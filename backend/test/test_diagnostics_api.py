from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]


class DiagnosticsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "diagnostics_api_test.db"
        os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path.as_posix()}"
        os.environ["ENABLE_BACKGROUND_WORKERS"] = "0"
        self._run_alembic_upgrade()

        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory
        from main import create_app

        get_settings.cache_clear()
        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()

        self.client = TestClient(create_app())

    def tearDown(self) -> None:
        self.client.close()

        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory

        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()
        os.environ.pop("DATABASE_URL", None)
        os.environ.pop("ENABLE_BACKGROUND_WORKERS", None)
        self.temp_dir.cleanup()

    def test_list_operation_logs_orders_by_created_at_and_id_with_total(self) -> None:
        base_time = datetime(2026, 4, 26, 8, 30, tzinfo=UTC)
        older_id = self._seed_log(
            category="mail",
            event_name="email.started",
            created_at=base_time - timedelta(minutes=1),
        )
        middle_id = self._seed_log(
            category="mail",
            event_name="email.finished",
            created_at=base_time,
        )
        latest_id = self._seed_log(
            category="llm",
            event_name="draft.generated",
            created_at=base_time,
        )

        response = self.client.get("/api/diagnostics/operation-logs?limit=2&offset=1")

        self.assertEqual(response.status_code, 200, msg=response.text)
        payload = response.json()
        self.assertEqual(payload["total"], 3)
        self.assertEqual(payload["limit"], 2)
        self.assertEqual(payload["offset"], 1)
        self.assertEqual([item["id"] for item in payload["items"]], [middle_id, older_id])
        all_response = self.client.get("/api/diagnostics/operation-logs")
        self.assertEqual(
            [item["id"] for item in all_response.json()["items"]],
            [latest_id, middle_id, older_id],
        )

    def test_list_operation_logs_filters_common_dimensions(self) -> None:
        expected_id = self._seed_log(
            request_id="req-expected",
            category="mail",
            event_name="email.failed",
            level="error",
            entity_type="email_task",
            entity_id="task-1",
        )
        self._seed_log(
            request_id="req-other",
            category="mail",
            event_name="email.failed",
            level="error",
            entity_type="email_task",
            entity_id="task-1",
        )
        self._seed_log(
            request_id="req-expected",
            category="llm",
            event_name="email.failed",
            level="error",
            entity_type="email_task",
            entity_id="task-1",
        )

        response = self.client.get(
            "/api/diagnostics/operation-logs",
            params={
                "level": "error",
                "category": "mail",
                "event_name": "email.failed",
                "request_id": "req-expected",
                "entity_type": "email_task",
                "entity_id": "task-1",
            },
        )

        self.assertEqual(response.status_code, 200, msg=response.text)
        payload = response.json()
        self.assertEqual(payload["total"], 1)
        self.assertEqual([item["id"] for item in payload["items"]], [expected_id])

    def test_list_operation_logs_validates_limit_bounds(self) -> None:
        lower_response = self.client.get("/api/diagnostics/operation-logs?limit=0")
        upper_response = self.client.get("/api/diagnostics/operation-logs?limit=501")

        self.assertEqual(lower_response.status_code, 422)
        self.assertEqual(upper_response.status_code, 422)

    def test_export_operation_logs_returns_timestamp_filters_and_default_limit(self) -> None:
        for index in range(501):
            self._seed_log(
                request_id="export-req" if index % 2 == 0 else "other-req",
                category="mail",
                event_name="email.exported",
                level="info",
                entity_type="email_task",
                entity_id="task-1",
                created_at=datetime(2026, 4, 26, 9, 0, tzinfo=UTC) + timedelta(seconds=index),
            )

        response = self.client.get(
            "/api/diagnostics/export",
            params={
                "category": "mail",
                "entity_type": "email_task",
                "entity_id": "task-1",
            },
        )

        self.assertEqual(response.status_code, 200, msg=response.text)
        payload = response.json()
        self.assertIsInstance(payload["exported_at"], str)
        self.assertEqual(payload["total"], 501)
        self.assertEqual(len(payload["items"]), 500)
        self.assertEqual(
            payload["filters"],
            {
                "level": None,
                "category": "mail",
                "event_name": None,
                "request_id": None,
                "entity_type": "email_task",
                "entity_id": "task-1",
            },
        )

    def test_operation_log_metadata_field_maps_from_event_metadata(self) -> None:
        log_id = self._seed_log(
            category="llm",
            event_name="draft.generated",
            event_metadata={"status": "ok", "usage": {"prompt_tokens": 10}},
        )

        response = self.client.get("/api/diagnostics/operation-logs")

        self.assertEqual(response.status_code, 200, msg=response.text)
        item = response.json()["items"][0]
        self.assertEqual(item["id"], log_id)
        self.assertEqual(item["metadata"], {"status": "ok", "usage": {"prompt_tokens": 10}})
        self.assertNotIn("event_metadata", item)

    def _seed_log(
        self,
        *,
        category: str = "backend",
        event_name: str = "operation.completed",
        level: str = "info",
        message: str | None = "operation completed",
        request_id: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        event_metadata: dict[str, object] | None = None,
        created_at: datetime | None = None,
    ) -> int:
        async def _seed() -> int:
            from app.core.database import get_session_factory
            from app.models import OperationLog

            async with get_session_factory()() as session:
                log = OperationLog(
                    request_id=request_id,
                    category=category,
                    event_name=event_name,
                    level=level,
                    message=message,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    event_metadata=event_metadata,
                    created_at=created_at or datetime.now(UTC),
                )
                session.add(log)
                await session.commit()
                await session.refresh(log)
                return log.id

        return asyncio.run(_seed())

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
