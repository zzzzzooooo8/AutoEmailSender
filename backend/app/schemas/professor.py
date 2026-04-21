from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProfessorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None
    title: str | None
    university: str | None
    school: str | None
    department: str | None
    research_direction: str | None
    recent_papers: list[str] | None
    profile_url: str | None
    source_url: str | None
    crawl_status: str
    skip_reason: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProfessorDashboardItemRead(BaseModel):
    id: int
    name: str
    email: str | None
    title: str | None
    university: str | None
    school: str | None
    department: str | None
    research_direction: str | None
    recent_papers: list[str]
    match_score: int | None
    sent_count: int
    status: str


class ProfessorImportResult(BaseModel):
    inserted_count: int
    total_count: int
    message: str


class ProfessorManagementItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
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
    crawl_status: str
    skip_reason: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProfessorUpsertPayload(BaseModel):
    name: str
    email: str
    title: str | None = None
    university: str | None = None
    school: str | None = None
    department: str | None = None
    research_direction: str | None = None
    recent_papers: list[str] = Field(default_factory=list)
    profile_url: str | None = None
    source_url: str | None = None

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

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str | None) -> str:
        if not value:
            raise ValueError("邮箱不能为空")
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


class ProfessorImportFileResult(BaseModel):
    inserted_count: int
    updated_count: int
    failed_count: int
    message: str


class ProfessorBulkArchivePayload(BaseModel):
    ids: list[int]


class ProfessorActionResult(BaseModel):
    ok: bool
    affected_count: int
    message: str
