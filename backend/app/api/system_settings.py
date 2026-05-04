from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.schemas.system_settings import SystemSettingsRead, SystemSettingsUpdate
from app.services.system_settings import get_or_create_app_settings, update_mail_delivery_mode


router = APIRouter(prefix="/api/system-settings", tags=["system-settings"])


@router.get("", response_model=SystemSettingsRead)
async def get_system_settings(
    session: AsyncSession = Depends(get_async_session),
) -> SystemSettingsRead:
    settings = await get_or_create_app_settings(session)
    await session.commit()
    return SystemSettingsRead(
        mail_delivery_mode=settings.mail_delivery_mode,
        updated_at=settings.updated_at,
    )


@router.patch("", response_model=SystemSettingsRead)
async def patch_system_settings(
    payload: SystemSettingsUpdate,
    session: AsyncSession = Depends(get_async_session),
) -> SystemSettingsRead:
    settings = await update_mail_delivery_mode(session, payload.mail_delivery_mode)
    await session.commit()
    return SystemSettingsRead(
        mail_delivery_mode=settings.mail_delivery_mode,
        updated_at=settings.updated_at,
    )
