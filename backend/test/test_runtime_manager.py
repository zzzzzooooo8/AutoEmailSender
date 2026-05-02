from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, Mock, patch

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


if __name__ == "__main__":
    unittest.main()
