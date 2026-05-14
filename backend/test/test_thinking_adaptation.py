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


class IsThinkingModeProtocolErrorTests(unittest.TestCase):
    def test_returns_true_for_deepseek_reasoning_content_error(self) -> None:
        from app.services.thinking_adaptation import is_thinking_mode_protocol_error

        body = (
            '{"error":{"code":"400","message":"Param Incorrect",'
            '"param":"The reasoning_content in the thinking mode '
            'must be passed back to the API."}}'
        )
        self.assertTrue(is_thinking_mode_protocol_error(400, body))

    def test_returns_true_for_thinking_block_error(self) -> None:
        from app.services.thinking_adaptation import is_thinking_mode_protocol_error

        body = '{"error":{"message":"thinking block must be preserved"}}'
        self.assertTrue(is_thinking_mode_protocol_error(400, body))

    def test_returns_false_for_non_400_status(self) -> None:
        from app.services.thinking_adaptation import is_thinking_mode_protocol_error

        body = (
            '{"error":{"message":"The reasoning_content in the thinking '
            'mode must be passed back to the API."}}'
        )
        self.assertFalse(is_thinking_mode_protocol_error(500, body))
        self.assertFalse(is_thinking_mode_protocol_error(401, body))

    def test_returns_false_for_unrelated_400(self) -> None:
        from app.services.thinking_adaptation import is_thinking_mode_protocol_error

        body = '{"error":{"message":"Not supported model"}}'
        self.assertFalse(is_thinking_mode_protocol_error(400, body))

    def test_returns_false_for_empty_body(self) -> None:
        from app.services.thinking_adaptation import is_thinking_mode_protocol_error

        self.assertFalse(is_thinking_mode_protocol_error(400, ""))


class ThinkingDisableCandidatesTests(unittest.TestCase):
    def test_candidates_in_priority_order(self) -> None:
        from app.services.thinking_adaptation import THINKING_DISABLE_CANDIDATES

        self.assertEqual(
            list(THINKING_DISABLE_CANDIDATES),
            [
                {"thinking": {"type": "disabled"}},
                {"enable_thinking": False},
                {"reasoning": {"effort": "off"}},
                {"thinking_budget": 0},
            ],
        )

    def test_merge_extra_body_overrides_existing_thinking_keys(self) -> None:
        from app.services.thinking_adaptation import merge_extra_body

        merged = merge_extra_body(
            {
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": "ping"}],
                "thinking": {"type": "enabled"},
                "enable_thinking": True,
            },
            {"thinking": {"type": "disabled"}},
        )
        self.assertEqual(merged["thinking"], {"type": "disabled"})
        self.assertNotIn("enable_thinking", merged)
        self.assertEqual(merged["messages"], [{"role": "user", "content": "ping"}])

    def test_merge_extra_body_handles_none(self) -> None:
        from app.services.thinking_adaptation import merge_extra_body

        merged = merge_extra_body(
            {"model": "gpt-4o-mini", "thinking": {"type": "enabled"}},
            None,
        )
        self.assertNotIn("thinking", merged)
        self.assertEqual(merged["model"], "gpt-4o-mini")


if __name__ == "__main__":
    unittest.main()
