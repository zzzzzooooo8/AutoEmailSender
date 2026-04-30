from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


TokenUsageFeatureType = Literal["crawl", "match_analysis", "draft_generation"]
TokenUsageFeatureFilter = Literal[
    "all",
    "crawl",
    "match_analysis",
    "draft_generation",
]
TokenUsageStatus = Literal["success", "failed", "running", "unknown"]


class TokenUsageRecordRead(BaseModel):
    id: str
    feature_type: TokenUsageFeatureType
    feature_label: str
    title: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    cached_tokens: int | None = None
    total_tokens: int | None = None
    model_name: str | None = None
    identity_name: str | None = None
    created_at: datetime
    status: TokenUsageStatus


class TokenUsageSummaryRead(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    total_tokens: int = 0
    record_count: int = 0


class TokenUsagePaginationRead(BaseModel):
    page: int
    page_size: int
    total_records: int
    total_pages: int


class TokenUsageRecordListRead(BaseModel):
    records: list[TokenUsageRecordRead] = Field(default_factory=list)
    summary: TokenUsageSummaryRead
    pagination: TokenUsagePaginationRead
