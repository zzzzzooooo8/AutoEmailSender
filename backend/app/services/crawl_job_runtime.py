from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.faculty_crawler_agent import build_faculty_crawler_model, run_faculty_crawler_agent
from app.models import CrawlCandidate, CrawlJob, CrawlJobStatus, CrawlPage, LLMProfile
from app.services.crawler_debug import append_crawler_debug_event
from app.services.crawl_job_events import normalize_agent_trace_event
from app.services.crawl_job_runs import (
    accumulate_crawl_job_run_tokens,
    extract_token_usage_from_llm_response,
    get_or_create_current_crawl_job_run,
    mark_crawl_job_run_finished,
    mark_crawl_job_run_paused,
    mark_crawl_job_run_running,
)
from app.services.crawler_tools import (
    CrawlJobCanceled,
    CrawlJobPaused,
    CrawlJobSaveBudgetExceeded,
    CrawlToolContext,
    CandidateEnrichmentPayload,
    ProfessorCandidatePayload,
    build_candidate_enrichment_prompt,
    build_profile_candidate_prompt,
    crawl_page_with_crawl4ai,
    ensure_crawl_job_can_continue,
    extract_candidate_profile_enrichment,
    save_candidates,
)


NO_LLM_PROFILE_ERROR = "请先配置可用的 LLM Profile"
WORKER_CANCELLED_ERROR = "抓取任务被后台 worker 取消"
NO_CANDIDATES_SAVED_ERROR = "抓取结束但未成功保存任何候选导师"
PROFILE_EXTRACTION_FAILED_ERROR = "未能从详情页识别导师信息"
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

        await mark_crawl_job_run_running(session, job, now=now)
        llm_profile = await _resolve_llm_profile(session, job)
        if llm_profile is None:
            failed_at = datetime.now(UTC)
            job.status = CrawlJobStatus.FAILED.value
            job.error_message = NO_LLM_PROFILE_ERROR
            job.updated_at = failed_at
            await mark_crawl_job_run_finished(
                session,
                job,
                status=CrawlJobStatus.FAILED.value,
                error_message=NO_LLM_PROFILE_ERROR,
                now=failed_at,
            )
            await session.commit()
            return 1

        await session.commit()

        job_id = job.id
        start_urls = _get_crawl_job_start_urls(job)
        ctx = CrawlToolContext(
            job_id=job.id,
            start_url=start_urls[0],
            university=job.university,
            school=job.school,
            session_factory=session_factory,
        )

    async def trace_callback(event: Any) -> None:
        append_crawler_debug_event(job_id, event)
        await _append_agent_trace(session_factory, job_id, event)

    try:
        for start_url in start_urls:
            entry_ctx = replace(ctx, start_url=start_url)
            try:
                if job.entry_type == "profile":
                    await _run_profile_crawl_job(
                        session_factory,
                        entry_ctx,
                        llm_profile=llm_profile,
                        trace_callback=trace_callback,
                    )
                else:
                    await run_faculty_crawler_agent(
                        entry_ctx,
                        llm_profile,
                        trace_callback=trace_callback,
                    )
            except (CrawlJobPaused, CrawlJobCanceled, CrawlJobSaveBudgetExceeded, asyncio.CancelledError):
                raise
            except Exception as exc:
                if len(start_urls) == 1:
                    raise
                await _emit_trace_event(
                    trace_callback,
                    {
                        "event_type": "start_url_failed",
                        "message": f"入口 URL 抓取失败：{exc}",
                        "created_at": datetime.now(UTC).isoformat(),
                        "raw": {"url": start_url},
                    },
                )
                continue
        await _complete_running_job(session_factory, job_id)
    except CrawlJobPaused:
        await _emit_trace_event(
            trace_callback,
            {
                "event_type": "job_control",
                "message": "任务已暂停，已保留当前抓取结果",
                "created_at": datetime.now(UTC).isoformat(),
            },
        )
        await _mark_job_paused(session_factory, job_id)
    except CrawlJobCanceled:
        await _emit_trace_event(
            trace_callback,
            {
                "event_type": "job_control",
                "message": "任务已取消",
                "created_at": datetime.now(UTC).isoformat(),
            },
        )
        await _mark_job_canceled(session_factory, job_id)
    except CrawlJobSaveBudgetExceeded as exc:
        await _emit_trace_event(
            trace_callback,
            {
                "event_type": "save_failure_circuit_breaker",
                "message": str(exc),
                "failure_fingerprint": exc.failure_fingerprint,
                "consecutive_same_batch_failures": exc.same_batch_save_failures,
                "total_save_failures": exc.total_save_failures,
                "terminal_reason": exc.terminal_reason,
                "latest_failure_summary": exc.latest_failure_summary,
                "created_at": datetime.now(UTC).isoformat(),
            },
        )
        await _mark_job_failed(session_factory, job_id, str(exc))
    except asyncio.CancelledError:
        await _mark_job_failed(session_factory, job_id, WORKER_CANCELLED_ERROR)
        raise
    except Exception as exc:
        await _mark_job_failed(session_factory, job_id, str(exc))

    return 1


def _get_crawl_job_start_urls(job: CrawlJob) -> list[str]:
    urls = job.start_urls or [job.start_url]
    normalized: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if not isinstance(url, str):
            continue
        stripped = url.strip()
        if not stripped or stripped in seen:
            continue
        seen.add(stripped)
        normalized.append(stripped)
    return normalized or [job.start_url]


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
        await accumulate_crawl_job_run_tokens(session, job_id, normalized_event)
        await session.commit()


async def _accumulate_direct_llm_response_tokens(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
    response: object,
) -> None:
    usage = extract_token_usage_from_llm_response(response)
    if usage is None:
        return

    async with session_factory() as session:
        job = await session.get(CrawlJob, job_id)
        if job is None:
            return

        run = await get_or_create_current_crawl_job_run(session, job)
        run.input_tokens += usage["input_tokens"] or 0
        run.output_tokens += usage["output_tokens"] or 0
        run.total_tokens += usage["total_tokens"] or 0
        cached_tokens = usage.get("cached_tokens")
        if cached_tokens is not None:
            run.cached_tokens = (run.cached_tokens or 0) + cached_tokens
        run.updated_at = datetime.now(UTC)
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
        now = datetime.now(UTC)
        job.updated_at = now
        await mark_crawl_job_run_finished(
            session,
            job,
            status=job.status,
            error_message=job.error_message,
            now=now,
        )
        await session.commit()


async def _run_profile_crawl_job(
    session_factory: async_sessionmaker[AsyncSession],
    ctx: CrawlToolContext,
    *,
    llm_profile: LLMProfile,
    trace_callback: Any | None = None,
) -> None:
    async with session_factory() as session:
        await ensure_crawl_job_can_continue(session, ctx.job_id)

    await _emit_trace_event(
        trace_callback,
        {
            "event_type": "profile_entry",
            "message": "开始抓取单个导师详情页",
            "created_at": datetime.now(UTC).isoformat(),
            "raw": {"url": ctx.start_url},
        },
    )
    snapshot = await crawl_page_with_crawl4ai(ctx, ctx.start_url, intent="profile")
    if snapshot.status != "succeeded" or not snapshot.text.strip():
        raise ValueError(snapshot.error_message or "详情页抓取失败")

    async with session_factory() as session:
        await ensure_crawl_job_can_continue(session, ctx.job_id)

    candidate = await extract_profile_candidate_with_llm(ctx, llm_profile, snapshot.text)
    if not candidate.name.strip():
        raise ValueError(PROFILE_EXTRACTION_FAILED_ERROR)

    candidate = candidate.model_copy(
        update={
            "university": candidate.university or ctx.university,
            "school": candidate.school or ctx.school,
            "profile_url": candidate.profile_url or ctx.start_url,
            "source_url": candidate.source_url or ctx.start_url,
        },
    )
    saved = await save_candidates(ctx, [candidate])
    if not saved:
        raise ValueError(PROFILE_EXTRACTION_FAILED_ERROR)

    await _emit_trace_event(
        trace_callback,
        {
            "event_type": "profile_entry",
            "message": f"详情页导师候选提取成功：{saved[0].name}",
            "created_at": datetime.now(UTC).isoformat(),
            "raw": {"candidate_id": saved[0].id, "url": ctx.start_url},
        },
    )


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
        async with session_factory() as session:
            await ensure_crawl_job_can_continue(session, ctx.job_id)

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

        snapshot = await crawl_page_with_crawl4ai(
            ctx,
            candidate.profile_url or "",
            intent="profile",
        )
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
        now = datetime.now(UTC)
        job.updated_at = now
        await mark_crawl_job_run_finished(
            session,
            job,
            status=CrawlJobStatus.FAILED.value,
            error_message=error_message,
            now=now,
        )
        await session.commit()


async def _mark_job_paused(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
) -> None:
    async with session_factory() as session:
        job = await session.get(CrawlJob, job_id)
        if job is None:
            return

        now = datetime.now(UTC)
        job.status = CrawlJobStatus.PAUSED.value
        job.updated_at = now
        await mark_crawl_job_run_paused(session, job, now=now)
        await session.commit()


async def _mark_job_canceled(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
) -> None:
    async with session_factory() as session:
        job = await session.get(CrawlJob, job_id)
        if job is None:
            return

        now = datetime.now(UTC)
        job.status = CrawlJobStatus.CANCELED.value
        job.updated_at = now
        await mark_crawl_job_run_finished(
            session,
            job,
            status=CrawlJobStatus.CANCELED.value,
            now=now,
        )
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

        await ensure_crawl_job_can_continue(session, candidate.job_id)
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
    await _accumulate_direct_llm_response_tokens(ctx.session_factory, ctx.job_id, response)
    content = _extract_model_message_content(response)
    if not content:
        raise ValueError("模型补全返回空响应")
    return CandidateEnrichmentPayload.model_validate_json(content)


async def extract_profile_candidate_with_llm(
    ctx: CrawlToolContext,
    llm_profile: LLMProfile,
    page_text: str,
) -> ProfessorCandidatePayload:
    model = build_faculty_crawler_model(llm_profile)
    prompt = build_profile_candidate_prompt(
        university=ctx.university,
        school=ctx.school,
        profile_url=ctx.start_url,
        page_text=page_text,
    )
    response = await model.ainvoke(prompt)
    await _accumulate_direct_llm_response_tokens(ctx.session_factory, ctx.job_id, response)
    content = _extract_model_message_content(response)
    if not content:
        raise ValueError(PROFILE_EXTRACTION_FAILED_ERROR)
    candidate = ProfessorCandidatePayload.model_validate_json(content)
    if not candidate.name.strip():
        raise ValueError(PROFILE_EXTRACTION_FAILED_ERROR)
    return candidate


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
