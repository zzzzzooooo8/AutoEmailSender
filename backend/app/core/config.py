from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
DEFAULT_SQLITE_PATH = DATA_DIR / "auto_email_sender.db"
DEFAULT_DATABASE_URL = f"sqlite+aiosqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"


@dataclass(frozen=True, slots=True)
class Settings:
    project_root: Path
    data_dir: Path
    uploads_dir: Path
    crawler_debug_dir: Path
    database_url: str
    default_mail_delivery_mode: str
    draft_worker_interval_seconds: int
    dispatcher_interval_seconds: int
    imap_poll_interval_seconds: int
    crawler_worker_count: int
    crawler_profile_enrichment_concurrency: int
    crawler_host_concurrency: int
    crawler_profile_fetch_max_retries: int
    llm_request_timeout_seconds: int
    smtp_send_timeout_seconds: int
    imap_lookback_hours: int
    operation_log_retention_days: int
    enable_background_workers: bool
    crawler_debug_enabled: bool


def _get_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default


def _get_bool_env(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_database_url(database_url: str) -> str:
    if database_url.startswith("sqlite:///") and "+aiosqlite" not in database_url:
        return database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    return database_url


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    crawler_debug_dir = Path(
        os.getenv("CRAWLER_DEBUG_DIR", (DATA_DIR / "logs" / "crawler").as_posix())
    )
    crawler_debug_dir.mkdir(parents=True, exist_ok=True)
    database_url = _normalize_database_url(
        os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
    )
    return Settings(
        project_root=PROJECT_ROOT,
        data_dir=DATA_DIR,
        uploads_dir=UPLOADS_DIR,
        crawler_debug_dir=crawler_debug_dir,
        database_url=database_url,
        default_mail_delivery_mode=os.getenv("DEFAULT_MAIL_DELIVERY_MODE", "dry_run"),
        draft_worker_interval_seconds=_get_int_env("DRAFT_WORKER_INTERVAL_SECONDS", 10),
        dispatcher_interval_seconds=_get_int_env("DISPATCHER_INTERVAL_SECONDS", 30),
        imap_poll_interval_seconds=_get_int_env("IMAP_POLL_INTERVAL_SECONDS", 60),
        crawler_worker_count=_get_int_env("CRAWLER_WORKER_COUNT", 2),
        crawler_profile_enrichment_concurrency=_get_int_env(
            "CRAWLER_PROFILE_ENRICHMENT_CONCURRENCY",
            3,
        ),
        crawler_host_concurrency=_get_int_env("CRAWLER_HOST_CONCURRENCY", 1),
        crawler_profile_fetch_max_retries=_get_int_env(
            "CRAWLER_PROFILE_FETCH_MAX_RETRIES",
            2,
        ),
        llm_request_timeout_seconds=_get_int_env("LLM_REQUEST_TIMEOUT_SECONDS", 90),
        smtp_send_timeout_seconds=_get_int_env("SMTP_SEND_TIMEOUT_SECONDS", 30),
        imap_lookback_hours=_get_int_env("IMAP_LOOKBACK_HOURS", 72),
        operation_log_retention_days=_get_int_env("OPERATION_LOG_RETENTION_DAYS", 30),
        enable_background_workers=_get_bool_env("ENABLE_BACKGROUND_WORKERS", True),
        crawler_debug_enabled=_get_bool_env("CRAWLER_DEBUG", False),
    )


def get_sync_database_url() -> str:
    return get_settings().database_url.replace("+aiosqlite", "", 1)
