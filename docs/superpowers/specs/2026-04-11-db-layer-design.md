# Database Layer Design

**Date:** 2026-04-11
**Status:** Approved (design)
**Scope:** Plumbing for the Klassenzeit backend's database layer — ORM/migration choice, connection and session wiring, test isolation strategy, dev/test environment layout, and the documentation structure the project will grow into. No production domain models; a single throwaway probe table proves the plumbing works.

## Goals

1. Pick the ORM and migration tool, once, and commit.
2. Stand up a Postgres dev+test environment that onboards in three commands.
3. Wire SQLAlchemy 2.0 async sessions into FastAPI with no module-level globals so tests can override the session factory cleanly.
4. Give the backend an integration test strategy that hits a real Postgres (never a mocked DB), rolls back per-test, and runs in sub-millisecond teardown.
5. Establish the living docs layer (`docs/architecture/`, `docs/adr/`) alongside the existing `docs/superpowers/specs/` historical specs, so subsequent features have clear slots to document into.
6. Leave OPEN_THINGS updated so the next spec in the roadmap (authentication) starts from known ground.

## Non-goals

- **Domain models.** No users, classes, schedules, or any real entity. The only model this spec lands is a `Ping` probe that proves migrations and CRUD work; it is deleted by the first feature spec that adds a real model.
- **Repository / unit-of-work layer.** Routes take `AsyncSession` directly via `Depends`. A repository layer earns its place only once queries get duplicated across endpoints.
- **Authentication.** Covered by the next spec in the roadmap.
- **Production deployment.** No containerized backend, no secrets management, no CI wiring beyond documenting what the eventual CI job will need.
- **Data migrations and seed data.** Alembic schema migrations only. Data migrations are deferred until there's real data.
- **Multi-tenancy, read replicas, connection pooling at scale.** Production DB shape is out of scope until the deployment spec.
- **`pytest-xdist` parallelization.** The current suite is small; sequential runs are fine. Noted in OPEN_THINGS for when it becomes relevant.

## Core decisions

| Decision | Choice | Rejected alternatives |
|---|---|---|
| ORM | SQLAlchemy 2.0 (async) | SQLModel, Piccolo, Tortoise ORM |
| Migration tool | Alembic | Piccolo's built-in, hand-rolled SQL |
| DB engine | Postgres 17, everywhere (dev/test/prod) | SQLite in dev, SQLite everywhere |
| Async driver | `asyncpg` | `psycopg` async |
| Dev container runtime | Podman | Docker |
| Test isolation | Transaction-rollback with savepoint restart | `TRUNCATE` between tests, fresh DB per test |
| Package location | `backend/src/klassenzeit_backend/db/` | Separate `klassenzeit-db` workspace member |
| Settings | `pydantic-settings`, layered env files | Hand-rolled config loader |
| Container compose file location | Repo root (`compose.yaml`) | `backend/compose.yaml` |

Full rationale for each is captured as an ADR (see "Documentation structure" below). Brainstorming history lives in the comments of this spec's commit and the brainstorming session transcript; the ADRs are the canonical, findable record.

## Architecture

### Directory layout

```
klassenzeit/
├── compose.yaml                         # Postgres service (podman compose)
├── scripts/
│   └── db-init.sh                       # Creates klassenzeit_test DB on first boot
├── backend/
│   ├── .env.example                     # Committed, documents every KZ_* var
│   ├── .env.test                        # Committed, points at klassenzeit_test
│   ├── alembic.ini                      # Alembic config (sqlalchemy.url blank)
│   ├── alembic/
│   │   ├── env.py                       # Async-aware; reads DATABASE_URL from settings
│   │   ├── script.py.mako
│   │   └── versions/                    # Migration files (one initial, creating `ping`)
│   ├── src/klassenzeit_backend/
│   │   ├── core/
│   │   │   └── settings.py              # pydantic-settings Settings class
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── engine.py                # build_engine() → AsyncEngine
│   │   │   ├── session.py               # get_session FastAPI dependency
│   │   │   ├── base.py                  # DeclarativeBase + naming convention
│   │   │   └── models/
│   │   │       ├── __init__.py          # Single import surface for Alembic
│   │   │       └── _ping.py             # Probe model
│   │   └── main.py                      # Gains FastAPI lifespan wiring
│   └── tests/
│       ├── conftest.py                  # Engine, session, client fixtures
│       └── db/
│           └── test_ping.py             # Four integration tests (see below)
└── docs/
    ├── README.md                        # NEW. Docs map.
    ├── architecture/                    # NEW. Living reference docs.
    │   ├── overview.md
    │   └── database.md
    ├── adr/                             # NEW. Immutable decision records.
    │   ├── README.md
    │   ├── template.md
    │   ├── 0001-monorepo-two-workspaces.md
    │   ├── 0002-rust-solver-pyo3-bindings.md
    │   ├── 0003-postgres-everywhere.md
    │   ├── 0004-sqlalchemy-async-alembic.md
    │   └── 0005-transaction-rollback-tests.md
    └── superpowers/                     # Unchanged
```

### Package boundary

The database layer is a subpackage of the backend, not its own workspace member. `backend/` is currently the only Python consumer of the DB, and promoting `db/` to `klassenzeit-db` is a five-minute refactor if a second consumer ever appears (CLI, worker, admin tool). Classic YAGNI.

### No module-level globals

Engine, session factory, and settings are all bound to `app.state` via a FastAPI `lifespan` context manager. Routes and fixtures retrieve them through `request.app.state` or dependency overrides. No `_engine = create_async_engine(...)` at module import time — that breaks test overrides and delays configuration errors until the first request.

## Settings

`backend/src/klassenzeit_backend/core/settings.py`:

```python
from functools import lru_cache
from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="KZ_",
        extra="ignore",
    )

    database_url: PostgresDsn       # KZ_DATABASE_URL
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_echo: bool = False           # SQL logging; leave off outside debugging

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### Env file layering

Standard layered pydantic-settings approach. No stage-switching branches in code; stage is implicit in what env vars exist at process start.

| File | Committed? | Purpose |
|---|---|---|
| `backend/.env.example` | yes | Documents every `KZ_*` var with safe placeholders |
| `backend/.env` | **no** (gitignored) | Local dev overrides; contributor copies from `.env.example` |
| `backend/.env.test` | yes | Points at `klassenzeit_test`; loaded explicitly in conftest |
| Prod env | n/a | Real environment variables injected by the container runtime; no file on disk |

Precedence, from highest to lowest (pydantic-settings default):

1. Init kwargs (tests: `Settings(_env_file=".env.test")`)
2. Real process environment
3. `.env` file
4. Field defaults

Contents of `backend/.env.example`:

```bash
# Dev DB — matches compose.yaml service
KZ_DATABASE_URL=postgresql+asyncpg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_dev
KZ_DB_POOL_SIZE=5
KZ_DB_MAX_OVERFLOW=10
KZ_DB_ECHO=false
```

Contents of `backend/.env.test`:

```bash
KZ_DATABASE_URL=postgresql+asyncpg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test
KZ_DB_ECHO=false
```

`.gitignore` adds `backend/.env` and `backend/.env.local`. `.env.example` and `.env.test` are explicitly committed. Credentials in both are dev-only and documented as such.

## Engine and session

`backend/src/klassenzeit_backend/db/engine.py`:

```python
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from klassenzeit_backend.core.settings import get_settings

def build_engine() -> AsyncEngine:
    s = get_settings()
    return create_async_engine(
        str(s.database_url),
        pool_size=s.db_pool_size,
        max_overflow=s.db_max_overflow,
        echo=s.db_echo,
        pool_pre_ping=True,
    )
```

`backend/src/klassenzeit_backend/db/session.py`:

```python
from collections.abc import AsyncIterator
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        yield session
```

`backend/src/klassenzeit_backend/main.py` gains a `lifespan` context manager:

```python
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker
from klassenzeit_backend.db.engine import build_engine

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = build_engine()
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(
        engine, expire_on_commit=False,
    )
    try:
        yield
    finally:
        await engine.dispose()

app = FastAPI(title="Klassenzeit", lifespan=lifespan)
```

**Why `async_sessionmaker` and not raw `AsyncSession(engine, ...)` at every call site:** the maker is the one place that binds the engine and sets `expire_on_commit=False` (the standard async default — without it, every attribute access after commit triggers an unintended reload). Without the maker you repeat the same config at every call site. The per-request `async with factory() as session` is *also* a context manager — the maker just constructs the session; the `async with` still scopes its lifetime.

**Why no unit-of-work / repository layer yet:** YAGNI. Routes declare `session: Annotated[AsyncSession, Depends(get_session)]` and use it directly. A repository layer earns its place once queries get duplicated across endpoints — add it when it hurts, not before.

## Declarative base and models

`backend/src/klassenzeit_backend/db/base.py`:

```python
from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix":  "ix_%(column_0_label)s",
    "uq":  "uq_%(table_name)s_%(column_0_name)s",
    "ck":  "ck_%(table_name)s_%(constraint_name)s",
    "fk":  "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk":  "pk_%(table_name)s",
}

class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
```

The naming convention is non-negotiable — without it, autogenerated migrations diff differently across environments because SQLAlchemy's unnamed-constraint hashing isn't stable. Every new model inherits from `Base`.

`backend/src/klassenzeit_backend/db/models/__init__.py` is the single import surface for Alembic:

```python
from klassenzeit_backend.db.models._ping import Ping  # noqa: F401
```

Every new model file must be re-exported here. This is documented as a rule in `docs/architecture/database.md` and in CONTRIBUTING. Models not re-exported are invisible to Alembic autogenerate.

`backend/src/klassenzeit_backend/db/models/_ping.py`:

```python
from datetime import datetime
from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from klassenzeit_backend.db.base import Base

class Ping(Base):
    __tablename__ = "ping"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

The underscore prefix (`_ping.py`) signals "not a real model; delete me when a real one lands." The first feature spec that adds a real entity is expected to delete `_ping.py`, remove the re-export, and replace the smoke tests accordingly. A corrective migration drops the `ping` table at the same time.

## Alembic configuration

- `backend/alembic.ini`: standard template, `script_location = alembic`, `sqlalchemy.url` **blank**. URL comes from `env.py`.
- `backend/alembic/env.py`: async-aware. Imports `get_settings()` and `Base`, triggers `klassenzeit_backend.db.models` to populate `Base.metadata`, then:
  - In offline mode: `context.configure(url=str(get_settings().database_url), target_metadata=Base.metadata, ...)`.
  - In online mode: `async_engine_from_config` with the URL from settings, `context.configure(connection=conn, target_metadata=Base.metadata, compare_type=True)`.
- `compare_type=True` so Alembic notices column type changes.
- `render_as_batch=False` — Postgres doesn't need SQLite's batch mode.

**Invariant: migrations are never edited after merge.** A bad migration gets a new corrective migration on top of it. Documented in `docs/architecture/database.md` and CONTRIBUTING.

## Container and scripts

### `compose.yaml` (repo root)

```yaml
services:
  db:
    image: docker.io/library/postgres:17
    environment:
      POSTGRES_USER: klassenzeit
      POSTGRES_PASSWORD: klassenzeit
      POSTGRES_DB: klassenzeit_dev
    # Host port 5433 (not 5432) because the dev host already runs a
    # klassenzeit-postgres-dev staging container on 5432. Container
    # internal port stays 5432.
    ports: ["5433:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/db-init.sh:/docker-entrypoint-initdb.d/10-create-test-db.sh:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U klassenzeit -d klassenzeit_dev"]
      interval: 2s
      timeout: 2s
      retries: 15

volumes:
  pgdata:
    name: klassenzeit_pgdata
```

- Image is **fully qualified** (`docker.io/library/postgres:17`) so podman doesn't prompt for a registry on first pull.
- Volume is named `klassenzeit_pgdata` so `db:reset` can target it explicitly.
- Lives at repo root: frontend and backend containers will be added to the same file by future specs, not as parallel compose files.

### `scripts/db-init.sh`

```bash
#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE klassenzeit_test OWNER klassenzeit;
EOSQL
```

Runs exactly once, on first container boot, via Postgres' `docker-entrypoint-initdb.d` convention.

## `mise.toml` task additions

```toml
[tasks."db:up"]
description = "Start the dev Postgres"
run = "podman compose up -d db"

[tasks."db:stop"]
description = "Stop the dev DB (keeps volume)"
run = "podman compose stop db"

[tasks."db:reset"]
description = "Destroy dev DB volume and start fresh (DANGEROUS)"
run = [
  "podman compose rm -sf db",
  "podman volume rm klassenzeit_pgdata",
  "podman compose up -d db",
]

[tasks."db:migrate"]
description = "Apply migrations to the dev DB"
run = "cd backend && uv run alembic upgrade head"

[tasks."db:revision"]
description = "Autogenerate a new migration (usage: mise run db:revision -- -m 'message')"
run = "cd backend && uv run alembic revision --autogenerate"

[tasks."db:downgrade"]
description = "Roll back the last migration"
run = "cd backend && uv run alembic downgrade -1"
```

Tasks are scoped to the `db` service explicitly — `podman compose down` (which would stop every service) is not used, so future frontend/backend services in the same compose file are unaffected by `db:stop`. `db:reset` is the explicit nuke path; destruction is opt-in and clearly named.

## Test isolation strategy

Per the project rule "integration tests must hit a real database, not mocks" (established as feedback during earlier work), tests run against a real Postgres. The question is how to isolate each test's state.

**Chosen approach: transaction rollback per test with savepoint restart.**

Three-layer fixture structure in `backend/tests/conftest.py`:

### Layer 1 — session-scoped engine

```python
from pathlib import Path
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from klassenzeit_backend.core.settings import Settings

BACKEND_ROOT = Path(__file__).resolve().parent.parent  # backend/
ENV_TEST = BACKEND_ROOT / ".env.test"

@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(_env_file=ENV_TEST)

@pytest.fixture(scope="session")
async def engine(settings: Settings) -> AsyncEngine:
    eng = create_async_engine(str(settings.database_url), pool_pre_ping=True)
    yield eng
    await eng.dispose()
```

One engine per pytest session, bound to the test DB. `BACKEND_ROOT` is resolved relative to `conftest.py` because pytest is invoked from the repo root (per the scaffolding spec's `[tool.pytest.ini_options] testpaths`), so relative paths like `".env.test"` would resolve against the wrong cwd.

### Layer 2 — migrations, once per session

```python
@pytest.fixture(scope="session", autouse=True)
async def apply_migrations(engine: AsyncEngine) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", str(engine.url))
    command.downgrade(cfg, "base")   # clean slate
    command.upgrade(cfg, "head")
```

Both `alembic.ini` and `script_location` are resolved as absolute paths for the same reason: pytest runs from the repo root, and Alembic's `Config` otherwise interprets `script_location` relative to cwd.

Downgrade then upgrade gives a fresh schema regardless of prior state. Runs once per pytest session. Not per-test — that would cost ~500ms each.

### Layer 3 — per-test transaction with savepoint restart

The load-bearing piece. This is the standard SQLAlchemy pattern documented as "Joining a Session into an External Transaction (such as for test suites)":

```python
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

@pytest.fixture
async def db_session(engine: AsyncEngine) -> AsyncSession:
    async with engine.connect() as connection:
        trans = await connection.begin()
        factory = async_sessionmaker(bind=connection, expire_on_commit=False)

        async with factory() as session:
            await session.begin_nested()

            @event.listens_for(session.sync_session, "after_transaction_end")
            def restart_savepoint(sess, transaction):
                if transaction.nested and not transaction._parent.nested:
                    sess.begin_nested()

            yield session

        await trans.rollback()
```

Mechanics:

- The outer `connection.begin()` is never committed. It is always rolled back at teardown, discarding everything the test did.
- The session runs inside a `begin_nested()` savepoint. If test code (or application code under test) calls `session.commit()`, the savepoint ends.
- The `after_transaction_end` listener immediately opens a new savepoint, so the session remains inside a transaction from the outside.
- Net effect: **test code can call `commit()` and the changes still disappear at teardown.** The application sees a normal session; the test infrastructure guarantees isolation.

Cost per test: sub-millisecond. No schema churn between tests.

### Layer 4 — FastAPI dependency override for HTTP-level tests

```python
from httpx import ASGITransport, AsyncClient
from klassenzeit_backend.main import app
from klassenzeit_backend.db.session import get_session

@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
```

HTTP-level and DB-level tests share the same `db_session`. An API call and a follow-up query see each other's state within the test, and everything rolls back at the end.

### Tests delivered by this spec

`backend/tests/db/test_ping.py`:

1. **`test_migrations_create_ping_table`** — queries `information_schema.tables`, asserts `ping` exists. Proves the migration ran.
2. **`test_ping_roundtrip`** — inserts a `Ping`, commits, selects it back, asserts `created_at` is non-null and timezone-aware. Proves models + commit + server defaults.
3. **`test_rollback_isolation_insert`** — inserts and commits a `Ping`, asserts `count == 1` via a separate query within the same test. Proves the savepoint-restart shim allows commits to be visible to follow-up queries.
4. **`test_rollback_isolation_empty`** — sibling test. Asserts `count == 0` at start. Proves the outer transaction rollback actually discarded test 3's committed row. Tests 3 and 4 together prove isolation — test 3 alone cannot, and test 4 alone cannot.
5. **`test_health_endpoint_still_works`** — calls `/health` via the `client` fixture; confirms DB wiring didn't break existing routes.

## Documentation structure

### Why this spec establishes the living-docs layer

Until now, the only documentation tree in the repo is `docs/superpowers/specs/` — **historical** design docs. A spec captures the design as of a point in time. It is frozen once approved. Someone reading it later learns *how we decided*, not *what the system currently looks like*.

That is valuable, but it is not the same as **living reference docs** — the things a new contributor reads to understand the system *today*. Specs rot the moment code changes; living docs are maintained alongside the code. We start that layer now, because it's easier to begin when the tree is small.

We also introduce **ADRs** (Architecture Decision Records) — short, immutable, numbered records of load-bearing decisions. ADRs are not spec replacements; a spec is a design for work to be done, while an ADR is a one-screen decision nugget ("we chose X over Y because Z") that you can find in isolation long after the spec that motivated it has faded from memory.

The result is three orthogonal doc trees, each answering a different question:

| Tree | Answers | Mutability |
|---|---|---|
| `docs/architecture/` | "How does the system currently work?" | Updated alongside code |
| `docs/adr/` | "Why did we pick X over Y?" | Immutable once merged (superseded, not edited) |
| `docs/superpowers/specs/` | "What did we agree to build on day D?" | Frozen once approved |

### The docs map (`docs/README.md`)

Instead of scaffolding empty directories that would rot as stubs, this spec adds a single `docs/README.md` that lists every intended slot and marks which are populated. Content roughly:

> ## Docs map
>
> - **`architecture/`** — living reference for current system state. **Populated.** Start here to understand the codebase as it is today.
> - **`adr/`** — immutable decision records. **Populated.** Go here to find *why* something is the way it is.
> - **`superpowers/specs/`** — frozen design documents from feature work. **Populated.** Historical — useful for context, not current state.
> - **`tutorials/`** — step-by-step learning paths. **Not yet.** Will live at `docs/tutorials/` once onboarding outgrows the README.
> - **`how-to/`** — task-oriented recipes. **Not yet.** Will live at `docs/how-to/` once the architecture docs stop being able to cover everything inline.
> - **`reference/`** — auto-generated API docs. **Not yet.** Will live at `docs/reference/` once there's a stable public API worth documenting.
> - **`runbooks/`** — incident response and oncall. **Not yet.** Will live at `docs/runbooks/` once there's a production deployment.
>
> ### Rules
>
> 1. Write an ADR when making a decision that's load-bearing and not obvious from reading the code.
> 2. Update `architecture/<subsystem>.md` when the subsystem lands or changes shape.
> 3. Specs and plans stay under `docs/superpowers/` — they're the *process*, not the *product*.

### `docs/architecture/overview.md` (new, ~200 words)

Single-page system-at-a-glance. Short now, grows as subsystems land. Initial content covers: what Klassenzeit is (a scheduling app for school class time), the monorepo layout (backend + solver-core + solver-py), the toolchain surface (`mise`, `uv`, `cargo`, `podman compose`), and a pointer to the ADR index. Links to `docs/architecture/database.md` for the DB layer.

### `docs/architecture/database.md` (new)

Practical contributor-facing reference. Covers:

- **Stack.** SQLAlchemy 2.0 async, `asyncpg`, Alembic, Postgres 17.
- **Env config.** The `.env.example` → `.env` → `.env.test` layering and `KZ_*` prefix.
- **Starting the dev DB.** `mise run db:up`, `db:migrate`, `db:stop`, `db:reset`.
- **Adding a model.** Create `db/models/<name>.py`, inherit from `Base`, re-export from `db/models/__init__.py`, generate migration with `mise run db:revision -- -m "..."`, review the generated file, commit it alongside the model.
- **The naming-convention rule.** Why it exists and why it's never removed.
- **The "never edit merged migrations" rule.** Corrective migrations only.
- **How tests work.** Transaction rollback per test, savepoint restart, `db_session` + `client` fixtures, what tests should use which.
- **When to reach for raw SQL.** Escape hatches via `session.execute(text(...))`.

### ADRs

`docs/adr/README.md` explains what an ADR is in this repo (one decision, one page, immutable, superseded by a new ADR rather than edited), lists every ADR with its status, and points at the template.

`docs/adr/template.md` is the canonical skeleton: Title, Status, Context, Decision, Consequences.

This spec lands **five ADRs**:

| # | Title | Status | Source |
|---|---|---|---|
| 0001 | Monorepo with Cargo + uv workspaces | Accepted | Backfilled from scaffolding spec |
| 0002 | Rust solver split into `solver-core` + PyO3 `solver-py` | Accepted | Backfilled from scaffolding spec |
| 0003 | Postgres everywhere (dev, test, prod) | Accepted | This spec |
| 0004 | SQLAlchemy 2.0 async + Alembic for the ORM/migration stack | Accepted | This spec |
| 0005 | Transaction-rollback-with-savepoint-restart for DB test isolation | Accepted | This spec |

Each ADR is 150–400 words and includes the alternatives rejected, the reason for the choice, and the consequences that would motivate a future supersession. 0001 and 0002 are backfilled because they are core, load-bearing, and not obvious from reading the code — exactly the kind of decision ADRs are for.

### Updates to existing docs

- `README.md`: dev setup gains three new steps (see below); top of file gains a link to `docs/architecture/overview.md` and `docs/adr/`.
- `CONTRIBUTING.md`: new "Database" section that points at `docs/architecture/database.md` for the how-to material and summarizes the invariants (naming convention, never edit migrations, models must be re-exported).

## Dev setup updates

`README.md` "Dev Setup" becomes:

> 1. Install [mise](https://mise.jdx.dev/).
> 2. `mise install`
> 3. `mise run install`
> 4. `mise run db:up` — start the dev Postgres.
> 5. `cp backend/.env.example backend/.env` — seed your local env.
> 6. `mise run db:migrate` — apply migrations.
> 7. `mise run test` — confirm everything works.

`CONTRIBUTING.md` gets the same extension plus the new "Database" section.

## Definition of done

1. `mise run db:up` starts Postgres, `klassenzeit_test` exists alongside `klassenzeit_dev`.
2. `mise run db:migrate` applies the initial migration containing the `ping` table.
3. `mise run test:py` passes, including the four new tests in `backend/tests/db/test_ping.py`.
4. `mise run lint` passes with no new warnings (ruff, ty, vulture all clean on the new code).
5. `GET /health` still returns `{"status": "ok", "solver_check": "ok"}`.
6. README Dev Setup reflects the new bootstrap steps.
7. `docs/README.md`, `docs/architecture/overview.md`, `docs/architecture/database.md`, and all five ADRs exist and are coherent.
8. `docs/superpowers/OPEN_THINGS.md` updated: the "Database layer" bullet is removed from "Product capabilities", and the deferred items below are added.
9. CI implication: the existing GitHub Actions workflow (currently running lint + test) must continue to pass, which means the CI wiring spec follow-up (see OPEN_THINGS) must provision a Postgres service before this spec merges, or this spec's test suite must be temporarily gated until that lands. The implementation plan addresses the sequencing explicitly.

## Deferred to OPEN_THINGS after this spec lands

- **Parallelized test DBs** via `pytest-xdist` with worker-ID-keyed schemas. Not needed at current suite size.
- **`pytest-postgresql` or `testcontainers-python`** as an alternative to compose-based test infra. Revisit if onboarding friction emerges.
- **CI wiring for Postgres.** The GitHub Actions workflow currently runs `mise run lint` and `mise run test` but has no DB service. The CI spec (already in OPEN_THINGS) must add a `services: postgres` block, create `klassenzeit_test`, export `KZ_DATABASE_URL`, and run `alembic upgrade head` before the test job. Flagged with high priority because the test suite in this spec will break CI until it's done.
- **Data migrations / seed data framework.** Schema migrations only for now. Add when there's real data to seed.
- **Production DB configuration.** Connection pooling at scale, read replicas, `statement_timeout`, `pg_stat_statements`. All prod concerns, out of scope until the deployment spec.
- **`cog bump`-driven migration numbering or timestamp-based revision IDs.** Alembic default (hash-based) is fine for now.
- **Repository / unit-of-work layer.** Add when query duplication across endpoints makes it hurt.
- **Async fixtures plugin choice.** This spec uses vanilla `pytest-asyncio` (already a dev dep); if it causes friction we can revisit `anyio`-based alternatives.

## Open questions resolved during brainstorming

- **ORM choice** — SQLAlchemy 2.0 async. SQLModel rejected for leaky abstraction; Piccolo/Tortoise rejected for ecosystem size.
- **Migration tool** — Alembic.
- **Async driver** — `asyncpg`.
- **Dev DB engine** — Postgres 17, same engine in every environment. No SQLite.
- **Container runtime** — Podman (project-wide preference). `compose.yaml` is compatible with both; only the CLI invocation differs.
- **Compose file location** — repo root, not `backend/`. Frontend and backend services will be added to the same file later.
- **Scope** — plumbing only. No domain models beyond `_ping.py`.
- **Package location** — `backend/src/klassenzeit_backend/db/`, not a separate workspace member.
- **Test isolation** — transaction rollback with savepoint restart. `TRUNCATE` and fresh-DB-per-test rejected on performance/complexity grounds.
- **Test DB provisioning** — same Postgres instance as dev, separate database created by an init script on first boot.
- **Env file layering** — `.env.example` (committed), `.env` (gitignored, local), `.env.test` (committed, for tests), real env vars in prod. No stage-switching logic in code.
- **No module-level globals** — engine and session factory live on `app.state`, created in a `lifespan` context manager.
- **Naming convention on `MetaData`** — non-negotiable; required for stable Alembic diffs.
- **Never-edit-merged-migrations invariant** — established in this spec, documented in architecture/database.md and CONTRIBUTING.
- **Probe model** — `_ping.py` with underscore prefix, deleted by the first feature spec.
- **Documentation structure** — living `architecture/`, immutable `adr/`, historical `superpowers/specs/` as three orthogonal trees. `docs/README.md` is the doc map; empty directories are not scaffolded.
