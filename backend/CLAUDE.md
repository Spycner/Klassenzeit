# Klassenzeit backend: rules

Stack: FastAPI + SQLAlchemy async, Alembic, Pydantic. Served under `klassenzeit_backend`. Rules below are on top of `.claude/CLAUDE.md`, not a replacement.

## Layout (`backend/src/`)

- Routes and route handlers live next to the aggregate they serve.
- Runtime state (engine, session factory, settings, rate limiter) lives on `app.state`, set in `lifespan`. No module-level globals.

## Runtime state

- **`app.state` for FastAPI runtime state.** Engine, session factory, settings, and rate limiter live on `app.state` (set in `lifespan`). Tests set these on `app.state` in the `client` fixture. No module-level globals.

## Error handling

- **No bare catchalls.** No bare `except:` / `except Exception` in Python. Catch the specific error you can handle; let the rest propagate.

## Data access

- **No raw SQL outside the abstraction layer.** All queries go through SQLAlchemy (or whatever repository layer lands later). If raw SQL is unavoidable, it lives inside the data-access module, never in route handlers or business logic.

## Testing

- **Test fixtures, not imports.** `pytest` runs with `--import-mode=importlib`. Shared test helpers must be pytest fixtures (factory pattern) in `conftest.py`, not plain functions imported across test files. Cross-conftest imports break silently.
