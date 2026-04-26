from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.faculty_crawler_agent import run_faculty_crawler_agent
from app.models import CrawlJob, CrawlJobStatus, LLMProfile
from app.services.crawl_job_events import normalize_agent_trace_event
from app.services.crawler_tools import CrawlToolContext


NO_LLM_PROFILE_ERROR = "请先配置可用的 LLM Profile"
WORKER_CANCELLED_ERROR = "抓取任务被后台 worker 取消"
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

    async def trace_callback(event: dict[str, object]) -> None:
        await _append_agent_trace(session_factory, job_id, event)

    try:
        await run_faculty_crawler_agent(ctx, llm_profile, trace_callback=trace_callback)
    except asyncio.CancelledError:
        await _mark_job_failed(session_factory, job_id, WORKER_CANCELLED_ERROR)
        raise
    except Exception as exc:
        await _mark_job_failed(session_factory, job_id, str(exc))
    else:
        await _mark_running_job_needs_review(session_factory, job_id)

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


async def _mark_running_job_needs_review(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
) -> None:
    async with session_factory() as session:
        job = await session.get(CrawlJob, job_id)
        if job is None or job.status != CrawlJobStatus.RUNNING.value:
            return

        job.status = CrawlJobStatus.NEEDS_REVIEW.value
        job.error_message = None
        job.updated_at = datetime.now(UTC)
        await session.commit()


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


def _normalize_trace(value: Any) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]
