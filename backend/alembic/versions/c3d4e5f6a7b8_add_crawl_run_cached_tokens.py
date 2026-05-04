"""add crawl run cached tokens

Revision ID: c3d4e5f6a7b8
Revises: b8c9d0e1f2a3
Create Date: 2026-04-30 14:45:00.000000
"""

from __future__ import annotations

import json
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "crawl_job_runs",
        sa.Column("cached_tokens", sa.Integer(), nullable=True),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT crawl_job_runs.id AS run_id, crawl_jobs.agent_trace AS agent_trace
            FROM crawl_job_runs
            JOIN crawl_jobs ON crawl_jobs.id = crawl_job_runs.job_id
            """
        )
    ).mappings()
    for row in rows:
        cached_tokens = _legacy_cached_tokens(row["agent_trace"])
        if cached_tokens is None:
            continue
        connection.execute(
            sa.text(
                "UPDATE crawl_job_runs SET cached_tokens = :cached_tokens WHERE id = :run_id"
            ),
            {"cached_tokens": cached_tokens, "run_id": row["run_id"]},
        )


def downgrade() -> None:
    op.drop_column("crawl_job_runs", "cached_tokens")


def _legacy_cached_tokens(agent_trace: object) -> int | None:
    if not agent_trace:
        return None
    if isinstance(agent_trace, str):
        try:
            trace = json.loads(agent_trace)
        except json.JSONDecodeError:
            trace = agent_trace
    else:
        trace = agent_trace

    haystack = str(trace)
    patterns = _cached_token_patterns()
    for pattern_group in (patterns[:1], patterns[1:]):
        total = 0
        found = False
        for pattern in pattern_group:
            for match in pattern.finditer(haystack):
                total += int(match.group("cached"))
                found = True
        if found:
            return total
    return None


def _cached_token_patterns() -> tuple[re.Pattern[str], ...]:
    return (
        re.compile(
            r"['\"](?:prompt_tokens_details|input_tokens_details|input_token_details)['\"]"
            r":\s*\{[^{}]*(?:['\"]cached_tokens['\"]|['\"]cache_read['\"]):\s*(?P<cached>\d+)"
        ),
        re.compile(r"['\"]cached_tokens['\"]:\s*(?P<cached>\d+)"),
        re.compile(r"['\"]cache_read['\"]:\s*(?P<cached>\d+)"),
    )
