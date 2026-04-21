from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.identity import IdentityMaterialRead


class WorkspaceProfessorRead(BaseModel):
    id: int
    name: str
    email: str | None
    title: str | None
    university: str | None
    school: str | None
    research_direction: str | None


class WorkspaceIdentityRead(BaseModel):
    id: int
    name: str
    email_address: str


class WorkspaceLLMRead(BaseModel):
    id: int
    name: str
    provider: str
    model_name: str


class WorkspaceTaskSummaryRead(BaseModel):
    id: int | None
    batch_task_id: int | None
    status: str | None
    outreach_generation_mode: str
    outreach_template_subject: str | None
    outreach_template_body_text: str | None
    outreach_template_body_html: str | None
    match_score: int | None
    match_reason: str | None
    fit_points: list[str]
    risk_points: list[str]
    match_keywords: list[str]
    generated_subject: str | None
    generated_content_text: str | None
    generated_content_html: str | None
    approved_subject: str | None
    approved_body_text: str | None
    approved_body_html: str | None
    primary_material_id: int | None
    primary_material: IdentityMaterialRead | None
    selected_material_ids: list[int] | None
    delivery_mode: str | None
    approved_at: datetime | None
    scheduled_at: datetime | None
    last_send_attempt_at: datetime | None
    sent_at: datetime | None
    last_rfc_message_id: str | None
    retry_count: int
    last_error: str | None
    is_replied: bool
    estimated_prompt_tokens: int | None = None
    estimated_completion_tokens_upper_bound: int | None = None
    estimated_total_tokens_upper_bound: int | None = None
    last_draft_prompt_tokens: int | None = None
    last_draft_completion_tokens: int | None = None
    last_draft_total_tokens: int | None = None


class WorkspaceMessageRead(BaseModel):
    id: int
    direction: str
    delivery_mode: str | None
    subject: str | None
    content: str
    content_html: str | None
    rfc_message_id: str | None
    failure_summary: str | None
    reply_headers: dict[str, object] | None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    created_at: datetime


class WorkspaceThreadRead(BaseModel):
    professor: WorkspaceProfessorRead
    identity: WorkspaceIdentityRead
    llm_profile: WorkspaceLLMRead
    mail_delivery_mode: str
    material_options: list[IdentityMaterialRead]
    current_task: WorkspaceTaskSummaryRead
    messages: list[WorkspaceMessageRead]
