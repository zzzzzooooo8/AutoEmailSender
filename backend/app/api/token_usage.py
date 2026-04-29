from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.schemas.token_usage import TokenUsageRecordListRead
from app.services.token_usage_records import list_token_usage_records


router = APIRouter(prefix="/api/token-usage", tags=["token-usage"])


@router.get("/records", response_model=TokenUsageRecordListRead)
async def list_records(
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_async_session),
) -> TokenUsageRecordListRead:
    return await list_token_usage_records(session, limit=limit)
