from __future__ import annotations

from collections.abc import Mapping, Sequence
from types import FunctionType, MethodType

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import get_request_id
from app.models import OperationLog


SENSITIVE_KEY_PARTS = {
    "apikey",
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
}
SENSITIVE_KEYS = {
    "body",
    "payload",
    "requestbody",
    "responsebody",
}
MAX_STRING_LENGTH = 1000
MAX_DEPTH = 10
REDACTED = "[REDACTED]"


async def record_operation_log(
    session: AsyncSession,
    *,
    category: str,
    event_name: str,
    level: str = "info",
    message: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    metadata: object | None = None,
    request_id: str | None = None,
) -> OperationLog:
    log = OperationLog(
        request_id=request_id if request_id is not None else get_request_id(),
        category=category,
        event_name=event_name,
        level=level,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
        event_metadata=_safe_json(metadata),
    )
    session.add(log)
    await session.flush()
    return log


def _safe_json(value: object | None) -> object | None:
    if value is None:
        return None
    try:
        return _to_jsonable(value, seen=set(), depth=0)
    except Exception as exc:
        return {"metadata_error": _stringify_exception(exc)}


def _to_jsonable(value: object, *, seen: set[int], depth: int) -> object:
    if depth > MAX_DEPTH:
        return "[MaxDepth]"
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, str):
        return _truncate_string(value)
    if isinstance(value, BaseException):
        return _stringify_exception(value)
    if isinstance(value, bytes):
        return _truncate_string(value.decode("utf-8", errors="replace"))
    if isinstance(value, FunctionType | MethodType):
        return _truncate_string(repr(value))

    value_id = id(value)
    if isinstance(value, Mapping):
        if value_id in seen:
            return "[Circular]"
        seen.add(value_id)
        try:
            return {
                str(key): (
                    REDACTED
                    if _is_sensitive_key(str(key))
                    else _to_jsonable(item, seen=seen, depth=depth + 1)
                )
                for key, item in value.items()
            }
        finally:
            seen.remove(value_id)

    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        if value_id in seen:
            return "[Circular]"
        seen.add(value_id)
        try:
            return [_to_jsonable(item, seen=seen, depth=depth + 1) for item in value]
        finally:
            seen.remove(value_id)

    return _truncate_string(repr(value))


def _is_sensitive_key(key: str) -> bool:
    normalized = "".join(char for char in key.lower() if char.isalnum())
    return normalized in SENSITIVE_KEYS or any(part in normalized for part in SENSITIVE_KEY_PARTS)


def _truncate_string(value: str) -> str:
    if len(value) <= MAX_STRING_LENGTH:
        return value
    return f"{value[:MAX_STRING_LENGTH]}...[truncated]"


def _stringify_exception(exc: BaseException) -> str:
    return _truncate_string(f"{exc.__class__.__name__}: {exc}")
