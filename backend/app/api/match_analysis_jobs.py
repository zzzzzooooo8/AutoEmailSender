from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_session, get_session_factory
from app.models import MatchAnalysisJob, MatchAnalysisJobItem
from app.schemas.match_analysis_job import (
    CreateMatchAnalysisJobRequest,
    MatchAnalysisJobActionResponse,
    MatchAnalysisJobItemRead,
    MatchAnalysisJobRead,
)
from app.services.match_analysis_job_runtime import (
    create_match_analysis_job,
    request_match_analysis_job_cancel,
    retry_failed_match_analysis_job,
    serialize_match_analysis_job,
    serialize_match_analysis_job_item,
)


router = APIRouter(prefix="/api/match-analysis-jobs", tags=["match-analysis-jobs"])


@router.get("", response_model=list[MatchAnalysisJobRead])
async def list_match_analysis_jobs(
    identity_id: int | None = Query(default=None),
    llm_profile_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_async_session),
) -> list[MatchAnalysisJobRead]:
    statement = select(MatchAnalysisJob).order_by(
        MatchAnalysisJob.created_at.desc(),
        MatchAnalysisJob.id.desc(),
    )
    if identity_id is not None:
        statement = statement.where(MatchAnalysisJob.identity_id == identity_id)
    if llm_profile_id is not None:
        statement = statement.where(MatchAnalysisJob.llm_profile_id == llm_profile_id)
    jobs = list(await session.scalars(statement))
    return [serialize_match_analysis_job(job) for job in jobs]


@router.post("", response_model=MatchAnalysisJobRead, status_code=status.HTTP_201_CREATED)
async def create_job(payload: CreateMatchAnalysisJobRequest) -> MatchAnalysisJobRead:
    try:
        job = await create_match_analysis_job(
            get_session_factory(),
            identity_id=payload.identity_id,
            llm_profile_id=payload.llm_profile_id,
            professor_ids=payload.professor_ids,
            name=payload.name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_match_analysis_job(job)


@router.get("/{job_id}", response_model=MatchAnalysisJobRead)
async def get_match_analysis_job(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> MatchAnalysisJobRead:
    job = await session.get(MatchAnalysisJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="匹配分析任务不存在")
    return serialize_match_analysis_job(job)


@router.get("/{job_id}/items", response_model=list[MatchAnalysisJobItemRead])
async def list_match_analysis_job_items(
    job_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> list[MatchAnalysisJobItemRead]:
    job_exists = await session.scalar(select(MatchAnalysisJob.id).where(MatchAnalysisJob.id == job_id))
    if job_exists is None:
        raise HTTPException(status_code=404, detail="匹配分析任务不存在")
    items = list(
        await session.scalars(
            select(MatchAnalysisJobItem)
            .options(
                selectinload(MatchAnalysisJobItem.professor),
                selectinload(MatchAnalysisJobItem.email_task),
            )
            .where(MatchAnalysisJobItem.job_id == job_id)
            .order_by(MatchAnalysisJobItem.id.asc()),
        ),
    )
    return [serialize_match_analysis_job_item(item) for item in items]


@router.post("/{job_id}/cancel", response_model=MatchAnalysisJobActionResponse)
async def cancel_match_analysis_job(job_id: int) -> MatchAnalysisJobActionResponse:
    try:
        job = await request_match_analysis_job_cancel(get_session_factory(), job_id)
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if "不存在" in detail else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return MatchAnalysisJobActionResponse(ok=True, job=serialize_match_analysis_job(job))


@router.post("/{job_id}/retry-failed", response_model=MatchAnalysisJobRead, status_code=status.HTTP_201_CREATED)
async def retry_failed_match_analysis_job_api(job_id: int) -> MatchAnalysisJobRead:
    try:
        job = await retry_failed_match_analysis_job(get_session_factory(), job_id)
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if "不存在" in detail else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return serialize_match_analysis_job(job)
