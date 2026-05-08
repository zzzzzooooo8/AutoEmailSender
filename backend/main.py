from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    batch_tasks_router,
    crawl_jobs_router,
    diagnostics_router,
    email_tasks_router,
    identities_router,
    llm_profiles_router,
    materials_router,
    match_analysis_jobs_router,
    professors_router,
    runtime_settings_router,
    test_compose_router,
    token_usage_router,
    workspaces_router,
)
from app.core.config import get_settings
from app.core.database import dispose_engine, get_session_factory
from app.core.migrations import ensure_database_schema
from app.core.request_context import RequestContextMiddleware
from app.core.windows_event_loop import ensure_windows_proactor_event_loop_policy
from app.services.operation_logs import cleanup_old_operation_logs
from app.services.runtime_manager import RuntimeManager


ensure_windows_proactor_event_loop_policy()
logger = logging.getLogger(__name__)


@dataclass(slots=True)
class StartupStatus:
    state: str
    phase: str
    message: str
    started_at: datetime
    updated_at: datetime
    error: str | None = None

    def to_response(self) -> dict[str, object]:
        payload = asdict(self)
        payload["started_at"] = self.started_at.isoformat()
        payload["updated_at"] = self.updated_at.isoformat()
        payload["elapsed_seconds"] = max(
            0,
            int((datetime.now(UTC) - self.started_at).total_seconds()),
        )
        return payload


STARTUP_PHASE_MESSAGES = {
    "starting": "正在启动系统服务",
    "migrating_database": "正在检查和升级本地数据",
    "cleaning_logs": "正在整理本地运行日志",
    "starting_workers": "正在启动后台任务",
    "ready": "系统已准备就绪",
    "error": "系统准备失败",
}


def initialize_startup_status(app: FastAPI) -> None:
    now = datetime.now(UTC)
    app.state.startup_status = StartupStatus(
        state="starting",
        phase="starting",
        message=STARTUP_PHASE_MESSAGES["starting"],
        started_at=now,
        updated_at=now,
    )


def set_startup_status(
    app: FastAPI,
    *,
    state: str,
    phase: str,
    error: str | None = None,
) -> None:
    current = getattr(app.state, "startup_status", None)
    now = datetime.now(UTC)
    started_at = current.started_at if current is not None else now
    app.state.startup_status = StartupStatus(
        state=state,
        phase=phase,
        message=STARTUP_PHASE_MESSAGES[phase],
        started_at=started_at,
        updated_at=now,
        error=error,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_startup_status(app)
    app.state.runtime_ready = False
    app.state.runtime_error = None
    app.state.runtime_manager = None
    runtime_task = asyncio.create_task(initialize_runtime(app))
    runtime_task.add_done_callback(log_runtime_initialization_failure)

    try:
        yield
    finally:
        if not runtime_task.done():
            runtime_task.cancel()
            await asyncio.gather(runtime_task, return_exceptions=True)
        runtime_manager = app.state.runtime_manager
        if runtime_manager is not None:
            await runtime_manager.stop()
        await dispose_engine()


async def initialize_runtime(app: FastAPI) -> None:
    try:
        set_startup_status(app, state="starting", phase="migrating_database")
        await ensure_database_schema()
        set_startup_status(app, state="starting", phase="cleaning_logs")
        async with get_session_factory()() as session:
            await cleanup_old_operation_logs(session)
            await session.commit()
        set_startup_status(app, state="starting", phase="starting_workers")
        if get_settings().enable_background_workers:
            runtime_manager = RuntimeManager(get_session_factory())
            await runtime_manager.start()
            app.state.runtime_manager = runtime_manager
        app.state.runtime_ready = True
        set_startup_status(app, state="ready", phase="ready")
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        app.state.runtime_error = str(exc)
        set_startup_status(app, state="error", phase="error", error=str(exc))
        raise


def log_runtime_initialization_failure(task: asyncio.Task[None]) -> None:
    if task.cancelled():
        return
    try:
        task.result()
    except Exception:
        logger.exception("桌面后端运行时初始化失败")


def create_app() -> FastAPI:
    app = FastAPI(title="Auto Email Agent API", version="3.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)

    app.include_router(identities_router)
    app.include_router(materials_router)
    app.include_router(match_analysis_jobs_router)
    app.include_router(llm_profiles_router)
    app.include_router(professors_router)
    app.include_router(test_compose_router)
    app.include_router(crawl_jobs_router)
    app.include_router(diagnostics_router)
    app.include_router(batch_tasks_router)
    app.include_router(email_tasks_router)
    app.include_router(workspaces_router)
    app.include_router(token_usage_router)
    app.include_router(runtime_settings_router)

    @app.get("/api/ping")
    async def ping() -> dict[str, str]:
        return {
            "status": "ok",
            "message": "Auto Email Agent API 已启动",
        }

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/startup-status")
    async def startup_status() -> dict[str, object]:
        status = getattr(app.state, "startup_status", None)
        if status is None:
            initialize_startup_status(app)
            status = app.state.startup_status
        return status.to_response()

    @app.get("/ready")
    async def ready() -> dict[str, str]:
        runtime_error = getattr(app.state, "runtime_error", None)
        if runtime_error:
            raise HTTPException(status_code=500, detail=runtime_error)
        if not getattr(app.state, "runtime_ready", False):
            raise HTTPException(status_code=503, detail="后端初始化中")
        return {"status": "ready"}

    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8010, reload=True)
