from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any


STATUS_MESSAGES = {
    "queued": "任务已排队",
    "running": "任务正在运行",
    "needs_review": "任务进入待审核",
    "completed": "任务已完成",
    "failed": "任务失败",
    "canceled": "任务已取消",
}


def build_crawl_job_events(
    job: Any,
    *,
    pages: list[Any],
    candidates: list[Any],
) -> list[dict[str, object]]:
    job_id = _get_attr(job, "id")
    events: list[dict[str, object]] = []

    status = _enum_value(_get_attr(job, "status"))
    events.append(
        {
            "id": f"job:{job_id}:status:{status or 'unknown'}",
            "job_id": job_id,
            "event_type": "job_status",
            "message": STATUS_MESSAGES.get(status, "任务状态已更新"),
            "created_at": _to_event_time(_get_attr(job, "updated_at") or _get_attr(job, "created_at")),
            "raw": {
                "status": status,
                "error_message": _get_attr(job, "error_message"),
            },
        },
    )

    for index, trace_event in enumerate(_iter_agent_trace(_get_attr(job, "agent_trace"))):
        normalized = normalize_agent_trace_event(trace_event)
        event_id = normalized.get("id") or f"job:{job_id}:trace:{index}"
        events.append(
            {
                **normalized,
                "id": event_id,
                "job_id": job_id,
            },
        )

    for page in pages:
        page_id = _get_attr(page, "id")
        title = _get_attr(page, "title")
        url = _get_attr(page, "url")
        events.append(
            {
                "id": f"job:{job_id}:page:{page_id or len(events)}",
                "job_id": job_id,
                "event_type": "page",
                "message": f"已抓取页面：{title or url or '未知页面'}",
                "created_at": _to_event_time(_get_attr(page, "created_at")),
                "raw": {
                    "id": page_id,
                    "url": url,
                    "title": title,
                    "status": _enum_value(_get_attr(page, "status")),
                },
            },
        )

    for candidate in candidates:
        candidate_id = _get_attr(candidate, "id")
        name = _get_attr(candidate, "name") or "未知导师"
        events.append(
            {
                "id": f"job:{job_id}:candidate:{candidate_id or len(events)}",
                "job_id": job_id,
                "event_type": "candidate",
                "message": f"发现候选导师：{name}",
                "created_at": _to_event_time(_get_attr(candidate, "created_at")),
                "raw": {
                    "id": candidate_id,
                    "name": _get_attr(candidate, "name"),
                    "email": _get_attr(candidate, "email"),
                    "source_url": _get_attr(candidate, "source_url"),
                    "confidence": _get_attr(candidate, "confidence"),
                },
            },
        )

    return sorted(events, key=lambda event: str(event.get("created_at") or ""))


def normalize_agent_trace_event(event: dict[str, object]) -> dict[str, object]:
    raw = event if isinstance(event, dict) else {}
    event_type = _trace_event_type(raw)

    return {
        "id": raw.get("id") or raw.get("event_id") or "",
        "event_type": event_type,
        "message": summarize_agent_trace_event(raw),
        "created_at": _to_event_time(raw.get("created_at") or raw.get("timestamp") or raw.get("time")),
        "raw": raw,
    }


def summarize_agent_trace_event(event: dict[str, object]) -> str:
    if not isinstance(event, dict) or not event:
        return "Agent 更新了执行状态"

    message = event.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()

    name = _find_nested_name(event)
    if name:
        return f"Agent 调用 {name}"

    event_type = _trace_event_type(event)
    if event_type:
        return f"Agent 事件：{event_type}"

    return "Agent 更新了执行状态"


def _iter_agent_trace(value: object) -> list[object]:
    if not isinstance(value, list):
        return []
    return list(value)


def _find_nested_name(value: object) -> str | None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "name" and isinstance(item, str) and item.strip():
                return item.strip()

        for item in value.values():
            nested = _find_nested_name(item)
            if nested:
                return nested
    elif isinstance(value, list):
        for item in value:
            nested = _find_nested_name(item)
            if nested:
                return nested

    return None


def _trace_event_type(event: dict[str, object]) -> str:
    for key in ("event_type", "type"):
        value = event.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _get_attr(value: object, name: str) -> Any:
    return getattr(value, name, None)


def _enum_value(value: object) -> str:
    if isinstance(value, Enum):
        value = value.value
    if isinstance(value, str):
        return value
    return ""


def _to_event_time(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)
