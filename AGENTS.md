# Repository Guidelines

- 请保持使用中文和用户进行交流。
- 终端和文件均使用 UTF-8 编码，避免中文出现乱码。
- Python 使用 uv 进行包管理。
- Always prefix shell commands with `rtk`.

## Project Structure & Module Organization
- `frontend/` contains the Vite + React UI. App code is in `frontend/src`, with routes in `pages`, reusable UI in `components/{atoms,molecules,organisms}`, feature logic in `features`, and shared helpers in `lib`.
- `backend/` contains the FastAPI service. `main.py` is the current entry point, while `pyproject.toml` and `uv.lock` define Python dependencies.
- `backend/test/Plan_A` and `backend/test/Plan_B/faculty-directory-crawler` hold scraper prototypes and crawler tests, not the main API code.
- `docs/` stores product and database notes. `data/` holds local runtime data and exports.

## Build, Test, and Development Commands
- `cd frontend && npm install`: install frontend deps.
- `cd frontend && npm run dev`: start the Vite dev server on `http://127.0.0.1:5173`.
- `cd frontend && npm run build`: run TypeScript compilation and create the production bundle.
- `cd frontend && npm run lint`: run ESLint across TS/TSX files.
- `cd backend && uv sync`: create or refresh the Python environment.
- `cd backend && uv run uvicorn main:app --reload`: run the FastAPI API locally on `http://127.0.0.1:8000`.
- `cd backend && uv run python -m unittest discover test/Plan_B/faculty-directory-crawler/tests`: run crawler unit tests.

## Coding Style & Naming Conventions
- Use UTF-8 for source files, Markdown, and terminal output to avoid Chinese text corruption.
- TypeScript and TSX follow the existing React + Vite style: 2-space indentation, PascalCase component files such as `HomePage.tsx`, camelCase utilities/hooks such as `useMentorFilters.ts`, and `@/` imports for `frontend/src`.
- Python uses 4-space indentation, snake_case module names, and explicit typing for FastAPI handlers and support code where practical.

## Testing Guidelines
- Frontend has no committed automated test suite yet; at minimum, run `npm run lint` and manually verify affected routes and forms.
- Backend tests currently use `unittest` with `test_*.py` naming. Keep new tests deterministic and avoid live-network dependencies unless they are clearly experimental.

## Commit & Pull Request Guidelines
- Recent history mixes Chinese summaries with Conventional Commit prefixes. Prefer `type(scope): summary`, for example `feat(frontend): add mentor filter state` or `docs: update database design`.
- Keep each commit focused on one logical change. PRs should explain the change, list verification commands, link related issues, and include UI screenshots when needed.

## Security & Configuration Tips
- Never commit `.env`, API keys, `.venv`, `node_modules`, or generated crawler output.
- When adding configuration, update the corresponding `.env.example` file and keep local-only output under `data/` or ignored test output folders.

# Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

@RTK.md
