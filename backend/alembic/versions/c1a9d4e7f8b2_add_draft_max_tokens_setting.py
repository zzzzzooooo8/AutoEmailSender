"""add draft max tokens setting

Revision ID: c1a9d4e7f8b2
Revises: b6f1a2c3d4e5
Create Date: 2026-05-06 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1a9d4e7f8b2"
down_revision: Union[str, Sequence[str], None] = "b6f1a2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("app_settings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "draft_max_tokens",
                sa.Integer(),
                server_default=sa.text("3600"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    with op.batch_alter_table("app_settings", schema=None) as batch_op:
        batch_op.drop_column("draft_max_tokens")
