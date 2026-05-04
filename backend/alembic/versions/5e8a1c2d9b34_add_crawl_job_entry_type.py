"""add crawl job entry type

Revision ID: 5e8a1c2d9b34
Revises: 6d7e8f9a0b12
Create Date: 2026-04-28
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5e8a1c2d9b34"
down_revision: Union[str, Sequence[str], None] = "6d7e8f9a0b12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "crawl_jobs",
        sa.Column(
            "entry_type",
            sa.String(length=32),
            server_default=sa.text("'list'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("crawl_jobs", "entry_type")
