from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


DashboardMentorMatchBucket = Literal[
    "unmatched",
    "0_59",
    "60_69",
    "70_79",
    "80_89",
    "90_100",
]

DashboardEmailStatusKey = Literal[
    "discovered",
    "matched",
    "generating_draft",
    "draft_failed",
    "review_required",
    "approved",
    "scheduled",
    "sending",
    "sent",
    "send_failed",
    "reply_detected",
    "canceled",
]

DashboardProfileCompletenessBucket = Literal[
    "complete",
    "missing_email",
    "missing_research_direction",
    "missing_recent_papers",
    "missing_profile_url",
    "multiple_missing",
]


class DashboardMentorSummaryRead(BaseModel):
    total_professors: int = 0
    matched_professors: int = 0
    matched_rate: float = 0.0
    high_match_professors: int = 0
    high_score_uncontacted_count: int = 0
    high_score_threshold: int = 80


class DashboardMentorMatchBucketRead(BaseModel):
    bucket: DashboardMentorMatchBucket
    label: str
    count: int = 0


class DashboardProfileCompletenessRead(BaseModel):
    key: Literal["email", "research_direction", "recent_papers", "profile_url", "complete"]
    label: str
    count: int = 0
    total: int = 0
    rate: float = 0.0


class DashboardSchoolDistributionRead(BaseModel):
    school_name: str
    count: int = 0


class DashboardSchoolFilterSchoolRead(BaseModel):
    school_name: str
    count: int = 0


class DashboardSchoolFilterRead(BaseModel):
    university: str
    count: int = 0
    schools: list[DashboardSchoolFilterSchoolRead] = Field(default_factory=list)


class DashboardMentorFilterRead(BaseModel):
    university: str | None = None
    school: str | None = None


class DashboardProfileCompletenessBucketRead(BaseModel):
    key: DashboardProfileCompletenessBucket
    label: str
    count: int = 0
    total: int = 0
    rate: float = 0.0


class DashboardMentorActionItemRead(BaseModel):
    professor_id: int
    name: str
    university: str | None = None
    school: str | None = None
    department: str | None = None
    match_score: int | None = None
    status: str
    status_label: str
    reason: str
    updated_at: datetime
    missing_fields: list[str] = Field(default_factory=list)


class DashboardMentorSectionRead(BaseModel):
    summary: DashboardMentorSummaryRead
    match_score_distribution: list[DashboardMentorMatchBucketRead] = Field(default_factory=list)
    profile_completeness: list[DashboardProfileCompletenessRead] = Field(default_factory=list)
    profile_completeness_distribution: list[DashboardProfileCompletenessBucketRead] = Field(default_factory=list)
    school_distribution: list[DashboardSchoolDistributionRead] = Field(default_factory=list)
    school_filters: list[DashboardSchoolFilterRead] = Field(default_factory=list)
    active_filter: DashboardMentorFilterRead = Field(default_factory=DashboardMentorFilterRead)
    high_score_uncontacted: list[DashboardMentorActionItemRead] = Field(default_factory=list)
    incomplete_professors: list[DashboardMentorActionItemRead] = Field(default_factory=list)


class DashboardEmailSummaryRead(BaseModel):
    sent_count: int = 0
    contacted_professor_count: int = 0
    replied_count: int = 0
    reply_rate: float = 0.0
    send_failed_count: int = 0
    send_failed_rate: float = 0.0
    review_required_count: int = 0
    scheduled_count: int = 0


class DashboardEmailTrendBucketRead(BaseModel):
    date: str
    label: str | None = None
    sent_count: int = 0
    replied_count: int = 0
    failed_count: int = 0


class DashboardEmailFunnelBucketRead(BaseModel):
    key: str
    label: str
    count: int = 0


class DashboardEmailStatusBucketRead(BaseModel):
    status: DashboardEmailStatusKey
    label: str
    count: int = 0


class DashboardEmailFollowUpRead(BaseModel):
    professor_id: int
    task_id: int
    name: str
    university: str | None = None
    school: str | None = None
    department: str | None = None
    match_score: int | None = None
    status: str
    status_label: str
    reason: str
    updated_at: datetime


class DashboardEmailSectionRead(BaseModel):
    summary: DashboardEmailSummaryRead
    trend_30_days: list[DashboardEmailTrendBucketRead] = Field(default_factory=list)
    funnel: list[DashboardEmailFunnelBucketRead] = Field(default_factory=list)
    status_distribution: list[DashboardEmailStatusBucketRead] = Field(default_factory=list)
    follow_ups: list[DashboardEmailFollowUpRead] = Field(default_factory=list)


class DashboardOverviewRead(BaseModel):
    mentor: DashboardMentorSectionRead
    email: DashboardEmailSectionRead
