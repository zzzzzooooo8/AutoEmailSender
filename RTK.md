# RTK - Rust Token Killer (Codex CLI)

**Usage**: Token-optimized CLI proxy for shell commands.

## Rule

Route shell commands by the first real program:

- Use `rtk` when the first real program is an external CLI, such as `git`, `npm`, `uv`, `python`, `rg`, `node`, `cargo`, or `pytest`.
- Use `pwsh` directly when the command depends on PowerShell syntax, variables, cmdlets, pipelines, or `.ps1` scripts.
- Never wrap PowerShell in RTK. Do not write `rtk pwsh -Command ...`.

Correct RTK examples:

```powershell
rtk git status --short
rtk git diff --stat
rtk npm run lint
rtk npm run build
rtk uv run python dev_entry.py
rtk rg -n "TODO" frontend/src
```

Correct PowerShell examples:

```powershell
pwsh -NoLogo -NoProfile -Command "Get-Content -Raw -Encoding UTF8 'AGENTS.md'"
pwsh -NoLogo -NoProfile -Command "Test-Path 'frontend/package.json'"
pwsh -NoLogo -NoProfile -Command "$path = Join-Path $PWD 'data'; Get-ChildItem $path"
pwsh -NoLogo -NoProfile -File ".\scripts\release.ps1" 0.1.1
```

Wrong examples:

```powershell
rtk pwsh -Command "git status --short"
rtk pwsh -Command "npm run lint"
rtk pwsh -Command "Get-Content AGENTS.md"
```

## Meta Commands

```bash
rtk gain            # Token savings analytics
rtk gain --history  # Recent command savings history
rtk proxy <cmd>     # Run raw command without filtering
```

## Verification

```bash
rtk --version
rtk gain
which rtk
```
