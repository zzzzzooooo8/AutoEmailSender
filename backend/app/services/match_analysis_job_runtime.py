from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.models import (
    EmailTask,
    EmailTaskSource,
    EmailTaskStatus,
    IdentityProfile,
    LLMProfile,
    MatchAnalysisJob,
    MatchAnalysisJobItem,
    MatchAnalysisJobItemStatus,
    MatchAnalysisJobStatus,
    Professor,
)
from app.schemas.match_analysis_job import MatchAnalysisJobItemRead, MatchAnalysisJobRead
from app.services.task_runtime import (
    MatchAnalysisAlreadyRunningError,
    calculate_task_match,
)


async def create_match_analysis_job(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    identity_id: int,
    llm_profile_id: int,
    professor_ids: list[int],
    name: str | None = None,
) -> MatchAnalysisJob:
    unique_professor_ids = list(dict.fromkeys(professor_ids))
    if not unique_professor_ids:
        raise ValueError("请选择要分析匹配度的导师")

    async with session_factory() as session:
        identity = await session.get(IdentityProfile, identity_id)
        if identity is None:
            raise ValueError("身份不存在")
        if identity.current_primary_material_id is None:
            raise ValueError("请先设置默认材料")

        llm_profile = await session.get(LLMProfile, llm_profile_id)
        if llm_profile is None:
            raise ValueError("LLM 配置不存在")

        professors = list(
            await session.scalars(
                select(Professor)
                .where(
                    Professor.id.in_(unique_professor_ids),
                    Professor.archived_at.is_(None),
                )
                .order_by(Professor.id.asc()),
            ),
        )
        if not professors:
            raise ValueError("没有可分析的导师")

        now = datetime.now(UTC)
        job = MatchAnalysisJob(
            name=name or f"批量匹配分析 {now:%Y-%m-%d %H:%M}",
            identity_id=identity_id,
            llm_profile_id=llm_profile_id,
            status=MatchAnalysisJobStatus.QUEUED.value,
            target_count=0,
            skipped_count=0,
            created_at=now,
            updated_at=now,
        )
        session.add(job)
        await session.flush()

        queued_count = 0
        skipped_count = 0
        for professor in professors:
            if _has_professor_match_evidence(professor):
                email_task = await _ensure_match_email_task(
                    session,
                    professor=professor,
                    identity=identity,
                    llm_profile=llm_profile,
                )
                item = MatchAnalysisJobItem(
                    job_id=job.id,
                    professor_id=professor.id,
                    email_task_id=email_task.id,
                    status=MatchAnalysisJobItemStatus.QUEUED.value,
                    created_at=now,
                    updated_at=now,
                )
                queued_count += 1
            else:
                item = MatchAnalysisJobItem(
                    job_id=job.id,
                    professor_id=professor.id,
                    email_task_id=None,
                    status=MatchAnalysisJobItemStatus.SKIPPED.value,
                    skip_reason="缺少研究方向或近期论文",
                    finished_at=now,
                    created_at=now,
                    updated_at=now,
                )
                skipped_count += 1
            session.add(item)

        if queued_count == 0:
            await session.rollback()
            raise ValueError("已选导师都缺少研究方向或近期论文，暂不能分析匹配度")

        job.target_count = queued_count
        job.skipped_count = skipped_count
        await session.commit()
        await session.refresh(job)
        return job


def serialize_match_analysis_job(job: MatchAnalysisJob) -> MatchAnalysisJobRead:
    return MatchAnalysisJobRead(
        id=job.id,
        name=job.name,
        status=job.status,
        target_count=job.target_count,
        succeeded_count=job.succeeded_count,
        failed_count=job.failed_count,
        skipped_count=job.skipped_count,
        total_prompt_tokens=job.total_prompt_tokens,
        total_completion_tokens=job.total_completion_tokens,
        total_tokens=job.total_tokens,
        identity_id=job.identity_id,
        llm_profile_id=job.llm_profile_id,
        cancel_requested_at=job.cancel_requested_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        created_at=job.created_at,
        updated_at=job.updated_at,
        last_error=job.last_error,
    )


def serialize_match_analysis_job_item(
    item: MatchAnalysisJobItem,
) -> MatchAnalysisJobItemRead:
    return MatchAnalysisJobItemRead(
        id=item.id,
        job_id=item.job_id,
        professor_id=item.professor_id,
        professor_name=item.professor.name,
        professor_email=item.professor.email,
        professor_title=item.professor.title,
        professor_school=item.professor.school,
        email_task_id=item.email_task_id,
        status=item.status,
        match_score=item.email_task.match_score if item.email_task else None,
        match_analysis_run_id=item.match_analysis_run_id,
        error_message=item.error_message,
        skip_reason=item.skip_reason,
        prompt_tokens=item.prompt_tokens,
        completion_tokens=item.completion_tokens,
        total_tokens=item.total_tokens,
        started_at=item.started_at,
        finished_at=item.finished_at,
        updated_at=item.updated_at,
    )


async def run_queued_match_analysis_jobs_once(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    item_concurrency: int = 3,
) -> int:
    job_id = await _claim_next_match_analysis_job(session_factory)
    if job_id is None:
        return 0
    await _run_match_analysis_job(
        session_factory,
        job_id,
        item_concurrency=item_concurrency,
    )
    return 1


async def request_match_analysis_job_cancel(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
) -> MatchAnalysisJob:
    async with session_factory() as session:
        job = await session.get(MatchAnalysisJob, job_id)
        if job is None:
            raise ValueError("匹配分析任务不存在")

        now = datetime.now(UTC)
        if job.status == MatchAnalysisJobStatus.QUEUED.value:
            job.status = MatchAnalysisJobStatus.CANCELED.value
            job.cancel_requested_at = now
            job.finished_at = now
            job.updated_at = now
            await session.execute(
                update(MatchAnalysisJobItem)
                .where(
                    MatchAnalysisJobItem.job_id == job.id,
                    MatchAnalysisJobItem.status == MatchAnalysisJobItemStatus.QUEUED.value,
                )
                .values(
                    status=MatchAnalysisJobItemStatus.CANCELED.value,
                    finished_at=now,
                    updated_at=now,
                ),
            )
            await session.commit()
            await session.refresh(job)
            return job

        if job.status == MatchAnalysisJobStatus.RUNNING.value:
            job.cancel_requested_at = now
            job.updated_at = now
            await session.commit()
            await session.refresh(job)
            return job

        raise ValueError("只有排队中或运行中的匹配分析任务可以取消")


async def retry_failed_match_analysis_job(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
) -> MatchAnalysisJob:
    async with session_factory() as session:
        job = await session.get(MatchAnalysisJob, job_id)
        if job is None:
            raise ValueError("匹配分析任务不存在")
        professor_ids = list(
            await session.scalars(
                select(MatchAnalysisJobItem.professor_id)
                .where(
                    MatchAnalysisJobItem.job_id == job_id,
                    MatchAnalysisJobItem.status.in_(
                        [
                            MatchAnalysisJobItemStatus.FAILED.value,
                            MatchAnalysisJobItemStatus.CANCELED.value,
                        ]
                    ),
                )
                .order_by(MatchAnalysisJobItem.id.asc()),
            )
        )
        identity_id = job.identity_id
        llm_profile_id = job.llm_profile_id
        name = f"{job.name} - 重试"

    if not professor_ids:
        raise ValueError("没有可重试的失败项")

    return await create_match_analysis_job(
        session_factory,
        identity_id=identity_id,
        llm_profile_id=llm_profile_id,
        professor_ids=professor_ids,
        name=name,
    )


def _has_professor_match_evidence(professor: Professor) -> bool:
    if professor.research_direction and professor.research_direction.strip():
        return True
    return bool(professor.recent_papers)


async def _ensure_match_email_task(
    session: AsyncSession,
    *,
    professor: Professor,
    identity: IdentityProfile,
    llm_profile: LLMProfile,
) -> EmailTask:
    existing_task = await session.scalar(
        select(EmailTask)
        .where(
            EmailTask.professor_id == professor.id,
            EmailTask.identity_id == identity.id,
            EmailTask.llm_profile_id == llm_profile.id,
            EmailTask.status != EmailTaskStatus.CANCELED.value,
        )
        .order_by(EmailTask.created_at.desc(), EmailTask.id.desc())
        .limit(1),
    )
    if existing_task is not None:
        if existing_task.primary_material_id is None:
            existing_task.primary_material_id = identity.current_primary_material_id
        return existing_task

    task = EmailTask(
        professor_id=professor.id,
        identity_id=identity.id,
        llm_profile_id=llm_profile.id,
        source=EmailTaskSource.MANUAL.value,
        status=EmailTaskStatus.DISCOVERED.value,
        primary_material_id=identity.current_primary_material_id,
        selected_material_ids=[],
    )
    session.add(task)
    await session.flush()
    return task


async def _claim_next_match_analysis_job(
    session_factory: async_sessionmaker[AsyncSession],
) -> int | None:
    async with session_factory() as session:
        job_id = await session.scalar(
            select(MatchAnalysisJob.id)
            .where(MatchAnalysisJob.status == MatchAnalysisJobStatus.QUEUED.value)
            .order_by(MatchAnalysisJob.created_at.asc(), MatchAnalysisJob.id.asc())
            .limit(1),
        )
        if job_id is None:
            return None

        now = datetime.now(UTC)
        claim_result = await session.execute(
            update(MatchAnalysisJob)
            .where(
                MatchAnalysisJob.id == job_id,
                MatchAnalysisJob.status == MatchAnalysisJobStatus.QUEUED.value,
            )
            .values(
                status=MatchAnalysisJobStatus.RUNNING.value,
                started_at=now,
                updated_at=now,
                last_error=None,
            ),
        )
        if claim_result.rowcount != 1:
            await session.rollback()
            return None
        await session.commit()
        return job_id


async def _run_match_analysis_job(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
    *,
    item_concurrency: int,
) -> None:
    async with session_factory() as session:
        queued_item_ids = list(
            await session.scalars(
                select(MatchAnalysisJobItem.id)
                .where(
                    MatchAnalysisJobItem.job_id == job_id,
                    MatchAnalysisJobItem.status == MatchAnalysisJobItemStatus.QUEUED.value,
                )
                .order_by(MatchAnalysisJobItem.id.asc()),
            )
        )

    semaphore = asyncio.Semaphore(max(item_concurrency, 1))

    async def run_item(item_id: int) -> None:
        async with semaphore:
            await _run_match_analysis_job_item(session_factory, job_id, item_id)

    await asyncio.gather(*(run_item(item_id) for item_id in queued_item_ids))
    await _refresh_match_analysis_job_summary(session_factory, job_id)


async def _run_match_analysis_job_item(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
    item_id: int,
) -> None:
    now = datetime.now(UTC)
    async with session_factory() as session:
        job = await session.get(MatchAnalysisJob, job_id)
        item = await session.get(
            MatchAnalysisJobItem,
            item_id,
            options=[selectinload(MatchAnalysisJobItem.email_task)],
        )
        if job is None or item is None:
            return

        if job.cancel_requested_at is not None:
            item.status = MatchAnalysisJobItemStatus.CANCELED.value
            item.finished_at = now
            item.updated_at = now
            await session.commit()
            return

        item.status = MatchAnalysisJobItemStatus.RUNNING.value
        item.started_at = now
        item.updated_at = now
        await session.commit()

    try:
        result = await calculate_task_match(
            session_factory,
            item.email_task_id,
            force=True,
            ignore_batch_status=True,
        )
    except MatchAnalysisAlreadyRunningError as exc:
        await _mark_item_skipped(
            session_factory,
            item_id,
            skip_reason=str(exc),
        )
        return
    except ValueError as exc:
        await _mark_item_skipped(
            session_factory,
            item_id,
            skip_reason=str(exc),
        )
        return
    except Exception as exc:
        await _mark_item_failed(
            session_factory,
            item_id,
            error_message=str(exc),
        )
        return

    await _mark_item_succeeded(
        session_factory,
        item_id,
        run_id=result.run_id,
        prompt_tokens=result.usage.prompt_tokens or 0,
        completion_tokens=result.usage.completion_tokens or 0,
        total_tokens=result.usage.total_tokens or 0,
    )


async def _mark_item_succeeded(
    session_factory: async_sessionmaker[AsyncSession],
    item_id: int,
    *,
    run_id: int | None,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
) -> None:
    async with session_factory() as session:
        item = await session.get(MatchAnalysisJobItem, item_id)
        if item is None:
            return
        now = datetime.now(UTC)
        item.status = MatchAnalysisJobItemStatus.SUCCEEDED.value
        item.match_analysis_run_id = run_id
        item.prompt_tokens = prompt_tokens
        item.completion_tokens = completion_tokens
        item.total_tokens = total_tokens
        item.error_message = None
        item.skip_reason = None
        item.finished_at = now
        item.updated_at = now
        await session.commit()


async def _mark_item_skipped(
    session_factory: async_sessionmaker[AsyncSession],
    item_id: int,
    *,
    skip_reason: str,
) -> None:
    async with session_factory() as session:
        item = await session.get(MatchAnalysisJobItem, item_id)
        if item is None:
            return
        now = datetime.now(UTC)
        item.status = MatchAnalysisJobItemStatus.SKIPPED.value
        item.skip_reason = skip_reason
        item.error_message = None
        item.finished_at = now
        item.updated_at = now
        await session.commit()


async def _mark_item_failed(
    session_factory: async_sessionmaker[AsyncSession],
    item_id: int,
    *,
    error_message: str,
) -> None:
    async with session_factory() as session:
        item = await session.get(MatchAnalysisJobItem, item_id)
        if item is None:
            return
        now = datetime.now(UTC)
        item.status = MatchAnalysisJobItemStatus.FAILED.value
        item.error_message = error_message
        item.finished_at = now
        item.updated_at = now
        await session.commit()


async def _refresh_match_analysis_job_summary(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: int,
) -> None:
    async with session_factory() as session:
        job = await session.get(MatchAnalysisJob, job_id)
        if job is None:
            return

        items = list(
            await session.scalars(
                select(MatchAnalysisJobItem).where(MatchAnalysisJobItem.job_id == job_id)
            )
        )
        succeeded_count = sum(
            1 for item in items if item.status == MatchAnalysisJobItemStatus.SUCCEEDED.value
        )
        failed_count = sum(
            1 for item in items if item.status == MatchAnalysisJobItemStatus.FAILED.value
        )
        skipped_count = sum(
            1 for item in items if item.status == MatchAnalysisJobItemStatus.SKIPPED.value
        )
        canceled_count = sum(
            1 for item in items if item.status == MatchAnalysisJobItemStatus.CANCELED.value
        )
        running_count = sum(
            1 for item in items if item.status == MatchAnalysisJobItemStatus.RUNNING.value
        )
        queued_count = sum(
            1 for item in items if item.status == MatchAnalysisJobItemStatus.QUEUED.value
        )

        job.succeeded_count = succeeded_count
        job.failed_count = failed_count
        job.skipped_count = skipped_count
        job.total_prompt_tokens = sum(item.prompt_tokens for item in items)
        job.total_completion_tokens = sum(item.completion_tokens for item in items)
        job.total_tokens = sum(item.total_tokens for item in items)
        job.updated_at = datetime.now(UTC)
        job.finished_at = job.updated_at

        if canceled_count > 0 and succeeded_count == 0 and failed_count == 0:
            job.status = MatchAnalysisJobStatus.CANCELED.value
        elif failed_count == 0 and queued_count == 0 and running_count == 0 and succeeded_count > 0:
            job.status = MatchAnalysisJobStatus.COMPLETED.value
        elif succeeded_count > 0:
            job.status = MatchAnalysisJobStatus.PARTIAL_FAILED.value
        else:
            job.status = MatchAnalysisJobStatus.FAILED.value

        if job.status == MatchAnalysisJobStatus.FAILED.value and skipped_count == len(items):
            job.last_error = "没有可分析导师"

        await session.commit()
