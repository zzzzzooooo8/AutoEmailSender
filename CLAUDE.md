# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

- 请保持使用中文和用户进行交流。
- 终端和文件均使用 UTF-8 编码，避免中文出现乱码。
- Python 使用 uv 进行包管理。

## Project Overview

Auto Email Sender v2 is an open-source tool for students (grad school/PhD applications) to automate initial contact with professors. It crawls professor information, evaluates match quality using LLMs, generates email drafts, and requires manual review before sending.

**Core principle**: Any email sending requires explicit human approval - no fully automated mass sending.

## Development Commands

### Frontend (React + Vite + TailwindCSS)
```bash
cd frontend
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # Run ESLint
```

### Backend (FastAPI)
```bash
cd backend
uv run uvicorn main:app --reload   # Start dev server on port 8000
```

### Backend Testing (Scraper)
```bash
cd backend
.\.venv\Scripts\python.exe test/langgraph_scraper_mvp.py <url> [options]
# Options: --output, --max-pages, --resume, --checkpoint-file
```

## Architecture

### Monorepo Structure
```
auto-email-agent/
├── backend/           # FastAPI + SQLAlchemy
│   ├── app/          # Core application (planned structure)
│   │   ├── api/      # FastAPI routes
│   │   ├── core/     # Config, database, logging
│   │   ├── models/   # SQLAlchemy models
│   │   ├── schemas/  # Pydantic models
│   │   ├── agents/   # LLM agents (crawler, matcher, writer)
│   │   ├── services/ # Mailer, inbox, tracker
│   │   └── scheduler/# APScheduler tasks
│   ├── main.py       # FastAPI entry point
│   └── test/         # LangGraph scraper prototype
├── frontend/         # React + Vite + TailwindCSS
│   └── src/          # React components and pages
├── docs/             # Architecture documentation
└── data/             # SQLite database, uploads, logs
```

### Backend Core Modules

1. **Agents** (`backend/app/agents/`):
   - `crawler.py`: LLM-assisted web scraping using LangGraph (Router pattern: list_page → extract links; profile_page → extract professor data)
   - `matcher.py`: Evaluates student-professor match score (0-100)
   - `writer.py`: Generates email drafts

2. **Models**:
   - `IdentityProfile`: Sender identity (email, SMTP/IMAP, resume, send policies)
   - `LLMProfile`: LLM configuration (API key, model, prompt templates) - independent from identity
   - `Professor`: Crawled professor data (deduplicated by email)
   - `EmailTask`: Email task with status workflow

3. **Services**:
   - `mailer.py`: SMTP sending
   - `inbox.py`: IMAP reply checking
   - `tracker.py`: Read tracking (optional)

4. **Scheduler**: APScheduler for periodic inbox checks and sending

### Key Technical Decisions
- **Async-first**: Use `async def` for FastAPI routes, Playwright, and HTTP requests
- **No external queues**: No Redis/Celery/RabbitMQ - APScheduler only
- **Identity/LLM separation**: LLM config and identity are independently modeled
- **Human approval gate**: All sending requires `approved` status
- **Professor deduplication**: By email, skip on duplicate, don't overwrite
- **Structured output validation**: LLM JSON output must be validated before storage

### Task Status Workflow
Current main flow: `discovered` → `matched` → `review_required` → `approved` → `scheduled` → `sent` → `reply_detected`

`send_failed` is the failure branch during the sending stage. `canceled` is the explicit cancellation state, mainly used when batch sending is stopped.

## Important Constraints
- Single-user, local-only deployment
- No multi-tenant/permission system
- All major decisions are in `docs/project_description.md` - read before making architectural changes
- Crawler architecture (LangGraph Router pattern) is in `docs/crawler_architecture_design.md`

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
