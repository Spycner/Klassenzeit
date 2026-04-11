# Database layer

The backend's database layer lives at
`backend/src/klassenzeit_backend/db/` and is built on SQLAlchemy 2.0
(async) + Alembic + Postgres 17. This doc is the contributor-facing
reference for how to use and extend it. For the design rationale and
the decisions made along the way, see the ADRs linked at the bottom.

## Stack

| Layer | Choice |
|---|---|
| ORM | SQLAlchemy 2.0 async (`Mapped[...]`, `mapped_column`, `AsyncSession`) |
| Driver | asyncpg |
| Migration tool | Alembic (async-aware env.py) |
| Engine | Postgres 17 |
| Container runtime | podman (via root-level `compose.yaml`) |
| Settings | pydantic-settings (`KZ_*` env prefix) |
| Test isolation | Transaction rollback with savepoint restart |

## Starting the dev DB

First time:

```bash
mise run db:up            # start Postgres
cp backend/.env.example backend/.env
mise run db:migrate       # apply migrations
```

Day-to-day:

```bash
mise run db:up            # idempotent; no-op if already running
mise run db:stop          # stop without destroying data
mise run db:reset         # NUKE: destroys the volume and rebuilds
```

The compose file lives at the repo root because frontend and backend
services will eventually share it. `db:*` tasks operate only on the
`db` service — never `podman compose down`, which would take down every
service once the file grows.

## Environment variables

All backend env vars share the `KZ_` prefix.

| Var | Type | Default | Purpose |
|---|---|---|---|
| `KZ_DATABASE_URL` | PostgresDsn | (required) | SQLAlchemy URL, async driver |
| `KZ_DB_POOL_SIZE` | int | 5 | Engine pool size |
| `KZ_DB_MAX_OVERFLOW` | int | 10 | Engine max overflow |
| `KZ_DB_ECHO` | bool | false | SQL logging (debug only) |

File layering, by precedence (highest wins):

1. Init kwargs (tests pass `_env_file=str(ENV_TEST)` explicitly)
2. Real process environment
3. `backend/.env` (gitignored, local dev)
4. Field defaults

`backend/.env.example` is committed and documents every var.
`backend/.env.test` is committed and used by the test suite — its
credentials are dev-only.

## Adding a new model

1. Create `backend/src/klassenzeit_backend/db/models/<name>.py`.
2. Make it inherit from `Base`:

   ```python
   from sqlalchemy.orm import Mapped, mapped_column
   from klassenzeit_backend.db.base import Base

   class Thing(Base):
       __tablename__ = "thing"
       id: Mapped[int] = mapped_column(primary_key=True)
       # ... columns ...
   ```

3. Re-export it from `backend/src/klassenzeit_backend/db/models/__init__.py`:

   ```python
   from klassenzeit_backend.db.models.thing import Thing

   __all__ = [..., "Thing"]
   ```

   **Models not re-exported are invisible to Alembic autogenerate.**
   This is a load-bearing rule — enforce it in code review.

4. Generate the migration:

   ```bash
   mise run db:revision -- -m "add thing table"
   ```

5. **Read the generated migration file.** Autogenerate is a draft, not
   a deliverable. Check that constraint names follow the convention
   (`pk_*`, `fk_*`, `ix_*`, etc.), that no incidental diffs are
   included, and that the downgrade path is correct.

6. Apply it:

   ```bash
   mise run db:migrate
   ```

7. Commit the model file and the migration together in one commit.

## Invariants

### Never edit a merged migration

Once a migration is on `master`, it is **immutable**. If a migration
has a bug, write a new corrective migration that lives on top of it.
Editing a merged migration breaks every downstream checkout whose DB
already ran the old version.

### The naming convention is load-bearing

`db/base.py` sets a `MetaData(naming_convention=...)` that gives every
constraint a deterministic name (`pk_table`, `fk_table_col_other`,
etc.). Without it, SQLAlchemy's hash-based constraint names drift
across environments and Alembic autogenerate produces spurious diffs.
**Do not remove the convention.** If you need to add a new constraint
kind, extend the dict.

### No module-level engine or session

`engine.py` exposes a `build_engine()` factory, not a global
`engine = ...`. The real engine is built in the FastAPI `lifespan`
and stashed on `app.state.engine`. This lets tests build their own
engine against `.env.test` without monkey-patching module state.

## Tests

The suite runs against a real Postgres — never a mock, never SQLite.
The `klassenzeit_test` database lives in the same Postgres instance
as `klassenzeit_dev`, created by `scripts/db-init.sh` on first boot.

`backend/tests/conftest.py` provides four fixture layers:

| Fixture | Scope | What it gives you |
|---|---|---|
| `settings` | session | `Settings` loaded from `.env.test` |
| `engine` | session | An `AsyncEngine` bound to the test DB |
| `apply_migrations` | session, autouse | Fresh schema (downgrade → upgrade) once per run |
| `db_session` | function | Per-test `AsyncSession` inside a rolled-back outer transaction |
| `client` | function | `httpx.AsyncClient` whose `get_session` is overridden to reuse `db_session` |

### When to use which fixture

- **Pure DB tests** (query a table, insert a row): use `db_session`.
- **HTTP-level integration tests** (hit an endpoint that writes to the
  DB and then assert on the DB): use `client`. It shares the same
  underlying session as `db_session`, so an API-level write and a
  follow-up query in the test see each other's state — and all of it
  rolls back at teardown.
- **Smoke tests that don't touch the DB** (e.g. the existing
  `test_health`): no fixture needed.

### How rollback isolation works

The `db_session` fixture opens a connection, begins an outer
transaction that is **never committed**, creates a session bound to
that connection, and starts a nested savepoint. A SQLAlchemy event
listener (`after_transaction_end`) immediately restarts the savepoint
whenever application code calls `session.commit()`. From the test's
point of view, commits work normally; from the outside, the outer
transaction rolls back at teardown and discards every change.

This is the canonical pattern documented in the SQLAlchemy docs under
"Joining a Session into an External Transaction (such as for test
suites)". It keeps teardown sub-millisecond and avoids the cost of
`TRUNCATE`-between-tests.

## Escape hatches

- **Raw SQL:** `session.execute(text("..."))`. Use when expressing a
  query in ORM terms would be clumsy.
- **Bypass autogenerate:** hand-write a migration file under
  `backend/alembic/versions/` with a unique revision id that points at
  the previous head. Reach for this when autogenerate can't see the
  change (e.g. data migrations, index-concurrently, custom types).
- **Direct engine access:** `request.app.state.engine` inside a route
  or `engine` fixture inside a test. Avoid unless you genuinely need
  a raw `Connection`.

## Related ADRs

- [`0003-postgres-everywhere`](../adr/0003-postgres-everywhere.md)
- [`0004-sqlalchemy-async-alembic`](../adr/0004-sqlalchemy-async-alembic.md)
- [`0005-transaction-rollback-tests`](../adr/0005-transaction-rollback-tests.md)
