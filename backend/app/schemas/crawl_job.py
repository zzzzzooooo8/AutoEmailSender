from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.crawler_tools import (
    UNSAFE_CRAWL_URL_MESSAGE,
    validate_safe_public_crawl_url,
)


CrawlJobStatusDTO = Literal["queued", "running", "needs_review", "completed", "failed", "canceled"]
CrawlCandidateReviewStatusDTO = Literal["pending", "accepted", "rejected", "merged"]


class CrawlJobCreatePayload(BaseModel):
    university: str
    school: str
    start_url: str
    llm_profile_id: int | None = None

    @field_validator("university", "school", "start_url", mode="before")
    @classmethod
    def _strip_required_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("university", "school", "start_url")
    @classmethod
    def _required_text(cls, value: str) -> str:
        if not value:
            raise ValueError("不能为空")
        return value

    @field_validator("start_url")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("教师列表页面 URL 必须以 http:// 或 https:// 开头")
        try:
            validate_safe_public_crawl_url(value)
        except ValueError as exc:
            raise ValueError(UNSAFE_CRAWL_URL_MESSAGE) from exc
        return value


class CrawlJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    university: str
    school: str
    start_url: str
    llm_profile_id: int | None
    status: CrawlJobStatusDTO
    progress_current: int
    progress_total: int
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class CrawlPageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    url: str
    parent_url: str | None
    fetch_method: str
    page_type: str
    status: str
    title: str | None
    text_excerpt: str | None
    error_message: str | None
    created_at: datetime


class CrawlCandidateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    professor_id: int | None
    name: str
    email: str | None
    title: str | None
    university: str | None
    school: str | None
    department: str | None
    research_direction: str | None
    recent_papers: list[str]
    profile_url: str | None
    source_url: str | None
    confidence: float
    field_confidence: dict[str, float] | None
    evidence: dict[str, object] | None
    review_status: CrawlCandidateReviewStatusDTO
    created_at: datetime
    updated_at: datetime

    @field_validator("recent_papers", mode="before")
    @classmethod
    def _normalize_recent_papers(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return []


class CrawlCandidateUpdatePayload(BaseModel):
    name: str
    email: str | None = None
    title: str | None = None
    university: str | None = None
    school: str | None = None
    department: str | None = None
    research_direction: str | None = None
    recent_papers: list[str] = Field(default_factory=list)
    profile_url: str | None = None
    source_url: str | None = None
    review_status: CrawlCandidateReviewStatusDTO = "pending"

    @field_validator(
        "name",
        "email",
        "title",
        "university",
        "school",
        "department",
        "research_direction",
        "profile_url",
        "source_url",
        mode="before",
    )
    @classmethod
    def _strip_string_fields(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str:
        if not value:
            raise ValueError("姓名不能为空")
        return value

    @field_validator("recent_papers", mode="before")
    @classmethod
    def _normalize_recent_papers(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            return [item.strip() for item in value.split("|") if item.strip()]
        return []


class CrawlJobApprovePayload(BaseModel):
    candidate_ids: list[int]


class CrawlJobApproveResult(BaseModel):
    inserted_count: int
    updated_count: int
    skipped_count: int
    message: str
