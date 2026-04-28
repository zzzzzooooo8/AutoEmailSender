"""merge crawl entry type and run heads

Revision ID: a4b6c8d0e2f1
Revises: 5e8a1c2d9b34, f2a7c9d8e1b3
Create Date: 2026-04-29 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "a4b6c8d0e2f1"
down_revision: Union[str, Sequence[str], None] = ("5e8a1c2d9b34", "f2a7c9d8e1b3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
