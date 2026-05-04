from app.api.batch_tasks import router as batch_tasks_router
from app.api.crawl_jobs import router as crawl_jobs_router
from app.api.diagnostics import router as diagnostics_router
from app.api.email_tasks import router as email_tasks_router
from app.api.identities import router as identities_router
from app.api.llm_profiles import router as llm_profiles_router
from app.api.materials import router as materials_router
from app.api.match_analysis_jobs import router as match_analysis_jobs_router
from app.api.professors import router as professors_router
from app.api.runtime_settings import router as runtime_settings_router
from app.api.test_compose import router as test_compose_router
from app.api.token_usage import router as token_usage_router
from app.api.workspaces import router as workspaces_router

__all__ = [
    "batch_tasks_router",
    "crawl_jobs_router",
    "diagnostics_router",
    "email_tasks_router",
    "identities_router",
    "llm_profiles_router",
    "materials_router",
    "match_analysis_jobs_router",
    "professors_router",
    "runtime_settings_router",
    "test_compose_router",
    "token_usage_router",
    "workspaces_router",
]
