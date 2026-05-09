from __future__ import annotations

import re
from datetime import date, datetime, time


DATE_FORMAT_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalize_scheduled_dates(values: list[str] | None) -> list[str]:
    if not values:
        return []

    normalized: set[str] = set()
    for value in values:
        if not DATE_FORMAT_PATTERN.fullmatch(value):
            raise ValueError("发送日期必须使用 YYYY-MM-DD 格式")
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("发送日期必须使用 YYYY-MM-DD 格式") from exc
        normalized.add(parsed.isoformat())

    return sorted(normalized)


def is_datetime_in_batch_window(
    now: datetime,
    *,
    scheduled_dates: list[str] | None,
    window_start_time: str | None,
    window_end_time: str | None,
) -> bool:
    dates = set(normalize_scheduled_dates(scheduled_dates))
    if now.date().isoformat() not in dates:
        return False
    if not window_start_time or not window_end_time:
        return False

    current = now.strftime("%H:%M")
    return window_start_time <= current < window_end_time


def has_future_batch_window(
    now: datetime,
    *,
    scheduled_dates: list[str] | None,
    window_end_time: str | None,
) -> bool:
    if not window_end_time:
        return False

    dates = normalize_scheduled_dates(scheduled_dates)
    if not dates:
        return False

    current = now.replace(tzinfo=None)
    end_clock = time.fromisoformat(window_end_time)
    for value in dates:
        if datetime.combine(date.fromisoformat(value), end_clock) > current:
            return True
    return False


def is_batch_window_expired(
    now: datetime,
    *,
    scheduled_dates: list[str] | None,
    window_end_time: str | None,
) -> bool:
    if not scheduled_dates or not window_end_time:
        return False
    return not has_future_batch_window(
        now,
        scheduled_dates=scheduled_dates,
        window_end_time=window_end_time,
    )
