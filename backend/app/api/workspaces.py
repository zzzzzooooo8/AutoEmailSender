from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.workspace_support import build_workspace_thread, ensure_workspace_task
from app.core.database import get_async_session, get_session_factory
from app.models import Professor
from app.schemas.workspace import WorkspaceThreadRead
from app.services.task_runtime import sync_workspace_professor_replies


router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


@router.get("/{professor_id}", response_model=WorkspaceThreadRead)
async def get_workspace_thread(
    professor_id: int,
    identity_id: int = Query(...),
    llm_profile_id: int = Query(...),
    session: AsyncSession = Depends(get_async_session),
) -> WorkspaceThreadRead:
    return await build_workspace_thread(
        session,
        professor_id=professor_id,
        identity_id=identity_id,
        llm_profile_id=llm_profile_id,
    )


@router.post("/{professor_id}/ensure-task", response_model=WorkspaceThreadRead)
async def ensure_personal_workspace_task(
    professor_id: int,
    identity_id: int = Query(...),
    llm_profile_id: int = Query(...),
    session: AsyncSession = Depends(get_async_session),
) -> WorkspaceThreadRead:
    await ensure_workspace_task(
        session,
        professor_id=professor_id,
        identity_id=identity_id,
        llm_profile_id=llm_profile_id,
    )
    return await build_workspace_thread(
        session,
        professor_id=professor_id,
        identity_id=identity_id,
        llm_profile_id=llm_profile_id,
    )

@router.post("/{professor_id}/refresh-replies", response_model=WorkspaceThreadRead)
async def refresh_workspace_replies(
    professor_id: int,
    identity_id: int = Query(...),
    llm_profile_id: int = Query(...),
    session: AsyncSession = Depends(get_async_session),
) -> WorkspaceThreadRead:
    await sync_workspace_professor_replies(
        get_session_factory(),
        identity_id,
        professor_id,
    )
    return await build_workspace_thread(
        session,
        professor_id=professor_id,
        identity_id=identity_id,
        llm_profile_id=llm_profile_id,
    )
