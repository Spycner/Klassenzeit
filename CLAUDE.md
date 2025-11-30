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
- Podman (with podman-compose)
- uv (Python package manager)

### Initial Setup

```bash
uv sync --extra dev           # Install dependencies (including pre-commit)
uv run pre-commit install     # Install git hooks
podman machine start          # Start Podman VM (macOS)
make db-up                    # Start PostgreSQL database
```

Pre-commit hooks run automatically before each commit:
- **Backend**: Spotless and Checkstyle on Java files
- **Frontend**: Biome (lint + format) and TypeScript type checking

## Database

PostgreSQL 17 runs via Podman. Manage with:
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

## Project Planning

Task tracking and roadmap documentation:
- `tasks/roadmap.md` - Development roadmap and next steps
