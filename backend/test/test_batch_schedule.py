import unittest
from datetime import UTC, datetime

from app.services.batch_schedule import (
    is_datetime_in_batch_window,
    normalize_scheduled_dates,
)


class BatchScheduleTest(unittest.TestCase):
    def test_normalize_scheduled_dates_sorts_and_deduplicates_dates(self) -> None:
        result = normalize_scheduled_dates(
            ["2026-05-04", "2026-04-28", "2026-05-04"],
        )

        self.assertEqual(result, ["2026-04-28", "2026-05-04"])

    def test_normalize_scheduled_dates_rejects_invalid_date(self) -> None:
        with self.assertRaisesRegex(ValueError, "YYYY-MM-DD"):
            normalize_scheduled_dates(["2026-02-30"])

    def test_is_datetime_in_batch_window_requires_selected_date_and_time_window(self) -> None:
        now = datetime(2026, 5, 4, 10, 30, tzinfo=UTC)

        self.assertTrue(
            is_datetime_in_batch_window(
                now,
                scheduled_dates=["2026-05-04"],
                window_start_time="09:00",
                window_end_time="18:00",
            ),
        )
        self.assertFalse(
            is_datetime_in_batch_window(
                now,
                scheduled_dates=["2026-05-05"],
                window_start_time="09:00",
                window_end_time="18:00",
            ),
        )
        self.assertFalse(
            is_datetime_in_batch_window(
                now,
                scheduled_dates=["2026-05-04"],
                window_start_time="11:00",
                window_end_time="18:00",
            ),
        )
