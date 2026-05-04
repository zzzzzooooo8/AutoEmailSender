from __future__ import annotations

import asyncio
import platform


def ensure_windows_proactor_event_loop_policy() -> bool:
    if platform.system() != "Windows":
        return False

    current_policy = asyncio.get_event_loop_policy()
    if isinstance(current_policy, asyncio.WindowsProactorEventLoopPolicy):
        return False

    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    return True
