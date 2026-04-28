from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass, field
import ipaddress
import platform
import re
import socket
from typing import Any, Literal
from urllib.parse import urljoin, urlparse

import httpx
import httpcore
from bs4 import BeautifulSoup
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.crawl_job import CrawlCandidate, CrawlJob, CrawlJobStatus, CrawlPage
from app.services.html_text import html_to_text
from app.services.professor_management import normalize_professor_title


MAX_TEXT_CHARS = 12000
MAX_LINKS = 200
MAX_HTTP_REDIRECTS = 5
MAX_RETRIES_FOR_BROWSER_RENDER = 2
CRAWL4AI_BROWSER_FALLBACK_STATUS = {403, 412, 429}
JS_RENDER_TIMEOUT_MS = 30000
CRAWL4AI_BROWSER_WAIT_TIMEOUT_MS = 15000
CRAWL4AI_BROWSER_DELAY_SECONDS = 1.5
CRAWL4AI_BROWSER_WAIT_SELECTOR = "css:body"
UNSAFE_CRAWL_URL_MESSAGE = "URL 不允许指向本机、内网或不可解析地址"
MULTI_LABEL_PUBLIC_SUFFIXES = ("ac.cn", "com.cn", "edu.cn", "gov.cn", "net.cn", "org.cn")
CrawlPageIntent = Literal["generic", "directory", "profile"]


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
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    name: str = Field(validation_alias=AliasChoices("name", "姓名"))
    email: str | None = Field(
        default=None,
        validation_alias=AliasChoices("email", "邮箱", "邮箱地址"),
    )
    title: str | None = Field(
        default=None,
        validation_alias=AliasChoices("title", "职称", "岗位"),
    )
    university: str | None = Field(
        default=None,
        validation_alias=AliasChoices("university", "学校", "院校"),
    )
    school: str | None = Field(
        default=None,
        validation_alias=AliasChoices("school", "学院", "院系", "学院/单位", "单位"),
    )
    department: str | None = Field(
        default=None,
        validation_alias=AliasChoices("department", "部门", "系别"),
    )
    research_direction: str | None = Field(
        default=None,
        validation_alias=AliasChoices("research_direction", "研究方向", "研究领域"),
    )
    recent_papers: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("recent_papers", "近期论文", "代表论文"),
    )
    profile_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("profile_url", "主页URL", "主页链接", "个人主页"),
    )
    source_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("source_url", "证据来源", "来源页面", "页面URL"),
    )
    confidence: float = Field(
        default=0.0,
        validation_alias=AliasChoices("confidence", "置信度"),
    )
    field_confidence: dict[str, float] | None = Field(
        default=None,
        validation_alias=AliasChoices("field_confidence", "字段置信度"),
    )
    evidence: dict[str, object] | None = Field(
        default=None,
        validation_alias=AliasChoices("evidence", "证据"),
    )


class CandidateEnrichmentPayload(BaseModel):
    email: str | None = None
    department: str | None = None
    research_direction: str | None = None
    recent_papers: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class CrawlToolContext:
    job_id: int
    start_url: str
    university: str
    school: str
    session_factory: async_sessionmaker[AsyncSession]
    http_blocked_hosts: set[str] = field(default_factory=set)

    def mark_http_blocked(self, url: str) -> None:
        host = (urlparse(url).hostname or "").lower()
        if host:
            self.http_blocked_hosts.add(host)

    def is_http_blocked(self, url: str) -> bool:
        host = (urlparse(url).hostname or "").lower()
        return bool(host and host in self.http_blocked_hosts)


@dataclass(frozen=True)
class _SafeCrawlUrl:
    hostname: str
    resolved_ips: tuple[str, ...]


def is_allowed_crawl_url(start_url: str, candidate_url: str) -> bool:
    start = urlparse(start_url)
    candidate = urlparse(urljoin(start_url, candidate_url))
    absolute_candidate_url = candidate.geturl()
    if not is_safe_public_crawl_url(start_url):
        return False
    if not is_safe_public_crawl_url(absolute_candidate_url):
        return False
    start_host = (start.hostname or "").lower()
    candidate_host = (candidate.hostname or "").lower()
    return _registrable_domain(start_host) == _registrable_domain(candidate_host)


def is_safe_public_crawl_url(url: str) -> bool:
    try:
        validate_safe_public_crawl_url(url)
    except ValueError:
        return False
    return True


def validate_safe_public_crawl_url(url: str) -> None:
    _validate_safe_crawl_url_literal(url)


def _validate_safe_crawl_url_literal(url: str) -> tuple[str, str, int]:
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
        return normalized_host, parsed.scheme, parsed.port or _default_port_for_scheme(parsed.scheme)

    if _is_unsafe_ip_address(ip_address):
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)
    return normalized_host, parsed.scheme, parsed.port or _default_port_for_scheme(parsed.scheme)


def _resolve_safe_public_crawl_url(url: str) -> _SafeCrawlUrl:
    normalized_host, _scheme, port = _validate_safe_crawl_url_literal(url)
    try:
        ip_address = ipaddress.ip_address(normalized_host)
    except ValueError:
        return _SafeCrawlUrl(
            hostname=normalized_host,
            resolved_ips=_resolve_system_host_ips(normalized_host, port),
        )
    return _SafeCrawlUrl(hostname=normalized_host, resolved_ips=(str(ip_address),))


def _resolve_system_host_ips(host: str, port: int) -> tuple[str, ...]:
    try:
        address_infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE) from exc

    if not address_infos:
        raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)

    resolved_ips: list[str] = []
    for address_info in address_infos:
        sockaddr = address_info[4]
        if not sockaddr:
            raise ValueError(UNSAFE_CRAWL_URL_MESSAGE)
        ip_text = str(sockaddr[0])
        try:
            ip_address = ipaddress.ip_address(ip_text)
        except ValueError as exc:
            raise ValueError(UNSAFE_CRAWL_URL_MESSAGE) from exc
        normalized_ip = str(ip_address)
        if normalized_ip not in resolved_ips:
            resolved_ips.append(normalized_ip)
    return tuple(resolved_ips)


def _default_port_for_scheme(scheme: str) -> int:
    return 80 if scheme == "http" else 443


def _registrable_domain(hostname: str) -> str:
    normalized = hostname.rstrip(".").lower()
    labels = [label for label in normalized.split(".") if label]
    if len(labels) <= 2:
        return normalized

    suffix = ".".join(labels[-2:])
    if suffix in MULTI_LABEL_PUBLIC_SUFFIXES and len(labels) >= 3:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


class _PinnedCrawlNetworkBackend(httpcore.AsyncNetworkBackend):
    def __init__(
        self,
        *,
        hostname: str,
        resolved_ip: str,
        network_backend: httpcore.AsyncNetworkBackend | None = None,
    ) -> None:
        self._hostname = hostname.rstrip(".").lower()
        self._resolved_ip = resolved_ip
        self._network_backend = network_backend or _default_async_network_backend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Any = None,
    ) -> httpcore.AsyncNetworkStream:
        if host.rstrip(".").lower() != self._hostname:
            raise httpcore.ConnectError("crawl transport attempted an unvalidated host")
        return await self._network_backend.connect_tcp(
            self._resolved_ip,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Any = None,
    ) -> httpcore.AsyncNetworkStream:
        return await self._network_backend.connect_unix_socket(
            path,
            timeout=timeout,
            socket_options=socket_options,
        )

    async def sleep(self, seconds: float) -> None:
        await self._network_backend.sleep(seconds)


def _default_async_network_backend() -> httpcore.AsyncNetworkBackend:
    return httpcore.AnyIOBackend()


def _build_safe_crawl_transport(
    *,
    hostname: str,
    resolved_ip: str,
    network_backend: httpcore.AsyncNetworkBackend | None = None,
) -> httpx.AsyncHTTPTransport:
    transport = httpx.AsyncHTTPTransport(
        trust_env=False,
        proxy=None,
        http2=False,
        limits=httpx.Limits(max_connections=1, max_keepalive_connections=0),
    )
    transport._pool._network_backend = _PinnedCrawlNetworkBackend(  # type: ignore[attr-defined]
        hostname=hostname,
        resolved_ip=resolved_ip,
        network_backend=network_backend,
    )
    return transport


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
        "title": normalize_professor_title(_clean_optional(candidate.title)),
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


def build_candidate_enrichment_prompt(
    candidate: CrawlCandidate,
    page_text: str,
) -> str:
    return f"""
你正在补全已发现的导师候选详情。
已知基础信息：
- 姓名：{candidate.name or "未知"}
- 邮箱：{candidate.email or "未知"}
- 职称：{candidate.title or "未知"}
- 资料页：{candidate.profile_url or "未知"}

要求：
- 只补全缺失字段：email, department, research_direction, recent_papers
- 不要改写已有基础字段
- 没有证据就保持为空

资料页正文：
{page_text}
"""


_EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

_AT_REPLACEMENTS = (
    r"\(\s*at\s*\)",
    r"\[\s*at\s*\]",
    r"\s+at\s+",
)

_DOT_REPLACEMENTS = (
    r"\(\s*dot\s*\)",
    r"\[\s*dot\s*\]",
    r"\s+dot\s+",
)


def normalize_obfuscated_email_tokens(text: str) -> str:
    normalized = text
    for token in _AT_REPLACEMENTS:
        normalized = re.sub(token, "@", normalized, flags=re.IGNORECASE)
    for token in _DOT_REPLACEMENTS:
        normalized = re.sub(token, ".", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s*@\s*", "@", normalized)
    normalized = re.sub(r"\s*\.\s*", ".", normalized)
    return normalized


def extract_first_email_from_text(text: str) -> str | None:
    direct = _EMAIL_PATTERN.findall(text)
    if direct:
        return direct[0]

    normalized = normalize_obfuscated_email_tokens(text)
    normalized = re.sub(r"\s+", "", normalized)
    normalized_emails = _EMAIL_PATTERN.findall(normalized)
    return normalized_emails[0] if normalized_emails else None


def extract_candidate_profile_enrichment(text: str) -> dict[str, Any]:
    return {
        "email": extract_first_email_from_text(text),
        "department": _extract_prefixed_line(text, ("院系：", "部门：", "所在系：")),
        "research_direction": _extract_prefixed_line(
            text,
            ("研究方向：", "研究领域：", "主要研究方向："),
        ),
        "recent_papers": _extract_paper_list(text),
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
        for redirect_count in range(MAX_HTTP_REDIRECTS + 1):
            snapshot = _pre_request_rejected_snapshot(ctx, current_url, "http")
            if snapshot is not None:
                await record_page_snapshot(ctx, snapshot)
                return snapshot

            safe_url = _resolve_safe_public_crawl_url(current_url)
            transport = _build_safe_crawl_transport(
                hostname=safe_url.hostname,
                resolved_ip=safe_url.resolved_ips[0],
            )
            async with httpx.AsyncClient(
                follow_redirects=False,
                timeout=20.0,
                transport=transport,
                trust_env=False,
            ) as client:
                response = await client.get(
                    current_url,
                    headers={"User-Agent": "AutoEmailSenderCrawler/0.1"},
                )
            if not getattr(response, "is_redirect", False):
                if response.status_code in CRAWL4AI_BROWSER_FALLBACK_STATUS:
                    snapshot = html_to_snapshot(str(response.url), response.text, "http")
                    snapshot.status = "failed"
                    snapshot.error_message = (
                        f"HTTP {response.status_code} blocked, browser fallback advised"
                    )
                    snapshot.suspicious_empty = True
                    await record_page_snapshot(ctx, snapshot)
                    return snapshot

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
            error_message=_format_exception_for_snapshot(exc, "HTTP request failed"),
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
        link for link in snapshot.links if _is_same_host_http_url(ctx.start_url, link)
    ][:MAX_LINKS]
    await record_page_snapshot(ctx, snapshot)
    return snapshot


async def crawl_page_with_crawl4ai(
    ctx: CrawlToolContext,
    url: str,
    *,
    intent: CrawlPageIntent = "generic",
) -> PageSnapshot:
    absolute_url = urljoin(ctx.start_url, url)
    if ctx.is_http_blocked(absolute_url):
        return await browser_investigate(ctx, absolute_url, goal="", intent=intent)

    http_snapshot = await crawl_page_with_http(ctx, url)
    if _should_use_crawl4ai_fallback(http_snapshot):
        if _is_http_blocked_snapshot(http_snapshot):
            ctx.mark_http_blocked(http_snapshot.url or absolute_url)
        return await browser_investigate(
            ctx,
            url,
            goal="",
            intent=intent,
        )
    return http_snapshot


async def browser_investigate(
    ctx: CrawlToolContext,
    url: str,
    goal: str,
    intent: CrawlPageIntent = "generic",
) -> PageSnapshot:
    absolute_url = urljoin(ctx.start_url, url)
    if _has_unsafe_public_crawl_url(ctx.start_url, absolute_url):
        snapshot = _failed_snapshot(
            url=absolute_url,
            fetch_method="browser",
            error_message=UNSAFE_CRAWL_URL_MESSAGE,
        )
        await record_page_snapshot(ctx, snapshot)
        return snapshot

    if not is_allowed_crawl_url(ctx.start_url, url):
        snapshot = _failed_snapshot(
            url=url,
            fetch_method="browser",
            error_message="URL 不在入口页面同域范围内，已拒绝浏览器调查",
        )
        await record_page_snapshot(ctx, snapshot)
        return snapshot

    snapshot = await _crawl_page_with_crawl4ai_browser(ctx, absolute_url, goal, intent)
    await record_page_snapshot(ctx, snapshot)
    return snapshot


def _should_use_crawl4ai_fallback(snapshot: PageSnapshot) -> bool:
    if snapshot.fetch_method != "http":
        return False

    if snapshot.suspicious_empty:
        return True

    if snapshot.status == "failed":
        error_message = (snapshot.error_message or "").lower()
        if any(str(marker) in error_message for marker in CRAWL4AI_BROWSER_FALLBACK_STATUS):
            return True
        if "cf-" in error_message:
            return True
        return any(
            marker in error_message
            for marker in (
                "cloudflare",
                "please",
                "anti-bot",
                "captcha",
                "security check",
                "verify you",
                "enable javascript",
            )
        )

    text = (snapshot.text or "").lower()
    if not text.strip():
        return True
    if len(text) >= 80:
        return False

    return any(
        marker in text
        for marker in (
            "cloudflare",
            "just a moment",
            "please enable javascript",
            "please verify",
            "anti-bot",
            "access denied",
            "captcha",
            "security check",
        )
    )


def _is_http_blocked_snapshot(snapshot: PageSnapshot) -> bool:
    if snapshot.fetch_method != "http":
        return False
    error_message = (snapshot.error_message or "").lower()
    return any(str(status) in error_message for status in CRAWL4AI_BROWSER_FALLBACK_STATUS)


def _browser_wait_selector_for_intent(intent: CrawlPageIntent) -> str:
    _ = intent
    return CRAWL4AI_BROWSER_WAIT_SELECTOR


def _browser_run_config_for_intent(
    intent: CrawlPageIntent,
    *,
    wait_for: str | None = None,
) -> "CrawlerRunConfig":
    from crawl4ai import CrawlerRunConfig

    return CrawlerRunConfig(
        process_in_browser=True,
        wait_until="networkidle",
        wait_for=wait_for if wait_for is not None else _browser_wait_selector_for_intent(intent),
        wait_for_timeout=CRAWL4AI_BROWSER_WAIT_TIMEOUT_MS,
        delay_before_return_html=CRAWL4AI_BROWSER_DELAY_SECONDS,
        page_timeout=JS_RENDER_TIMEOUT_MS,
        max_retries=MAX_RETRIES_FOR_BROWSER_RENDER,
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        verbose=False,
    )


def _browser_run_config_for_goal(goal: str) -> "CrawlerRunConfig":
    _ = goal
    return _browser_run_config_for_intent("generic")


async def _crawl_page_with_crawl4ai_browser(
    ctx: CrawlToolContext,
    absolute_url: str,
    goal: str,
    intent: CrawlPageIntent = "generic",
) -> PageSnapshot:
    _ = ctx, intent
    if _should_offload_browser_fetch_to_thread():
        return await asyncio.to_thread(
            _run_browser_fetch_with_proactor_loop,
            absolute_url,
            goal,
        )

    return await _crawl_page_with_crawl4ai_browser_direct(absolute_url, goal)


async def _crawl_page_with_crawl4ai_browser_direct(
    absolute_url: str,
    goal: str,
) -> PageSnapshot:
    _ = goal
    try:
        from crawl4ai import AsyncWebCrawler
    except Exception as exc:
        return _failed_snapshot(
            url=absolute_url,
            fetch_method="browser",
            error_message=_format_exception_for_snapshot(exc, "Failed to load Crawl4AI"),
        )

    config = _browser_run_config_for_goal(goal)

    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            crawl_result = await crawler.arun(absolute_url, config=config)
    except Exception as exc:
        return _failed_snapshot(
            url=absolute_url,
            fetch_method="browser",
            error_message=_format_exception_for_snapshot(
                exc,
                "Crawl4AI browser fetch failed",
            ),
        )

    if not crawl_result:
        return _failed_snapshot(
            url=absolute_url,
            fetch_method="browser",
            error_message="Crawl4AI browser returned no result",
        )

    crawl_item = crawl_result[0]
    if not getattr(crawl_item, "success", False):
        return _failed_snapshot(
            url=str(getattr(crawl_item, "url", absolute_url) or absolute_url),
            fetch_method="browser",
            error_message=_format_message_with_fallback(
                str(getattr(crawl_item, "error_message", "") or ""),
                "browser tool reported unsuccessful result",
            ),
        )

    content = str(getattr(crawl_item, "html", "") or "")
    final_url = str(getattr(crawl_item, "redirected_url", "") or absolute_url)
    snapshot = html_to_snapshot(final_url, content, "browser")
    if not snapshot.text.strip():
        snapshot.suspicious_empty = True
    return snapshot


def _run_browser_fetch_with_proactor_loop(
    absolute_url: str,
    goal: str,
) -> PageSnapshot:
    from app.core.windows_event_loop import ensure_windows_proactor_event_loop_policy

    ensure_windows_proactor_event_loop_policy()
    return asyncio.run(_crawl_page_with_crawl4ai_browser_direct(absolute_url, goal))


def _should_offload_browser_fetch_to_thread() -> bool:
    if platform.system() != "Windows":
        return False

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return False

    proactor_type = getattr(asyncio, "ProactorEventLoop", None)
    if proactor_type is not None and isinstance(loop, proactor_type):
        return False

    return True


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


def _format_exception_for_snapshot(exc: BaseException, context: str) -> str:
    message = str(exc).strip()
    if message:
        return f"{context}: {type(exc).__name__}: {message}"
    return f"{context}: {type(exc).__name__}"


def _format_message_with_fallback(message: str, fallback: str) -> str:
    message = message.strip()
    return message or fallback


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


def _extract_prefixed_line(text: str, prefixes: tuple[str, ...]) -> str | None:
    lines = [line.strip() for line in text.splitlines()]
    for line in lines:
        for prefix in prefixes:
            if line.startswith(prefix):
                value = line.removeprefix(prefix).strip()
                return value or None
    return None


def _extract_paper_list(text: str) -> list[str]:
    line = _extract_prefixed_line(text, ("代表论文：", "近期论文：", "论文："))
    if not line:
        return []
    return [
        item.strip()
        for item in re.split(r"[；;|]+", line)
        if item.strip()
    ]


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


def _is_same_host_http_url(start_url: str, candidate_url: str) -> bool:
    start = urlparse(start_url)
    candidate = urlparse(urljoin(start_url, candidate_url))
    return (
        candidate.scheme in {"http", "https"}
        and (start.hostname or "").lower() == (candidate.hostname or "").lower()
    )


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
