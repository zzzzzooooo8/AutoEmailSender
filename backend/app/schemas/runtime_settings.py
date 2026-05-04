from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class RuntimeSettingsRead(BaseModel):
    match_analysis_job_worker_count: int
    match_analysis_job_item_concurrency: int
    match_analysis_job_interval_seconds: int
    crawler_worker_count: int
    crawler_profile_enrichment_concurrency: int
    crawler_host_concurrency: int
    updated_at: datetime


class RuntimeSettingsUpdate(BaseModel):
    match_analysis_job_worker_count: int = Field(ge=1, le=8)
    match_analysis_job_item_concurrency: int = Field(ge=1, le=20)
    match_analysis_job_interval_seconds: int = Field(ge=1, le=300)
    crawler_worker_count: int = Field(ge=1, le=8)
    crawler_profile_enrichment_concurrency: int = Field(ge=1, le=20)
    crawler_host_concurrency: int = Field(ge=1, le=8)
