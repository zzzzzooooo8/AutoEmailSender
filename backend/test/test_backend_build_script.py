from __future__ import annotations

from pathlib import Path
import unittest


class BackendBuildScriptTest(unittest.TestCase):
    def test_installs_playwright_browsers_to_packaged_resource_dir(self) -> None:
        script = Path(__file__).resolve().parents[1] / ".." / "scripts" / "build-backend.ps1"
        content = script.resolve().read_text(encoding="utf-8")

        self.assertIn("$env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightBrowsersDir", content)
        self.assertIn("uv run python -m playwright install chromium", content)
        self.assertIn("uv run python -m patchright install chromium", content)
