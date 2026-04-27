from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any


USAGE_METADATA_PATTERN = re.compile(
    r"usage_metadata=\{'input_tokens':\s*(?P<input>\d+),\s*'output_tokens':\s*(?P<output>\d+),\s*'total_tokens':\s*(?P<total>\d+)",
)
TOKEN_USAGE_PATTERN = re.compile(
    r"'token_usage':\s*\{'completion_tokens':\s*(?P<output>\d+),\s*'prompt_tokens':\s*(?P<input>\d+),\s*'total_tokens':\s*(?P<total>\d+)",
)


@dataclass(frozen=True, slots=True)
class CrawlJobMetrics:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    duration_seconds: int = 0


def build_crawl_job_metrics(job: Any) -> CrawlJobMetrics:
    trace_events = _normalize_trace(getattr(job, "agent_trace", None))
    input_tokens = 0
    output_tokens = 0
    total_tokens = 0

    for event in trace_events:
        usage = _extract_token_usage(event)
        if usage is None:
            continue
        input_tokens += usage["input_tokens"]
        output_tokens += usage["output_tokens"]
        total_tokens += usage["total_tokens"]

    created_at = _ensure_datetime(getattr(job, "created_at", None))
    updated_at = _ensure_datetime(getattr(job, "updated_at", None))
    duration_seconds = 0
    if created_at is not None and updated_at is not None:
        duration_seconds = max(0, int((updated_at - created_at).total_seconds()))

    return CrawlJobMetrics(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        duration_seconds=duration_seconds,
    )


def _extract_token_usage(event: dict[str, object]) -> dict[str, int] | None:
    haystack = _stringify_trace_payload(event)
    metadata_match = USAGE_METADATA_PATTERN.search(haystack)
    if metadata_match:
        return {
            "input_tokens": int(metadata_match.group("input")),
            "output_tokens": int(metadata_match.group("output")),
            "total_tokens": int(metadata_match.group("total")),
        }

    token_usage_match = TOKEN_USAGE_PATTERN.search(haystack)
    if token_usage_match:
        return {
            "input_tokens": int(token_usage_match.group("input")),
            "output_tokens": int(token_usage_match.group("output")),
            "total_tokens": int(token_usage_match.group("total")),
        }

    return None


def _stringify_trace_payload(event: dict[str, object]) -> str:
    parts: list[str] = []
    for key in ("message", "summary"):
        value = event.get(key)
        if isinstance(value, str):
            parts.append(value)
    raw = event.get("raw")
    if raw is not None:
        parts.append(str(raw))
    return "\n".join(parts)


def _normalize_trace(value: Any) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _ensure_datetime(value: object) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value
