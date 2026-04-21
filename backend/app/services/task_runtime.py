from __future__ import annotations

import re
from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.models import (
    BatchTask,
    BatchTaskStatus,
    EmailDirection,
    EmailLog,
    EmailTask,
    EmailTaskStatus,
    IdentityMaterial,
    IdentityProfile,
    MailDeliveryMode,
    Professor,
)
from app.schemas.email_task import EmailTaskApprovalRequest, EmailTaskScheduleRequest
from app.services import llm_runtime, mail_runtime
from app.services.mail_runtime import MailAttachment, ReceivedEmail
from app.services.materials import (
    build_material_download_name,
    ensure_material_extracted_text,
    material_can_be_primary,
)
from app.services.outreach_templates import (
    OUTREACH_GENERATION_MODE_TEMPLATE,
    get_outreach_template_defaults_validation_error,
    render_outreach_template,
    resolve_outreach_template_config,
)
from app.services.system_settings import get_or_create_app_settings


TASK_RELATION_OPTIONS = (
    selectinload(EmailTask.batch_task),
    selectinload(EmailTask.identity).selectinload(IdentityProfile.materials),
    selectinload(EmailTask.identity).selectinload(IdentityProfile.current_primary_material),
    selectinload(EmailTask.llm_profile),
    selectinload(EmailTask.professor),
    selectinload(EmailTask.primary_material),
)


async def process_pending_drafts_once(
    session_factory: async_sessionmaker[AsyncSession],
    limit: int = 5,
) -> int:
    return 0


async def dispatch_due_tasks_once(
    session_factory: async_sessionmaker[AsyncSession],
    limit: int = 10,
) -> int:
    now = datetime.now(UTC)
    async with session_factory() as session:
        task_ids = list(
            (
                await session.execute(
                    select(EmailTask.id)
                    .join(BatchTask, EmailTask.batch_task_id == BatchTask.id, isouter=True)
                    .where(
                        EmailTask.status.in_(
                            [
                                EmailTaskStatus.APPROVED.value,
                                EmailTaskStatus.SCHEDULED.value,
                            ],
                        ),
                        or_(
                            EmailTask.scheduled_at.is_(None),
                            EmailTask.scheduled_at <= now,
                        ),
                        or_(
                            BatchTask.id.is_(None),
                            BatchTask.status == BatchTaskStatus.RUNNING.value,
                        ),
                    )
                    .order_by(EmailTask.approved_at.asc(), EmailTask.created_at.asc())
                    .limit(limit),
                )
            ).scalars()
        )

    processed = 0
    for task_id in task_ids:
        await dispatch_email_task(session_factory, task_id)
        processed += 1
    return processed


async def poll_for_replies_once(
    session_factory: async_sessionmaker[AsyncSession],
) -> int:
    async with session_factory() as session:
        identity_ids = list(
            (
                await session.execute(
                    select(IdentityProfile.id).where(
                        IdentityProfile.imap_host.is_not(None),
                        IdentityProfile.imap_username.is_not(None),
                        IdentityProfile.imap_password.is_not(None),
                    ),
                )
            ).scalars()
        )

    detected = 0
    for identity_id in identity_ids:
        detected += await poll_identity_replies(session_factory, identity_id)
    return detected


async def generate_task_draft(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
    *,
    force: bool,
    ignore_batch_status: bool = False,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        task = await _load_email_task(session, task_id)
        if not task:
            raise ValueError(f"EmailTask {task_id} 不存在")
        if (
            task.batch_task
            and task.batch_task.status != BatchTaskStatus.RUNNING.value
            and not ignore_batch_status
        ):
            return task.professor_id, task.identity_id, task.llm_profile_id

        batch_task = task.batch_task

        try:
            outreach_config = _resolve_task_outreach_config(task)
            if outreach_config.generation_mode == OUTREACH_GENERATION_MODE_TEMPLATE:
                template_subject = _normalize_nullable_text(outreach_config.subject_template)
                template_body = _normalize_nullable_text(outreach_config.body_text_template)
                detail = get_outreach_template_defaults_validation_error(
                    template_subject,
                    template_body,
                )
                if detail:
                    raise ValueError(detail)
                rendered = render_outreach_template(
                    task.identity,
                    task.professor,
                    subject_template=template_subject,
                    body_text_template=template_body,
                    body_html_template=outreach_config.body_html_template,
                )
                subject = rendered.subject
                body_text = rendered.body_text
                body_html = rendered.body_html
                usage = None
                suggested_material_ids = (
                    batch_task.selected_material_ids if batch_task else None
                )
                provider_payload = {
                    "source": OUTREACH_GENERATION_MODE_TEMPLATE,
                    "placeholders": rendered.placeholders,
                    "usage": None,
                }
            else:
                if task.primary_material is None:
                    if force:
                        raise ValueError("请先选择用于匹配的默认材料")
                    return task.professor_id, task.identity_id, task.llm_profile_id
                ensure_material_extracted_text(task.primary_material)
                template_subject = _normalize_nullable_text(outreach_config.subject_template) or (
                    _normalize_nullable_text(batch_task.email_subject) if batch_task else None
                )
                template_body = _normalize_nullable_text(outreach_config.body_text_template) or (
                    _normalize_nullable_text(batch_task.email_body) if batch_task else None
                )
                detail = get_outreach_template_defaults_validation_error(
                    template_subject,
                    template_body,
                )
                if detail:
                    raise ValueError(detail)

                current_match = _build_match_result_from_task(task)
                generation = await llm_runtime.generate_draft_content(
                    identity=task.identity,
                    primary_material=task.primary_material,
                    llm_profile=task.llm_profile,
                    professor=task.professor,
                    available_materials=list(task.identity.materials),
                    custom_subject=template_subject,
                    custom_body=template_body,
                    current_match=current_match,
                )
                subject = generation.result.subject
                body_text = generation.result.body_text
                body_html = generation.result.body_html
                usage = generation.usage
                suggested_material_ids = (
                    generation.result.suggested_material_ids
                    or (batch_task.selected_material_ids if batch_task else None)
                )
                provider_payload = {
                    "source": "llm",
                    "primary_material_id": task.primary_material_id,
                    "suggested_material_ids": generation.result.suggested_material_ids,
                    "usage": (
                        {
                            "prompt_tokens": usage.prompt_tokens,
                            "completion_tokens": usage.completion_tokens,
                            "total_tokens": usage.total_tokens,
                        }
                        if usage is not None
                        else None
                    ),
                }
        except llm_runtime.LLMRuntimeError as exc:
            task.last_error = str(exc)
            task.updated_at = datetime.now(UTC)
            await session.commit()
            return task.professor_id, task.identity_id, task.llm_profile_id
        except ValueError as exc:
            task.last_error = str(exc)
            task.updated_at = datetime.now(UTC)
            await session.commit()
            raise

        task.generated_subject = subject
        task.generated_content_text = body_text
        task.generated_content_html = body_html
        if suggested_material_ids is not None:
            task.selected_material_ids = suggested_material_ids
        task.status = EmailTaskStatus.REVIEW_REQUIRED.value
        task.updated_at = datetime.now(UTC)
        task.last_error = None

        session.add(
            EmailLog(
                email_task_id=task.id,
                identity_id=task.identity_id,
                llm_profile_id=task.llm_profile_id,
                professor_id=task.professor_id,
                direction=EmailDirection.DRAFT.value,
                subject=subject,
                content=body_text,
                content_html=body_html,
                provider_payload=provider_payload,
            ),
        )
        await session.commit()
        return task.professor_id, task.identity_id, task.llm_profile_id


async def calculate_task_match(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
    *,
    force: bool,
    ignore_batch_status: bool = False,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        task = await _load_email_task(session, task_id)
        if not task:
            raise ValueError(f"EmailTask {task_id} 不存在")
        if (
            task.batch_task
            and task.batch_task.status != BatchTaskStatus.RUNNING.value
            and not ignore_batch_status
        ):
            return task.professor_id, task.identity_id, task.llm_profile_id
        if task.primary_material is None:
            if force:
                raise ValueError("请先选择用于匹配的默认材料")
            return task.professor_id, task.identity_id, task.llm_profile_id
        ensure_material_extracted_text(task.primary_material)
        if not force and task.status in {
            EmailTaskStatus.MATCHED.value,
            EmailTaskStatus.REVIEW_REQUIRED.value,
            EmailTaskStatus.APPROVED.value,
            EmailTaskStatus.SCHEDULED.value,
            EmailTaskStatus.SENT.value,
            EmailTaskStatus.REPLY_DETECTED.value,
        }:
            return task.professor_id, task.identity_id, task.llm_profile_id

        try:
            generation = await llm_runtime.generate_match_evaluation(
                identity=task.identity,
                primary_material=task.primary_material,
                llm_profile=task.llm_profile,
                professor=task.professor,
                available_materials=list(task.identity.materials),
            )
        except llm_runtime.LLMRuntimeError as exc:
            task.last_error = str(exc)
            task.updated_at = datetime.now(UTC)
            await session.commit()
            return task.professor_id, task.identity_id, task.llm_profile_id

        result = generation.result
        task.match_score = result.match_score
        task.match_reason = result.match_reason
        task.fit_points = result.fit_points
        task.risk_points = result.risk_points
        task.match_keywords = result.keywords
        task.status = (
            EmailTaskStatus.SKIPPED.value
            if task.identity.match_threshold is not None and result.match_score < task.identity.match_threshold
            else EmailTaskStatus.MATCHED.value
        )
        task.updated_at = datetime.now(UTC)
        task.last_error = None
        await session.commit()
        return task.professor_id, task.identity_id, task.llm_profile_id


async def regenerate_task_draft(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
) -> tuple[int, int, int]:
    return await generate_task_draft(session_factory, task_id, force=True)


async def calculate_task_match_once(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
) -> tuple[int, int, int]:
    return await calculate_task_match(session_factory, task_id, force=True)


async def update_task_primary_material(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
    primary_material_id: int,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        task = await _load_email_task(session, task_id)
        if not task:
            raise ValueError(f"EmailTask {task_id} 不存在")
        if task.status in {
            EmailTaskStatus.SENT.value,
            EmailTaskStatus.REPLY_DETECTED.value,
        }:
            raise ValueError("已发送或已回信任务不能再切换默认材料")

        material = await _validate_primary_material_id(session, task.identity_id, primary_material_id)
        task.primary_material_id = material.id
        task.approved_subject = None
        task.approved_body_text = None
        task.approved_body_html = None
        task.approved_at = None
        task.scheduled_at = None
        task.delivery_mode = None
        task.last_error = None
        task.updated_at = datetime.now(UTC)
        await session.commit()

    return await generate_task_draft(
        session_factory,
        task_id,
        force=True,
        ignore_batch_status=True,
    )


async def update_task_outreach_config(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
    *,
    outreach_generation_mode: str,
    outreach_template_subject: str | None = None,
    outreach_template_body_text: str | None = None,
    outreach_template_body_html: str | None = None,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        task = await _load_email_task(session, task_id)
        if not task:
            raise ValueError(f"EmailTask {task_id} 不存在")
        if task.status in {
            EmailTaskStatus.SENT.value,
            EmailTaskStatus.REPLY_DETECTED.value,
        }:
            raise ValueError("已发送或已回信任务不能再切换本次发信模式")

        snapshot = _build_task_outreach_snapshot(
            task.identity,
            outreach_generation_mode=outreach_generation_mode,
            outreach_template_subject=outreach_template_subject,
            outreach_template_body_text=outreach_template_body_text,
            outreach_template_body_html=outreach_template_body_html,
            fallback_task=task,
        )
        task.outreach_generation_mode = snapshot["outreach_generation_mode"]
        task.outreach_template_subject = snapshot["outreach_template_subject"]
        task.outreach_template_body_text = snapshot["outreach_template_body_text"]
        task.outreach_template_body_html = snapshot["outreach_template_body_html"]
        task.approved_subject = None
        task.approved_body_text = None
        task.approved_body_html = None
        task.approved_at = None
        task.scheduled_at = None
        task.delivery_mode = None
        task.last_error = None
        task.updated_at = datetime.now(UTC)
        await session.commit()
        return task.professor_id, task.identity_id, task.llm_profile_id


async def approve_and_send_task(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
    payload: EmailTaskApprovalRequest,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        task = await _load_email_task(session, task_id)
        if not task:
            raise ValueError(f"EmailTask {task_id} 不存在")
        await _snapshot_approval(session, task, payload)
        task.status = EmailTaskStatus.APPROVED.value
        await session.commit()
        professor_id = task.professor_id
        identity_id = task.identity_id
        llm_profile_id = task.llm_profile_id

    await dispatch_email_task(session_factory, task_id)
    return professor_id, identity_id, llm_profile_id


async def approve_and_schedule_task(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
    payload: EmailTaskScheduleRequest,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        task = await _load_email_task(session, task_id)
        if not task:
            raise ValueError(f"EmailTask {task_id} 不存在")
        await _snapshot_approval(session, task, payload)
        task.status = EmailTaskStatus.SCHEDULED.value
        task.scheduled_at = payload.scheduled_at.astimezone(UTC)
        task.updated_at = datetime.now(UTC)
        await session.commit()
        return task.professor_id, task.identity_id, task.llm_profile_id


async def cancel_scheduled_task(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        task = await _load_email_task(session, task_id)
        if not task:
            raise ValueError(f"EmailTask {task_id} 不存在")
        task.status = EmailTaskStatus.REVIEW_REQUIRED.value
        task.scheduled_at = None
        task.updated_at = datetime.now(UTC)
        await session.commit()
        return task.professor_id, task.identity_id, task.llm_profile_id


async def dispatch_email_task(
    session_factory: async_sessionmaker[AsyncSession],
    task_id: int,
) -> tuple[int, int, int]:
    async with session_factory() as session:
        task = await _load_email_task(session, task_id)
        if not task:
            raise ValueError(f"EmailTask {task_id} 不存在")
        if task.batch_task and task.batch_task.status != BatchTaskStatus.RUNNING.value:
            return task.professor_id, task.identity_id, task.llm_profile_id

        subject = task.approved_subject or task.generated_subject
        body_text = task.approved_body_text or task.generated_content_text
        body_html = task.approved_body_html or task.generated_content_html
        if not subject or not body_text:
            task.status = EmailTaskStatus.SEND_FAILED.value
            task.last_error = "任务缺少可发送的主题或正文"
            task.updated_at = datetime.now(UTC)
            await session.commit()
            return task.professor_id, task.identity_id, task.llm_profile_id

        attachments = await _resolve_selected_materials(
            session,
            task.identity_id,
            task.selected_material_ids,
        )
        task.last_send_attempt_at = datetime.now(UTC)
        task.retry_count = (task.retry_count or 0) + 1

        try:
            if task.delivery_mode == MailDeliveryMode.LIVE.value:
                result = await mail_runtime.send_email(
                    identity=task.identity,
                    professor=task.professor,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    attachments=attachments,
                )
                rfc_message_id = result.message_id
                provider_payload = result.provider_payload
            else:
                rfc_message_id = None
                provider_payload = {
                    "mode": MailDeliveryMode.DRY_RUN.value,
                    "attachments": [
                        {
                            "file_path": attachment.file_path,
                            "download_name": attachment.download_name,
                        }
                        for attachment in attachments
                    ],
                }

            task.status = EmailTaskStatus.SENT.value
            task.sent_at = datetime.now(UTC)
            task.last_rfc_message_id = rfc_message_id
            task.last_error = None
            task.updated_at = datetime.now(UTC)
            session.add(
                EmailLog(
                    email_task_id=task.id,
                    identity_id=task.identity_id,
                    llm_profile_id=task.llm_profile_id,
                    professor_id=task.professor_id,
                    direction=EmailDirection.SENT.value,
                    delivery_mode=task.delivery_mode,
                    subject=subject,
                    content=body_text,
                    content_html=body_html,
                    rfc_message_id=rfc_message_id,
                    provider_payload=provider_payload,
                ),
            )
        except mail_runtime.MailRuntimeError as exc:
            task.status = EmailTaskStatus.SEND_FAILED.value
            task.last_error = str(exc)
            task.updated_at = datetime.now(UTC)
            session.add(
                EmailLog(
                    email_task_id=task.id,
                    identity_id=task.identity_id,
                    llm_profile_id=task.llm_profile_id,
                    professor_id=task.professor_id,
                    direction=EmailDirection.SENT.value,
                    delivery_mode=task.delivery_mode,
                    subject=subject,
                    content=body_text,
                    content_html=body_html,
                    failure_summary=str(exc),
                ),
            )

        await session.commit()
        return task.professor_id, task.identity_id, task.llm_profile_id


async def poll_identity_replies(
    session_factory: async_sessionmaker[AsyncSession],
    identity_id: int,
) -> int:
    async with session_factory() as session:
        identity = await session.get(IdentityProfile, identity_id)
    if not identity:
        return 0

    messages = await mail_runtime.fetch_recent_inbox_messages(identity)
    detected = 0
    for message in messages:
        async with session_factory() as session:
            if message.message_id:
                existing = await session.scalar(
                    select(EmailLog.id).where(EmailLog.rfc_message_id == message.message_id),
                )
                if existing:
                    continue

            task = await _find_reply_target(session, identity_id, message)
            if not task:
                continue

            task.is_replied = True
            task.status = EmailTaskStatus.REPLY_DETECTED.value
            task.updated_at = datetime.now(UTC)
            session.add(
                EmailLog(
                    email_task_id=task.id,
                    identity_id=task.identity_id,
                    llm_profile_id=task.llm_profile_id,
                    professor_id=task.professor_id,
                    direction=EmailDirection.RECEIVED.value,
                    delivery_mode=MailDeliveryMode.LIVE.value,
                    subject=message.subject,
                    content=message.content,
                    content_html=message.content_html,
                    rfc_message_id=message.message_id,
                    reply_headers=message.headers,
                ),
            )
            await session.commit()
            detected += 1
    return detected


async def _snapshot_approval(
    session: AsyncSession,
    task: EmailTask,
    payload: EmailTaskApprovalRequest,
) -> None:
    app_settings = await get_or_create_app_settings(session)
    await _validate_selected_material_ids(session, task.identity_id, payload.selected_material_ids)

    task.delivery_mode = app_settings.mail_delivery_mode
    task.approved_subject = (payload.subject or task.generated_subject or "").strip()
    task.approved_body_text = payload.body_text.strip()
    task.approved_body_html = (payload.body_html or mail_runtime.text_to_html(payload.body_text)).strip()
    if payload.selected_material_ids is not None:
        task.selected_material_ids = payload.selected_material_ids
    task.approved_at = datetime.now(UTC)
    task.updated_at = datetime.now(UTC)
    task.last_error = None


async def _validate_primary_material_id(
    session: AsyncSession,
    identity_id: int,
    primary_material_id: int,
) -> IdentityMaterial:
    material = await session.scalar(
        select(IdentityMaterial).where(
            IdentityMaterial.identity_id == identity_id,
            IdentityMaterial.id == primary_material_id,
        ),
    )
    if not material:
        raise ValueError("默认材料不属于当前身份")
    if not material_can_be_primary(material):
        raise ValueError("当前材料不支持作为默认材料")
    return material


async def _validate_selected_material_ids(
    session: AsyncSession,
    identity_id: int,
    material_ids: list[int] | None,
) -> None:
    if not material_ids:
        return
    materials = list(
        (
            await session.execute(
                select(IdentityMaterial.id).where(
                    IdentityMaterial.identity_id == identity_id,
                    IdentityMaterial.id.in_(material_ids),
                ),
            )
        ).scalars()
    )
    if len(set(materials)) != len(set(material_ids)):
        raise ValueError("存在不属于当前身份的随信材料")


async def _resolve_selected_materials(
    session: AsyncSession,
    identity_id: int,
    material_ids: list[int] | None,
) -> list[MailAttachment]:
    if not material_ids:
        return []

    result = await session.execute(
        select(IdentityMaterial).where(
            IdentityMaterial.identity_id == identity_id,
            IdentityMaterial.id.in_(material_ids),
        ),
    )
    materials = {material.id: material for material in result.scalars()}
    attachments: list[MailAttachment] = []
    for material_id in material_ids:
        material = materials.get(material_id)
        if material is None:
            continue
        attachments.append(
            MailAttachment(
                file_path=material.file_path,
                download_name=build_material_download_name(material),
            ),
        )
    return attachments


async def _find_reply_target(
    session: AsyncSession,
    identity_id: int,
    message: ReceivedEmail,
) -> EmailTask | None:
    reference_ids = extract_message_ids(message.in_reply_to, message.references)
    if reference_ids:
        matched_log = await session.scalar(
            select(EmailLog)
            .where(
                EmailLog.identity_id == identity_id,
                EmailLog.direction == EmailDirection.SENT.value,
                EmailLog.delivery_mode == MailDeliveryMode.LIVE.value,
                EmailLog.rfc_message_id.in_(reference_ids),
            )
            .order_by(EmailLog.created_at.desc()),
        )
        if matched_log and matched_log.email_task_id:
            return await _load_email_task(session, matched_log.email_task_id)

    if not message.from_email:
        return None

    candidate_tasks = list(
        (
            await session.execute(
                select(EmailTask)
                .options(*TASK_RELATION_OPTIONS)
                .join(Professor, EmailTask.professor_id == Professor.id)
                .where(
                    EmailTask.identity_id == identity_id,
                    EmailTask.delivery_mode == MailDeliveryMode.LIVE.value,
                    Professor.email == message.from_email,
                    EmailTask.status.in_(
                        [
                            EmailTaskStatus.SENT.value,
                            EmailTaskStatus.REPLY_DETECTED.value,
                        ],
                    ),
                )
                .order_by(EmailTask.sent_at.desc(), EmailTask.updated_at.desc()),
            )
        ).scalars()
    )
    if not candidate_tasks:
        return None

    normalized_incoming_subject = normalize_subject(message.subject)
    if normalized_incoming_subject:
        for task in candidate_tasks:
            if normalize_subject(task.approved_subject or task.generated_subject) == normalized_incoming_subject:
                return task
    return candidate_tasks[0]


async def _load_email_task(session: AsyncSession, task_id: int) -> EmailTask | None:
    return await session.scalar(
        select(EmailTask)
        .options(*TASK_RELATION_OPTIONS)
        .where(EmailTask.id == task_id),
    )


def _resolve_task_outreach_config(task: EmailTask):
    return resolve_outreach_template_config(
        task.identity,
        generation_mode=task.outreach_generation_mode,
        subject_template=task.outreach_template_subject,
        body_text_template=task.outreach_template_body_text,
        body_html_template=task.outreach_template_body_html,
    )


def _build_task_outreach_snapshot(
    identity: IdentityProfile,
    *,
    outreach_generation_mode: str | None = None,
    outreach_template_subject: str | None = None,
    outreach_template_body_text: str | None = None,
    outreach_template_body_html: str | None = None,
    fallback_task: EmailTask | None = None,
) -> dict[str, str | None]:
    resolved = resolve_outreach_template_config(
        identity,
        generation_mode=(
            outreach_generation_mode
            if outreach_generation_mode is not None
            else fallback_task.outreach_generation_mode if fallback_task is not None else None
        ),
        subject_template=(
            outreach_template_subject
            if outreach_template_subject is not None
            else fallback_task.outreach_template_subject if fallback_task is not None else None
        ),
        body_text_template=(
            outreach_template_body_text
            if outreach_template_body_text is not None
            else fallback_task.outreach_template_body_text if fallback_task is not None else None
        ),
        body_html_template=(
            outreach_template_body_html
            if outreach_template_body_html is not None
            else fallback_task.outreach_template_body_html if fallback_task is not None else None
        ),
    )
    body_text = _normalize_nullable_text(resolved.body_text_template)
    body_html = _normalize_nullable_text(resolved.body_html_template)
    detail = get_outreach_template_defaults_validation_error(
        resolved.subject_template,
        resolved.body_text_template,
    )
    if detail:
        raise ValueError(detail)
    return {
        "outreach_generation_mode": resolved.generation_mode,
        "outreach_template_subject": _normalize_nullable_text(resolved.subject_template),
        "outreach_template_body_text": body_text,
        "outreach_template_body_html": body_html,
    }


def _normalize_nullable_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _build_match_result_from_task(task: EmailTask) -> llm_runtime.MatchEvaluationResult | None:
    if task.match_score is None or not task.match_reason:
        return None
    return llm_runtime.MatchEvaluationResult(
        match_score=task.match_score,
        match_reason=task.match_reason,
        fit_points=task.fit_points or [],
        risk_points=task.risk_points or [],
        keywords=task.match_keywords or [],
    )


def extract_message_ids(*headers: str | None) -> set[str]:
    values: set[str] = set()
    for header in headers:
        if not header:
            continue
        values.update(re.findall(r"<[^>]+>", header))
    return values


def normalize_subject(subject: str | None) -> str:
    if not subject:
        return ""
    normalized = subject.strip().lower()
    normalized = re.sub(r"^(re|fw|fwd)\s*:\s*", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized
