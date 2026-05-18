from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.identity_serializers import serialize_material
from app.core.database import get_async_session
from app.models import EmailTask, IdentityMaterial, IdentityMaterialType, IdentityProfile
from app.schemas.identity import IdentityMaterialRead
from app.services.file_storage import (
    build_display_name,
    delete_file,
    save_upload,
)
from app.services.materials import (
    TERMINAL_MATERIAL_REFERENCING_STATUSES,
    build_material_download_name,
    material_can_be_primary,
)
from app.services.operation_logs import record_operation_log


router = APIRouter(prefix="/api", tags=["materials"])


@router.post(
    "/identities/{identity_id}/materials",
    response_model=IdentityMaterialRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_identity_material(
    identity_id: int,
    file: UploadFile = File(...),
    material_type: str = Form(default=IdentityMaterialType.OTHER.value),
    display_name: str | None = Form(default=None),
    session: AsyncSession = Depends(get_async_session),
) -> IdentityMaterialRead:
    identity = await _get_identity(session, identity_id)
    material_type_value = _normalize_material_type(material_type)

    stored_upload = save_upload(file, "identities", str(identity_id), "materials")
    material = IdentityMaterial(
        identity_id=identity_id,
        display_name=(display_name or build_display_name(stored_upload.original_name)).strip() or build_display_name(stored_upload.original_name),
        original_filename=stored_upload.original_name,
        file_path=stored_upload.file_path,
        mime_type=file.content_type,
        size_bytes=stored_upload.size_bytes,
        sha256=stored_upload.sha256,
        extracted_text=None,
        material_type=material_type_value,
    )
    session.add(material)
    await session.flush()

    if identity.current_primary_material_id is None and material_can_be_primary(material):
        identity.current_primary_material_id = material.id
        identity.updated_at = datetime.now(UTC)

    await _record_material_log(session, material, "identity_material.uploaded")
    await session.commit()
    await session.refresh(identity)
    await session.refresh(material)
    return serialize_material(material, identity.current_primary_material_id)


@router.post("/materials/{material_id}/set-primary", response_model=IdentityMaterialRead)
async def set_primary_material(
    material_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> IdentityMaterialRead:
    material = await _get_material(session, material_id)
    if not material_can_be_primary(material):
        raise HTTPException(status_code=400, detail="当前材料不支持作为默认材料")

    identity = material.identity
    identity.current_primary_material_id = material.id
    identity.updated_at = datetime.now(UTC)
    await _record_material_log(session, material, "identity_material.primary_set")
    await session.commit()
    await session.refresh(identity)
    return serialize_material(material, identity.current_primary_material_id)


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(
    material_id: int,
    session: AsyncSession = Depends(get_async_session),
) -> None:
    material = await _get_material(session, material_id)
    identity = material.identity
    is_current_primary = identity.current_primary_material_id == material.id

    active_tasks = list(
        (
            await session.execute(
                select(EmailTask).where(
                    EmailTask.identity_id == material.identity_id,
                    EmailTask.status.not_in(TERMINAL_MATERIAL_REFERENCING_STATUSES),
                ),
            )
        ).scalars()
    )
    for task in active_tasks:
        if task.primary_material_id == material.id:
            raise HTTPException(status_code=400, detail="当前材料仍被未完成任务作为默认材料使用")
        if material.id in (task.selected_material_ids or []):
            raise HTTPException(status_code=400, detail="当前材料仍被未完成任务选为随信材料")

    referencing_tasks = list(
        (
            await session.execute(
                select(EmailTask).where(
                    EmailTask.identity_id == material.identity_id,
                    EmailTask.status.in_(TERMINAL_MATERIAL_REFERENCING_STATUSES),
                ),
            )
        ).scalars()
    )
    for task in referencing_tasks:
        task_updated = False
        if task.primary_material_id == material.id:
            task.primary_material_id = None
            task_updated = True
        if material.id in (task.selected_material_ids or []):
            task.selected_material_ids = [
                selected_material_id
                for selected_material_id in task.selected_material_ids or []
                if selected_material_id != material.id
            ]
            task_updated = True
        if task_updated:
            task.updated_at = datetime.now(UTC)

    if is_current_primary:
        identity.current_primary_material_id = None
        identity.updated_at = datetime.now(UTC)

    await _record_material_log(
        session,
        material,
        "identity_material.deleted",
        metadata={"was_primary": is_current_primary},
    )
    delete_file(material.file_path)
    await session.delete(material)
    await session.commit()


@router.get("/materials/{material_id}/open")
async def open_material(
    material_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    material = await _get_material(session, material_id)
    file_path = Path(material.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="材料文件不存在")

    response = FileResponse(file_path, media_type=material.mime_type)
    response.headers["Content-Disposition"] = "inline"
    return response


@router.get("/materials/{material_id}/download")
async def download_material(
    material_id: int,
    session: AsyncSession = Depends(get_async_session),
):
    material = await _get_material(session, material_id)
    file_path = Path(material.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="材料文件不存在")

    return FileResponse(
        file_path,
        media_type=material.mime_type,
        filename=build_material_download_name(material),
    )


async def _get_identity(session: AsyncSession, identity_id: int) -> IdentityProfile:
    identity = await session.scalar(
        select(IdentityProfile)
        .options(
            selectinload(IdentityProfile.materials),
            selectinload(IdentityProfile.current_primary_material),
        )
        .where(IdentityProfile.id == identity_id),
    )
    if not identity:
        raise HTTPException(status_code=404, detail="未找到身份配置")
    return identity


async def _get_material(session: AsyncSession, material_id: int) -> IdentityMaterial:
    material = await session.scalar(
        select(IdentityMaterial)
        .options(selectinload(IdentityMaterial.identity))
        .where(IdentityMaterial.id == material_id),
    )
    if not material:
        raise HTTPException(status_code=404, detail="未找到材料")
    return material


def _normalize_material_type(material_type: str) -> str:
    normalized = material_type.strip().lower()
    if normalized not in {item.value for item in IdentityMaterialType}:
        raise HTTPException(status_code=400, detail="不支持的材料标签")
    return normalized


async def _record_material_log(
    session: AsyncSession,
    material: IdentityMaterial,
    event_name: str,
    *,
    metadata: dict[str, object] | None = None,
) -> None:
    base_metadata: dict[str, object] = {
        "identity_id": material.identity_id,
        "display_name": material.display_name,
        "original_filename": material.original_filename,
        "material_type": material.material_type,
        "mime_type": material.mime_type,
        "size_bytes": material.size_bytes,
    }
    if metadata:
        base_metadata.update(metadata)
    await record_operation_log(
        session,
        category="user_action",
        event_name=event_name,
        entity_type="identity_material",
        entity_id=str(material.id),
        metadata=base_metadata,
    )
