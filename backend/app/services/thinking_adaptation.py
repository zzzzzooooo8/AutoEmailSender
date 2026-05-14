"""Thinking-mode adaptation: detect protocol errors and find the right extra_body per model.

The cache is keyed by (api_base_url, model_name) and stored in the
``thinking_adaptation_cache`` table. See ``docs/database_table_design.md`` for
field semantics.
"""

from __future__ import annotations

from typing import Final


THINKING_PROTOCOL_ERROR_KEYWORDS: Final[tuple[str, ...]] = (
    "reasoning_content",
    "reasoning blocks",
    "reasoning block",
    "thinking mode",
    "thinking block",
    "thinking blocks",
    "must be passed back",
    "must be preserved",
)

# Candidates are tried in priority order. The first item covers DeepSeek /
# MiMo / Doubao / Moonshot; the rest cover Qwen3 / GLM / OpenRouter / Gemini.
THINKING_DISABLE_CANDIDATES: Final[tuple[dict[str, object], ...]] = (
    {"thinking": {"type": "disabled"}},
    {"enable_thinking": False},
    {"reasoning": {"effort": "off"}},
    {"thinking_budget": 0},
)

_THINKING_KEYS: Final[tuple[str, ...]] = (
    "thinking",
    "enable_thinking",
    "reasoning",
    "thinking_budget",
)


def is_thinking_mode_protocol_error(status_code: int, response_text: str) -> bool:
    """Return True when an HTTP failure looks like a thinking-mode protocol error.

    These errors only appear on multi-turn calls where the upstream model
    requires the previous assistant ``reasoning_content`` to be replayed.
    """

    if status_code != 400 or not response_text:
        return False
    haystack = response_text.lower()
    return any(keyword in haystack for keyword in THINKING_PROTOCOL_ERROR_KEYWORDS)


def strip_thinking_keys(payload: dict[str, object]) -> dict[str, object]:
    """Remove every known thinking-mode override key from ``payload`` (out-of-place)."""

    cleaned = dict(payload)
    for key in _THINKING_KEYS:
        cleaned.pop(key, None)
    return cleaned


def merge_extra_body(
    payload: dict[str, object],
    extra_body: dict[str, object] | None,
) -> dict[str, object]:
    """Strip any existing thinking keys from ``payload`` and overlay ``extra_body``.

    Always overwrites so a single attempt's intent is unambiguous: if
    ``extra_body`` is ``None`` we strip and write nothing back.
    """

    merged = strip_thinking_keys(payload)
    if extra_body:
        merged.update(extra_body)
    return merged


from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ThinkingAdaptationCache


async def get_cached_extra_body(
    session: AsyncSession,
    *,
    api_base_url: str,
    model_name: str,
) -> tuple[bool, dict[str, object] | None]:
    """Look up the cached extra_body for a (base_url, model_name) pair.

    Returns ``(hit, value)`` where ``hit`` is True if a row exists (even if the
    stored value is ``None``, which positively means "we tried and the model
    needs no extra_body").
    """

    row = await session.scalar(
        select(ThinkingAdaptationCache).where(
            ThinkingAdaptationCache.api_base_url == api_base_url,
            ThinkingAdaptationCache.model_name == model_name,
        )
    )
    if row is None:
        return False, None
    value = row.learned_extra_body
    return True, dict(value) if isinstance(value, dict) else None


async def record_thinking_adaptation(
    session: AsyncSession,
    *,
    api_base_url: str,
    model_name: str,
    learned_extra_body: dict[str, object] | None,
) -> None:
    """Insert or update the cache row for ``(api_base_url, model_name)``.

    The caller is responsible for committing the surrounding session.
    """

    row = await session.scalar(
        select(ThinkingAdaptationCache).where(
            ThinkingAdaptationCache.api_base_url == api_base_url,
            ThinkingAdaptationCache.model_name == model_name,
        )
    )
    now = datetime.now(UTC)
    if row is None:
        session.add(
            ThinkingAdaptationCache(
                api_base_url=api_base_url,
                model_name=model_name,
                learned_extra_body=(
                    dict(learned_extra_body) if learned_extra_body else None
                ),
                probed_at=now,
            )
        )
    else:
        row.learned_extra_body = (
            dict(learned_extra_body) if learned_extra_body else None
        )
        row.probed_at = now
