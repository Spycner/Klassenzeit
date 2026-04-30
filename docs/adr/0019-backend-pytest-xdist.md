# 0019: Backend pytest-xdist with per-worker test databases

- **Status:** Accepted
- **Date:** 2026-04-30

## Context

The backend CI Python-test step takes 8-12 minutes and dominates every PR's
wall time. Lint, frontend, Playwright, and Rust steps each finish in 1-2
minutes. The runner has 4 vCPU but pytest runs single-process, leaving 75%
of the CPU idle. Coverage instrumentation costs roughly 2-3x on top.

## Decision

Adopt `pytest-xdist` with `-n auto` in CI and a per-worker postgres
database (`klassenzeit_test_<worker>`). The per-worker database is created
idempotently by `backend/tests/conftest.py` on session start via a
`psycopg` admin connection to the `postgres` database. Sequential local
`mise run test:py` runs against `klassenzeit_test` exactly as before.

## Alternatives considered

- **Per-worker schema instead of per-worker database.** Schema-based isolation
  needs per-connection `SET search_path` and complicates Alembic and the few
  raw-SQL `UPDATE` paths in seed solvability tests. Rejected as more
  invasive than per-worker databases for no measurable speedup.
- **CREATE DATABASE ... TEMPLATE** to seed each worker DB from a migrated
  template rather than running migrations N times. Rejected for now: per-
  worker migration cost is 3-5 seconds and the template approach adds a
  coordinator step plus an unfamiliar Postgres feature. Revisit if
  migration latency dominates.
- **Pre-create worker DBs in the CI workflow.** Requires CI to know the
  worker count up front; xdist's `-n auto` resolves at runtime so a CI
  pre-create either guesses high or duplicates `nproc` logic. Rejected for
  the in-fixture auto-create approach which is self-contained.
- **Split coverage off into a separate master-only job.** Would let PR runs
  use bare pytest (faster). Out of scope for this ADR; revisit if `-n auto`
  alone does not bring the wall-clock under 4 min.

## Consequences

What becomes easier:

- PR turnaround drops from 8-12 min to under 4 min (on a 4-vCPU runner).
- Adding new tests no longer linearly inflates CI cost; xdist amortises.
- The CI workflow is shorter (no static `CREATE DATABASE` step).

What becomes harder:

- Tests that share state across the whole pytest session would break under
  xdist. The current suite is transaction-rollback isolated per test, so
  there is no shared state to begin with; the constraint is preserved by
  documentation only.
- Debugging a failure across workers needs a rerun under `mise run test:py`
  (sequential default).

What would make us revisit:

- Wall-clock still over 4 min after this PR ships, then split coverage off.
- Per-worker migration latency dominates, then switch to `CREATE DATABASE
  ... TEMPLATE`.
- Postgres connection cap reached on high-worker-count runners, then tune
  pool / NullPool.
