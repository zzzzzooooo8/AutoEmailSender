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
   - `IdentityProfile`: Sender identity (email, SMTP/IMAP, resume, signature, send policies)
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
`discovered` → `skipped`/`matched` → `draft_generated` → `review_required` → `approved` → `scheduled` → `sent`/`send_failed` → `reply_detected`

## Important Constraints
- Single-user, local-only deployment
- No multi-tenant/permission system
- All major decisions are in `docs/project_description.md` - read before making architectural changes
- Crawler architecture (LangGraph Router pattern) is in `docs/crawler_architecture_design.md`
