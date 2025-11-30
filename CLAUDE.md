# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Klassenzeit is a timetabler application for schools with a monorepo structure:
- **backend/**: Spring Boot application
- **frontend/**: Frontend application

## Development Setup

The root project uses uv for Python tooling:

```bash
uv sync --extra dev           # Install dependencies (including pre-commit)
uv run pre-commit install     # Install git hooks
```

Pre-commit hooks run automatically before each commit:
- **Backend**: Spotless and Checkstyle on Java files
- **Frontend**: Biome (lint + format) and TypeScript type checking
