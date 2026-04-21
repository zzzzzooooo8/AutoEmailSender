from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.services.task_runtime import (
    dispatch_due_tasks_once,
    poll_for_replies_once,
)


logger = logging.getLogger(__name__)


class RuntimeManager:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._tasks: list[asyncio.Task[None]] = []
        self._stopped = asyncio.Event()

    async def start(self) -> None:
        if self._tasks:
            return
        self._stopped.clear()
        settings = get_settings()
        self._tasks = [
            asyncio.create_task(
                self._loop(
                    "dispatcher",
                    settings.dispatcher_interval_seconds,
                    dispatch_due_tasks_once,
                ),
            ),
            asyncio.create_task(
                self._loop(
                    "imap-poller",
                    settings.imap_poll_interval_seconds,
                    poll_for_replies_once,
                ),
            ),
        ]

    async def stop(self) -> None:
        self._stopped.set()
        if not self._tasks:
            return
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    async def _loop(
        self,
        worker_name: str,
        interval_seconds: int,
        worker: Callable[[async_sessionmaker[AsyncSession]], Awaitable[int]],
    ) -> None:
        while not self._stopped.is_set():
            try:
                await worker(self._session_factory)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("%s 执行失败", worker_name)

            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=interval_seconds)
            except TimeoutError:
                continue
