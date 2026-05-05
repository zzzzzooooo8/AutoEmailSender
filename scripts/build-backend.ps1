param(
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendDir = Join-Path $RepoRoot "backend"
$AlembicIni = Join-Path $BackendDir "alembic.ini"
$AlembicDir = Join-Path $BackendDir "alembic"
$PlaywrightBrowsersDir = Join-Path $BackendDir "ms-playwright"

Push-Location $BackendDir
try {
  if ($Clean) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "build", "dist"
  }

  uv sync --dev
  $env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightBrowsersDir
  uv run python -m playwright install chromium
  uv run python -m patchright install chromium
  uv run pyinstaller `
    --noconfirm `
    --clean `
    --onedir `
    --name backend `
    --specpath build `
    --hidden-import main `
    --add-data "$AlembicIni;." `
    --add-data "$AlembicDir;alembic" `
    desktop_entry.py
} finally {
  Pop-Location
}
