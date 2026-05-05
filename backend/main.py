from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

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


@asynccontextmanager
async def lifespan(app: FastAPI):
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
        await ensure_database_schema()
        async with get_session_factory()() as session:
            await cleanup_old_operation_logs(session)
            await session.commit()
        if get_settings().enable_background_workers:
            runtime_manager = RuntimeManager(get_session_factory())
            await runtime_manager.start()
            app.state.runtime_manager = runtime_manager
        app.state.runtime_ready = True
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        app.state.runtime_error = str(exc)
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
