from __future__ import annotations

import asyncio
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select


BACKEND_DIR = Path(__file__).resolve().parents[1]


class OperationLogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "operation_logs_test.db"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path.as_posix()}"
        os.environ["ENABLE_BACKGROUND_WORKERS"] = "0"
        self._run_alembic_upgrade()

        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory

        get_settings.cache_clear()
        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()

    def tearDown(self) -> None:
        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory

        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()
        os.environ.pop("DATABASE_URL", None)
        os.environ.pop("ENABLE_BACKGROUND_WORKERS", None)
        self.temp_dir.cleanup()

    def test_record_operation_log_uses_request_context_id(self) -> None:
        from app.core.database import get_session_factory
        from app.services.operation_logs import record_operation_log
        from main import create_app

        app = create_app()

        @app.post("/test/operation-log")
        async def create_operation_log() -> dict[str, object | None]:
            async with get_session_factory()() as session:
                log = await record_operation_log(
                    session,
                    category="api",
                    event_name="diagnostic.export_requested",
                    entity_type="diagnostic_bundle",
                    entity_id="bundle-1",
                )
                await session.commit()
                return {"id": log.id, "request_id": log.request_id}

        client = TestClient(app)
        try:
            response = client.post(
                "/test/operation-log",
                headers={"X-Request-ID": "audit.request-1"},
            )
        finally:
            client.close()

        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertEqual(response.json()["request_id"], "audit.request-1")

        connection = sqlite3.connect(self.db_path)
        try:
            row = connection.execute(
                """
                SELECT request_id, category, event_name, level, entity_type, entity_id
                FROM operation_logs
                """
            ).fetchone()
        finally:
            connection.close()

        self.assertEqual(
            row,
            (
                "audit.request-1",
                "api",
                "diagnostic.export_requested",
                "info",
                "diagnostic_bundle",
                "bundle-1",
            ),
        )

    def test_record_operation_log_sanitizes_metadata_without_committing(self) -> None:
        from app.core.database import get_session_factory
        from app.models import OperationLog
        from app.services.operation_logs import record_operation_log

        async def scenario() -> dict[str, object]:
            recursive: dict[str, object] = {"name": "root"}
            recursive["self"] = recursive

            async with get_session_factory()() as session:
                log = await record_operation_log(
                    session,
                    category="backend",
                    event_name="email.send_failed",
                    level="error",
                    message="发送失败",
                    metadata={
                        "token": "secret-token",
                        "smtpPassword": "smtp-secret",
                        "body": "private body",
                        "requestBody": {"nested": "private request"},
                        "error": RuntimeError("smtp timeout"),
                        "callback": lambda: None,
                        "recursive": recursive,
                        "long_text": "x" * 5000,
                    },
                    request_id="manual-request",
                )

                flushed = await session.scalar(
                    select(OperationLog).where(OperationLog.id == log.id)
                )
                self.assertIsNotNone(flushed)
                metadata = flushed.event_metadata

            connection = sqlite3.connect(self.db_path)
            try:
                persisted_count = connection.execute(
                    "SELECT COUNT(*) FROM operation_logs"
                ).fetchone()[0]
            finally:
                connection.close()

            return {"metadata": metadata, "persisted_count": persisted_count}

        result = asyncio.run(scenario())
        metadata = result["metadata"]

        self.assertEqual(result["persisted_count"], 0)
        self.assertEqual(metadata["token"], "[REDACTED]")
        self.assertEqual(metadata["smtpPassword"], "[REDACTED]")
        self.assertEqual(metadata["body"], "[REDACTED]")
        self.assertEqual(metadata["requestBody"], "[REDACTED]")
        self.assertIn("RuntimeError", metadata["error"])
        self.assertIn("function", metadata["callback"])
        self.assertEqual(metadata["recursive"]["self"], "[Circular]")
        self.assertLessEqual(len(metadata["long_text"]), 1200)

    def _run_alembic_upgrade(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=os.environ.copy(),
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            self.fail(
                "Alembic migration failed.\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}",
            )


if __name__ == "__main__":
    unittest.main()
