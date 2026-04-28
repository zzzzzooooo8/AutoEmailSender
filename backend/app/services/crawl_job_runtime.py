from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.faculty_crawler_agent import build_faculty_crawler_model, run_faculty_crawler_agent
from app.models import CrawlCandidate, CrawlJob, CrawlJobStatus, CrawlPage, LLMProfile
from app.services.crawler_debug import append_crawler_debug_event
from app.services.crawl_job_events import normalize_agent_trace_event
from app.services.crawler_tools import (
    CrawlToolContext,
    CandidateEnrichmentPayload,
    build_candidate_enrichment_prompt,
    crawl_page_with_crawl4ai,
    extract_candidate_profile_enrichment,
)


NO_LLM_PROFILE_ERROR = "请先配置可用的 LLM Profile"
WORKER_CANCELLED_ERROR = "抓取任务被后台 worker 取消"
NO_CANDIDATES_SAVED_ERROR = "抓取结束但未成功保存任何候选导师"
INVALID_SAVE_TOOL_CALL_ERROR = (
    "抓取结果未成功保存：Agent 生成了无效的 save_professor_candidates 调用"
)
TRUNCATED_SAVE_TOOL_CALL_ERROR = (
    "抓取结果未成功保存：模型在调用 save_professor_candidates 时输出被截断"
)
MAX_AGENT_TRACE_EVENTS = 100


async def run_queued_crawl_jobs_once(
    session_factory: async_sessionmaker[AsyncSession],
) -> int:
    async with session_factory() as session:
        job_id = await session.scalar(
            select(CrawlJob.id)
            .where(CrawlJob.status == CrawlJobStatus.QUEUED.value)
            .order_by(CrawlJob.created_at.asc(), CrawlJob.id.asc())
            .limit(1),
        )
        if job_id is None:
            return 0

        now = datetime.now(UTC)
        claim_result = await session.execute(
            update(CrawlJob)
            .where(
                CrawlJob.id == job_id,
                CrawlJob.status == CrawlJobStatus.QUEUED.value,
            )
            .values(
                status=CrawlJobStatus.RUNNING.value,
                error_message=None,
                updated_at=now,
            ),
        )
        if claim_result.rowcount != 1:
            await session.rollback()
            return 0

        job = await session.scalar(
            select(CrawlJob)
            .where(CrawlJob.id == job_id)
            .limit(1),
        )
        if job is None:
            await session.rollback()
            return 0

        llm_profile = await _resolve_llm_profile(session, job)
        if llm_profile is None:
            job.status = CrawlJobStatus.FAILED.value
            job.error_message = NO_LLM_PROFILE_ERROR
            job.updated_at = datetime.now(UTC)
            await session.commit()
            return 1

        await session.commit()

        job_id = job.id
        ctx = CrawlToolContext(
            job_id=job.id,
            start_url=job.start_url,
            university=job.university,
            school=job.school,
            session_factory=session_factory,
        )

    async def trace_callback(event: Any) -> None:
        append_crawler_debug_event(job_id, event)
        await _append_agent_trace(session_factory, job_id, event)

    try:
        await run_faculty_crawler_agent(ctx, llm_profile, trace_callback=trace_callback)
    except asyncio.CancelledError:
        await _mark_job_failed(session_factory, job_id, WORKER_CANCELLED_ERROR)
        raise
    except Exception as exc:
        await _mark_job_failed(session_factory, job_id, str(exc))
    else:
        await _enrich_saved_candidates(
            session_factory,
            ctx,
            llm_profile=llm_profile,
            trace_callback=trace_callback,
        )
        await _complete_running_job(session_factory, job_id)

    return 1


async def _resolve_llm_profile(
    session: AsyncSession,
    job: CrawlJob,
) -> LLMProfile | None:
    if job.llm_profile_id is not None:
        return await session.get(LLMProfile, job.llm_profile_id)

    return await session.scalar(
        select(LLMProfile)
        .where(LLMProfile.is_default.is_(True))
        .order_by(LLMProfile.created_at.asc(), LLMProfile.id.asc())
        .limit(1),
    )


async def _append_agent_trace(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
    event: dict[str, object],
) -> None:
    async with session_factory() as session:
        job = await session.get(CrawlJob, job_id)
        if job is None:
            return

        normalized_event = normalize_agent_trace_event(event)
        if not normalized_event.get("created_at"):
            normalized_event["created_at"] = datetime.now(UTC).isoformat()

        trace = list(_normalize_trace(job.agent_trace))
        trace.append(normalized_event)
        job.agent_trace = trace[-MAX_AGENT_TRACE_EVENTS:]
        job.updated_at = datetime.now(UTC)
        await session.commit()


async def _complete_running_job(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
) -> None:
    async with session_factory() as session:
        job = await session.get(CrawlJob, job_id)
        if job is None or job.status != CrawlJobStatus.RUNNING.value:
            return

        candidate_count = await session.scalar(
            select(func.count()).select_from(CrawlCandidate).where(CrawlCandidate.job_id == job_id)
        )
        if int(candidate_count or 0) > 0:
            job.status = CrawlJobStatus.NEEDS_REVIEW.value
            job.error_message = None
        else:
            job.status = CrawlJobStatus.FAILED.value
            job.error_message = await _derive_job_failure_message(
                session,
                job_id,
                job.agent_trace,
            )
        job.updated_at = datetime.now(UTC)
        await session.commit()


async def _enrich_saved_candidates(
    session_factory: async_sessionmaker[AsyncSession],
    ctx: CrawlToolContext,
    *,
    llm_profile: LLMProfile,
    trace_callback: Any | None = None,
) -> int:
    async with session_factory() as session:
        candidates = list(
            (
                await session.execute(
                    select(CrawlCandidate)
                    .where(CrawlCandidate.job_id == ctx.job_id)
                    .order_by(CrawlCandidate.created_at.asc(), CrawlCandidate.id.asc())
                )
            ).scalars()
        )

    pending_candidates = [candidate for candidate in candidates if _needs_profile_enrichment(candidate)]
    enriched = 0
    unchanged = 0
    failed = 0

    if pending_candidates:
        await _emit_trace_event(
            trace_callback,
            {
                "event_type": "enrichment",
                "message": f"开始统一补全候选导师详情，共 {len(pending_candidates)} 位待补全",
                "created_at": datetime.now(UTC).isoformat(),
                "raw": {"candidate_count": len(pending_candidates)},
            },
        )

    for candidate in pending_candidates:
        await _emit_trace_event(
            trace_callback,
            {
                "event_type": "enrichment",
                "message": f"开始补全候选导师详情：{candidate.name}",
                "created_at": datetime.now(UTC).isoformat(),
                "raw": {
                    "candidate_id": candidate.id,
                    "profile_url": candidate.profile_url,
                },
            },
        )

        snapshot = await crawl_page_with_crawl4ai(ctx, candidate.profile_url or "")
        if snapshot.status != "succeeded" or not snapshot.text.strip():
            failed += 1
            await _emit_trace_event(
                trace_callback,
                {
                    "event_type": "enrichment",
                    "message": f"候选导师详情补全失败：{candidate.name}",
                    "created_at": datetime.now(UTC).isoformat(),
                    "raw": {
                        "candidate_id": candidate.id,
                        "profile_url": candidate.profile_url,
                        "status": snapshot.status,
                        "error_message": snapshot.error_message,
                    },
                },
            )
            continue

        try:
            enrichment = await enrich_candidate_profile_with_llm(
                ctx,
                llm_profile,
                candidate,
                snapshot.text,
            )
        except Exception:
            enrichment = _extract_fallback_enrichment(snapshot.text)
        if not _has_any_enrichment(enrichment):
            fallback = extract_candidate_profile_enrichment(snapshot.text)
            enrichment = CandidateEnrichmentPayload.model_validate(fallback)

        changes = enrichment.model_dump()
        changed_fields = [field for field, value in changes.items() if value]
        if await _apply_candidate_enrichment(session_factory, candidate.id, enrichment):
            enriched += 1
            await _emit_trace_event(
                trace_callback,
                {
                    "event_type": "enrichment",
                    "message": f"候选导师详情补全成功：{candidate.name}（{_format_enrichment_fields(changed_fields)}）",
                    "created_at": datetime.now(UTC).isoformat(),
                    "raw": {
                        "candidate_id": candidate.id,
                        "profile_url": candidate.profile_url,
                        "updated_fields": changed_fields,
                    },
                },
            )
        else:
            unchanged += 1
            await _emit_trace_event(
                trace_callback,
                {
                    "event_type": "enrichment",
                    "message": f"候选导师详情无新增信息：{candidate.name}",
                    "created_at": datetime.now(UTC).isoformat(),
                    "raw": {
                        "candidate_id": candidate.id,
                        "profile_url": candidate.profile_url,
                        "detected_fields": changed_fields,
                    },
                },
            )

    if pending_candidates:
        await _emit_trace_event(
            trace_callback,
            {
                "event_type": "enrichment",
                "message": f"候选导师详情补全完成：成功 {enriched} 位，未变化 {unchanged} 位，失败 {failed} 位",
                "created_at": datetime.now(UTC).isoformat(),
                "raw": {
                    "candidate_count": len(pending_candidates),
                    "enriched_count": enriched,
                    "unchanged_count": unchanged,
                    "failed_count": failed,
                },
            },
        )
    return enriched


async def _mark_job_failed(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
    error_message: str,
) -> None:
    async with session_factory() as session:
        job = await session.get(CrawlJob, job_id)
        if job is None or job.status != CrawlJobStatus.RUNNING.value:
            return

        job.status = CrawlJobStatus.FAILED.value
        job.error_message = error_message
        job.updated_at = datetime.now(UTC)
        await session.commit()


async def _derive_job_failure_message(
    session: AsyncSession,
    job_id: int,
    agent_trace: Any,
) -> str:
    trace_error = _derive_candidate_save_failure(agent_trace)
    if trace_error != NO_CANDIDATES_SAVED_ERROR:
        return trace_error

    page_error = await session.scalar(
        select(CrawlPage.error_message)
        .where(
            CrawlPage.job_id == job_id,
            CrawlPage.status == "failed",
            CrawlPage.error_message.is_not(None),
        )
        .order_by(CrawlPage.id.desc())
        .limit(1),
    )
    if isinstance(page_error, str) and page_error.strip():
        return page_error.strip()

    return NO_CANDIDATES_SAVED_ERROR


async def _apply_candidate_enrichment(
    session_factory: async_sessionmaker[AsyncSession],
    candidate_id: int,
    updates: CandidateEnrichmentPayload,
) -> bool:
    async with session_factory() as session:
        candidate = await session.get(CrawlCandidate, candidate_id)
        if candidate is None:
            return False

        update_payload = updates.model_dump()

        changed = False
        email = update_payload.get("email")
        if email and not candidate.email:
            candidate.email = email
            changed = True

        department = update_payload.get("department")
        if department and not candidate.department:
            candidate.department = department
            changed = True

        research_direction = update_payload.get("research_direction")
        if research_direction and not candidate.research_direction:
            candidate.research_direction = research_direction
            changed = True

        recent_papers = update_payload.get("recent_papers") or []
        if recent_papers and not (candidate.recent_papers or []):
            candidate.recent_papers = recent_papers
            changed = True

        if not changed:
            return False

        candidate.updated_at = datetime.now(UTC)
        await session.commit()
        return True


async def _emit_trace_event(trace_callback: Any | None, event: dict[str, object]) -> None:
    if trace_callback is None:
        return
    result = trace_callback(event)
    if asyncio.iscoroutine(result):
        await result


def _normalize_trace(value: Any) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _needs_profile_enrichment(candidate: CrawlCandidate) -> bool:
    if not candidate.profile_url:
        return False
    return any(
        (
            not (candidate.email or "").strip(),
            not (candidate.department or "").strip(),
            not (candidate.research_direction or "").strip(),
            not any(str(item).strip() for item in candidate.recent_papers or []),
        )
    )


def _format_enrichment_fields(fields: list[str]) -> str:
    labels = {
        "email": "邮箱",
        "department": "院系",
        "research_direction": "研究方向",
        "recent_papers": "近期论文",
    }
    if not fields:
        return "无新字段"
    return "、".join(labels.get(field, field) for field in fields)


def _has_any_enrichment(payload: CandidateEnrichmentPayload) -> bool:
    return bool(
        (payload.email and payload.email.strip())
        or
        (payload.department and payload.department.strip())
        or (payload.research_direction and payload.research_direction.strip())
        or any(item.strip() for item in payload.recent_papers if isinstance(item, str)),
    )


async def enrich_candidate_profile_with_llm(
    ctx: CrawlToolContext,
    llm_profile: LLMProfile,
    candidate: CrawlCandidate,
    page_text: str,
) -> CandidateEnrichmentPayload:
    _ = ctx
    model = build_faculty_crawler_model(llm_profile)
    prompt = build_candidate_enrichment_prompt(candidate, page_text)
    response = await model.ainvoke(prompt)
    content = _extract_model_message_content(response)
    if not content:
        raise ValueError("模型补全返回空响应")
    return CandidateEnrichmentPayload.model_validate_json(content)


def _extract_fallback_enrichment(page_text: str) -> CandidateEnrichmentPayload:
    return CandidateEnrichmentPayload.model_validate(
        extract_candidate_profile_enrichment(page_text),
    )


def _extract_model_message_content(response: object) -> str:
    if isinstance(response, str):
        return response.strip()

    if isinstance(response, dict):
        candidate = response.get("content")
        if candidate is None:
            return ""
        response = candidate

    content = getattr(response, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        pieces: list[str] = []
        for item in content:
            if isinstance(item, str):
                pieces.append(item)
                continue
            if not isinstance(item, dict):
                continue
            value = item.get("text") or item.get("content")
            if isinstance(value, str):
                pieces.append(value)
        joined = "".join(pieces).strip()
        return joined
    return ""


def _derive_candidate_save_failure(agent_trace: Any) -> str:
    trace_events = _normalize_trace(agent_trace)
    for event in reversed(trace_events):
        haystack = _stringify_trace_payload(event)
        if "save_professor_candidates" not in haystack:
            continue
        if "invalid_tool_call" in haystack or "invalid_tool_calls" in haystack:
            if "finish_reason='length'" in haystack or '"finish_reason": "length"' in haystack:
                return TRUNCATED_SAVE_TOOL_CALL_ERROR
            return INVALID_SAVE_TOOL_CALL_ERROR
    return NO_CANDIDATES_SAVED_ERROR


def _stringify_trace_payload(event: dict[str, object]) -> str:
    parts: list[str] = []
    for key in ("message", "summary"):
        value = event.get(key)
        if isinstance(value, str):
            parts.append(value)
    raw = event.get("raw")
    if raw is not None:
        parts.append(str(raw))
    return "\n".join(parts)
