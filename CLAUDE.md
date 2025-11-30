# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Klassenzeit is a timetabler application for schools with a monorepo structure:
- **backend/**: Spring Boot application
- **frontend/**: Frontend application

## Python Development Tools

The root project uses uv for Python tooling (pre-commit hooks, etc.):

```bash
uv sync                    # Install dependencies
uv run <command>           # Run Python commands
```
