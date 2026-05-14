from __future__ import annotations

import unittest
from datetime import UTC, datetime

import asyncio
import os
import tempfile
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _make_test_session_factory() -> tuple[async_sessionmaker, Path]:
    """Return (session_factory, db_path) bound to a fresh migrated sqlite file."""
    from test.migrated_database import create_migrated_sqlite_database

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    create_migrated_sqlite_database(db_path)
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path.as_posix()}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return session_factory, db_path


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


class CacheReadWriteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.session_factory, self.db_path = _make_test_session_factory()

    async def asyncTearDown(self) -> None:
        engine = self.session_factory.kw.get("bind")
        if engine is not None:
            await engine.dispose()
        try:
            os.unlink(self.db_path)
        except FileNotFoundError:
            pass

    async def test_miss_returns_false_with_none(self) -> None:
        from app.services.thinking_adaptation import get_cached_extra_body

        async with self.session_factory() as session:
            hit, value = await get_cached_extra_body(
                session,
                api_base_url="https://api.deepseek.com/v1",
                model_name="deepseek-chat",
            )
        self.assertFalse(hit)
        self.assertIsNone(value)

    async def test_record_then_get_returns_hit_with_value(self) -> None:
        from app.services.thinking_adaptation import (
            get_cached_extra_body,
            record_thinking_adaptation,
        )

        async with self.session_factory() as session:
            await record_thinking_adaptation(
                session,
                api_base_url="https://api.deepseek.com/v1",
                model_name="deepseek-chat",
                learned_extra_body={"thinking": {"type": "disabled"}},
            )
            await session.commit()

        async with self.session_factory() as session:
            hit, value = await get_cached_extra_body(
                session,
                api_base_url="https://api.deepseek.com/v1",
                model_name="deepseek-chat",
            )
        self.assertTrue(hit)
        self.assertEqual(value, {"thinking": {"type": "disabled"}})

    async def test_record_with_none_persists_known_no_extra_body(self) -> None:
        from app.services.thinking_adaptation import (
            get_cached_extra_body,
            record_thinking_adaptation,
        )

        async with self.session_factory() as session:
            await record_thinking_adaptation(
                session,
                api_base_url="https://api.openai.com/v1",
                model_name="gpt-4o-mini",
                learned_extra_body=None,
            )
            await session.commit()

        async with self.session_factory() as session:
            hit, value = await get_cached_extra_body(
                session,
                api_base_url="https://api.openai.com/v1",
                model_name="gpt-4o-mini",
            )
        # 命中但值为 None：表示已探活，确认无需 extra_body
        self.assertTrue(hit)
        self.assertIsNone(value)

    async def test_record_twice_updates_existing_row(self) -> None:
        from app.services.thinking_adaptation import (
            get_cached_extra_body,
            record_thinking_adaptation,
        )

        async with self.session_factory() as session:
            await record_thinking_adaptation(
                session,
                api_base_url="https://api.acme.ai/v1",
                model_name="acme-v1",
                learned_extra_body={"thinking": {"type": "disabled"}},
            )
            await session.commit()

        async with self.session_factory() as session:
            await record_thinking_adaptation(
                session,
                api_base_url="https://api.acme.ai/v1",
                model_name="acme-v1",
                learned_extra_body={"enable_thinking": False},
            )
            await session.commit()

        async with self.session_factory() as session:
            hit, value = await get_cached_extra_body(
                session,
                api_base_url="https://api.acme.ai/v1",
                model_name="acme-v1",
            )
        self.assertTrue(hit)
        self.assertEqual(value, {"enable_thinking": False})


if __name__ == "__main__":
    unittest.main()
