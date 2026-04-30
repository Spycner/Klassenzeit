# Profile and shrink the 20-minute backend pytest CI job

**Date:** 2026-04-30
**Status:** Design approved (autopilot autonomous mode).

## Problem

PR #151 (DX/CI sprint PR-1) landed `pytest-xdist` with `-n auto --dist=worksteal` and per-worker test databases. The wall-clock target was not met: the master post-merge CI run (workflow #25146174511) took **20 m 15 s** for the `Run Python tests with coverage` step (1215.6 s wall, 329 tests, 4 workers). The xdist scaffolding was correct, but the wall-clock dropped only from ~22 min to ~21 min on representative PRs and 28 min on cold-cache master.

Local timing on the same suite (Ryzen 7 3700X, podman Postgres on the same host, `-n 4 --dist=worksteal --cov`) is **13.4 s** for 279 backend tests. CI is ~90× slower than local on identical pytest configuration.

CI dot-progress trace from #25146174511 reveals the asymmetry: 87 % of tests complete by 03:50:46 (15 s after collection); the last ~42 tests take 1196 s wall to drain. The slow tail is dominated by the seed solvability tests (`test_demo_grundschule_solvability`, `test_demo_grundschule_zweizuegig_solvability`) and the schedule-route POST tests. All of these go through `POST /api/classes/{id}/schedule`, which runs `solver_core::solve()` with a hard 200 ms LAHC wall-clock deadline.

OPEN_THINGS already documents two diagnostic conjectures from PR-1's retrospective:

- **Postgres I/O contention** ("Investigate the Postgres bottleneck"). Per-worker DBs eliminate logical contention but four pytest workers still hit one shared Postgres process. The `engine` fixture is function-scoped with `NullPool`, so every test does a fresh `asyncpg.connect()` then disposes; ~330 tests × per-test connect/disconnect against one Postgres backend serialises on connection setup and query queue.
- **Long-tail solver tests** ("Prune slowest seed solvability tests"). Each schedule POST is bounded below by the 200 ms LAHC deadline. The two seed solvability tests POST schedule for *every* class in the fixture (4 + 8 calls); the schedule-route tests POST once each (~10 calls). Total LAHC wall-time across the suite: ~10×200 ms + 4×200 ms + 8×200 ms = 4.4 s.

The LAHC contribution alone is small (4.4 s out of 1200 s) but it is the *only* component that is unavoidable wall-clock waiting. Everything else is amplifiable by removing per-test database setup overhead and reducing solver invocations.

There is no per-test duration data in any CI run today. Pytest is invoked without `--durations`, so when a tail like this slips into 20 minutes, the only signal is the wall-clock total.

## Goal

One PR that ships:

1. **Profiling visibility in CI permanently.** Add `--durations=30` to the pytest invocation so every CI run logs the 30 slowest tests. Cheap, always-on, no per-test instrumentation.
2. **Targeted fixes that shrink the slow tail.** Make the LAHC deadline configurable so tests can opt into greedy-only solves (saves the per-call 200 ms wait); prune duplicate schedule POSTs in the seed solvability tests; cache the alembic migration via a Postgres template database so workers do not each re-run downgrade/upgrade.
3. **A regression gate.** Track total pytest wall-clock against a budget file (`.test-duration-budget`) modelled on the existing `.coverage-baseline` ratchet. CI fails if the suite breaches the budget. Initial budget: 600 s (10 min). Sprint goal of "under 4 min" gets a follow-up PR after the targeted fixes have shipped and the new floor is known.

After this PR: the `Run Python tests with coverage` step is under 10 minutes on master, with per-test durations logged for every run. Future regressions are caught by the ratchet at PR time.

## Non-goals

- **Coverage-only-on-master split** (OPEN_THINGS option a). Defer until after this PR shows whether 1+2+3 alone are enough. The split is a one-line workflow change that can land separately.
- **Per-worker postgres processes** (`pytest-postgresql` / `testcontainers-python`). Real architectural fix to the documented bottleneck but a multi-PR rewrite that affects every test fixture. Out of scope.
- **Switch from NullPool function-scoped engine to session-scoped engine + TRUNCATE reset.** Same risk profile as per-worker postgres. Filed as a follow-up.
- **Move test job to self-hosted runner.** Orthogonal; separate PR.
- **Tighten the budget below 600 s in this PR.** Ratchet floor is set generously to avoid false-failing the very PR that introduces it. The next PR (or a follow-up commit on master) tightens it once the new baseline is observed.
- **Promote `SolveConfig.max_iterations` to a production knob.** Unrelated; left as the existing OPEN_THINGS deferral.

## Architecture

### Files touched

- `solver/solver-core/src/json.rs`: add `pub fn solve_json_with_config(json: &str, deadline_ms: Option<u64>) -> Result<String, Error>`. Existing `solve_json` becomes a one-line delegate over `solve_json_with_config(json, Some(200))` to preserve the production default.
- `solver/solver-py/src/lib.rs`: add `#[pyfunction] py_solve_json_with_config` that mirrors the new `solve_json_with_config` signature; existing `py_solve_json` stays as the default-deadline entry point.
- `solver/solver-py/python/klassenzeit_solver/_rust.pyi`: add the new function's stub.
- `backend/src/klassenzeit_backend/core/settings.py`: add `solve_deadline_ms: int = 200` field.
- `backend/src/klassenzeit_backend/scheduling/solver_io.py`: thread the settings value into the `solve_json` call (use `solve_json_with_config`).
- `backend/src/klassenzeit_backend/scheduling/routes/schedule.py`: pull `settings.solve_deadline_ms` from `app.state` and pass to `run_solve`.
- `backend/.env.test`: set `KZ_SOLVE_DEADLINE_MS=0` so test invocations are greedy-only.
- `backend/tests/seed/test_demo_grundschule_solvability.py`: collapse 4 schedule POSTs to 1; assert class count separately.
- `backend/tests/seed/test_demo_grundschule_zweizuegig_solvability.py`: same shape; collapse 8 to 1.
- `backend/tests/_xdist_db.py`: add `ensure_template_database_with_migrations(base_url, alembic_cwd)` and a corresponding `clone_database_from_template(template_name, target_name)` helper. The first worker creates and migrates a `klassenzeit_test_template`; subsequent workers `CREATE DATABASE ... TEMPLATE klassenzeit_test_template` (Postgres copy is milliseconds; the alembic run becomes one-shot per CI session, not one-per-worker). Behind a Postgres advisory lock so the worker race is safe.
- `backend/tests/conftest.py`: replace the per-worker `apply_migrations` subprocess call with a call to the template helper. Per-test `db_session` and `engine` fixtures are unchanged.
- `.github/workflows/ci.yml`: pytest invocation gains `--durations=30`. New step parses `(0:NN:NN)` from the result line and gates against `.test-duration-budget`.
- `.test-duration-budget`: new file at the repo root holding a single integer (seconds). Initial value: 600.
- `scripts/bench_pytest.sh`: developer-facing wrapper that runs the suite under `time` and prints the wall-clock alongside the budget for parity with CI.
- `mise.toml`: new `bench:tests` task that wraps the script.
- `docs/adr/0020-configurable-lahc-deadline.md`: ADR for the additive solver-core API surface.
- `docs/superpowers/OPEN_THINGS.md`: close items the PR resolves; open follow-ups.
- `README.md`: commands table picks up `bench:tests`.

### Data flow

```
backend test invocation (KZ_ENV=test, KZ_SOLVE_DEADLINE_MS=0)
    │
    ├── pytest collects 329 tests; xdist spawns 4 workers
    │
    ├── conftest module-load (per worker):
    │       PYTEST_XDIST_WORKER → suffix KZ_DATABASE_URL → klassenzeit_test_<wid>
    │
    ├── apply_migrations (session-scoped autouse, per worker):
    │       psycopg admin connect to the `postgres` db
    │       advisory_lock(hashtext('klassenzeit_test_template'))
    │           if template missing:
    │               CREATE DATABASE klassenzeit_test_template
    │               run alembic downgrade base + upgrade head against template
    │       advisory_unlock
    │       advisory_lock(hashtext('klassenzeit_test_<wid>'))
    │           if worker db missing:
    │               CREATE DATABASE klassenzeit_test_<wid> TEMPLATE klassenzeit_test_template
    │       advisory_unlock
    │
    ├── per-test fixtures (engine, db_session, client) unchanged
    │
    └── per request through `client`:
            schedule POST → run_solve → klassenzeit_solver.solve_json_with_config(problem, deadline_ms=0)
                                       │
                                       └── solver_core::solve_json_with_config → SolveConfig { deadline: None, .. } → greedy_only
            (200 ms LAHC wait skipped for tests; production path unchanged)
```

The advisory-lock pair makes the template creation race-safe: only the first worker actually runs alembic; the others wait on the lock, see the template exists, and proceed to clone. Postgres `CREATE DATABASE ... TEMPLATE` is a per-database file-system copy; on a small schema like ours, this is single-digit milliseconds.

### Failure handling and rollback

The template-DB approach is opportunistic: the helper falls back to the existing per-worker `alembic downgrade base + upgrade head` flow if any of the following fail:

- `CREATE DATABASE ... TEMPLATE` rejects (e.g., source database has connections, locale mismatch, permission issue).
- The advisory lock is unavailable (timeout).
- The template database exists but its schema does not match the current alembic head (caught by a HEAD-revision marker stored in a one-row `_alembic_template_marker` table inside the template).

The fallback logs `template_db.fallback` with the reason at WARNING level so the next CI run surfaces it. No revert PR needed if the path turns out to be unstable on CI.

The other three changes are independently revertable by reverting their commits:
- LAHC deadline override: defaulting `KZ_SOLVE_DEADLINE_MS` back to 200 reverts to today's behaviour.
- Seed test prune: pure test-code change; revert the file.
- `--durations=30` and the budget gate: revert the workflow lines.

### Solver-core API surface

`solve_json_with_config(problem_json, deadline_ms)` is additive. `deadline_ms = None` means "greedy-only" (LAHC skipped); `deadline_ms = Some(N)` means "run LAHC for N ms wall-clock". The existing `solve_json(problem_json)` becomes `solve_json_with_config(problem_json, Some(200))` so production callers keep their 200 ms LAHC pass without any wire change.

The Python binding mirrors the surface: `klassenzeit_solver.solve_json(problem)` → 200 ms default; `klassenzeit_solver.solve_json_with_config(problem, deadline_ms=None|int)` → explicit deadline.

ADR 0020 records this choice. Alternatives considered:

- **Settings field on the backend only.** Would force the backend to pass the deadline through every call site without exposing it to other Python callers (notebooks, scripts). Rejected: the binding is the natural place for the option, and the cost of one new function on the binding is trivial.
- **Generalise to a `SolveConfigDict` argument.** Open-ended option dict on the binding side. Rejected: today only `deadline_ms` is a useful test override; the rest of `SolveConfig` (seed, weights, max_iterations) is either not test-relevant or already filed as a deferral. Adding a kwarg per test-relevant knob is the right granularity until a second one shows up.

### Regression gate shape

`.test-duration-budget` lives at the repo root and contains a single integer (seconds). The CI step after the test run greps for the result line `=== N passed, M warnings in X.YYs (H:MM:SS) ===`, parses `X.YY` (also accepts the `(H:MM:SS)` form), and compares to the budget. If `actual > budget`, fail the step with a message similar to the coverage ratchet:

```
::error::Test wall-clock 1215s exceeds the .test-duration-budget of 600s. Investigate or update the budget.
```

The gate is a one-way ratchet only insofar as the budget file lives in version control; lowering it is a deliberate `git commit`. The first commit sets the budget at 600 s; a follow-up PR tightens once the floor is observed.

## Test plan

- **Unit (Rust).** `solve_json_with_config(problem, None)` returns greedy result; `solve_json_with_config(problem, Some(N))` runs LAHC for N ms (equivalence to existing `solve_json`).
- **Unit (solver-py).** `klassenzeit_solver.solve_json_with_config(problem, deadline_ms=0)` returns greedy result; `solve_json_with_config(problem, deadline_ms=200)` matches `solve_json(problem)` (binding-level parity).
- **Integration (backend).** Existing schedule-route tests continue to pass with `KZ_SOLVE_DEADLINE_MS=0` set in `backend/.env.test`; assertions about placement counts and violation counts are unchanged because the seeded fixtures are already greedy-feasible.
- **Integration (seed solvability).** Pruned tests still assert "zero violations on the seed". The class-count assertion stays.
- **Migration template helper.** New unit test in `tests/test_xdist_db.py`: spin up a temporary database, run `ensure_template_database_with_migrations`, then `clone_database_from_template`, assert the clone has the same alembic head as the template. Uses an actual local Postgres (the same fixture pattern as the existing `tests/test_xdist_db.py`).
- **CI ratchet.** The new "Check pytest duration budget" step succeeds at the chosen 600 s budget (current observed wall-clock is 1215 s on master, so the *first* run after this PR should still pass because the targeted fixes drop us under 600 s; if it fails, the budget gets bumped to whatever the new floor is in a follow-up commit before merging the rest).

## Out-of-band: how to verify the LAHC-deadline path is hit

A small e2e-ish manual check: with `KZ_SOLVE_DEADLINE_MS=0`, `POST /api/classes/{id}/schedule` returns in well under 200 ms (network + DB + greedy only). With `KZ_SOLVE_DEADLINE_MS=200` (production default), the response is bounded below by ~200 ms. The structured `solver.solve.done` log carries the actual `duration_ms`; the test that asserts on this log already exists (`test_schedule_post_logs_solve_start_and_done`) and continues to pass with deadline=0 because the assertion only checks for the keys, not the value range.

## Open questions

None blocking. The advisory-lock pattern is standard Postgres; the additive solver-core API is the same shape as `SolveConfig`'s introduction in PR #140 (ADR 0014). The budget number (600 s) is intentionally generous; tightening is a one-line commit.
