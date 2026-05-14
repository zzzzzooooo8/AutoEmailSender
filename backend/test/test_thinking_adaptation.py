from __future__ import annotations

import unittest
from datetime import UTC, datetime


class ThinkingAdaptationCacheModelTests(unittest.TestCase):
    def test_model_round_trip_in_memory(self) -> None:
        from app.models import ThinkingAdaptationCache

        row = ThinkingAdaptationCache(
            api_base_url="https://api.deepseek.com/v1",
            model_name="deepseek-chat",
            learned_extra_body={"thinking": {"type": "disabled"}},
            probed_at=datetime(2026, 5, 14, tzinfo=UTC),
        )
        self.assertEqual(row.api_base_url, "https://api.deepseek.com/v1")
        self.assertEqual(row.model_name, "deepseek-chat")
        self.assertEqual(
            row.learned_extra_body,
            {"thinking": {"type": "disabled"}},
        )

    def test_learned_extra_body_can_be_none(self) -> None:
        from app.models import ThinkingAdaptationCache

        row = ThinkingAdaptationCache(
            api_base_url="https://api.openai.com/v1",
            model_name="gpt-4o-mini",
            learned_extra_body=None,
            probed_at=datetime(2026, 5, 14, tzinfo=UTC),
        )
        self.assertIsNone(row.learned_extra_body)


if __name__ == "__main__":
    unittest.main()
