from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import DateTime, Integer, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MailDeliveryMode(StrEnum):
    DRY_RUN = "dry_run"
    LIVE = "live"


class AppSetting(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(UTC),
    )
    match_analysis_job_worker_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("1"),
    )
    match_analysis_job_item_concurrency: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("3"),
    )
    match_analysis_job_interval_seconds: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("10"),
    )
    crawler_worker_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("2"),
    )
    crawler_profile_enrichment_concurrency: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("3"),
    )
    crawler_host_concurrency: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("1"),
    )
