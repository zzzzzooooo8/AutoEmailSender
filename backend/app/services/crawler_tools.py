from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
import ipaddress
import socket
from typing import Any, Literal
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.crawl_job import CrawlCandidate, CrawlJob, CrawlJobStatus, CrawlPage
from app.services.html_text import html_to_text


MAX_TEXT_CHARS = 12000
MAX_LINKS = 200
MAX_HTTP_REDIRECTS = 5
UNSAFE_CRAWL_URL_MESSAGE = "URL 不允许指向本机、内网或不可解析地址"


class PageSnapshot(BaseModel):
    url: str
    title: str | None = None
    text: str = ""
    html: str = ""
    links: list[str] = Field(default_factory=list)
    fetch_method: str
    status: Literal["succeeded", "failed"]
    error_message: str | None = None
    suspicious_empty: bool = False


class ProfessorCandidatePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    email: str | None = None
    title: str | None = None
    university: str | None = None
    school: str | None = None
    department: str | None = None
    research_direction: str | None = None
    recent_papers: list[str] = Field(default_factory=list)
    profile_url: str | None = None
    source_url: str | None = None
    confidence: float = 0.0
    field_confidence: dict[str, float] | None = None
    evidence: dict[str, object] | None = None


@dataclass(frozen=True)
class CrawlToolContext:
    job_id: int
    start_url: str
    university: str
    school: str
    session_factory: async_sessionmaker[AsyncSession]


def is_allowed_crawl_url(start_url: str, candidate_url: str) -> bool:
    start = urlparse(start_url)
    candidate = urlparse(urljoin(start_url, candidate_url))
    absolute_candidate_url = candidate.geturl()
    if not is_safe_public_crawl_url(start_url):
        return False
    if not is_safe_public_crawl_url(absolute_candidate_url):
        return False
    return (start.hostname or "").lower() == (candidate.hostname or "").lower()


def is_safe_public_crawl_url(url: str) -> bool:
    try:
        validate_safe_public_crawl_url(url)
    except ValueError:
        return False
    return True


def validate_safe_public_crawl_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)

    host = parsed.hostname
    if not host:
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)

    normalized_host = host.rstrip(".").lower()
    if normalized_host == "localhost" or normalized_host.endswith(".localhost"):
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)

    try:
        ip_address = ipaddress.ip_address(normalized_host)
    except ValueError:
        _validate_resolved_host_ips(normalized_host, parsed.port)
        return

    if _is_unsafe_ip_address(ip_address):
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)


def _validate_resolved_host_ips(host: str, port: int | None) -> None:
    try:
        address_infos = socket.getaddrinfo(host, port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE) from exc

    if not address_infos:
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)

    for address_info in address_infos:
        sockaddr = address_info[4]
        if not sockaddr:
            raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)
        ip_text = str(sockaddr[0])
        try:
            ip_address = ipaddress.ip_address(ip_text)
        except ValueError as exc:
            raise ValueError(UNSAFE_CRAWL_URL_MESSAGE) from exc
        if _is_unsafe_ip_address(ip_address):
            raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)


def _is_unsafe_ip_address(ip_address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any(
        (
            not ip_address.is_global,
            ip_address.is_private,
            ip_address.is_loopback,
            ip_address.is_link_local,
            ip_address.is_multicast,
            ip_address.is_unspecified,
            ip_address.is_reserved,
        )
    )


def normalize_candidate_payload(
    candidate: ProfessorCandidatePayload,
    *,
    university: str,
    school: str,
) -> dict[str, Any]:
    papers = [_clean_required(item) for item in candidate.recent_papers if _clean_optional(item)]
    field_confidence = None
    if candidate.field_confidence is not None:
        field_confidence = {
            str(key).strip(): _clamp_confidence(value)
            for key, value in candidate.field_confidence.items()
            if str(key).strip()
        }

    return {
        "name": _clean_required(candidate.name),
        "email": _clean_optional(candidate.email),
        "title": _clean_optional(candidate.title),
        "university": _clean_optional(candidate.university) or _clean_required(university),
        "school": _clean_optional(candidate.school) or _clean_required(school),
        "department": _clean_optional(candidate.department),
        "research_direction": _clean_optional(candidate.research_direction),
        "recent_papers": papers,
        "profile_url": _clean_optional(candidate.profile_url),
        "source_url": _clean_optional(candidate.source_url),
        "confidence": _clamp_confidence(candidate.confidence),
        "field_confidence": field_confidence,
        "evidence": candidate.evidence,
    }


async def crawl_page_with_http(ctx: CrawlToolContext, url: str) -> PageSnapshot:
    absolute_url = urljoin(ctx.start_url, url)
    snapshot = _pre_request_rejected_snapshot(ctx, absolute_url, "http")
    if snapshot is not None:
        await record_page_snapshot(ctx, snapshot)
        return snapshot

    try:
        response: httpx.Response | Any | None = None
        current_url = absolute_url
        async with httpx.AsyncClient(follow_redirects=False, timeout=20.0) as client:
            for redirect_count in range(MAX_HTTP_REDIRECTS + 1):
                snapshot = _pre_request_rejected_snapshot(ctx, current_url, "http")
                if snapshot is not None:
                    await record_page_snapshot(ctx, snapshot)
                    return snapshot

                response = await client.get(
                    current_url,
                    headers={"User-Agent": "AutoEmailSenderCrawler/0.1"},
                )
                if not getattr(response, "is_redirect", False):
                    response.raise_for_status()
                    break

                if redirect_count >= MAX_HTTP_REDIRECTS:
                    snapshot = _failed_snapshot(
                        url=str(response.url),
                        fetch_method="http",
                        error_message="重定向次数过多，已拒绝抓取",
                    )
                    await record_page_snapshot(ctx, snapshot)
                    return snapshot

                location = response.headers.get("Location") or response.headers.get("location")
                if not location:
                    snapshot = _failed_snapshot(
                        url=str(response.url),
                        fetch_method="http",
                        error_message="重定向响应缺少 Location，已拒绝抓取",
                    )
                    await record_page_snapshot(ctx, snapshot)
                    return snapshot

                next_url = urljoin(str(response.url), location)
                snapshot = _pre_request_rejected_snapshot(ctx, next_url, "http")
                if snapshot is not None:
                    await record_page_snapshot(ctx, snapshot)
                    return snapshot
                current_url = next_url
        if response is None:
            raise RuntimeError("HTTP 抓取未返回响应")
    except Exception as exc:
        snapshot = _failed_snapshot(
            url=absolute_url,
            fetch_method="http",
            error_message=str(exc),
        )
        await record_page_snapshot(ctx, snapshot)
        return snapshot

    final_url = str(response.url)
    if not is_safe_public_crawl_url(final_url):
        snapshot = _failed_snapshot(
            url=final_url,
            fetch_method="http",
            error_message=UNSAFE_CRAWL_URL_MESSAGE,
        )
        await record_page_snapshot(ctx, snapshot)
        return snapshot

    if not is_allowed_crawl_url(ctx.start_url, final_url):
        snapshot = _final_url_rejected_snapshot(
            final_url=final_url,
            fetch_method="http",
        )
        await record_page_snapshot(ctx, snapshot)
        return snapshot

    snapshot = html_to_snapshot(final_url, response.text, "http")
    snapshot.links = [
        link for link in snapshot.links if is_allowed_crawl_url(ctx.start_url, link)
    ][:MAX_LINKS]
    await record_page_snapshot(ctx, snapshot)
    return snapshot


async def crawl_page_with_crawl4ai(ctx: CrawlToolContext, url: str) -> PageSnapshot:
    # Crawl4AI owns redirect/DNS behavior; re-enable after safe transport controls exist.
    return await crawl_page_with_http(ctx, url)


async def browser_investigate(ctx: CrawlToolContext, url: str, goal: str) -> PageSnapshot:
    _ = goal
    absolute_url = urljoin(ctx.start_url, url)
    if _has_unsafe_public_crawl_url(ctx.start_url, absolute_url):
        snapshot = _failed_snapshot(
            url=absolute_url,
            fetch_method="browser_use",
            error_message=UNSAFE_CRAWL_URL_MESSAGE,
        )
        await record_page_snapshot(ctx, snapshot)
        return snapshot

    if not is_allowed_crawl_url(ctx.start_url, url):
        snapshot = _failed_snapshot(
            url=url,
            fetch_method="browser_use",
            error_message="URL 不在入口页面同域范围内，已拒绝浏览器调查",
        )
        await record_page_snapshot(ctx, snapshot)
        return snapshot

    snapshot = _failed_snapshot(
        url=absolute_url,
        fetch_method="browser_use",
        error_message="Browser Use 需要在任务 6 通过 LLMProfile 注入模型后启用",
    )
    await record_page_snapshot(ctx, snapshot)
    return snapshot


async def save_candidates(
    ctx: CrawlToolContext,
    candidates: Sequence[ProfessorCandidatePayload],
) -> list[CrawlCandidate]:
    payloads = [
        normalize_candidate_payload(
            candidate,
            university=ctx.university,
            school=ctx.school,
        )
        for candidate in candidates
    ]
    saved: list[CrawlCandidate] = []
    async with ctx.session_factory() as session:
        if await _is_crawl_job_canceled(session, ctx.job_id):
            return []

        existing_emails = await _load_existing_candidate_emails(session, ctx.job_id)
        seen_emails = set(existing_emails)
        for payload in payloads:
            email = payload["email"]
            if email and email.lower() in seen_emails:
                continue

            row = CrawlCandidate(job_id=ctx.job_id, **payload)
            session.add(row)
            saved.append(row)
            if email:
                seen_emails.add(email.lower())

        if await _is_crawl_job_canceled(session, ctx.job_id):
            await session.rollback()
            return []

        await session.commit()
        for row in saved:
            await session.refresh(row)
    return saved


async def record_page_snapshot(ctx: CrawlToolContext, snapshot: PageSnapshot) -> CrawlPage | None:
    row = CrawlPage(
        job_id=ctx.job_id,
        url=snapshot.url,
        parent_url=None,
        fetch_method=snapshot.fetch_method,
        page_type="unknown",
        status=snapshot.status,
        title=snapshot.title,
        text_excerpt=snapshot.text[:MAX_TEXT_CHARS] or None,
        error_message=snapshot.error_message,
    )
    async with ctx.session_factory() as session:
        if await _is_crawl_job_canceled(session, ctx.job_id):
            return None

        session.add(row)
        if await _is_crawl_job_canceled(session, ctx.job_id):
            await session.rollback()
            return None

        await session.commit()
        await session.refresh(row)
        return row


def html_to_snapshot(url: str, html: str, fetch_method: str) -> PageSnapshot:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    title = _clean_optional(soup.title.get_text(" ", strip=True) if soup.title else None)
    text = html_to_text(str(soup))[:MAX_TEXT_CHARS]
    links: list[str] = []
    seen_links: set[str] = set()
    for tag in soup.find_all("a", href=True):
        link = urljoin(url, str(tag["href"]).strip())
        parsed = urlparse(link)
        if parsed.scheme not in {"http", "https"} or link in seen_links:
            continue
        seen_links.add(link)
        links.append(link)
        if len(links) >= MAX_LINKS:
            break

    return PageSnapshot(
        url=url,
        title=title,
        text=text,
        html=html,
        links=links,
        fetch_method=fetch_method,
        status="succeeded",
        suspicious_empty=not text.strip(),
    )


def _clean_required(value: object) -> str:
    cleaned = str(value).strip() if value is not None else ""
    if not cleaned:
        raise ValueError("必填文本不能为空")
    return cleaned


def _clean_optional(value: object) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _clamp_confidence(value: object) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return min(1.0, max(0.0, number))


async def _load_existing_candidate_emails(session: AsyncSession, job_id: int) -> set[str]:
    result = await session.scalars(
        select(CrawlCandidate.email).where(
            CrawlCandidate.job_id == job_id,
            CrawlCandidate.email.is_not(None),
        )
    )
    return {email.lower() for email in result if email}


async def _is_crawl_job_canceled(session: AsyncSession, job_id: int) -> bool:
    return await _get_job_status(session, job_id) == CrawlJobStatus.CANCELED.value


async def _get_job_status(session: AsyncSession, job_id: int) -> str | None:
    return await session.scalar(select(CrawlJob.status).where(CrawlJob.id == job_id))


def _failed_snapshot(url: str, fetch_method: str, error_message: str) -> PageSnapshot:
    return PageSnapshot(
        url=url,
        title=None,
        text="",
        html="",
        links=[],
        fetch_method=fetch_method,
        status="failed",
        error_message=error_message,
        suspicious_empty=True,
    )


def _has_unsafe_public_crawl_url(start_url: str, candidate_url: str) -> bool:
    return not is_safe_public_crawl_url(start_url) or not is_safe_public_crawl_url(candidate_url)


def _pre_request_rejected_snapshot(
    ctx: CrawlToolContext,
    target_url: str,
    fetch_method: str,
) -> PageSnapshot | None:
    if _has_unsafe_public_crawl_url(ctx.start_url, target_url):
        return _failed_snapshot(
            url=target_url,
            fetch_method=fetch_method,
            error_message=UNSAFE_CRAWL_URL_MESSAGE,
        )

    if not is_allowed_crawl_url(ctx.start_url, target_url):
        return _failed_snapshot(
            url=target_url,
            fetch_method=fetch_method,
            error_message="URL 不在入口页面同域范围内，已拒绝抓取",
        )

    return None


def _final_url_rejected_snapshot(final_url: str, fetch_method: str) -> PageSnapshot:
    return _failed_snapshot(
        url=final_url,
        fetch_method=fetch_method,
        error_message="最终 URL 不在允许范围内，已拒绝抓取结果",
    )
