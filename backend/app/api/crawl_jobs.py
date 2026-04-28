# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_session
from app.models import (
    CrawlCandidate,
    CrawlCandidateReviewStatus,
    CrawlJob,
    CrawlJobStatus,
    CrawlPage,
    Professor,
)
from app.schemas.crawl_job import (
    CrawlCandidateRead,
    CrawlCandidateUpdatePayload,
    CrawlJobApprovePayload,
    CrawlJobApproveResult,
    CrawlJobCreatePayload,
    CrawlJobEventRead,
    CrawlJobRead,
    CrawlJobSummaryRead,
    CrawlPageRead,
    CrawlJobRetryPayload,
)
from app.services.crawl_job_events import build_crawl_job_events, normalize_agent_trace_event
from app.services.crawl_job_metrics import build_crawl_job_metrics
from app.services.crawl_job_runs import (
    create_initial_crawl_job_run,
    create_retry_crawl_job_run,
    mark_crawl_job_run_finished,
    mark_crawl_job_run_paused,
    mark_crawl_job_run_queued,
)
from app.services.operation_logs import record_operation_log
from app.services.professor_management import is_valid_professor_email


router = APIRouter(prefix="/api/crawl-jobs", tags=["crawl-jobs"])


@router.post("", response_model=CrawlJobRead, status_code=status.HTTP_201_CREATED)
async def create_crawl_job(
    payload: CrawlJobCreatePayload,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlJob:
    job = CrawlJob(
        university=payload.university,
        school=payload.school,
        start_url=payload.start_url,
        llm_profile_id=payload.llm_profile_id,
        status=CrawlJobStatus.QUEUED.value,
        progress_current=0,
        progress_total=0,
    )
    session.add(job)
    await session.flush()
    await create_initial_crawl_job_run(session, job)
    await record_operation_log(
        session,
        category="crawler",
        event_name="crawl_job.created",
        entity_type="crawl_job",
        entity_id=str(job.id),
        metadata={
            "university": job.university,
            "school": job.school,
            "start_url": job.start_url,
            "llm_profile_id": job.llm_profile_id,
        },
    )
    await session.commit()
    await session.refresh(job)
    return job


@router.get("", response_model=list[CrawlJobSummaryRead])
async def list_crawl_jobs(
    session: AsyncSession = Depends(get_async_session),
) -> list[CrawlJobSummaryRead]:
    jobs = list(
        (
            await session.execute(
                select(CrawlJob)
                .options(selectinload(CrawlJob.current_run))
                .order_by(CrawlJob.created_at.desc(), CrawlJob.id.desc())
                .limit(50),
            )
        ).scalars(),
    )
    return await _build_crawl_job_summaries(session, jobs)


@router.patch("/candidates/{candidate_id}", response_model=CrawlCandidateRead)
async def update_crawl_candidate(
    candidate_id: int,
    payload: CrawlCandidateUpdatePayload,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlCandidate:
    candidate = await session.get(CrawlCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="未找到候选导师")

    candidate.name = payload.name
    candidate.email = payload.email.lower() if payload.email else None
    candidate.title = payload.title
    candidate.university = payload.university
    candidate.school = payload.school
    candidate.department = payload.department
    candidate.research_direction = payload.research_direction
    candidate.recent_papers = payload.recent_papers
    candidate.profile_url = payload.profile_url
    candidate.source_url = payload.source_url
    candidate.review_status = payload.review_status
    candidate.updated_at = datetime.now(UTC)

    await record_operation_log(
        session,
        category="crawler",
        event_name="crawl_candidate.updated",
        entity_type="crawl_candidate",
        entity_id=str(candidate.id),
        metadata={
            "job_id": candidate.job_id,
            "review_status": candidate.review_status,
            "has_email": bool(candidate.email),
        },
    )
    await session.commit()
    await session.refresh(candidate)
    return candidate


@router.get("/{job_id}", response_model=CrawlJobSummaryRead)
async def get_crawl_job(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlJobSummaryRead:
    job = await _get_crawl_job_or_404(session, job_id)
    summaries = await _build_crawl_job_summaries(session, [job])
    return summaries[0]


@router.get("/{job_id}/events", response_model=list[CrawlJobEventRead])
async def list_crawl_job_events(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> list[dict[str, object]]:
    job = await _get_crawl_job_or_404(session, job_id)
    pages = await _list_crawl_pages_for_job(session, job_id)
    candidates = await _list_crawl_candidates_for_job(session, job_id)
    return build_crawl_job_events(job, pages=pages, candidates=candidates)


@router.get("/{job_id}/pages", response_model=list[CrawlPageRead])
async def list_crawl_pages(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> list[CrawlPage]:
    await _get_crawl_job_or_404(session, job_id)
    return await _list_crawl_pages_for_job(session, job_id)


@router.get("/{job_id}/candidates", response_model=list[CrawlCandidateRead])
async def list_crawl_candidates(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> list[CrawlCandidate]:
    await _get_crawl_job_or_404(session, job_id)
    return await _list_crawl_candidates_for_job(session, job_id)


async def _list_crawl_pages_for_job(session: AsyncSession, job_id: int) -> list[CrawlPage]:
    return list(
        (
            await session.execute(
                select(CrawlPage)
                .where(CrawlPage.job_id == job_id)
                .order_by(CrawlPage.created_at.asc(), CrawlPage.id.asc()),
            )
        ).scalars(),
    )


async def _list_crawl_candidates_for_job(session: AsyncSession, job_id: int) -> list[CrawlCandidate]:
    return list(
        (
            await session.execute(
                select(CrawlCandidate)
                .where(CrawlCandidate.job_id == job_id)
                .order_by(
                    CrawlCandidate.confidence.desc(),
                    CrawlCandidate.created_at.asc(),
                    CrawlCandidate.id.asc(),
                ),
            )
        ).scalars(),
    )


@router.post("/{job_id}/approve", response_model=CrawlJobApproveResult)
async def approve_crawl_candidates(
    job_id: int,
    payload: CrawlJobApprovePayload,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlJobApproveResult:
    job = await _get_crawl_job_or_404(session, job_id)
    if job.status != CrawlJobStatus.NEEDS_REVIEW.value:
        raise HTTPException(status_code=409, detail="抓取任务尚未进入审核状态")
    if not payload.candidate_ids:
        raise HTTPException(status_code=400, detail="请至少选择一位候选导师")

    candidates = list(
        (
            await session.execute(
                select(CrawlCandidate)
                .where(
                    CrawlCandidate.job_id == job_id,
                    CrawlCandidate.id.in_(payload.candidate_ids),
                )
                .order_by(CrawlCandidate.id.asc()),
            )
        ).scalars(),
    )
    if not candidates:
        raise HTTPException(status_code=400, detail="未找到可审核的候选导师")

    inserted_count = 0
    updated_count = 0
    skipped_count = 0
    now = datetime.now(UTC)

    for candidate in candidates:
        email = candidate.email.strip().lower() if candidate.email else None
        if email is None or not is_valid_professor_email(email):
            skipped_count += 1
            continue

        professor = await session.scalar(select(Professor).where(Professor.email == email))
        if professor is None:
            professor = Professor(email=email)
            session.add(professor)
            inserted_count += 1
        else:
            updated_count += 1

        professor.name = candidate.name
        professor.email = email
        professor.title = candidate.title
        professor.university = candidate.university
        professor.school = candidate.school
        professor.department = candidate.department
        professor.research_direction = candidate.research_direction
        professor.recent_papers = candidate.recent_papers or []
        professor.profile_url = candidate.profile_url
        professor.source_url = candidate.source_url
        professor.archived_at = None
        professor.updated_at = now
        await session.flush()

        candidate.professor_id = professor.id
        candidate.review_status = CrawlCandidateReviewStatus.ACCEPTED.value
        candidate.updated_at = now

    job.status = CrawlJobStatus.COMPLETED.value
    job.updated_at = now
    await record_operation_log(
        session,
        category="crawler",
        event_name="crawl_job.approved",
        entity_type="crawl_job",
        entity_id=str(job.id),
        metadata={
            "inserted_count": inserted_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "candidate_count": len(candidates),
        },
    )
    await session.commit()

    return CrawlJobApproveResult(
        inserted_count=inserted_count,
        updated_count=updated_count,
        skipped_count=skipped_count,
        message=(
            f"审核完成：新增 {inserted_count} 位导师，更新 {updated_count} 位导师，"
            f"跳过 {skipped_count} 位候选。"
        ),
    )


@router.post("/{job_id}/cancel", response_model=CrawlJobRead)
async def cancel_crawl_job(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlJob:
    job = await _get_crawl_job_or_404(session, job_id)
    if job.status in {
        CrawlJobStatus.COMPLETED.value,
        CrawlJobStatus.FAILED.value,
        CrawlJobStatus.CANCELED.value,
    }:
        return job

    now = datetime.now(UTC)
    job.status = CrawlJobStatus.CANCELED.value
    job.updated_at = now
    await mark_crawl_job_run_finished(
        session,
        job,
        status=CrawlJobStatus.CANCELED.value,
        now=now,
    )
    await record_operation_log(
        session,
        category="crawler",
        event_name="crawl_job.canceled",
        entity_type="crawl_job",
        entity_id=str(job.id),
        metadata={"status": job.status},
    )
    await session.commit()
    await session.refresh(job)
    return job


@router.post("/{job_id}/pause", response_model=CrawlJobRead)
async def pause_crawl_job(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlJob:
    job = await _get_crawl_job_or_404(session, job_id)
    if job.status == CrawlJobStatus.PAUSED.value:
        return job
    if job.status not in {CrawlJobStatus.QUEUED.value, CrawlJobStatus.RUNNING.value}:
        raise HTTPException(status_code=409, detail="仅允许暂停排队中或运行中的抓取任务")

    now = datetime.now(UTC)
    job.status = CrawlJobStatus.PAUSED.value
    job.updated_at = now
    await mark_crawl_job_run_paused(session, job, now=now)
    await record_operation_log(
        session,
        category="crawler",
        event_name="crawl_job.paused",
        entity_type="crawl_job",
        entity_id=str(job.id),
        metadata={"status": job.status},
    )
    await session.commit()
    await session.refresh(job)
    return job


@router.post("/{job_id}/resume", response_model=CrawlJobRead)
async def resume_crawl_job(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlJob:
    job = await _get_crawl_job_or_404(session, job_id)
    if job.status != CrawlJobStatus.PAUSED.value:
        raise HTTPException(status_code=409, detail="仅允许继续已暂停的抓取任务")

    now = datetime.now(UTC)
    job.status = CrawlJobStatus.QUEUED.value
    job.error_message = None
    job.updated_at = now
    await mark_crawl_job_run_queued(session, job, now=now)
    await record_operation_log(
        session,
        category="crawler",
        event_name="crawl_job.resumed",
        entity_type="crawl_job",
        entity_id=str(job.id),
        metadata={"status": job.status},
    )
    await session.commit()
    await session.refresh(job)
    return job


@router.post("/{job_id}/retry", response_model=CrawlJobRead)
async def retry_crawl_job(
    job_id: int,
    payload: CrawlJobRetryPayload,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlJob:
    job = await _get_crawl_job_or_404(session, job_id)
    if job.status not in {CrawlJobStatus.FAILED.value, CrawlJobStatus.CANCELED.value}:
        raise HTTPException(
            status_code=409,
            detail="仅允许重试状态为\"失败\"或\"已取消\"的抓取任务",
        )

    if payload.clear_existing_data:
        await session.execute(
            delete(CrawlCandidate).where(CrawlCandidate.job_id == job.id),
        )
        await session.execute(
            delete(CrawlPage).where(CrawlPage.job_id == job.id),
        )
        job.agent_trace = []

    now = datetime.now(UTC)
    job.status = CrawlJobStatus.QUEUED.value
    job.progress_current = 0
    job.progress_total = 0
    job.error_message = None
    job.updated_at = now
    await create_retry_crawl_job_run(session, job, now=now)
    await record_operation_log(
        session,
        category="crawler",
        event_name="crawl_job.retried",
        entity_type="crawl_job",
        entity_id=str(job.id),
        metadata={
            "status": job.status,
            "clear_existing_data": payload.clear_existing_data,
        },
    )
    await session.commit()
    await session.refresh(job)
    return job


async def _get_crawl_job_or_404(session: AsyncSession, job_id: int) -> CrawlJob:
    job = await session.scalar(
        select(CrawlJob).options(selectinload(CrawlJob.current_run)).where(CrawlJob.id == job_id),
    )
    if job is None:
        raise HTTPException(status_code=404, detail="未找到抓取任务")
    return job


async def _build_crawl_job_summaries(
    session: AsyncSession,
    jobs: list[CrawlJob],
) -> list[CrawlJobSummaryRead]:
    if not jobs:
        return []

    job_ids = [job.id for job in jobs]
    page_counts = await _count_by_job_id(session, CrawlPage.job_id, job_ids)
    candidate_counts = await _count_by_job_id(session, CrawlCandidate.job_id, job_ids)

    return [
        CrawlJobSummaryRead.model_validate(job).model_copy(
            update={
                "page_count": page_counts.get(job.id, 0),
                "candidate_count": candidate_counts.get(job.id, 0),
                "latest_event_message": _latest_event_message(job.agent_trace),
                "input_tokens": metrics.input_tokens,
                "output_tokens": metrics.output_tokens,
                "total_tokens": metrics.total_tokens,
                "duration_seconds": metrics.duration_seconds,
            },
        )
        for job in jobs
        for metrics in [build_crawl_job_metrics(job)]
    ]


async def _count_by_job_id(
    session: AsyncSession,
    job_id_column: object,
    job_ids: list[int],
) -> dict[int, int]:
    rows = (
        await session.execute(
            select(job_id_column, func.count())
            .where(job_id_column.in_(job_ids))
            .group_by(job_id_column),
        )
    ).all()
    return {int(job_id): int(count) for job_id, count in rows}


def _latest_event_message(agent_trace: object) -> str | None:
    if not isinstance(agent_trace, list):
        return None

    trace_events = [item for item in agent_trace if isinstance(item, dict)]
    if not trace_events:
        return None

    latest_event = trace_events[-1]
    summary = latest_event.get("summary")
    if isinstance(summary, str) and summary.strip():
        return summary.strip()

    message = normalize_agent_trace_event(latest_event).get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    return None

