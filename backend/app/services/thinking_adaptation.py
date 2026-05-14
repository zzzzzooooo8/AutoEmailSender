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
from app.models import LLMProfile
from app.services.llm_runtime import LLMRuntimeError, request_chat_completion


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


class ThinkingAdaptationFailed(RuntimeError):
    """Raised when no candidate extra_body can satisfy the model's thinking-mode protocol."""

    def __init__(
        self,
        message: str,
        *,
        attempted_extra_bodies: list[dict[str, object] | None],
        last_error: LLMRuntimeError | None = None,
    ) -> None:
        super().__init__(message)
        self.attempted_extra_bodies = attempted_extra_bodies
        self.last_error = last_error


def _build_probe_payload(profile: LLMProfile) -> dict[str, object]:
    """Build a 3-turn payload that triggers thinking-mode protocol errors on
    affected models, but is harmless on regular models (they just answer "7")."""

    return {
        "model": profile.model_name,
        "messages": [
            {"role": "user", "content": "记住数字 7。"},
            {"role": "assistant", "content": "好的，我已记住数字 7。"},
            {"role": "user", "content": "我让你记的数字是几？只回复数字。"},
        ],
        "temperature": 0,
        "max_tokens": 16,
    }


def resolve_base_url_for_cache(api_base_url: str | None) -> str:
    """Normalize the api_base_url for use as a cache key."""

    from app.services.llm_runtime import resolve_base_url

    return resolve_base_url(api_base_url)


async def probe_and_learn_extra_body(
    session: AsyncSession,
    profile: LLMProfile,
) -> dict[str, object] | None:
    """Send a multi-turn probe and learn which extra_body the model needs.

    On success: writes a row into ``thinking_adaptation_cache`` and returns the
    learned value (``None`` if the model needs no extra_body).

    On thinking-mode protocol failure across all candidates: raises
    ``ThinkingAdaptationFailed`` and writes nothing.

    On other 4xx/5xx: re-raises ``LLMRuntimeError`` (caller decides what to do).
    """

    payload = _build_probe_payload(profile)
    attempts: list[dict[str, object] | None] = [None, *THINKING_DISABLE_CANDIDATES]
    last_error: LLMRuntimeError | None = None

    for index, candidate in enumerate(attempts):
        try:
            await request_chat_completion(profile, payload, extra_body=candidate)
        except LLMRuntimeError as exc:
            last_error = exc
            if exc.status_code != 400:
                raise
            if not is_thinking_mode_protocol_error(
                exc.status_code or 0,
                str(exc),
            ):
                raise
            if index == len(attempts) - 1:
                raise ThinkingAdaptationFailed(
                    "已尝试全部候选 extra_body，仍无法绕开思考模式协议错。",
                    attempted_extra_bodies=attempts,
                    last_error=exc,
                ) from exc
            continue

        await record_thinking_adaptation(
            session,
            api_base_url=resolve_base_url_for_cache(profile.api_base_url),
            model_name=profile.model_name,
            learned_extra_body=candidate,
        )
        return dict(candidate) if candidate else None

    # 不可达：循环要么 return 要么 raise
    raise AssertionError("probe_and_learn_extra_body terminated unexpectedly")


async def ensure_thinking_adaptation(
    session: AsyncSession,
    profile: LLMProfile,
) -> dict[str, object] | None:
    """Return the extra_body to use for ``profile``, probing on cache miss.

    - Cache hit (any value, including ``None``) → return cached value
    - Cache miss → run :func:`probe_and_learn_extra_body`, write the row, return the result
    - Probe-level errors propagate to the caller (``ThinkingAdaptationFailed`` or ``LLMRuntimeError``)
    """

    api_base_url = resolve_base_url_for_cache(profile.api_base_url)
    hit, value = await get_cached_extra_body(
        session,
        api_base_url=api_base_url,
        model_name=profile.model_name,
    )
    if hit:
        return value
    return await probe_and_learn_extra_body(session, profile)
