"""merge batch draft and task trash heads

Revision ID: b9d1e3f4a6c7
Revises: e8f7a6b5c4d3, f6b2c9d8a1e4
Create Date: 2026-05-07 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "b9d1e3f4a6c7"
down_revision: Union[str, Sequence[str], None] = ("e8f7a6b5c4d3", "f6b2c9d8a1e4")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
