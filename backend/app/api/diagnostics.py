from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.models import OperationLog
from app.schemas.diagnostics import (
    OperationLogExportResponse,
    OperationLogListResponse,
    OperationLogRead,
)


router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])

OperationLogLimit = Annotated[int, Query(ge=1, le=500)]
OperationLogOffset = Annotated[int, Query(ge=0)]


@router.get("/operation-logs", response_model=OperationLogListResponse)
async def list_operation_logs(
    limit: OperationLogLimit = 100,
    offset: OperationLogOffset = 0,
    level: str | None = None,
    category: str | None = None,
    event_name: str | None = None,
    request_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    session: AsyncSession = Depends(get_async_session),
) -> OperationLogListResponse:
    filters = _build_operation_log_filters(
        level=level,
        category=category,
        event_name=event_name,
        request_id=request_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    total = await _count_operation_logs(session, filters)
    logs = list(
        (
            await session.execute(
                select(OperationLog)
                .where(*filters)
                .order_by(OperationLog.created_at.desc(), OperationLog.id.desc())
                .limit(limit)
                .offset(offset),
            )
        ).scalars(),
    )
    return OperationLogListResponse(
        items=[_to_operation_log_read(log) for log in logs],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/export", response_model=OperationLogExportResponse)
async def export_operation_logs(
    level: str | None = None,
    category: str | None = None,
    event_name: str | None = None,
    request_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    session: AsyncSession = Depends(get_async_session),
) -> OperationLogExportResponse:
    filter_values = {
        "level": level,
        "category": category,
        "event_name": event_name,
        "request_id": request_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
    }
    filters = _build_operation_log_filters(**filter_values)
    total = await _count_operation_logs(session, filters)
    logs = list(
        (
            await session.execute(
                select(OperationLog)
                .where(*filters)
                .order_by(OperationLog.created_at.desc(), OperationLog.id.desc())
                .limit(500),
            )
        ).scalars(),
    )
    return OperationLogExportResponse(
        exported_at=datetime.now(UTC),
        total=total,
        items=[_to_operation_log_read(log) for log in logs],
        filters=filter_values,
    )


def _build_operation_log_filters(
    *,
    level: str | None,
    category: str | None,
    event_name: str | None,
    request_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
) -> list[object]:
    filters: list[object] = []
    if level is not None:
        filters.append(OperationLog.level == level)
    if category is not None:
        filters.append(OperationLog.category == category)
    if event_name is not None:
        filters.append(OperationLog.event_name == event_name)
    if request_id is not None:
        filters.append(OperationLog.request_id == request_id)
    if entity_type is not None:
        filters.append(OperationLog.entity_type == entity_type)
    if entity_id is not None:
        filters.append(OperationLog.entity_id == entity_id)
    return filters


async def _count_operation_logs(session: AsyncSession, filters: list[object]) -> int:
    statement: Select[tuple[int]] = select(func.count()).select_from(OperationLog).where(*filters)
    return int(await session.scalar(statement) or 0)


def _to_operation_log_read(log: OperationLog) -> OperationLogRead:
    return OperationLogRead(
        id=log.id,
        request_id=log.request_id,
        category=log.category,
        event_name=log.event_name,
        level=log.level,
        message=log.message,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        metadata=log.event_metadata,
        created_at=log.created_at,
    )
