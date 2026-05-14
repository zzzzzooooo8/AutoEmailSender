"""add thinking adaptation cache

Revision ID: e7a1b2c3d4f5
Revises: d0f1a2b3c4d5
Create Date: 2026-05-14 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7a1b2c3d4f5"
down_revision: Union[str, Sequence[str], None] = "d0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "thinking_adaptation_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("api_base_url", sa.String(length=500), nullable=False),
        sa.Column("model_name", sa.String(length=255), nullable=False),
        sa.Column("learned_extra_body", sa.JSON(), nullable=True),
        sa.Column(
            "probed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_thinking_adaptation_cache")),
        sa.UniqueConstraint(
            "api_base_url",
            "model_name",
            name=op.f("uq_thinking_adaptation_cache_api_base_url"),
        ),
    )
    op.create_index(
        op.f("ix_thinking_adaptation_cache_model_name"),
        "thinking_adaptation_cache",
        ["model_name"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_thinking_adaptation_cache_model_name"),
        table_name="thinking_adaptation_cache",
    )
    op.drop_table("thinking_adaptation_cache")
