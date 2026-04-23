from app.api.batch_tasks import router as batch_tasks_router
from app.api.email_tasks import router as email_tasks_router
from app.api.identities import router as identities_router
from app.api.llm_profiles import router as llm_profiles_router
from app.api.materials import router as materials_router
from app.api.professors import router as professors_router
from app.api.workspaces import router as workspaces_router

__all__ = [
    "batch_tasks_router",
    "email_tasks_router",
    "identities_router",
    "llm_profiles_router",
    "materials_router",
    "professors_router",
    "workspaces_router",
]
