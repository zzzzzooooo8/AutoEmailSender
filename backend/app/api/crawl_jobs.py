from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    CrawlJobRead,
    CrawlPageRead,
)
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
    await session.commit()
    await session.refresh(job)
    return job


@router.get("", response_model=list[CrawlJobRead])
async def list_crawl_jobs(
    session: AsyncSession = Depends(get_async_session),
) -> list[CrawlJob]:
    return list(
        (
            await session.execute(
                select(CrawlJob)
                .order_by(CrawlJob.created_at.desc(), CrawlJob.id.desc())
                .limit(50),
            )
        ).scalars(),
    )


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

    await session.commit()
    await session.refresh(candidate)
    return candidate


@router.get("/{job_id}", response_model=CrawlJobRead)
async def get_crawl_job(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> CrawlJob:
    return await _get_crawl_job_or_404(session, job_id)


@router.get("/{job_id}/pages", response_model=list[CrawlPageRead])
async def list_crawl_pages(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> list[CrawlPage]:
    await _get_crawl_job_or_404(session, job_id)
    return list(
        (
            await session.execute(
                select(CrawlPage)
                .where(CrawlPage.job_id == job_id)
                .order_by(CrawlPage.created_at.asc(), CrawlPage.id.asc()),
            )
        ).scalars(),
    )


@router.get("/{job_id}/candidates", response_model=list[CrawlCandidateRead])
async def list_crawl_candidates(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> list[CrawlCandidate]:
    await _get_crawl_job_or_404(session, job_id)
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
    if not payload.candidate_ids:
        raise HTTPException(status_code=400, detail="请至少选择一位候选导师")

    job = await _get_crawl_job_or_404(session, job_id)
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
    if job.status in {CrawlJobStatus.COMPLETED.value, CrawlJobStatus.FAILED.value}:
        return job

    job.status = CrawlJobStatus.CANCELED.value
    job.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(job)
    return job


async def _get_crawl_job_or_404(session: AsyncSession, job_id: int) -> CrawlJob:
    job = await session.get(CrawlJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="未找到抓取任务")
    return job
