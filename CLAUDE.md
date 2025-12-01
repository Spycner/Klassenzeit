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

Task tracking and roadmap documentation:
- `tasks/roadmap.md` - Development roadmap and next steps
