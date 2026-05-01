from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.schemas.token_usage import (
    TokenUsageChartPreset,
    TokenUsageChartRead,
    TokenUsageFeatureFilter,
    TokenUsageRecordListRead,
)
from app.services.token_usage_records import (
    build_token_usage_chart,
    list_token_usage_records,
)


router = APIRouter(prefix="/api/token-usage", tags=["token-usage"])


@router.get("/records", response_model=TokenUsageRecordListRead)
async def list_records(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=5, ge=1, le=100),
    feature_type: TokenUsageFeatureFilter = Query(default="all"),
    model_name: str | None = Query(default=None),
    start_at: datetime | None = Query(default=None),
    end_at: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_async_session),
) -> TokenUsageRecordListRead:
    try:
        return await list_token_usage_records(
            session,
            page=page,
            page_size=page_size,
            feature_type=feature_type,
            model_name=model_name,
            start_at=start_at,
            end_at=end_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/chart", response_model=TokenUsageChartRead)
async def get_chart(
    preset: TokenUsageChartPreset = Query(default="last_24_hours"),
    feature_type: TokenUsageFeatureFilter = Query(default="all"),
    model_name: str | None = Query(default=None),
    start_at: datetime | None = Query(default=None),
    end_at: datetime | None = Query(default=None),
    session: AsyncSession = Depends(get_async_session),
) -> TokenUsageChartRead:
    try:
        return await build_token_usage_chart(
            session,
            preset=preset,
            feature_type=feature_type,
            model_name=model_name,
            start_at=start_at,
            end_at=end_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
