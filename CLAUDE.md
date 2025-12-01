# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Klassenzeit is a timetabler application for schools with a monorepo structure:
- **backend/**: Spring Boot application
- **frontend/**: Frontend application

## Quick Start

```bash
make dev    # Start database and backend
```

Run `make help` to see all available commands.

## Development Setup

### Prerequisites
- Java 21
- Docker Desktop
- uv (Python package manager)

### Initial Setup

```bash
uv sync --extra dev           # Install dependencies (including pre-commit)
uv run pre-commit install     # Install git hooks
make db-up                    # Start PostgreSQL database
```

Pre-commit hooks run automatically before each commit:
- **Backend**: Spotless and Checkstyle on Java files
- **Frontend**: Biome (lint + format) and TypeScript type checking

## Database

PostgreSQL 17 runs via Docker. Manage with:
```bash
make db-up      # Start database
make db-down    # Stop database
make db-reset   # Destroy and recreate (loses data)
make db-logs    # View logs
```

Connection details (local dev):
- Host: `localhost:5432`
- Database: `klassenzeit`
- User: `klassenzeit`
- Password: `klassenzeit`

## Environment Variables

Copy `.env.example` files to `.env` in each directory.

| Location | Variable | Description | Default |
|----------|----------|-------------|---------|
| Root | `POSTGRES_*` | Database config for Docker | See `.env.example` |
| `frontend/` | `VITE_API_BASE_URL` | Backend API URL | `http://localhost:8080` |
| `e2e/` | `API_BASE_URL` | API URL for integration tests | `http://localhost:8080/api` |

## Testing

### Unit Tests
```bash
make test           # Run all unit tests (backend + frontend)
make test-backend   # Run backend tests only
make test-frontend  # Run frontend tests only
```

### E2E Tests
E2E tests require both frontend and backend to be running:
```bash
# Option 1: Start services manually first
make dev            # In one terminal (starts DB + backend)
make frontend       # In another terminal
make test-e2e       # In a third terminal

# Option 2: Interactive mode (auto-starts frontend)
make test-e2e-ui    # Opens Playwright UI

# API integration tests only (no frontend needed)
cd e2e && npm run test:api
```

### Coverage Reports
- Backend: `backend/build/reports/jacoco/test/html/index.html`
- Frontend: `frontend/coverage/index.html`
- E2E: `e2e/playwright-report/index.html`

## Project Planning

the `tasks/` directory is used to plan and track the development of the project and is located in the root of the repository.

### Roadmap
- `tasks/roadmap.md` - Development roadmap and next steps

### Task Management

Tasks use a kanban-style workflow organized by area:

```
tasks/
├── todo/
│   ├── backend/
│   ├── frontend/
│   └── global/
├── doing/
│   ├── backend/
│   ├── frontend/
│   └── global/
└── done/
    ├── backend/
    ├── frontend/
    └── global/
```

**Task Format:**
- Each task is a separate markdown file with a unique ID prefix (e.g., `001-implement-teacher-crud.md`)
- Use action verbs: `implement-`, `fix-`, `update-`, `research-`
- Tasks can link to related tasks using markdown links: `[related task](../../todo/frontend/002-other-task.md)`

**Workflow:**
1. **todo → doing**: Move file when starting work
2. **doing → done**: Move file when complete, document what was done, decisions made, and any issues encountered

**Task File Template:**
```markdown
# Task Title

## Description
What needs to be done and why.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Notes
Progress updates, blockers, related commits.

## Completion Notes (add when done)
What was implemented, key decisions, issues encountered.
```
