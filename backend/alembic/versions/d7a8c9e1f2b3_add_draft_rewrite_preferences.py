"""add draft rewrite preferences

Revision ID: d7a8c9e1f2b3
Revises: c1a9d4e7f8b2
Create Date: 2026-05-06 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7a8c9e1f2b3"
down_revision: Union[str, Sequence[str], None] = "c1a9d4e7f8b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("app_settings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "draft_rewrite_intensity",
                sa.String(length=32),
                server_default=sa.text("'moderate'"),
                nullable=False,
            ),
        )
        batch_op.add_column(
            sa.Column(
                "draft_rewrite_tone",
                sa.String(length=32),
                server_default=sa.text("'polite'"),
                nullable=False,
            ),
        )
        batch_op.add_column(
            sa.Column(
                "draft_rewrite_formality",
                sa.String(length=32),
                server_default=sa.text("'balanced'"),
                nullable=False,
            ),
        )
        batch_op.add_column(
            sa.Column(
                "draft_rewrite_length",
                sa.String(length=32),
                server_default=sa.text("'default'"),
                nullable=False,
            ),
        )
        batch_op.add_column(
            sa.Column(
                "draft_rewrite_specificity",
                sa.String(length=32),
                server_default=sa.text("'balanced'"),
                nullable=False,
            ),
        )
        batch_op.add_column(
            sa.Column(
                "draft_template_preservation",
                sa.String(length=32),
                server_default=sa.text("'structure_first'"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    with op.batch_alter_table("app_settings", schema=None) as batch_op:
        batch_op.drop_column("draft_template_preservation")
        batch_op.drop_column("draft_rewrite_specificity")
        batch_op.drop_column("draft_rewrite_length")
        batch_op.drop_column("draft_rewrite_formality")
        batch_op.drop_column("draft_rewrite_tone")
        batch_op.drop_column("draft_rewrite_intensity")
