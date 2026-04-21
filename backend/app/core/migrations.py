from __future__ import annotations

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config


ALEMBIC_INI_PATH = Path(__file__).resolve().parents[2] / "alembic.ini"


def run_migrations_to_head() -> None:
    config = Config(str(ALEMBIC_INI_PATH))
    command.upgrade(config, "head")


async def ensure_database_schema() -> None:
    await asyncio.to_thread(run_migrations_to_head)
