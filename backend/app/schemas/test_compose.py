from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.identity import IdentityMaterialRead


class TestComposeIdentityRead(BaseModel):
    id: int
    name: str
    profile_name: str
    sender_name: str
    email_address: str


class TestComposeLLMRead(BaseModel):
    id: int
    name: str
    provider: str
    model_name: str


class TestComposeDraftRead(BaseModel):
    subject: str | None
    body_text: str
    body_html: str | None
    selected_material_ids: list[int]


class TestComposeMessageRead(BaseModel):
    id: int
    recipient_email: str
    subject: str | None
    content: str
    content_html: str | None
    status: str
    rfc_message_id: str | None
    failure_summary: str | None
    created_at: datetime


class TestComposeThreadRead(BaseModel):
    identity: TestComposeIdentityRead
    llm_profile: TestComposeLLMRead
    material_options: list[IdentityMaterialRead]
    draft: TestComposeDraftRead
    history: list[TestComposeMessageRead]


class TestComposeStatusRead(BaseModel):
    completed: bool


class TestComposeDraftUpdateRequest(BaseModel):
    subject: str | None = None
    body_text: str
    body_html: str | None = None
    selected_material_ids: list[int] | None = None


class TestComposeMessageSendRequest(TestComposeDraftUpdateRequest):
    pass
