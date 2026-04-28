from __future__ import annotations

import re
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CrawlJob, CrawlJobRun, CrawlJobStatus


USAGE_METADATA_PATTERN = re.compile(
    r"usage_metadata=\{'input_tokens':\s*(?P<input>\d+),\s*"
    r"'output_tokens':\s*(?P<output>\d+),\s*'total_tokens':\s*(?P<total>\d+)",
)
TOKEN_USAGE_PATTERN = re.compile(
    r"'token_usage':\s*\{'completion_tokens':\s*(?P<output>\d+),\s*"
    r"'prompt_tokens':\s*(?P<input>\d+),\s*'total_tokens':\s*(?P<total>\d+)",
)


async def create_initial_crawl_job_run(
    session: AsyncSession,
    job: CrawlJob,
    *,
    now: datetime | None = None,
) -> CrawlJobRun:
    resolved_now = now or datetime.now(UTC)
    run = CrawlJobRun(
        job_id=job.id,
        attempt_number=1,
        status=job.status,
        created_at=resolved_now,
        updated_at=resolved_now,
    )
    session.add(run)
    await session.flush()
    job.current_run_id = run.id
    return run


async def create_retry_crawl_job_run(
    session: AsyncSession,
    job: CrawlJob,
    *,
    now: datetime | None = None,
) -> CrawlJobRun:
    resolved_now = now or datetime.now(UTC)
    max_attempt = await session.scalar(
        select(func.max(CrawlJobRun.attempt_number)).where(CrawlJobRun.job_id == job.id)
    )
    run = CrawlJobRun(
        job_id=job.id,
        attempt_number=int(max_attempt or 0) + 1,
        status=CrawlJobStatus.QUEUED.value,
        created_at=resolved_now,
        updated_at=resolved_now,
    )
    session.add(run)
    await session.flush()
    job.current_run_id = run.id
    return run


async def get_or_create_current_crawl_job_run(
    session: AsyncSession,
    job: CrawlJob,
    *,
    now: datetime | None = None,
) -> CrawlJobRun:
    if job.current_run_id is not None:
        run = await session.get(CrawlJobRun, job.current_run_id)
        if run is not None:
            return run
    return await create_initial_crawl_job_run(session, job, now=now)


async def mark_crawl_job_run_running(
    session: AsyncSession,
    job: CrawlJob,
    *,
    now: datetime | None = None,
) -> CrawlJobRun:
    resolved_now = now or datetime.now(UTC)
    run = await get_or_create_current_crawl_job_run(session, job, now=resolved_now)
    run.status = CrawlJobStatus.RUNNING.value
    if run.started_at is None:
        run.started_at = resolved_now
    run.active_started_at = resolved_now
    run.updated_at = resolved_now
    return run


async def mark_crawl_job_run_paused(
    session: AsyncSession,
    job: CrawlJob,
    *,
    now: datetime | None = None,
) -> CrawlJobRun:
    resolved_now = now or datetime.now(UTC)
    run = await get_or_create_current_crawl_job_run(session, job, now=resolved_now)
    _settle_active_segment(run, now=resolved_now)
    run.status = CrawlJobStatus.PAUSED.value
    run.paused_at = resolved_now
    run.updated_at = resolved_now
    return run


async def mark_crawl_job_run_queued(
    session: AsyncSession,
    job: CrawlJob,
    *,
    now: datetime | None = None,
) -> CrawlJobRun:
    resolved_now = now or datetime.now(UTC)
    run = await get_or_create_current_crawl_job_run(session, job, now=resolved_now)
    run.status = CrawlJobStatus.QUEUED.value
    run.updated_at = resolved_now
    return run


async def mark_crawl_job_run_finished(
    session: AsyncSession,
    job: CrawlJob,
    *,
    status: str,
    error_message: str | None = None,
    now: datetime | None = None,
) -> CrawlJobRun:
    resolved_now = now or datetime.now(UTC)
    run = await get_or_create_current_crawl_job_run(session, job, now=resolved_now)
    _settle_active_segment(run, now=resolved_now)
    run.status = status
    run.finished_at = resolved_now
    run.error_message = error_message
    run.updated_at = resolved_now
    return run


async def accumulate_crawl_job_run_tokens(
    session: AsyncSession,
    job_id: int,
    event: dict[str, object],
) -> bool:
    usage = extract_token_usage(event)
    if usage is None:
        return False

    job = await session.get(CrawlJob, job_id)
    if job is None:
        return False
    run = await get_or_create_current_crawl_job_run(session, job)
    run.input_tokens += usage["input_tokens"]
    run.output_tokens += usage["output_tokens"]
    run.total_tokens += usage["total_tokens"]
    run.updated_at = datetime.now(UTC)
    return True


def extract_token_usage(event: dict[str, object]) -> dict[str, int] | None:
    haystack = _stringify_trace_payload(event)
    for pattern in (USAGE_METADATA_PATTERN, TOKEN_USAGE_PATTERN):
        match = pattern.search(haystack)
        if match:
            return {
                "input_tokens": int(match.group("input")),
                "output_tokens": int(match.group("output")),
                "total_tokens": int(match.group("total")),
            }
    return None


def _settle_active_segment(run: CrawlJobRun, *, now: datetime) -> None:
    active_started_at = _ensure_datetime(run.active_started_at)
    if active_started_at is None:
        return
    run.active_seconds += max(0, int((now - active_started_at).total_seconds()))
    run.active_started_at = None


def _stringify_trace_payload(event: dict[str, object]) -> str:
    parts: list[str] = []
    for key in ("message", "summary"):
        value = event.get(key)
        if isinstance(value, str):
            parts.append(value)
    raw = event.get("raw")
    if raw is not None:
        parts.append(str(raw))
    else:
        parts.append(str(event))
    return "\n".join(parts)


def _ensure_datetime(value: object) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value
