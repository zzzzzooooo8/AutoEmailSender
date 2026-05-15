from __future__ import annotations

import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from app.services.runtime_manager import RuntimeManager


class RuntimeManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_start_creates_multiple_crawler_workers_from_settings(self) -> None:
        session_factory = AsyncMock()
        manager = RuntimeManager(session_factory)

        async def idle_loop() -> None:
            await asyncio.Event().wait()

        def build_idle_loop(*args: object, **kwargs: object):
            _ = args, kwargs
            return idle_loop()

        with patch("app.services.runtime_manager.get_settings") as mocked_get_settings:
            mocked_get_settings.return_value = type(
                "SettingsStub",
                (),
                {
                    "dispatcher_interval_seconds": 30,
                    "imap_poll_interval_seconds": 60,
                    "crawler_worker_count": 2,
                    "match_analysis_job_worker_count": 1,
                    "match_analysis_job_interval_seconds": 10,
                },
            )()
            with patch.object(
                manager,
                "_loop",
                new=Mock(side_effect=build_idle_loop),
            ) as mocked_loop:
                await manager.start()

        worker_names = [call.args[0] for call in mocked_loop.call_args_list]
        self.assertEqual(worker_names.count("crawler-worker-1"), 1)
        self.assertEqual(worker_names.count("crawler-worker-2"), 1)
        self.assertIn("dispatcher", worker_names)
        self.assertIn("imap-poller", worker_names)

        await manager.stop()

    async def test_start_uses_runtime_settings_for_worker_counts_and_match_interval(self) -> None:
        session = object()
        session_context = MagicMock()
        session_context.__aenter__ = AsyncMock(return_value=session)
        session_context.__aexit__ = AsyncMock(return_value=None)
        session_factory = Mock(return_value=session_context)
        manager = RuntimeManager(session_factory)

        async def idle_loop() -> None:
            await asyncio.Event().wait()

        def build_idle_loop(*args: object, **kwargs: object):
            _ = args, kwargs
            return idle_loop()

        async def fake_get_runtime_settings(session_arg: object) -> SimpleNamespace:
            self.assertIs(session_arg, session)
            return SimpleNamespace(
                crawler_worker_count=3,
                match_analysis_job_worker_count=2,
                match_analysis_job_interval_seconds=5,
            )

        with patch("app.services.runtime_manager.get_settings") as mocked_get_settings:
            mocked_get_settings.return_value = type(
                "SettingsStub",
                (),
                {
                    "dispatcher_interval_seconds": 30,
                    "imap_poll_interval_seconds": 60,
                    "crawler_worker_count": 1,
                    "match_analysis_job_worker_count": 1,
                    "match_analysis_job_interval_seconds": 10,
                },
            )()
            with patch(
                "app.services.runtime_manager.get_runtime_settings",
                new=fake_get_runtime_settings,
            ), patch.object(
                manager,
                "_loop",
                new=Mock(side_effect=build_idle_loop),
            ) as mocked_loop:
                await manager.start()

        worker_calls = {call.args[0]: call.args for call in mocked_loop.call_args_list}
        self.assertIn("crawler-worker-1", worker_calls)
        self.assertIn("crawler-worker-2", worker_calls)
        self.assertIn("crawler-worker-3", worker_calls)
        self.assertNotIn("crawler-worker-4", worker_calls)
        self.assertEqual(worker_calls["match-analysis-worker-1"][1], 5)
        self.assertEqual(worker_calls["match-analysis-worker-2"][1], 5)
        self.assertNotIn("match-analysis-worker-3", worker_calls)

        await manager.stop()

    async def test_match_analysis_worker_uses_runtime_item_concurrency(self) -> None:
        session = object()
        session_context = MagicMock()
        session_context.__aenter__ = AsyncMock(return_value=session)
        session_context.__aexit__ = AsyncMock(return_value=None)
        session_factory = Mock(return_value=session_context)

        async def fake_get_runtime_settings(session: object) -> SimpleNamespace:
            _ = session
            return SimpleNamespace(match_analysis_job_item_concurrency=7)

        with patch(
            "app.services.runtime_manager.get_runtime_settings",
            new=fake_get_runtime_settings,
        ), patch(
            "app.services.runtime_manager.run_queued_match_analysis_jobs_once",
            new=AsyncMock(return_value=1),
        ) as mocked_run:
            from app.services.runtime_manager import _run_match_analysis_worker_once

            processed = await _run_match_analysis_worker_once(session_factory)

        self.assertEqual(processed, 1)
        mocked_run.assert_awaited_once_with(session_factory, item_concurrency=7)


if __name__ == "__main__":
    unittest.main()
