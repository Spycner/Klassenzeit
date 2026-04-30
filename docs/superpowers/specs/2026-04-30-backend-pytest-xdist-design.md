# Backend pytest-xdist parallelism with per-worker test databases

**Date:** 2026-04-30
**Status:** Design approved (autopilot autonomous mode).

## Problem

Sprint item filed in PR #150 (`docs/superpowers/OPEN_THINGS.md`, "CI / repo automation"): the backend CI Python-test step takes 8-12 minutes and dominates every PR's wall time. The rest of CI (lint, frontend, Playwright, Rust) finishes in 1-2 minutes. With pre-push hooks running the same suite locally, every push pays the cost twice.

Today:

- `mise run test:py` runs `uv run pytest` single-process against one shared test database (`klassenzeit_test`).
- The `apply_migrations` session-autouse fixture in `backend/tests/conftest.py` runs `alembic downgrade base && alembic upgrade head` once per session via subprocess, then every test rolls back inside a savepoint.
- CI's `.github/workflows/ci.yml::test` job runs `uv run pytest --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term | tee /tmp/pytest-cov.txt`, then a downstream step parses `TOTAL` for the coverage ratchet (baseline floor 80%).
- Tests are independent (transaction-rollback isolation) and the runtime cost is dominated by async DB tests plus the seed solvability tests that boot the solver per fixture. Coverage instrumentation adds ~2-3x overhead on top.

The CPU is largely idle during the test step: the GitHub-hosted `ubuntu-latest` runner has 4 vCPU and we use 1.

OPEN_THINGS lists four candidate fixes in priority order: (a) parallelise pytest with `pytest-xdist` plus per-worker test schemas; (b) split coverage off into a separate job that runs only on `master`; (c) prune the slowest seed solvability tests; (d) precompile `solver-py` once per workflow. This PR ships (a).

## Goal

One PR that lands `pytest-xdist` parallelism in CI and brings the backend test step under 4 minutes:

1. Add `pytest-xdist` to `backend/pyproject.toml` `[dependency-groups].dev` via `uv add --dev pytest-xdist`.
2. Teach `backend/tests/conftest.py` to derive a per-worker test database name from `PYTEST_XDIST_WORKER`. When the env var is unset or `master`, use `klassenzeit_test` (today's behaviour). When set to `gw0`, `gw1`, ..., suffix it (e.g., `klassenzeit_test_gw0`).
3. The `apply_migrations` fixture auto-creates the per-worker database via a side-channel `psycopg` admin connection before running the alembic downgrade/upgrade pair. Per-worker DBs are created idempotently (`SELECT 1 FROM pg_database WHERE datname = ...` then `CREATE DATABASE ... OWNER klassenzeit`).
4. Update `.github/workflows/ci.yml` to invoke `uv run pytest -n auto --cov=...` instead of single-process. Drop the static `psql ... CREATE DATABASE klassenzeit_test` step (now handled by the conftest auto-create path).
5. Add a `mise run test:py:parallel` task for parity with the CI invocation; keep `mise run test:py` sequential for clean stdout and pdb-friendliness.
6. Coverage ratchet stays as-is: `pytest-cov` natively combines per-worker `.coverage.<worker>` files in the master process and emits the `TOTAL` line the existing CI step parses.
7. Sprint bookkeeping inside the same PR's docs commit: move solver-quality sprint to "completed sprints" in `OPEN_THINGS.md`; open a new "Active sprint: DX / CI infra hardening" section with PR-1 (this), and tier the remaining DX/CI items as P1/P2.

After this PR: backend CI test step on a representative master push completes in under 4 minutes (target ≥2x speedup on a 4-vCPU runner). Local `mise run test:py` is unchanged. Coverage measurement and ratcheting work without rewrites.

## Non-goals

- **Coverage split (OPEN_THINGS option b).** PR runs continue to measure coverage. If parallelism alone does not bring the wall-clock under 4 min on a representative PR, file the split as a follow-up; the parallelism PR is the lower-risk first step and does not preclude the split.
- **Per-worker schemas (instead of per-worker databases).** Schema-based isolation needs a per-connection `SET search_path` and complicates Alembic. Database-based isolation is simpler and Postgres handles N=4 databases without strain. If migration-per-worker latency becomes the bottleneck (it is currently 3-5 seconds), revisit with a `CREATE DATABASE ... TEMPLATE` approach.
- **Solver test pruning (option c).** Seed solvability tests boot the solver per fixture; that is the point. Don't prune what xdist parallelises away.
- **Solver-py precompile (option d).** `mise run solver:rebuild` cost is paid once per workflow on a cold venv; xdist does not change that.
- **Local default to parallel.** Sequential is the dev default for clean output and easier debugging. The opt-in `mise run test:py:parallel` task is for developers who want to mirror CI.
- **Worker count tuning beyond `-n auto`.** Adapts to runner spec; revisit only if xdist scheduling overhead dominates at high worker counts on future runners.

## Architecture

### Files touched

- `backend/pyproject.toml`: add `pytest-xdist` to `[dependency-groups].dev`.
- `uv.lock`: regenerated by `uv add`.
- `backend/tests/conftest.py`: top-level worker-suffix env mutation; `apply_migrations` fixture gains a `_ensure_worker_database_exists` step.
- `.github/workflows/ci.yml`: `pytest -n auto` invocation, drop static `CREATE DATABASE`.
- `mise.toml`: new `test:py:parallel` task.
- `docs/superpowers/OPEN_THINGS.md`: sprint close + open.
- `docs/adr/0019-backend-pytest-xdist.md`: load-bearing decisions.
- `README.md`: commands table picks up the new task.

### Data flow

```
pytest invocation (CI: -n auto, local: no flag)
    │
    ├── master (no xdist OR -n 0): conftest sees PYTEST_XDIST_WORKER unset
    │       ↓
    │   uses klassenzeit_test (today's behaviour)
    │
    └── -n auto: spawns N worker processes
            ↓
        each worker re-imports conftest.py, sees PYTEST_XDIST_WORKER=gwN
            ↓
        os.environ["KZ_DATABASE_URL"] suffixed to klassenzeit_test_gwN
            ↓
        Settings() picks up the suffixed URL via pydantic-settings env precedence
            ↓
        apply_migrations: open psycopg admin connection to the postgres DB,
                          CREATE DATABASE klassenzeit_test_gwN if missing
            ↓
        subprocess alembic downgrade base && upgrade head against suffixed URL
            ↓
        engine, db_session, client fixtures all bind to the suffixed URL
            ↓
        tests run independently; pytest-cov writes .coverage.gwN
            ↓
        master collects, combines, prints TOTAL line
            ↓
        CI ratchet step parses TOTAL, applies floor + baseline check
```

### Worker-suffix mutation

At conftest module load, after the existing `os.environ.setdefault("KZ_ENV", "test")`:

```python
_worker = os.environ.get("PYTEST_XDIST_WORKER", "master")
if _worker != "master":
    _base_url = "postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_test"
    os.environ["KZ_DATABASE_URL"] = f"{_base_url}_{_worker}"
```

The base URL is hardcoded to mirror `backend/.env.test`. Settings construction reads this via env-var precedence, so the dotenv value is shadowed only when `PYTEST_XDIST_WORKER` is set. Subprocess alembic inherits the mutated env.

### Per-worker DB auto-create

A new helper inside `conftest.py`:

```python
def _ensure_worker_database_exists(settings: Settings) -> None:
    """Idempotently create the per-worker test database."""
    target = _parse_db_name(settings.database_url)  # e.g., klassenzeit_test_gw0
    admin_url = _admin_url_for(settings.database_url)  # same URL, /postgres dbname
    import psycopg
    with psycopg.connect(admin_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target,))
            if cur.fetchone() is None:
                cur.execute(f'CREATE DATABASE "{target}" OWNER klassenzeit')
```

Called from inside `apply_migrations` before the downgrade/upgrade pair. `psycopg[binary]` is already a backend dep.

### CI workflow

The current `.github/workflows/ci.yml::test` job has a step `Create klassenzeit_test database` that issues a static `CREATE DATABASE`. Drop that step (the conftest auto-create path handles `master` and per-worker DBs uniformly). Update the pytest invocation:

```yaml
- name: Run Python tests with coverage
  run: |
    uv run pytest -n auto --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term | tee /tmp/pytest-cov.txt
```

The downstream "Check Python coverage ratchet" step is unchanged.

### Mise task

```toml
[tasks."test:py:parallel"]
description = "Run Python tests in parallel (mirrors the CI invocation)"
run = "uv run pytest -n auto"
```

`mise run test:py` stays as-is.

## Testing

- **Unit-test additions: none.** The conftest changes are exercised end-to-end by every existing test.
- **Manual verification before push:**
  - `mise run test:py` (sequential) — passes; uses `klassenzeit_test`.
  - `uv run pytest -n auto` locally — passes; spawns workers, each gets its own DB.
  - `psql -U klassenzeit -d postgres -c '\l klassenzeit_test_gw*'` — confirms per-worker DBs exist post-run.
- **CI verification:** the PR run is the verification — green on `pytest -n auto` confirms the path. Wall-clock comparison against the prior master run on the same workflow file confirms the speedup.

## Risks

- **Postgres connection cap.** Default `max_connections = 100`. Steady-state usage with N=4 workers, NullPool, function-scoped engine: ~1 connection per active test, plus admin connection for the auto-create (closed after use). Well under cap.
- **xdist + pytest-asyncio.** `asyncio_default_fixture_loop_scope = "function"` (root `pyproject.toml`) means each test owns its event loop. xdist workers each have their own master loop; per-test loops are confined inside that. No cross-worker event-loop interference.
- **Module-level counters.** `_subject_counter`, `_room_counter`, etc. in `backend/tests/scheduling/conftest.py` are per-process. Per-worker DBs guarantee no cross-worker name collisions. No issue.
- **Stale per-worker DBs.** A worker death between runs leaves its DB intact. Next session's downgrade/upgrade resets schema; CI runner is ephemeral so DBs vanish anyway. Local dev: harmless.
- **xdist scheduling overhead.** At very low test counts the coordination cost can outweigh parallelism wins. Our suite is 33+ test files with multi-second async tests; the breakeven is well below our scale.
- **Coverage combine race.** pytest-cov writes per-worker files via process-safe atomic renames; combine runs once in master after collection. No race.

## Sprint bookkeeping

This PR is PR-1 of the new "DX / CI infra hardening" sprint. Inside the same PR's docs commit:

1. Move the solver-quality sprint section in `docs/superpowers/OPEN_THINGS.md` to "Completed sprints" (a new top-level section above "Acknowledged deferrals", or appended after "Prototype sprint (shipped 2026-04-24)").
2. Open a new "Active sprint: DX / CI infra hardening" section with the goal "graduate CI from 8-12 min PR turnaround to under 4 min, and close drift-check + locale-pin tidy debts while in the neighbourhood." Tiered items:
   - PR-1: this PR (P0).
   - PR-2: drift-check mode for `repo:apply-settings` (P1, OPEN_THINGS entry).
   - PR-3: pin Playwright locale explicitly (P1, OPEN_THINGS testing-section entry).
   - Deferred: structured-logging follow-ups (already filed, P2 for this sprint).
3. Refresh the auto-memory `project_roadmap_status.md` to point at the new sprint.

ADR 0019 records the load-bearing decisions (per-worker DB over per-worker schema, `-n auto` over fixed worker count, conftest-auto-create over CI-pre-create, sequential local default).
