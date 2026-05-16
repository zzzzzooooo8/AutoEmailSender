from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path


class SettingsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["AUTO_EMAIL_SENDER_DATA_DIR"] = self.temp_dir.name
        os.environ.pop("CRAWLER_DEBUG", None)

        from app.core.config import get_settings

        get_settings.cache_clear()

    def tearDown(self) -> None:
        from app.core.config import get_settings

        get_settings.cache_clear()
        os.environ.pop("AUTO_EMAIL_SENDER_DATA_DIR", None)
        os.environ.pop("CRAWLER_DEBUG", None)
        self.temp_dir.cleanup()

    def test_crawler_debug_defaults_to_enabled(self) -> None:
        from app.core.config import get_settings

        settings = get_settings()

        self.assertTrue(settings.crawler_debug_enabled)
        self.assertEqual(
            settings.crawler_debug_dir,
            (Path(self.temp_dir.name) / "logs" / "crawler").resolve(),
        )


if __name__ == "__main__":
    unittest.main()
