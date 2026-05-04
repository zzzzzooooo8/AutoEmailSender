from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


class DesktopRuntimeTests(unittest.TestCase):
    def tearDown(self) -> None:
        from app.core.config import get_settings
        from app.core.database import dispose_engine, get_engine, get_session_factory

        if get_engine.cache_info().currsize:
            asyncio.run(dispose_engine())
        get_session_factory.cache_clear()
        get_settings.cache_clear()
        os.environ.pop("AUTO_EMAIL_SENDER_DATA_DIR", None)
        os.environ.pop("DATABASE_URL", None)
        os.environ.pop("ENABLE_BACKGROUND_WORKERS", None)

    def test_health_endpoint_returns_ok(self) -> None:
        os.environ["ENABLE_BACKGROUND_WORKERS"] = "0"

        from app.core.config import get_settings
        from main import create_app

        get_settings.cache_clear()
        with TestClient(create_app()) as client:
            response = client.get("/health")

        self.assertEqual(response.status_code, 200, msg=response.text)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_desktop_data_dir_controls_default_storage_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "AutoEmailSender"
            os.environ["AUTO_EMAIL_SENDER_DATA_DIR"] = str(data_dir)
            os.environ.pop("DATABASE_URL", None)

            from app.core.config import get_settings

            get_settings.cache_clear()
            settings = get_settings()

            self.assertEqual(settings.data_dir, data_dir)
            self.assertEqual(settings.uploads_dir, data_dir / "uploads")
            self.assertEqual(
                settings.database_url,
                f"sqlite+aiosqlite:///{(data_dir / 'auto_email_sender.db').as_posix()}",
            )
            self.assertTrue(settings.uploads_dir.exists())
            self.assertTrue((data_dir / "logs" / "crawler").exists())

    def test_desktop_entry_builds_uvicorn_options_from_args(self) -> None:
        from desktop_entry import build_uvicorn_options

        options = build_uvicorn_options(["--host", "127.0.0.1", "--port", "48123"])

        self.assertEqual(options["app"], "main:app")
        self.assertEqual(options["host"], "127.0.0.1")
        self.assertEqual(options["port"], 48123)
        self.assertIs(options["reload"], False)


if __name__ == "__main__":
    unittest.main()
