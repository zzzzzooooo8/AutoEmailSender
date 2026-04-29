from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    batch_tasks_router,
    crawl_jobs_router,
    diagnostics_router,
    email_tasks_router,
    identities_router,
    llm_profiles_router,
    materials_router,
    professors_router,
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    runtime_manager: RuntimeManager | None = None
    await ensure_database_schema()
    async with get_session_factory()() as session:
        await cleanup_old_operation_logs(session)
        await session.commit()
    if get_settings().enable_background_workers:
        runtime_manager = RuntimeManager(get_session_factory())
        await runtime_manager.start()
        app.state.runtime_manager = runtime_manager

    try:
        yield
    finally:
        if runtime_manager is not None:
            await runtime_manager.stop()
        await dispose_engine()


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
    app.include_router(llm_profiles_router)
    app.include_router(professors_router)
    app.include_router(test_compose_router)
    app.include_router(crawl_jobs_router)
    app.include_router(diagnostics_router)
    app.include_router(batch_tasks_router)
    app.include_router(email_tasks_router)
    app.include_router(workspaces_router)
    app.include_router(token_usage_router)

    @app.get("/api/ping")
    async def ping() -> dict[str, str]:
        return {
            "status": "ok",
            "message": "Auto Email Agent API 已启动",
        }

    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
