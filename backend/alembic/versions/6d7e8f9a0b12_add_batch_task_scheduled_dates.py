"""add batch task scheduled dates

Revision ID: 6d7e8f9a0b12
Revises: 8a6d2f4c9b31
Create Date: 2026-04-26
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6d7e8f9a0b12"
down_revision: Union[str, Sequence[str], None] = "8a6d2f4c9b31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("batch_tasks", sa.Column("scheduled_dates", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("batch_tasks", "scheduled_dates")
