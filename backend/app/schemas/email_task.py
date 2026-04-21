from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class EmailTaskApprovalRequest(BaseModel):
    subject: str | None = None
    body_text: str
    body_html: str | None = None
    selected_material_ids: list[int] | None = None


class EmailTaskScheduleRequest(EmailTaskApprovalRequest):
    scheduled_at: datetime


class EmailTaskPrimaryMaterialRequest(BaseModel):
    primary_material_id: int


class EmailTaskOutreachConfigRequest(BaseModel):
    outreach_generation_mode: str
    outreach_template_subject: str | None = None
    outreach_template_body_text: str | None = None
    outreach_template_body_html: str | None = None
