# E2E Playwright Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-driven end-to-end test tier using Playwright, validating the real SPA against the real FastAPI backend and a real Postgres instance. Starting scope is one auth setup flow and one Subjects CRUD flow.

**Architecture:** A new FastAPI test-only router (`/__test__/reset`, `/__test__/health`) gated by a new `KZ_ENV=test` setting. Playwright drives Chromium against a `vite preview` build of the frontend, with backend and frontend booted by Playwright's `webServer`. Each test auto-calls `/__test__/reset` via an extended test fixture; admin login happens once in a setup project and every other test reuses `storageState`.

**Tech Stack:** FastAPI, pydantic-settings, SQLAlchemy async, @playwright/test, Chromium, mise, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-04-17-e2e-playwright-design.md`.

---

## File Structure

**Backend (created or modified):**
- Modify: `backend/src/klassenzeit_backend/core/settings.py`. Adds the `env` field.
- Create: `backend/src/klassenzeit_backend/testing/__init__.py`. Empty package marker.
- Create: `backend/src/klassenzeit_backend/testing/router.py`. Testing endpoints (`/reset`, `/health`).
- Create: `backend/src/klassenzeit_backend/testing/mount.py`. Conditional mount helper.
- Modify: `backend/src/klassenzeit_backend/main.py`. Wires the helper in.
- Modify: `backend/src/klassenzeit_backend/cli.py`. Adds the non-interactive `seed-e2e-admin` command.
- Modify: `backend/.env.test`. Adds `KZ_ENV=test`.
- Modify: `backend/tests/conftest.py`. Ensures `KZ_ENV=test` is set in the pytest process env before `app` is imported.
- Create: `backend/tests/testing/__init__.py`. Empty package marker.
- Create: `backend/tests/testing/test_mount.py`. Unit test for the conditional mount helper.
- Create: `backend/tests/testing/test_router.py`. Integration tests for `/reset` and `/health`.
- Modify: `backend/tests/auth/test_cli.py`. Adds tests for the `seed-e2e-admin` command alongside existing CLI tests.

**Frontend (created or modified):**
- Modify: `frontend/package.json` (via `pnpm add -D @playwright/test playwright`).
- Create: `frontend/e2e/playwright.config.ts`. Playwright config with two `webServer` entries.
- Create: `frontend/e2e/fixtures/test.ts`. Extended `test` with auto-reset fixture.
- Create: `frontend/e2e/fixtures/admin.setup.ts`. Logs in once, saves storageState.
- Create: `frontend/e2e/support/urls.ts`. Centralised route paths.
- Create: `frontend/e2e/flows/smoke.spec.ts`. Login + dashboard smoke test.
- Create: `frontend/e2e/flows/subjects.spec.ts`. Subjects create/edit/delete flow.

**Repo-level:**
- Modify: `mise.toml`. Adds `fe:preview`, `e2e`, `e2e:ui`, `e2e:install`, `auth:seed-e2e-admin` tasks.
- Modify: `.gitignore`. Adds `frontend/e2e/.auth/`, `frontend/playwright-report/`, `frontend/test-results/`.
- Modify: `.github/workflows/frontend-ci.yml`. Adds the `e2e` job and broadens path triggers.
- Modify: `docs/superpowers/OPEN_THINGS.md`. Adds a "Testing (E2E)" subsection.

---

## Task 1: Add `env` field to `Settings`

**Files:**
- Modify: `backend/src/klassenzeit_backend/core/settings.py`
- Modify: `backend/tests/core/test_settings.py`

- [ ] **Step 1: Read the existing settings test file to see its style.**

Run: `cat backend/tests/core/test_settings.py`

- [ ] **Step 2: Add a failing test for the `env` field.**

Append to `backend/tests/core/test_settings.py`:

```python
def test_env_defaults_to_dev(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """KZ_ENV unset should default to ``"dev"``."""
    monkeypatch.delenv("KZ_ENV", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("KZ_DATABASE_URL=postgresql+psycopg://u:p@localhost/x\n")
    s = Settings(_env_file=str(env_file))
    assert s.env == "dev"


def test_env_reads_kz_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """KZ_ENV=test should set env to ``"test"``."""
    monkeypatch.setenv("KZ_ENV", "test")
    env_file = tmp_path / ".env"
    env_file.write_text("KZ_DATABASE_URL=postgresql+psycopg://u:p@localhost/x\n")
    s = Settings(_env_file=str(env_file))
    assert s.env == "test"


def test_env_rejects_unknown_value(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Unknown env values raise a validation error."""
    monkeypatch.setenv("KZ_ENV", "staging")
    env_file = tmp_path / ".env"
    env_file.write_text("KZ_DATABASE_URL=postgresql+psycopg://u:p@localhost/x\n")
    with pytest.raises(ValidationError):
        Settings(_env_file=str(env_file))
```

If `pytest`, `Path`, `ValidationError`, or `Settings` are not already imported in the file, add:

```python
from pathlib import Path

import pytest
from pydantic import ValidationError

from klassenzeit_backend.core.settings import Settings
```

- [ ] **Step 3: Run the new tests and confirm failure.**

Run: `mise exec -- uv run pytest backend/tests/core/test_settings.py -v`
Expected: the three new tests fail with `AttributeError` or `ValidationError` (extra field not allowed or missing).

- [ ] **Step 4: Implement the `env` field.**

Edit `backend/src/klassenzeit_backend/core/settings.py`:

Add `Literal` to the `typing` imports:

```python
from typing import Literal
```

Add the field to the `Settings` class (place it just above `# Auth`):

```python
    env: Literal["dev", "test", "prod"] = "dev"
```

- [ ] **Step 5: Run the tests and confirm they pass.**

Run: `mise exec -- uv run pytest backend/tests/core/test_settings.py -v`
Expected: all new tests pass.

- [ ] **Step 6: Run the full backend test suite to confirm nothing broke.**

Run: `mise run test:py`
Expected: green.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/klassenzeit_backend/core/settings.py backend/tests/core/test_settings.py
git commit -m "feat(backend): add env setting for environment gating"
```

---

## Task 2: Set `KZ_ENV=test` in pytest env and `.env.test`

**Rationale:** Later tasks mount the testing router when `settings.env == "test"`. Pytest imports `app` at module load, which calls `get_settings()`. The process env must already say `KZ_ENV=test` at that moment. Setting it in both `.env.test` (for consistency) and the conftest (for correctness regardless of which env_file gets picked up) covers both.

**Files:**
- Modify: `backend/.env.test`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Add `KZ_ENV=test` to `.env.test`.**

Edit `backend/.env.test`, append at the end:

```
KZ_ENV=test
```

- [ ] **Step 2: Set `KZ_ENV=test` in conftest before any app import.**

At the very top of `backend/tests/conftest.py`, before the existing `import os`, add:

```python
import os

os.environ.setdefault("KZ_ENV", "test")
```

Then remove the duplicate `import os` that was already present; the file should have exactly one `import os` followed by the `setdefault` line, all before any `from klassenzeit_backend` imports.

- [ ] **Step 3: Run the backend test suite.**

Run: `mise run test:py`
Expected: green. Ensures nothing regressed from the ordering change.

- [ ] **Step 4: Commit.**

```bash
git add backend/.env.test backend/tests/conftest.py
git commit -m "chore(backend): set KZ_ENV=test for pytest runs"
```

---

## Task 3: Scaffold the testing package and `/health` endpoint

**Files:**
- Create: `backend/src/klassenzeit_backend/testing/__init__.py`
- Create: `backend/src/klassenzeit_backend/testing/router.py`
- Create: `backend/tests/testing/__init__.py`
- Create: `backend/tests/testing/test_router.py`

- [ ] **Step 1: Write the failing test for `/__test__/health`.**

Create `backend/tests/testing/__init__.py` (empty).

Create `backend/tests/testing/test_router.py`:

```python
"""Integration tests for the test-only router."""

from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
    """GET /__test__/health returns 200 with a simple body."""
    response = await client.get("/__test__/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the test and confirm failure.**

Run: `mise exec -- uv run pytest backend/tests/testing/test_router.py -v`
Expected: 404 on the health route. Router doesn't exist yet.

- [ ] **Step 3: Implement the router with the health endpoint only.**

Create `backend/src/klassenzeit_backend/testing/__init__.py` (empty).

Create `backend/src/klassenzeit_backend/testing/router.py`:

```python
"""Test-only HTTP endpoints.

These endpoints exist to let Playwright (or other black-box test drivers)
control backend state without going through the real API. The module must
only be mounted when ``settings.env == "test"``. See
``klassenzeit_backend.testing.mount``.
"""

from fastapi import APIRouter

testing_router = APIRouter(prefix="/__test__", tags=["testing"])


@testing_router.get("/health")
async def testing_health() -> dict[str, str]:
    """Trivial readiness probe used by the Playwright webServer."""
    return {"status": "ok"}
```

- [ ] **Step 4: Mount the router in `main.py` unconditionally (temporary; Task 5 adds gating).**

Edit `backend/src/klassenzeit_backend/main.py`. After the existing `app.include_router(scheduling_router)` line, add:

```python
from klassenzeit_backend.testing.router import testing_router  # noqa: E402
app.include_router(testing_router)
```

(Task 5 replaces this with a conditional helper. Keeping it unconditional here lets Task 3's tests pass with minimal churn.)

- [ ] **Step 5: Run the test and confirm it passes.**

Run: `mise exec -- uv run pytest backend/tests/testing/test_router.py -v`
Expected: `test_health_returns_ok` passes.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/klassenzeit_backend/testing/ backend/src/klassenzeit_backend/main.py backend/tests/testing/
git commit -m "feat(backend): add /__test__/health readiness endpoint"
```

---

## Task 4: Implement `POST /__test__/reset` (entity-tables only)

**Rationale:** Reset wipes entity tables (subjects, rooms, teachers, week_schemes, time_blocks, stundentafeln, stundentafel_entries, school_classes, class_groups, lessons, teacher_availabilities, teacher_qualifications, room_availabilities, room_subject_suitabilities). It preserves `users`, `sessions`, and `alembic_version` so the Playwright storageState cookie remains valid between tests.

**Files:**
- Modify: `backend/src/klassenzeit_backend/testing/router.py`
- Modify: `backend/tests/testing/test_router.py`

- [ ] **Step 1: Write the failing test for `/reset`.**

Append to `backend/tests/testing/test_router.py`:

```python
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models import Subject, User


async def test_reset_truncates_entity_tables(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST /__test__/reset wipes subjects (and other entity tables)."""
    subject = Subject(name="Temp", short_name="TMP")
    db_session.add(subject)
    await db_session.commit()

    # Confirm the row is visible to a fresh query through the app.
    pre_resp = await client.get("/subjects")
    assert pre_resp.status_code == 200
    assert any(s["name"] == "Temp" for s in pre_resp.json())

    response = await client.post("/__test__/reset")
    assert response.status_code == 204

    post_resp = await client.get("/subjects")
    assert post_resp.status_code == 200
    assert post_resp.json() == []


async def test_reset_preserves_users_and_sessions(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_user,
) -> None:
    """POST /__test__/reset does NOT truncate users or sessions."""
    user, _password = await create_test_user(email="keep@test.local")
    await db_session.commit()

    response = await client.post("/__test__/reset")
    assert response.status_code == 204

    result = await db_session.execute(select(User).where(User.email == "keep@test.local"))
    assert result.scalar_one_or_none() is not None
```

**Note on the `/subjects` assertion:** the existing `/subjects` endpoint returns an array of subjects (confirmed in `frontend/tests/msw-handlers.ts`). If the real endpoint shape differs, adjust the assertion to whatever list-equivalent the real API returns; the core requirement is "no 'Temp' subject after reset."

- [ ] **Step 2: Run the tests and confirm they fail.**

Run: `mise exec -- uv run pytest backend/tests/testing/test_router.py -v`
Expected: the two new tests fail (404 on /reset or similar).

- [ ] **Step 3: Implement `/reset`.**

Edit `backend/src/klassenzeit_backend/testing/router.py`. Full new contents:

```python
"""Test-only HTTP endpoints.

These endpoints exist to let Playwright (or other black-box test drivers)
control backend state without going through the real API. The module must
only be mounted when ``settings.env == "test"``. See
``klassenzeit_backend.testing.mount``.
"""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.base import Base
from klassenzeit_backend.db.session import get_session

testing_router = APIRouter(prefix="/__test__", tags=["testing"])

# Tables that must survive a reset. ``alembic_version`` is managed outside
# SQLAlchemy metadata; ``users`` and ``sessions`` stay so the Playwright
# storageState cookie remains valid between tests.
PRESERVED_TABLES: frozenset[str] = frozenset({"users", "sessions", "alembic_version"})


@testing_router.get("/health")
async def testing_health() -> dict[str, str]:
    """Trivial readiness probe used by the Playwright webServer."""
    return {"status": "ok"}


@testing_router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def testing_reset(session: AsyncSession = Depends(get_session)) -> Response:
    """Truncate all entity tables, preserving users and sessions.

    Returns 204 with no body.
    """
    tables = [t for t in Base.metadata.sorted_tables if t.name not in PRESERVED_TABLES]
    if tables:
        names = ", ".join(f'"{t.name}"' for t in tables)
        await session.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Confirm the test file's imports include `AsyncSession`, `select`, the `User`, `Subject` models, and the `create_test_user` fixture.**

The `create_test_user` fixture is defined in `backend/tests/conftest.py` and is auto-discovered. `pytest` is needed only if a raise-pytest-error was added; you don't need it for the asserts above. Remove any unused imports the linter flags.

- [ ] **Step 5: Run the tests.**

Run: `mise exec -- uv run pytest backend/tests/testing/test_router.py -v`
Expected: all tests pass.

- [ ] **Step 6: Run full backend suite.**

Run: `mise run test:py`
Expected: green.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/klassenzeit_backend/testing/router.py backend/tests/testing/test_router.py
git commit -m "feat(backend): add /__test__/reset endpoint that truncates entity tables"
```

---

## Task 5: Conditional mount helper + integration test

**Files:**
- Create: `backend/src/klassenzeit_backend/testing/mount.py`
- Create: `backend/tests/testing/test_mount.py`
- Modify: `backend/src/klassenzeit_backend/main.py`

- [ ] **Step 1: Write the failing test.**

Create `backend/tests/testing/test_mount.py`:

```python
"""Unit tests for the conditional mount helper."""

from fastapi import FastAPI

from klassenzeit_backend.core.settings import Settings
from klassenzeit_backend.testing.mount import include_testing_router_if_enabled


def _fake_settings(env: str) -> Settings:
    """Build a Settings instance with a fixed env value."""
    return Settings(  # ty: ignore[missing-argument]
        env=env,
        database_url="postgresql+psycopg://u:p@localhost/x",  # type: ignore[arg-type]
    )


def test_mounts_when_env_is_test() -> None:
    app = FastAPI()
    include_testing_router_if_enabled(app, _fake_settings("test"))
    paths = {r.path for r in app.routes}
    assert "/__test__/health" in paths
    assert "/__test__/reset" in paths


def test_does_not_mount_when_env_is_dev() -> None:
    app = FastAPI()
    include_testing_router_if_enabled(app, _fake_settings("dev"))
    paths = {r.path for r in app.routes}
    assert "/__test__/health" not in paths
    assert "/__test__/reset" not in paths


def test_does_not_mount_when_env_is_prod() -> None:
    app = FastAPI()
    include_testing_router_if_enabled(app, _fake_settings("prod"))
    paths = {r.path for r in app.routes}
    assert "/__test__/health" not in paths
    assert "/__test__/reset" not in paths
```

- [ ] **Step 2: Run the test and confirm failure.**

Run: `mise exec -- uv run pytest backend/tests/testing/test_mount.py -v`
Expected: ImportError (helper doesn't exist).

- [ ] **Step 3: Create the helper.**

Create `backend/src/klassenzeit_backend/testing/mount.py`:

```python
"""Conditional mount helper for the test-only router.

Kept separate from ``main.py`` so the mount logic can be unit-tested
without spinning up the full application.
"""

from fastapi import FastAPI

from klassenzeit_backend.core.settings import Settings
from klassenzeit_backend.testing.router import testing_router


def include_testing_router_if_enabled(app: FastAPI, settings: Settings) -> None:
    """Attach the testing router to ``app`` iff ``settings.env == "test"``.

    In any other environment the router is not mounted at all, so probing
    ``/__test__/*`` returns 404 without leaking the route shape.
    """
    if settings.env == "test":
        app.include_router(testing_router)
```

- [ ] **Step 4: Run the mount tests.**

Run: `mise exec -- uv run pytest backend/tests/testing/test_mount.py -v`
Expected: pass.

- [ ] **Step 5: Replace the unconditional mount in `main.py`.**

Edit `backend/src/klassenzeit_backend/main.py`. Remove the Task-3 lines that unconditionally include `testing_router`. Add instead, right after the existing router includes:

```python
from klassenzeit_backend.testing.mount import include_testing_router_if_enabled  # noqa: E402

include_testing_router_if_enabled(app, get_settings())
```

Keep the existing `from klassenzeit_backend.core.settings import get_settings` import at the top.

- [ ] **Step 6: Run all backend tests.**

Run: `mise run test:py`
Expected: green. The conftest's `KZ_ENV=test` setdefault ensures `get_settings().env` is `"test"` during tests.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/klassenzeit_backend/testing/mount.py backend/src/klassenzeit_backend/main.py backend/tests/testing/test_mount.py
git commit -m "feat(backend): mount testing router only when KZ_ENV=test"
```

---

## Task 6: Add `seed-e2e-admin` CLI command

**Rationale:** Playwright's setup test needs a known admin user to log in as. `mise run e2e` calls this CLI non-interactively before Playwright starts. Credentials are fixed: `admin@test.local` / `test-password`. Idempotent: no-op if the user already exists.

**Files:**
- Modify: `backend/src/klassenzeit_backend/cli.py`
- Modify: `backend/tests/auth/test_cli.py`

- [ ] **Step 1: Read the existing CLI test file to understand its patterns.**

Run: `cat backend/tests/auth/test_cli.py`

- [ ] **Step 2: Write the failing test.**

Append to `backend/tests/auth/test_cli.py`:

```python
from typer.testing import CliRunner


def test_seed_e2e_admin_creates_admin(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    """seed-e2e-admin creates the fixed e2e admin user."""
    from klassenzeit_backend.cli import cli

    monkeypatch.setenv("KZ_DATABASE_URL", str(settings.database_url))
    runner = CliRunner()
    result = runner.invoke(cli, ["seed-e2e-admin"])
    assert result.exit_code == 0, result.stdout


def test_seed_e2e_admin_is_idempotent(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
) -> None:
    """Running seed-e2e-admin twice does not fail."""
    from klassenzeit_backend.cli import cli

    monkeypatch.setenv("KZ_DATABASE_URL", str(settings.database_url))
    runner = CliRunner()
    first = runner.invoke(cli, ["seed-e2e-admin"])
    assert first.exit_code == 0, first.stdout
    second = runner.invoke(cli, ["seed-e2e-admin"])
    assert second.exit_code == 0, second.stdout
```

If the necessary imports (`pytest`, `Settings`) are not already at the top of the file, add them. `CliRunner` comes from `typer.testing`.

- [ ] **Step 3: Run the test and confirm failure.**

Run: `mise exec -- uv run pytest backend/tests/auth/test_cli.py -v`
Expected: two new tests fail with "No such command 'seed-e2e-admin'".

- [ ] **Step 4: Implement the command.**

Edit `backend/src/klassenzeit_backend/cli.py`. Add constants at the top of the module (just below the existing imports):

```python
E2E_ADMIN_EMAIL = "admin@test.local"
E2E_ADMIN_PASSWORD = "test-password-12345"
```

Note: `validate_password` requires `>= settings.password_min_length` which defaults to 12. The literal above has 17 characters so it passes validation. Keep this literal in sync with the Playwright setup test.

Add a new command at the end of the file, before `main()`:

```python
@cli.command()
def seed_e2e_admin() -> None:
    """Idempotently seed the fixed e2e admin user.

    Intended to be called by ``mise run e2e`` before Playwright starts.
    No-op if the user already exists (by email).
    """
    try:
        asyncio.run(_run_create_admin(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD))
    except ValueError as exc:
        if "already exists" in str(exc):
            typer.echo(f"Admin user already present: {E2E_ADMIN_EMAIL}")
            return
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    typer.echo(f"Admin user created: {E2E_ADMIN_EMAIL}")
```

- [ ] **Step 5: Run the tests.**

Run: `mise exec -- uv run pytest backend/tests/auth/test_cli.py -v`
Expected: the two new tests pass.

- [ ] **Step 6: Run all backend tests.**

Run: `mise run test:py`
Expected: green.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/klassenzeit_backend/cli.py backend/tests/auth/test_cli.py
git commit -m "feat(backend): add idempotent seed-e2e-admin CLI command"
```

---

## Task 7: Add e2e mise tasks and gitignore entries

**Files:**
- Modify: `mise.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Add Playwright-related gitignore entries.**

Append to `.gitignore`:

```
# Playwright (frontend e2e)
frontend/e2e/.auth/
frontend/playwright-report/
frontend/test-results/
```

- [ ] **Step 2: Add `fe:preview` mise task.**

Edit `mise.toml`. In the "Frontend" section, after the `fe:build` task, add:

```toml
[tasks."fe:preview"]
description = "Serve the built frontend via vite preview on :4173"
dir = "{{config_root}}/frontend"
run = "pnpm exec vite preview --port 4173 --strictPort"
```

- [ ] **Step 3: Add `auth:seed-e2e-admin` mise task.**

In the "Auth" section of `mise.toml`, after `auth:cleanup-sessions`, add:

```toml
[tasks."auth:seed-e2e-admin"]
description = "Idempotently seed the fixed e2e admin user"
dir = "{{config_root}}/backend"
run = "uv run klassenzeit-backend seed-e2e-admin"
```

- [ ] **Step 4: Add `e2e` mise tasks.**

Create a new section at the end of `mise.toml`:

```toml
# ─── End-to-end (Playwright) ────────────────────────────────────────────────

[tasks."e2e:install"]
description = "One-time Chromium install for Playwright"
dir = "{{config_root}}/frontend"
run = "pnpm exec playwright install chromium"

[tasks.e2e]
description = "Run the Playwright e2e suite (starts DB, migrates, seeds admin, runs tests)"
depends = ["db:up", "db:migrate", "auth:seed-e2e-admin"]
dir = "{{config_root}}/frontend"
env = { KZ_ENV = "test" }
run = "pnpm exec playwright test --config e2e/playwright.config.ts"

[tasks."e2e:ui"]
description = "Run the Playwright e2e suite in interactive UI mode"
depends = ["db:up", "db:migrate", "auth:seed-e2e-admin"]
dir = "{{config_root}}/frontend"
env = { KZ_ENV = "test" }
run = "pnpm exec playwright test --config e2e/playwright.config.ts --ui"
```

Note: `db:migrate` already sets `KZ_DATABASE_URL` via `.env.test` loading in alembic env.py. Because `db:migrate` uses the settings from `.env` by default, confirm behavior: if the migration runs against the dev DB, change the `db:migrate` dependency here to a new `e2e:migrate` task that explicitly sets `KZ_DATABASE_URL=postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test` or reads from `.env.test`. Adjust if the first run shows migrations hitting the wrong DB.

- [ ] **Step 5: Verify the mise task parses.**

Run: `mise tasks`
Expected: the new tasks appear in the list without errors.

- [ ] **Step 6: Commit.**

```bash
git add mise.toml .gitignore
git commit -m "chore(mise): add e2e and fe:preview tasks"
```

---

## Task 8: Install Playwright and scaffold the `e2e` directory

**Files:**
- Modify: `frontend/package.json` (via pnpm)
- Create: `frontend/e2e/support/urls.ts`

- [ ] **Step 1: Install Playwright packages.**

Run: `mise exec -- pnpm -C frontend add -D @playwright/test playwright`
Expected: `pnpm-lock.yaml` and `frontend/package.json` updated. No errors.

- [ ] **Step 2: Install Chromium.**

Run: `mise run e2e:install`
Expected: Chromium downloaded. On first run this takes up to a minute.

- [ ] **Step 3: Create the `frontend/e2e/support/urls.ts` helper.**

```ts
export const URLS = {
  login: "/login",
  dashboard: "/",
  subjects: "/subjects",
} as const;
```

- [ ] **Step 4: Commit.**

```bash
git add frontend/package.json pnpm-lock.yaml frontend/e2e/support/urls.ts
git commit -m "build(frontend): add @playwright/test and scaffold e2e/support"
```

---

## Task 9: Create `playwright.config.ts`

**Files:**
- Create: `frontend/e2e/playwright.config.ts`

- [ ] **Step 1: Write the config.**

Create `frontend/e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000";
const FRONTEND_URL = "http://localhost:4173";
const DATABASE_URL =
  process.env.KZ_E2E_DATABASE_URL ??
  "postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test";

export default defineConfig({
  testDir: "./flows",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "../playwright-report", open: "never" }],
  ],
  use: {
    baseURL: FRONTEND_URL,
    storageState: "e2e/.auth/admin.json",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "admin-setup",
      testDir: "./fixtures",
      testMatch: /admin\.setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: "chromium",
      dependencies: ["admin-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "uv --project ../../backend run uvicorn klassenzeit_backend.main:app --port 8000",
      url: `${BACKEND_URL}/__test__/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        KZ_ENV: "test",
        KZ_DATABASE_URL: DATABASE_URL,
        KZ_COOKIE_SECURE: "false",
      },
    },
    {
      command: "pnpm exec vite preview --port 4173 --strictPort",
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
```

- [ ] **Step 2: Lint the new file.**

Run: `mise exec -- pnpm -C frontend lint`
Expected: no errors on `e2e/playwright.config.ts`. If Biome flags style issues, fix them (e.g., reorder imports) without changing semantics.

- [ ] **Step 3: Commit.**

```bash
git add frontend/e2e/playwright.config.ts
git commit -m "chore(frontend): add Playwright config with webServer entries"
```

---

## Task 10: Create the auto-reset test fixture

**Files:**
- Create: `frontend/e2e/fixtures/test.ts`

- [ ] **Step 1: Write the fixture.**

Create `frontend/e2e/fixtures/test.ts`:

```ts
import { test as base, expect } from "@playwright/test";

type AutoResetFixtures = {
  resetBackend: void;
};

export const test = base.extend<AutoResetFixtures>({
  resetBackend: [
    async ({ request }, use) => {
      const response = await request.post("http://localhost:8000/__test__/reset");
      if (!response.ok()) {
        throw new Error(
          `Backend reset failed: ${response.status()} ${await response.text()}`,
        );
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
```

- [ ] **Step 2: Lint.**

Run: `mise exec -- pnpm -C frontend lint`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add frontend/e2e/fixtures/test.ts
git commit -m "feat(frontend): add Playwright auto-reset fixture"
```

---

## Task 11: Create the admin login setup test

**Files:**
- Create: `frontend/e2e/fixtures/admin.setup.ts`

- [ ] **Step 1: Write the setup test.**

Create `frontend/e2e/fixtures/admin.setup.ts`:

```ts
import { test as setup } from "@playwright/test";
import { URLS } from "../support/urls";

const ADMIN_EMAIL = "admin@test.local";
const ADMIN_PASSWORD = "test-password-12345";
const STORAGE_STATE = "e2e/.auth/admin.json";

setup("authenticate as admin", async ({ page }) => {
  await page.goto(URLS.login);
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  // Wait for the dashboard to render; the welcome copy comes from the English
  // i18n catalog and is unique to the authenticated landing page.
  await page.getByRole("heading", { name: "Dashboard" }).waitFor({ state: "visible" });

  await page.context().storageState({ path: STORAGE_STATE });
});
```

**Note on locale:** the default i18n detector reads `localStorage.i18nextLng` and then `navigator.language`. When Chromium is launched fresh with no `localStorage`, it'll typically fall back to `en`. If CI runs on a de-locale image, add a `page.addInitScript(() => localStorage.setItem("i18nextLng", "en"))` at the top of the setup. Adjust once the first CI run reveals the behavior.

- [ ] **Step 2: Commit.**

```bash
git add frontend/e2e/fixtures/admin.setup.ts
git commit -m "feat(frontend): add admin login setup test for Playwright"
```

---

## Task 12: Smoke test

**Files:**
- Create: `frontend/e2e/flows/smoke.spec.ts`

- [ ] **Step 1: Write the test.**

Create `frontend/e2e/flows/smoke.spec.ts`:

```ts
import { URLS } from "../support/urls";
import { expect, test } from "../fixtures/test";

test("authenticated landing page renders the dashboard", async ({ page }) => {
  await page.goto(URLS.dashboard);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
```

- [ ] **Step 2: Run the full e2e suite locally.**

Run: `mise run e2e`
Expected: `admin-setup` + 1 smoke test pass. If migrations against klassenzeit_test have not been applied in this environment, the task's `db:migrate` step will handle it.

If the test fails because `db:migrate` ran against the wrong DB (klassenzeit_dev instead of klassenzeit_test), change the `mise.toml` `e2e` task from `depends = ["db:up", "db:migrate", ...]` to run migrations explicitly:

```toml
[tasks.e2e]
description = "Run the Playwright e2e suite"
depends = ["db:up"]
dir = "{{config_root}}/frontend"
env = { KZ_ENV = "test" }
run = [
  "cd ../backend && KZ_DATABASE_URL=postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test uv run alembic upgrade head",
  "cd ../backend && KZ_DATABASE_URL=postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test uv run klassenzeit-backend seed-e2e-admin",
  "pnpm exec playwright test --config e2e/playwright.config.ts",
]
```

- [ ] **Step 3: Commit.**

```bash
git add frontend/e2e/flows/smoke.spec.ts
git commit -m "test(frontend): add e2e smoke test for authenticated dashboard"
```

---

## Task 13: Subjects CRUD flow test

**Files:**
- Create: `frontend/e2e/flows/subjects.spec.ts`

- [ ] **Step 1: Read the Subjects page to confirm locator text.**

Run: `cat frontend/src/features/subjects/subjects-page.tsx`

Note the text keys actually rendered: `t("subjects.title")`, `t("subjects.new")`, `t("common.edit")`, `t("common.delete")`, `t("common.create")`, `t("common.save")`, `t("common.cancel")`. Their English values are in `frontend/src/i18n/locales/en.json`. Cross-reference before writing locators.

- [ ] **Step 2: Write the test.**

Create `frontend/e2e/flows/subjects.spec.ts`:

```ts
import { URLS } from "../support/urls";
import { expect, test } from "../fixtures/test";

test.describe("Subjects CRUD", () => {
  test("creates, edits, and deletes a subject", async ({ page }) => {
    await page.goto(URLS.subjects);

    // Create
    await page.getByRole("button", { name: "New subject" }).click();
    await page.getByLabel("Name").fill("Physics");
    await page.getByLabel("Short name").fill("PH");
    await page.getByRole("button", { name: "Create" }).click();

    const physicsRow = page.getByRole("row", { name: /Physics/ });
    await expect(physicsRow).toBeVisible();

    // Edit
    await physicsRow.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Short name").fill("PHY");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("cell", { name: "PHY" })).toBeVisible();

    // Delete
    await physicsRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).last().click();

    await expect(page.getByText("No subjects yet")).toBeVisible();
  });
});
```

**Adjust locators if needed:** some of these strings (e.g., the edit dialog's "Short name" label vs "Short Name") are inferred from `en.json`. If a locator doesn't resolve, open the Playwright UI (`mise run e2e:ui`) and use the picker. The test must still rely on role-based locators, not CSS selectors.

- [ ] **Step 3: Run the suite.**

Run: `mise run e2e`
Expected: `admin-setup` + smoke + subjects all pass.

- [ ] **Step 4: Commit.**

```bash
git add frontend/e2e/flows/subjects.spec.ts
git commit -m "test(frontend): add Playwright e2e flow for Subjects CRUD"
```

---

## Task 14: Wire the `e2e` job into `frontend-ci.yml`

**Files:**
- Modify: `.github/workflows/frontend-ci.yml`

- [ ] **Step 1: Broaden the trigger path filter.**

Edit `.github/workflows/frontend-ci.yml`. Replace the current `on.pull_request.paths` and `on.push.paths` blocks (both identical lists) with:

```yaml
on:
  pull_request:
    paths:
      - "frontend/**"
      - "backend/**"
      - "scripts/dump_openapi.py"
      - "scripts/gen_frontend_types.sh"
      - "scripts/db-init.sh"
      - "compose.yaml"
      - ".github/workflows/frontend-ci.yml"
      - ".coverage-baseline-frontend"
      - "mise.toml"
  push:
    branches: [master]
    paths:
      - "frontend/**"
      - "backend/**"
      - "scripts/dump_openapi.py"
      - "scripts/gen_frontend_types.sh"
      - "scripts/db-init.sh"
      - "compose.yaml"
      - ".github/workflows/frontend-ci.yml"
      - ".coverage-baseline-frontend"
      - "mise.toml"
```

- [ ] **Step 2: Append the new `e2e` job.**

At the end of `.github/workflows/frontend-ci.yml`, append:

```yaml
  e2e:
    name: Playwright e2e
    runs-on: ubuntu-latest
    needs: build
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: klassenzeit
          POSTGRES_PASSWORD: klassenzeit
          POSTGRES_DB: klassenzeit_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U klassenzeit -d klassenzeit_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      KZ_ENV: test
      KZ_DATABASE_URL: postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup-mise
      - name: Install frontend deps
        run: mise exec -- pnpm -C frontend install --frozen-lockfile
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-chromium-${{ hashFiles('frontend/pnpm-lock.yaml') }}
      - name: Install Chromium
        run: mise exec -- pnpm -C frontend exec playwright install --with-deps chromium
      - name: Run migrations
        run: mise exec -- uv --project backend run alembic upgrade head
      - name: Seed e2e admin
        run: mise exec -- uv --project backend run klassenzeit-backend seed-e2e-admin
      - name: Build frontend
        run: mise run fe:build
      - name: Run Playwright
        run: mise exec -- pnpm -C frontend exec playwright test --config e2e/playwright.config.ts
      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
          retention-days: 14
      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-test-results
          path: frontend/test-results/
          retention-days: 14
```

- [ ] **Step 3: Validate the workflow YAML.**

Run: `mise exec -- python -c "import yaml; yaml.safe_load(open('.github/workflows/frontend-ci.yml'))"`
Expected: no output (valid YAML).

- [ ] **Step 4: Commit.**

```bash
git add .github/workflows/frontend-ci.yml
git commit -m "ci(frontend): add e2e Playwright job"
```

- [ ] **Step 5: Push and observe.**

```bash
git push
```

In the PR on GitHub, watch `Frontend CI / Playwright e2e`. If it fails, capture the logs and iterate in a follow-up commit. Common pitfalls:

- `alembic upgrade head` fails because `backend/.env` is missing on the runner. Fix by setting `KZ_DATABASE_URL` at the job level (already done above).
- `vite preview` fails with "dist not found": ensure "Build frontend" runs before Playwright.
- `playwright install --with-deps` fails without root; GitHub runners allow it via sudo. If the `--with-deps` flag is rejected, drop it and use `playwright install chromium` only.

Do not mark this task complete until the CI job is green on the PR.

- [ ] **Step 6: Once green, this task is complete.** No extra commit unless fixes were needed.

---

## Task 15: Update `OPEN_THINGS.md`

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Add a "Testing (E2E)" subsection.**

Edit `docs/superpowers/OPEN_THINGS.md`. Under the existing "Testing" heading, add a new subsection block (keeping the existing entries untouched):

```markdown
### E2E (Playwright)

- **Entity coverage beyond Subjects.** Each remaining entity CRUD spec (Rooms, Teachers, WeekSchemes, Stundentafel, SchoolClass, Lesson) should add its own Playwright flow when it lands.
- **Cross-browser matrix.** Firefox and WebKit are disabled for now (Chromium only). Enable when external users appear.
- **Accessibility audits inside Playwright.** `@axe-core/playwright` integration is deferred; track separately.
- **Visual regression.** Percy / Chromatic / Playwright snapshot tooling. Defer until design churn slows.
- **Parallel workers + per-worker DBs.** Currently Playwright runs single-worker against a shared DB. Move to per-worker schemas once CI time matters.
- **Session cleanup in /__test__/reset.** The reset endpoint preserves the `sessions` table so storageState stays valid; revisit if tests start needing clean session state.
- **Nightly extended run.** Slower flows, broader data scenarios. Add when the suite is large enough to justify tiering.
- **Test-only router hardening.** Currently gated by `settings.env == "test"`; an additional network-level guard (e.g., bind `/__test__` to localhost only) is possible if the surface grows.
```

- [ ] **Step 2: Commit.**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: track Playwright e2e follow-ups in OPEN_THINGS"
```

---

## Self-review checklist (planner)

1. **Spec coverage.**
   - Tiers and scope → Tasks 12, 13.
   - Directory layout → Tasks 8-13.
   - Tooling/packages → Task 8.
   - Mise tasks → Task 7.
   - Playwright config (webServer, storageState, reporters) → Task 9.
   - Gitignores → Task 7.
   - Backend test-only surface (router, health, reset) → Tasks 3, 4.
   - Settings change → Task 1.
   - Safety rails (conditional mount + gating test) → Task 5.
   - Fixtures (auto-reset, admin setup) → Tasks 10, 11.
   - Locator conventions → Tasks 11, 13 (inline guidance).
   - Artifacts (screenshots, traces, HTML report) → Tasks 9, 14.
   - CI wiring → Task 14.
   - Deferred items in OPEN_THINGS → Task 15.

2. **Placeholder scan.** No TBDs or "implement later" steps remain. Every code step shows the code.

3. **Type consistency.**
   - Function names: `testing_health`, `testing_reset`, `include_testing_router_if_enabled`, `seed_e2e_admin`, `_run_create_admin` are used consistently.
   - Constants: `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `PRESERVED_TABLES` referenced consistently.
   - Paths: `/__test__/health` and `/__test__/reset` (note: they use a double-underscore prefix, matching Python dunder style intentionally to make accidental collisions with real routes unlikely).
   - `storageState` path: `e2e/.auth/admin.json` (relative to `frontend/`) in both the config and the setup test.

4. **Ambiguity.** The one soft spot is `db:migrate` in Task 7 targeting klassenzeit_dev vs klassenzeit_test. Task 12 includes an explicit fallback if that manifests, so the plan does not silently drop the problem.
