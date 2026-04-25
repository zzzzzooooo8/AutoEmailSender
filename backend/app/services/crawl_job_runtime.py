from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.faculty_crawler_agent import run_faculty_crawler_agent
from app.models import CrawlJob, CrawlJobStatus, LLMProfile
from app.services.crawler_tools import CrawlToolContext


NO_LLM_PROFILE_ERROR = "请先配置可用的 LLM Profile"
MAX_AGENT_TRACE_EVENTS = 100


async def run_queued_crawl_jobs_once(
    session_factory: async_sessionmaker[AsyncSession],
) -> int:
    async with session_factory() as session:
        job = await session.scalar(
            select(CrawlJob)
            .where(CrawlJob.status == CrawlJobStatus.QUEUED.value)
            .order_by(CrawlJob.created_at.asc(), CrawlJob.id.asc())
            .limit(1),
        )
        if job is None:
            return 0

        llm_profile = await _resolve_llm_profile(session, job)
        if llm_profile is None:
            job.status = CrawlJobStatus.FAILED.value
            job.error_message = NO_LLM_PROFILE_ERROR
            job.updated_at = datetime.now(UTC)
            await session.commit()
            return 1

        job.status = CrawlJobStatus.RUNNING.value
        job.error_message = None
        job.updated_at = datetime.now(UTC)
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

        trace = list(_normalize_trace(job.agent_trace))
        trace.append(event)
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
