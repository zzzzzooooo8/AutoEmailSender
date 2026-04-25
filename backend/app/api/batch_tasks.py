from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_async_session
from app.models import (
    BatchTask,
    BatchTaskStatus,
    EmailTask,
    EmailTaskCancellationReason,
    EmailTaskSource,
    EmailTaskStatus,
    IdentityProfile,
    LLMProfile,
    Professor,
)
from app.schemas.batch_task import (
    BatchTaskActionResponse,
    BatchTaskCardRead,
    CreateBatchTaskRequest,
)
from app.services.materials import material_can_be_primary
from app.services.outreach_templates import (
    get_outreach_template_defaults_validation_error,
    resolve_outreach_template_config,
)


router = APIRouter(prefix="/api/batch-tasks", tags=["batch-tasks"])


@router.get("", response_model=list[BatchTaskCardRead])
async def list_batch_tasks(
    identity_id: int | None = None,
    llm_profile_id: int | None = None,
    session: AsyncSession = Depends(get_async_session),
) -> list[BatchTaskCardRead]:
    statement = (
        select(BatchTask)
        .options(selectinload(BatchTask.email_tasks))
        .order_by(BatchTask.created_at.desc())
    )
    if identity_id is not None:
        statement = statement.where(BatchTask.identity_id == identity_id)
    if llm_profile_id is not None:
        statement = statement.where(BatchTask.llm_profile_id == llm_profile_id)

    tasks = list((await session.execute(statement)).scalars().unique())
    return [_serialize_batch_task(task) for task in tasks]


@router.post("", response_model=BatchTaskCardRead, status_code=status.HTTP_201_CREATED)
async def create_batch_task(
    payload: CreateBatchTaskRequest,
    session: AsyncSession = Depends(get_async_session),
) -> BatchTaskCardRead:
    if not payload.professor_ids:
        raise HTTPException(status_code=400, detail="请至少选择一位导师")

    identity = await session.scalar(
        select(IdentityProfile)
        .options(
            selectinload(IdentityProfile.materials),
            selectinload(IdentityProfile.current_primary_material),
        )
        .where(IdentityProfile.id == payload.identity_id),
    )
    if not identity:
        raise HTTPException(status_code=404, detail="未找到身份配置")

    llm_profile = await session.get(LLMProfile, payload.llm_profile_id)
    if not llm_profile:
        raise HTTPException(status_code=404, detail="未找到 LLM 配置")

    professors = list(
        (
            await session.execute(
                select(Professor).where(
                    Professor.id.in_(payload.professor_ids),
                    Professor.archived_at.is_(None),
                ),
            )
        ).scalars()
    )
    if len(professors) != len(set(payload.professor_ids)):
        raise HTTPException(status_code=404, detail="部分导师不存在或已被移入回收站")

    material_map = {material.id: material for material in identity.materials}
    primary_material_id = payload.primary_material_id or identity.current_primary_material_id
    if primary_material_id is not None:
        primary_material = material_map.get(primary_material_id)
        if primary_material is None:
            raise HTTPException(status_code=400, detail="默认材料不属于当前身份")
        if not material_can_be_primary(primary_material):
            raise HTTPException(status_code=400, detail="当前材料不支持作为默认材料")

    selected_material_ids = payload.selected_material_ids or None
    if selected_material_ids:
        if len(set(selected_material_ids)) != len(set(material_map) & set(selected_material_ids)):
            raise HTTPException(status_code=400, detail="存在不属于当前身份的随信材料")

    requested_subject = _normalize_nullable_text(payload.outreach_template_subject) or _normalize_nullable_text(
        payload.email_subject,
    )
    requested_body_text = _normalize_nullable_text(
        payload.outreach_template_body_text,
    ) or _normalize_nullable_text(payload.email_body)
    requested_generation_mode = (
        str(payload.outreach_generation_mode or identity.outreach_generation_mode or "llm").strip().lower()
    )
    outreach_config = resolve_outreach_template_config(
        identity,
        generation_mode=requested_generation_mode,
        subject_template=requested_subject,
        body_text_template=requested_body_text,
        body_html_template=payload.outreach_template_body_html,
    )
    detail = get_outreach_template_defaults_validation_error(
        outreach_config.subject_template,
        outreach_config.body_text_template,
    )
    if detail:
        raise HTTPException(status_code=400, detail=detail)

    batch_task = BatchTask(
        identity_id=payload.identity_id,
        llm_profile_id=payload.llm_profile_id,
        name=payload.name,
        schedule_type=payload.schedule_type,
        window_start_time=payload.window_start_time,
        window_end_time=payload.window_end_time,
        emails_per_window=payload.emails_per_window,
        status=BatchTaskStatus.RUNNING.value,
        primary_material_id=primary_material_id,
        email_subject=_normalize_nullable_text(outreach_config.subject_template),
        email_body=_normalize_nullable_text(outreach_config.body_text_template),
        selected_material_ids=selected_material_ids,
        target_count=len(professors),
    )
    session.add(batch_task)
    await session.flush()

    for professor in professors:
        session.add(
            EmailTask(
                source=EmailTaskSource.BATCH.value,
                batch_task_id=batch_task.id,
                identity_id=payload.identity_id,
                llm_profile_id=payload.llm_profile_id,
                professor_id=professor.id,
                primary_material_id=primary_material_id,
                outreach_generation_mode=outreach_config.generation_mode,
                outreach_template_subject=_normalize_nullable_text(outreach_config.subject_template),
                outreach_template_body_text=_normalize_nullable_text(outreach_config.body_text_template),
                outreach_template_body_html=_normalize_nullable_text(outreach_config.body_html_template),
                status=EmailTaskStatus.DISCOVERED.value,
                selected_material_ids=selected_material_ids,
            ),
        )

    await session.commit()
    await session.refresh(batch_task, attribute_names=["email_tasks"])
    return _serialize_batch_task(batch_task)


@router.post("/{task_id}/pause", response_model=BatchTaskActionResponse)
async def pause_batch_task(
    task_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> BatchTaskActionResponse:
    task = await _get_batch_task(session, task_id)
    task.status = BatchTaskStatus.PAUSED.value
    task.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(task, attribute_names=["email_tasks"])
    return BatchTaskActionResponse(ok=True, task=_serialize_batch_task(task))


@router.post("/{task_id}/resume", response_model=BatchTaskActionResponse)
async def resume_batch_task(
    task_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> BatchTaskActionResponse:
    task = await _get_batch_task(session, task_id)
    task.status = BatchTaskStatus.RUNNING.value
    task.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(task, attribute_names=["email_tasks"])
    return BatchTaskActionResponse(ok=True, task=_serialize_batch_task(task))


@router.post("/{task_id}/stop", response_model=BatchTaskActionResponse)
async def stop_batch_task(
    task_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> BatchTaskActionResponse:
    task = await _get_batch_task(session, task_id)
    task.status = BatchTaskStatus.STOPPED.value
    task.updated_at = datetime.now(UTC)
    for email_task in task.email_tasks:
        if email_task.status not in {
            EmailTaskStatus.SENT.value,
            EmailTaskStatus.REPLY_DETECTED.value,
            EmailTaskStatus.SEND_FAILED.value,
        }:
            email_task.status = EmailTaskStatus.CANCELED.value
            email_task.cancellation_reason = EmailTaskCancellationReason.BATCH_STOPPED.value
            email_task.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(task, attribute_names=["email_tasks"])
    return BatchTaskActionResponse(ok=True, task=_serialize_batch_task(task))


async def _get_batch_task(session: AsyncSession, task_id: int) -> BatchTask:
    task = await session.scalar(
        select(BatchTask)
        .options(selectinload(BatchTask.email_tasks))
        .where(BatchTask.id == task_id),
    )
    if not task:
        raise HTTPException(status_code=404, detail="未找到批量任务")
    return task


def _serialize_batch_task(task: BatchTask) -> BatchTaskCardRead:
    status_counter = Counter(email_task.status for email_task in task.email_tasks)

    completed_count = sum(
        1
        for email_task in task.email_tasks
        if email_task.status in {
            EmailTaskStatus.SENT.value,
            EmailTaskStatus.REPLY_DETECTED.value,
        }
    )
    status = task.status
    if (
        task.target_count > 0
        and completed_count >= task.target_count
        and task.status != BatchTaskStatus.STOPPED.value
    ):
        status = BatchTaskStatus.COMPLETED.value

    pending_generation_count = sum(
        status_counter.get(item, 0)
        for item in [
            EmailTaskStatus.DISCOVERED.value,
            EmailTaskStatus.MATCHED.value,
        ]
    )

    return BatchTaskCardRead(
        id=task.id,
        name=task.name,
        status=status,
        schedule_type=task.schedule_type,
        window_start_time=task.window_start_time,
        window_end_time=task.window_end_time,
        emails_per_window=task.emails_per_window,
        email_subject=task.email_subject,
        target_count=task.target_count,
        completed_count=completed_count,
        identity_id=task.identity_id,
        llm_profile_id=task.llm_profile_id,
        pending_generation_count=pending_generation_count,
        review_required_count=status_counter.get(EmailTaskStatus.REVIEW_REQUIRED.value, 0),
        scheduled_count=status_counter.get(EmailTaskStatus.SCHEDULED.value, 0),
        sent_count=status_counter.get(EmailTaskStatus.SENT.value, 0),
        failed_count=status_counter.get(EmailTaskStatus.SEND_FAILED.value, 0),
        replied_count=status_counter.get(EmailTaskStatus.REPLY_DETECTED.value, 0),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _normalize_nullable_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None
