from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SystemSettingsRead(BaseModel):
    mail_delivery_mode: Literal["dry_run", "live"]
    updated_at: datetime


class SystemSettingsUpdate(BaseModel):
    mail_delivery_mode: Literal["dry_run", "live"]
