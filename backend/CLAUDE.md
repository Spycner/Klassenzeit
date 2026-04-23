# Klassenzeit backend: rules

Stack: FastAPI + SQLAlchemy async, Alembic, Pydantic. Served under `klassenzeit_backend`. Rules below are on top of `.claude/CLAUDE.md`, not a replacement.

## Layout (`backend/src/`)

- Routes and route handlers live next to the aggregate they serve.
- Runtime state (engine, session factory, settings, rate limiter) lives on `app.state`, set in `lifespan`. No module-level globals.

## Runtime state

- **`app.state` for FastAPI runtime state.** Engine, session factory, settings, and rate limiter live on `app.state` (set in `lifespan`). Tests set these on `app.state` in the `client` fixture. No module-level globals.

## Error handling

- **No bare catchalls.** No bare `except:` / `except Exception` in Python. Catch the specific error you can handle; let the rest propagate.
- **Use `status.HTTP_422_UNPROCESSABLE_CONTENT`** for 422 responses. The older `HTTP_422_UNPROCESSABLE_ENTITY` alias is deprecated in the Starlette/FastAPI stack we pin and raises a `DeprecationWarning` at import.

## Type checking

- **`ty` does not honor `# type: ignore[...]` pragmas.** If `ty` flags a line, silencing it requires the actual type, not a comment. Prefer concrete types (NamedTuple, TypedDict, a tiny dataclass) over returning `dict[str, object]` from helpers that `ty` will traverse.

## Data access

- **No raw SQL outside the abstraction layer.** All queries go through SQLAlchemy (or whatever repository layer lands later). If raw SQL is unavoidable, it lives inside the data-access module, never in route handlers or business logic.

## Testing

- **Test fixtures, not imports.** `pytest` runs with `--import-mode=importlib`. Shared test helpers must be pytest fixtures (factory pattern) in `conftest.py`, not plain functions imported across test files. Cross-conftest imports break silently.
- **Scheduling entity-aggregate factories** live in `backend/tests/scheduling/conftest.py`: `create_subject`, `create_week_scheme`, `create_time_block`, `create_room`, `create_teacher`, `create_stundentafel`, `create_stundentafel_entry`, `create_school_class`. Join-table rows (`Lesson`, `TeacherQualification`, `TeacherAvailability`, `RoomAvailability`, `RoomSubjectSuitability`) have no factory; construct inline with `db_session.add(...)` + `await db_session.flush()`. `Lesson.preferred_block_size` is NOT NULL with no server default; always set it (typically `1`).
- **`TimeBlock.start_time` / `end_time` are `datetime.time`,** not strings. Pass `time(8, 0)`, not `"08:00"`.
