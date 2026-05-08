"""fix partially completed crawl jobs

Revision ID: c6d7e8f9a012
Revises: b9d1e3f4a6c7
Create Date: 2026-05-08 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c6d7e8f9a012"
down_revision = "b9d1e3f4a6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            UPDATE crawl_jobs
            SET status = 'partially_completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'completed'
              AND EXISTS (
                SELECT 1
                FROM crawl_candidates
                WHERE crawl_candidates.job_id = crawl_jobs.id
                  AND crawl_candidates.review_status = 'pending'
              )
            """,
        ),
    )
    connection.execute(
        sa.text(
            """
            UPDATE crawl_job_runs
            SET status = 'partially_completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE id IN (
                SELECT current_run_id
                FROM crawl_jobs
                WHERE status = 'partially_completed'
                  AND current_run_id IS NOT NULL
            )
              AND status = 'completed'
            """,
        ),
    )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            UPDATE crawl_job_runs
            SET status = 'completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'partially_completed'
            """,
        ),
    )
    connection.execute(
        sa.text(
            """
            UPDATE crawl_jobs
            SET status = 'completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'partially_completed'
            """,
        ),
    )
