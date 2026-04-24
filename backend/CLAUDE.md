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
- **Pre-commit `ty check` blocks a strict "red test with missing module" TDD start.** A test that imports a not-yet-created module fails `ty`'s `unresolved-import` gate, and `ty` has no per-file carve-outs or pragmas. Land a stub module (typed `AsyncSession` signature, body `raise NotImplementedError(...)`) in the red commit; tests still fail at runtime, which is a valid red. Replace the body in the next commit.

## Data access

- **No raw SQL outside the abstraction layer.** All queries go through SQLAlchemy (or whatever repository layer lands later). If raw SQL is unavoidable, it lives inside the data-access module, never in route handlers or business logic.
- **Alembic autogenerate style drift.** `alembic revision --autogenerate` emits `typing.Sequence` and `typing.Union[X, Y]` imports. Repo style is `collections.abc.Sequence` + PEP 604 unions (`X | Y`). Tidy the new revision file before committing; `ruff` does not flag it.
- **`AsyncSession.execute(delete/update).rowcount`.** `ty` sees the return as `Result[Any]`; `.rowcount` only exists on runtime `CursorResult`. Access it via `int(getattr(result, "rowcount", 0) or 0)`. Pattern in `auth/sessions.py:66-76`.

## Testing

- **Test fixtures, not imports.** `pytest` runs with `--import-mode=importlib`. Shared test helpers must be pytest fixtures (factory pattern) in `conftest.py`, not plain functions imported across test files. Cross-conftest imports break silently.
- **Scheduling entity-aggregate factories** live in `backend/tests/scheduling/conftest.py`: `create_subject`, `create_week_scheme`, `create_time_block`, `create_room`, `create_teacher`, `create_stundentafel`, `create_stundentafel_entry`, `create_school_class`. Join-table rows (`Lesson`, `TeacherQualification`, `TeacherAvailability`, `RoomAvailability`, `RoomSubjectSuitability`) have no factory; construct inline with `db_session.add(...)` + `await db_session.flush()`. `Lesson.preferred_block_size` is NOT NULL with no server default; always set it (typically `1`).
- **`TimeBlock.start_time` / `end_time` are `datetime.time`,** not strings. Pass `time(8, 0)`, not `"08:00"`.
- **`async with db_session.begin_nested():` for tests that expect `IntegrityError`.** The `db_session` fixture wraps every test in an outer nested savepoint; a bare `await db_session.rollback()` in `finally:` escapes the inner savepoint and drops pre-inserted setup rows. Use the `async with` form so the rollback stays scoped. Pattern in `tests/seed/test_demo_grundschule_rollback.py`.
- **Solver sees only `Lesson.teacher_id IS NOT NULL` rows.** `scheduling/solver_io.py:build_problem_json` filters by non-null teacher. Tests that drive `POST /schedule` end-to-end must pre-assign `teacher_id` on every lesson (direct `UPDATE` after `generate-lessons`), otherwise the solver sees an empty problem and returns zero placements with zero violations. Pattern in `tests/seed/test_demo_grundschule_solvability.py`.
