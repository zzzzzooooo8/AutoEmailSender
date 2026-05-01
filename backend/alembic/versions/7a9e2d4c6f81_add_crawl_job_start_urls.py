"""add crawl job start urls

Revision ID: 7a9e2d4c6f81
Revises: c3d4e5f6a7b8
Create Date: 2026-05-01 12:05:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "7a9e2d4c6f81"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crawl_jobs", schema=None) as batch_op:
        batch_op.add_column(sa.Column("start_urls", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("crawl_jobs", schema=None) as batch_op:
        batch_op.drop_column("start_urls")
