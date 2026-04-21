from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import AppSetting, MailDeliveryMode


async def get_or_create_app_settings(session: AsyncSession) -> AppSetting:
    settings = await session.scalar(select(AppSetting).where(AppSetting.id == 1))
    if settings:
        return settings

    app_settings = AppSetting(
        id=1,
        mail_delivery_mode=_normalize_mail_delivery_mode(get_settings().default_mail_delivery_mode),
    )
    session.add(app_settings)
    await session.flush()
    return app_settings


async def update_mail_delivery_mode(
    session: AsyncSession,
    mail_delivery_mode: str,
) -> AppSetting:
    app_settings = await get_or_create_app_settings(session)
    app_settings.mail_delivery_mode = _normalize_mail_delivery_mode(mail_delivery_mode)
    app_settings.updated_at = datetime.now(UTC)
    await session.flush()
    return app_settings


def _normalize_mail_delivery_mode(value: str) -> str:
    normalized = value.strip().lower()
    if normalized == MailDeliveryMode.LIVE.value:
        return MailDeliveryMode.LIVE.value
    return MailDeliveryMode.DRY_RUN.value
