from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting


async def get_or_create_app_settings(session: AsyncSession) -> AppSetting:
    settings = await session.scalar(select(AppSetting).where(AppSetting.id == 1))
    if settings:
        return settings

    app_settings = AppSetting(id=1)
    session.add(app_settings)
    try:
        await session.flush()
        return app_settings
    except IntegrityError:
        await session.rollback()
        settings = await session.scalar(select(AppSetting).where(AppSetting.id == 1))
        if settings:
            return settings
        raise
