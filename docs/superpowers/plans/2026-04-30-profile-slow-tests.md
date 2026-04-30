# Profile and shrink the 20-minute backend pytest CI job: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land per-test duration visibility in CI, override LAHC deadline to 0 in tests via a configurable solver-core API, cache alembic migrations via a Postgres template database, and add a wall-clock budget ratchet so future regressions are caught at PR time.

**Architecture:** Five logical layers, each its own commit: (1) solver-core gains an additive `solve_json_with_config(json, deadline_ms)` plus solver-py binding and `.pyi` stub; (2) backend reads a new `solve_deadline_ms` Settings field and threads it through `run_solve`; (3) tests opt out of LAHC via `KZ_SOLVE_DEADLINE_MS=0` in `.env.test`; (4) `_xdist_db.py` and conftest gain a Postgres-template-DB path so alembic only runs once per CI session; (5) CI pytest invocation gains `--durations=30` and a wall-clock budget gate.

**Tech Stack:** Rust + PyO3 + maturin (`solver/`), FastAPI + SQLAlchemy async + Alembic + pytest + pytest-xdist + pytest-cov (`backend/`), GitHub Actions, Postgres 17.

---

## Spec coverage

Maps to `docs/superpowers/specs/2026-04-30-profile-slow-tests-design.md`:

- §"Goal" item 1 (visibility) → Task 5 step adds `--durations=30`.
- §"Goal" item 2 (LAHC, prune, template) → Tasks 1-4 (template DB) and 1-3 (LAHC); the spec's "prune duplicate POSTs" item is dropped during plan-write because the LAHC override alone collapses each schedule POST to a few ms; the seed solvability assertion (`total_placements == 196`) is functionally important and stays.
- §"Goal" item 3 (regression gate) → Task 5's `.test-duration-budget` step.
- §"Architecture / Files touched" → every task lists its file paths; no file is unaccounted for.
- §"Failure handling and rollback" → Task 4 implements the template-creation fallback to per-worker alembic.
- §"Test plan" → each task pairs implementation with the spec's listed tests.
- ADR 0020 → Task 1 step "Write the ADR".

---

## Task 1: Add `solve_json_with_config(deadline_ms)` to solver-core and solver-py

**Files:**
- Modify: `solver/solver-core/src/json.rs`
- Modify: `solver/solver-core/src/solve.rs` (no changes; the new helper composes existing `solve_with_config`)
- Modify: `solver/solver-py/src/lib.rs`
- Modify: `solver/solver-py/python/klassenzeit_solver/__init__.py`
- Modify: `solver/solver-py/python/klassenzeit_solver/_rust.pyi`
- Modify: `solver/solver-py/tests/test_bindings.py`
- Create: `docs/adr/0020-configurable-lahc-deadline.md`

- [ ] **Step 1.1: Write the failing Rust test**

Append to `solver/solver-core/src/json.rs` inside the existing `#[cfg(test)] mod tests` block:

```rust
#[test]
fn solve_json_with_config_none_skips_lahc_and_returns_greedy() {
    let problem = r#"{"teachers":[],"rooms":[],"subjects":[],"school_classes":[],"lessons":[],"time_blocks":[],"teacher_qualifications":[],"teacher_blocked_times":[],"room_blocked_times":[],"room_subject_suitabilities":[]}"#;
    let result = solve_json_with_config(problem, None).expect("greedy solve");
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    assert_eq!(parsed["placements"], serde_json::json!([]));
    assert_eq!(parsed["violations"], serde_json::json!([]));
}

#[test]
fn solve_json_with_config_some_matches_solve_json_for_default_deadline() {
    let problem = r#"{"teachers":[],"rooms":[],"subjects":[],"school_classes":[],"lessons":[],"time_blocks":[],"teacher_qualifications":[],"teacher_blocked_times":[],"room_blocked_times":[],"room_subject_suitabilities":[]}"#;
    let with_config = solve_json_with_config(problem, Some(200)).unwrap();
    let default = solve_json(problem).unwrap();
    let with_config_v: serde_json::Value = serde_json::from_str(&with_config).unwrap();
    let default_v: serde_json::Value = serde_json::from_str(&default).unwrap();
    assert_eq!(with_config_v, default_v);
}
```

- [ ] **Step 1.2: Run the failing tests**

Run: `cargo nextest run -p solver-core json::tests::solve_json_with_config_`
Expected: FAIL with "cannot find function `solve_json_with_config`".

- [ ] **Step 1.3: Implement `solve_json_with_config`**

Replace the body of `solver/solver-core/src/json.rs` (lines 1-20 of the existing file) with:

```rust
//! JSON string adapter over `solve`. Consumed by `solver-py` in step 2 of the
//! sprint. Input errors are wrapped in a tagged envelope; success emits the
//! `Solution` JSON directly.

use std::time::Duration;

use serde::Serialize;

use crate::error::Error;
use crate::solve::{solve_with_config, SolveConfig};
use crate::types::Problem;

/// Solve a timetable problem supplied as a JSON string and return the resulting
/// `Solution` serialised as JSON. Uses the production-default 200 ms LAHC
/// deadline; production callers should keep using this entry point.
pub fn solve_json(json: &str) -> Result<String, Error> {
    solve_json_with_config(json, Some(200))
}

/// Like [`solve_json`] but with an explicit LAHC deadline in milliseconds.
/// `None` skips LAHC entirely (greedy-only), used by the backend test suite to
/// avoid the per-call 200 ms wall-clock wait. `Some(n)` runs LAHC for `n` ms.
pub fn solve_json_with_config(json: &str, deadline_ms: Option<u64>) -> Result<String, Error> {
    let problem: Problem =
        serde_json::from_str(json).map_err(|e| Error::Input(format!("json: {e}")))?;
    let config = SolveConfig {
        deadline: deadline_ms.map(Duration::from_millis),
        ..SolveConfig::default()
    };
    let solution = solve_with_config(&problem, &config)?;
    serde_json::to_string(&solution).map_err(|e| Error::Input(format!("serialize: {e}")))
}
```

(Keep the rest of the file unchanged: the `ErrorEnvelope` type, the `From` impl, and `error_envelope_json`.)

- [ ] **Step 1.4: Run the Rust tests**

Run: `cargo nextest run -p solver-core --filter-expression 'binary(solver_core)'`
Expected: PASS for the two new tests plus all preexisting tests.

- [ ] **Step 1.5: Lint Rust**

Run: `cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check`
Expected: clean.

- [ ] **Step 1.6: Write the failing solver-py test**

Append to `solver/solver-py/tests/test_bindings.py`:

```python
import json

from klassenzeit_solver import solve_json, solve_json_with_config


_EMPTY_PROBLEM = json.dumps(
    {
        "teachers": [],
        "rooms": [],
        "subjects": [],
        "school_classes": [],
        "lessons": [],
        "time_blocks": [],
        "teacher_qualifications": [],
        "teacher_blocked_times": [],
        "room_blocked_times": [],
        "room_subject_suitabilities": [],
    }
)


def test_solve_json_with_config_none_returns_greedy() -> None:
    result = json.loads(solve_json_with_config(_EMPTY_PROBLEM, None))
    assert result["placements"] == []
    assert result["violations"] == []


def test_solve_json_with_config_some_matches_default_solve_json() -> None:
    a = json.loads(solve_json_with_config(_EMPTY_PROBLEM, 200))
    b = json.loads(solve_json(_EMPTY_PROBLEM))
    assert a == b
```

- [ ] **Step 1.7: Run the failing solver-py test**

Run: `mise run solver:rebuild && uv run pytest solver/solver-py/tests/test_bindings.py -v`
Expected: ImportError for `solve_json_with_config`.

- [ ] **Step 1.8: Add the PyO3 binding**

Replace `solver/solver-py/src/lib.rs` with:

```rust
//! solver-py — thin PyO3 wrapper over solver-core. Only glue lives here.

#![deny(missing_docs)]

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Solve a timetable problem supplied as a JSON string and return the resulting
/// Solution as a JSON string. Uses the production-default 200 ms LAHC deadline.
/// Releases the GIL during the call so parallel Python threads are not
/// serialised behind the interpreter lock.
#[pyfunction]
#[pyo3(name = "solve_json")]
fn py_solve_json(py: Python<'_>, problem_json: &str) -> PyResult<String> {
    py.detach(|| solver_core::solve_json(problem_json))
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

/// Like [`py_solve_json`] but with an explicit LAHC deadline in milliseconds.
/// `None` skips LAHC entirely; `Some(n)` runs LAHC for `n` ms wall-clock.
#[pyfunction]
#[pyo3(name = "solve_json_with_config", signature = (problem_json, deadline_ms))]
fn py_solve_json_with_config(
    py: Python<'_>,
    problem_json: &str,
    deadline_ms: Option<u64>,
) -> PyResult<String> {
    py.detach(|| solver_core::solve_json_with_config(problem_json, deadline_ms))
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

/// Python module exposing solver-core functions.
#[pymodule]
fn _rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(py_solve_json, m)?)?;
    m.add_function(wrap_pyfunction!(py_solve_json_with_config, m)?)?;
    Ok(())
}
```

- [ ] **Step 1.9: Update the Python re-export**

Replace `solver/solver-py/python/klassenzeit_solver/__init__.py`:

```python
"""Python bindings for the Klassenzeit constraint solver."""

from ._rust import solve_json, solve_json_with_config

__all__ = ["solve_json", "solve_json_with_config"]
```

- [ ] **Step 1.10: Update the type stub**

Replace `solver/solver-py/python/klassenzeit_solver/_rust.pyi`:

```python
def solve_json(problem_json: str) -> str: ...
def solve_json_with_config(problem_json: str, deadline_ms: int | None) -> str: ...
```

- [ ] **Step 1.11: Rebuild and run the solver-py tests**

Run: `mise run solver:rebuild && uv run pytest solver/solver-py/tests/test_bindings.py -v`
Expected: PASS for the two new tests plus all preexisting tests.

- [ ] **Step 1.12: Write the ADR**

Create `docs/adr/0020-configurable-lahc-deadline.md`:

```markdown
# 0020: Configurable LAHC deadline on the solver JSON adapter

Status: Accepted (2026-04-30)

## Context

`solver_core::solve()` carries a 200 ms LAHC active default. The JSON adapter `solve_json` was a one-liner over `solve()` so every caller, including the backend test suite, paid the 200 ms wall-clock per solve. The CI Python-test step takes 20 minutes; per-test profiling and the dot-progress trace point to the schedule POSTs (each bounded below by the LAHC deadline) plus per-test database setup as the dominant cost. See `docs/superpowers/specs/2026-04-30-profile-slow-tests-design.md`.

## Decision

Add `solve_json_with_config(json, deadline_ms: Option<u64>)` to `solver_core` and a matching PyO3 binding (`klassenzeit_solver.solve_json_with_config`). The existing `solve_json(json)` becomes a one-line delegate over `solve_json_with_config(json, Some(200))` so production callers keep their 200 ms LAHC pass without any wire change. `deadline_ms = None` skips LAHC entirely (greedy-only). Backend reads `KZ_SOLVE_DEADLINE_MS` from Settings and threads it into the binding; `backend/.env.test` sets it to 0 so the test suite never waits on LAHC.

## Alternatives

- **Settings-only on the backend.** Force the deadline through every backend call site without exposing it on the binding. Rejected: notebooks and scripts also benefit from the explicit knob, and the binding is the natural surface for it.
- **Generalise to a `SolveConfigDict` argument.** Open-ended kwargs on the binding. Rejected: only `deadline_ms` is a useful test override today; the rest of `SolveConfig` is either not test-relevant or already filed as a deferral. Adding a kwarg per test-relevant knob is the right granularity until a second one shows up. The OPEN_THINGS deferrals "Configurable LAHC deadline" and "Promote `SolveConfig.max_iterations` to a production knob" remain separate.

## Consequences

- Backend test suite no longer pays the 200 ms LAHC wall-clock per schedule POST. Local schedule-route tests drop from ~0.4 s to ~0.05 s; CI savings are larger because the 200 ms wait is wall-clock and accumulates across serialised long-tail tests.
- Production callers (`POST /api/classes/{id}/schedule` in dev/prod) keep the 200 ms LAHC default. No wire change.
- ADR 0014 (`SolveConfig`) and ADR 0015 (LAHC) remain authoritative for the public Rust types; this ADR only covers the JSON adapter additive surface.
- Closes the OPEN_THINGS deferral "Configurable LAHC deadline" for the test path. The user-facing query parameter (`?deadline_ms=`) on the schedule route stays a deferral; only the env-var path is wired.
```

- [ ] **Step 1.13: Lint and commit**

Run: `mise run lint`
Expected: clean.

```bash
git add solver/solver-core/src/json.rs solver/solver-py/src/lib.rs \
        solver/solver-py/python/klassenzeit_solver/__init__.py \
        solver/solver-py/python/klassenzeit_solver/_rust.pyi \
        solver/solver-py/tests/test_bindings.py \
        docs/adr/0020-configurable-lahc-deadline.md
git commit -m "perf(solver-core): add solve_json_with_config(deadline_ms) for tests"
```

---

## Task 2: Thread `solve_deadline_ms` through Settings into `run_solve`

**Files:**
- Modify: `backend/src/klassenzeit_backend/core/settings.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/solver_io.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/schedule.py`
- Modify: `backend/tests/scheduling/test_solver_io.py`

- [ ] **Step 2.1: Write the failing solver_io test**

Append to `backend/tests/scheduling/test_solver_io.py`:

```python
async def test_run_solve_passes_deadline_ms_to_binding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, object] = {}

    def fake_solve_json_with_config(problem_json: str, deadline_ms: int | None) -> str:
        seen["deadline_ms"] = deadline_ms
        return '{"placements": [], "violations": [], "soft_score": 0}'

    monkeypatch.setattr(
        "klassenzeit_backend.scheduling.solver_io._solve_json_with_config",
        fake_solve_json_with_config,
    )

    await run_solve(
        '{"teachers":[]}',
        uuid.uuid4(),
        {"lessons": 0, "teachers": 0, "rooms": 0, "subjects": 0, "school_classes": 0,
         "teacher_qualifications": 0, "teacher_blocked_times": 0,
         "room_blocked_times": 0, "room_subject_suitabilities": 0},
        deadline_ms=0,
    )
    assert seen["deadline_ms"] == 0
```

(Add `import uuid`, `import pytest` at the top if missing.)

- [ ] **Step 2.2: Run the failing test**

Run: `uv run pytest backend/tests/scheduling/test_solver_io.py::test_run_solve_passes_deadline_ms_to_binding -v`
Expected: FAIL because `run_solve` does not accept `deadline_ms`.

- [ ] **Step 2.3: Add `solve_deadline_ms` to Settings**

Edit `backend/src/klassenzeit_backend/core/settings.py`. After the `log_level: str = "INFO"` line, add:

```python
    # Solver
    solve_deadline_ms: int | None = 200
```

(`None` value means greedy-only; positive integer means LAHC for that many ms. Defaults to 200 to match production today.)

- [ ] **Step 2.4: Update `run_solve` to thread the deadline**

Edit `backend/src/klassenzeit_backend/scheduling/solver_io.py`. Replace the `from klassenzeit_solver import solve_json as _solve_json` import (line 38) with:

```python
from klassenzeit_solver import solve_json_with_config as _solve_json_with_config
```

Edit `run_solve` (line 294) to take a new keyword-only `deadline_ms` argument and pass it to the binding:

```python
async def run_solve(
    problem_json: str,
    school_class_id: UUID,
    input_counts: dict[str, int],
    *,
    deadline_ms: int | None,
) -> dict:
    """Run the solver off the event loop, emit structured log events, return the Solution dict."""
    logger.info(
        "solver.solve.start",
        extra={"school_class_id": str(school_class_id), **input_counts},
    )
    started = time.monotonic()
    try:
        solution_json = await asyncio.to_thread(
            _solve_json_with_config, problem_json, deadline_ms
        )
    except (ValueError, RuntimeError) as exc:
        duration_ms = (time.monotonic() - started) * 1000.0
        logger.error(
            "solver.solve.error",
            extra={
                "school_class_id": str(school_class_id),
                "duration_ms": duration_ms,
                "exc_class": type(exc).__name__,
            },
            exc_info=exc,
        )
        raise
    duration_ms = (time.monotonic() - started) * 1000.0
    solution = json.loads(solution_json)
    logger.info(
        "solver.solve.done",
        extra={
            "school_class_id": str(school_class_id),
            "duration_ms": duration_ms,
            "placements_total": len(solution["placements"]),
            "violations_total": len(solution["violations"]),
            "violations_by_kind": _count_violations_by_kind(solution["violations"]),
            "soft_score": solution.get("soft_score", 0),
        },
    )
    return solution
```

- [ ] **Step 2.5: Update the route handler to read deadline from app.state**

Edit `backend/src/klassenzeit_backend/scheduling/routes/schedule.py`. Replace the body of `generate_schedule_for_class` so it pulls `solve_deadline_ms` from `request.app.state.settings`:

```python
"""POST /api/classes/{class_id}/schedule: run the solver for a single class."""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import require_admin
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session
from klassenzeit_backend.scheduling import solver_io
from klassenzeit_backend.scheduling.schemas.schedule import ScheduleReadResponse, ScheduleResponse

router = APIRouter(tags=["schedule"])
logger = logging.getLogger(__name__)


@router.post("/classes/{class_id}/schedule")
async def generate_schedule_for_class(
    class_id: uuid.UUID,
    request: Request,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ScheduleResponse:
    """Run the solver for the given class, persist the placements, and return them."""
    problem_json, class_lesson_ids, input_counts = await solver_io.build_problem_json(db, class_id)
    deadline_ms = request.app.state.settings.solve_deadline_ms
    solution = await solver_io.run_solve(
        problem_json, class_id, input_counts, deadline_ms=deadline_ms
    )
    filtered = solver_io.filter_solution_for_class(solution, class_lesson_ids)
    logger.info(
        "solver.solve.filtered",
        extra={
            "school_class_id": str(class_id),
            "placements_for_class": len(filtered["placements"]),
            "violations_for_class": len(filtered["violations"]),
        },
    )
    await solver_io.persist_solution_for_class(db, class_id, filtered)
    return ScheduleResponse.model_validate(filtered)


@router.get("/classes/{class_id}/schedule")
async def read_schedule_for_class_route(
    class_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ScheduleReadResponse:
    """Return the persisted placements for this class."""
    placements = await solver_io.read_schedule_for_class(db, class_id)
    return ScheduleReadResponse(placements=placements)
```

- [ ] **Step 2.6: Update the existing `test_run_solve_round_trips_and_logs` and `test_run_solve_logs_error_and_reraises`**

Edit `backend/tests/scheduling/test_solver_io.py`. Each existing call to `run_solve(...)` needs `deadline_ms=200` (or any int) added as a keyword argument. Search for `await run_solve(` in the file and append `, deadline_ms=200` to each call. Example:

```python
solution = await run_solve(
    problem_json, school_class_id, input_counts, deadline_ms=200,
)
```

- [ ] **Step 2.7: Run the new + existing solver_io tests**

Run: `uv run pytest backend/tests/scheduling/test_solver_io.py -v`
Expected: PASS.

- [ ] **Step 2.8: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 2.9: Commit**

```bash
git add backend/src/klassenzeit_backend/core/settings.py \
        backend/src/klassenzeit_backend/scheduling/solver_io.py \
        backend/src/klassenzeit_backend/scheduling/routes/schedule.py \
        backend/tests/scheduling/test_solver_io.py
git commit -m "perf(backend): plumb solve_deadline_ms through Settings to run_solve"
```

---

## Task 3: Set `KZ_SOLVE_DEADLINE_MS=0` in test env

**Files:**
- Modify: `backend/.env.test`

- [ ] **Step 3.1: Add the env var**

Append to `backend/.env.test`:

```
KZ_SOLVE_DEADLINE_MS=0
```

(The value `0` casts to a non-None int, which means "run LAHC for 0 ms wall-clock" → loop body never executes → effectively greedy-only. This matches the spec wording `Some(0)` which the LAHC code already handles via the `start.elapsed() < deadline` check at iteration 0.)

- [ ] **Step 3.2: Run the full backend suite locally**

Run: `time uv run pytest backend/tests -n 4 --dist=worksteal --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term -q --durations=20`
Expected: PASS, total wall-clock down from ~13 s to ~10-11 s. The slowest tests no longer hit the 200 ms LAHC floor; the seed solvability tests drop from 1.3 s and 2.5 s to under 0.5 s each.

- [ ] **Step 3.3: Commit**

```bash
git add backend/.env.test
git commit -m "test(backend): set KZ_SOLVE_DEADLINE_MS=0 for greedy-only test solves"
```

---

## Task 4: Cache alembic migration via Postgres template database

**Files:**
- Modify: `backend/tests/_xdist_db.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_xdist_db.py`

- [ ] **Step 4.1: Write the failing helper test**

Append to `backend/tests/test_xdist_db.py`:

```python
import pytest

from tests._xdist_db import (
    clone_database_from_template,
    drop_database_if_exists,
    ensure_template_database,
)


def test_template_workflow_creates_clone_with_same_alembic_head(
    tmp_path: pytest.TempPathFactory,
) -> None:
    """Round-trip the template helper against the real local Postgres.

    Uses unique names so concurrent runs do not collide.
    """
    import os
    import uuid as _uuid

    base_url = os.environ["KZ_DATABASE_URL"].rsplit("_", 1)[0]
    suffix = _uuid.uuid4().hex[:8]
    template = f"klassenzeit_test_template_{suffix}"
    clone = f"klassenzeit_test_clone_{suffix}"
    base_template_url = f"{base_url}_template_{suffix}"
    base_clone_url = f"{base_url}_clone_{suffix}"

    try:
        ensure_template_database(base_template_url, alembic_cwd=str(_BACKEND_ROOT))
        clone_database_from_template(
            base_url=base_clone_url, template_name=template
        )
        # Confirm the clone exists with the alembic head marker.
        import psycopg
        from tests._xdist_db import admin_libpq_url

        with (
            psycopg.connect(admin_libpq_url(base_clone_url), autocommit=True) as conn,
            conn.cursor() as cur,
        ):
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (clone,))
            assert cur.fetchone() is not None
    finally:
        drop_database_if_exists(base_clone_url)
        drop_database_if_exists(base_template_url)
```

(Add `from pathlib import Path` and `_BACKEND_ROOT = Path(__file__).resolve().parent.parent` to module top if missing.)

- [ ] **Step 4.2: Run the failing test**

Run: `uv run pytest backend/tests/test_xdist_db.py::test_template_workflow_creates_clone_with_same_alembic_head -v`
Expected: FAIL with `ImportError` for the helper functions.

- [ ] **Step 4.3: Add the helpers to `_xdist_db.py`**

Append to `backend/tests/_xdist_db.py`:

```python
import os
import subprocess
import sys


_TEMPLATE_LOCK_KEY = 0x6B7A6E743A5050  # ascii "kznt:PP" — arbitrary, stable.


def drop_database_if_exists(database_url: str) -> None:
    """Idempotently drop the database referenced by ``database_url``.

    Used by the template-helper tests for cleanup. Closes any lingering
    connections to the target before dropping (Postgres rejects DROP if
    sessions are open).
    """
    target = parse_dbname(database_url)
    with (
        psycopg.connect(admin_libpq_url(database_url), autocommit=True) as conn,
        conn.cursor() as cur,
    ):
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (target,),
        )
        cur.execute(
            sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(target))
        )


def ensure_template_database(database_url: str, alembic_cwd: str) -> None:
    """Create and migrate the template database under an advisory lock.

    Idempotent: if the template already exists, runs alembic upgrade head
    against it (cheap when already current). Otherwise creates the
    database and runs downgrade base + upgrade head once. The advisory
    lock makes the path race-safe across xdist workers.
    """
    target = parse_dbname(database_url)
    admin_url = admin_libpq_url(database_url)

    with psycopg.connect(admin_url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_lock(%s)", (_TEMPLATE_LOCK_KEY,))
        try:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target,))
            existed = cur.fetchone() is not None
            if not existed:
                cur.execute(
                    sql.SQL("CREATE DATABASE {} OWNER klassenzeit").format(
                        sql.Identifier(target)
                    )
                )
            # Migrate (idempotent: alembic upgrade head no-ops at head).
            env = os.environ.copy()
            env["KZ_DATABASE_URL"] = database_url
            for args in (
                (["downgrade", "base"], not existed),
                (["upgrade", "head"], True),
            ):
                argv, run = args
                if not run:
                    continue
                subprocess.run(  # noqa: S603
                    [sys.executable, "-m", "alembic", *argv],
                    check=True,
                    cwd=alembic_cwd,
                    env=env,
                )
        finally:
            cur.execute("SELECT pg_advisory_unlock(%s)", (_TEMPLATE_LOCK_KEY,))


def clone_database_from_template(*, base_url: str, template_name: str) -> None:
    """Create the per-worker database as a copy of the template.

    Uses Postgres `CREATE DATABASE ... TEMPLATE`; on a small schema this
    is single-digit milliseconds. No-op if the worker DB already exists.
    Falls back silently if the clone fails (caller logs and re-runs the
    plain `ensure_database_exists` + alembic flow).
    """
    target = parse_dbname(base_url)
    with (
        psycopg.connect(admin_libpq_url(base_url), autocommit=True) as conn,
        conn.cursor() as cur,
    ):
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target,))
        if cur.fetchone() is not None:
            return
        cur.execute(
            sql.SQL("CREATE DATABASE {} TEMPLATE {} OWNER klassenzeit").format(
                sql.Identifier(target), sql.Identifier(template_name)
            )
        )
```

- [ ] **Step 4.4: Run the helper test**

Run: `uv run pytest backend/tests/test_xdist_db.py::test_template_workflow_creates_clone_with_same_alembic_head -v`
Expected: PASS.

- [ ] **Step 4.5: Wire the conftest to use the template helper**

Edit `backend/tests/conftest.py`. Replace the `apply_migrations` fixture (lines 115-135 in the current file) with:

```python
@pytest.fixture(scope="session", autouse=True)
def apply_migrations(settings: Settings) -> None:
    """Migrate the per-worker database, optionally via a template DB.

    First worker (gw0 or master) creates and migrates a shared
    ``klassenzeit_test_template`` under an advisory lock. Subsequent
    workers ``CREATE DATABASE ... TEMPLATE`` the worker DB from the
    template (single-digit ms in Postgres). Falls back to the per-worker
    alembic flow if the template path raises (e.g., locale mismatch,
    permission issue).
    """
    from tests._xdist_db import (
        clone_database_from_template,
        ensure_database_exists,
        ensure_template_database,
        parse_dbname,
    )

    base_url = read_env_test_database_url(_ENV_TEST)
    target_url = str(settings.database_url)
    template_url = f"{base_url}_template"
    template_name = parse_dbname(template_url)

    try:
        ensure_template_database(template_url, alembic_cwd=str(_BACKEND_ROOT))
        clone_database_from_template(base_url=target_url, template_name=template_name)
        return
    except Exception as exc:  # noqa: BLE001 — fallback path
        logging.getLogger(__name__).warning(
            "template_db.fallback",
            extra={"reason": type(exc).__name__, "detail": str(exc)},
        )

    # Fallback: per-worker alembic flow (today's behaviour).
    ensure_database_exists(target_url)
    env = os.environ.copy()
    env["KZ_DATABASE_URL"] = target_url
    for args in (["downgrade", "base"], ["upgrade", "head"]):
        subprocess.run(  # noqa: S603
            [sys.executable, "-m", "alembic", *args],
            check=True,
            cwd=str(_BACKEND_ROOT),
            env=env,
        )
```

(Add `import logging` to module top imports if missing.)

The `# noqa: BLE001` is the only place a bare `except Exception` is allowed in this file (the spec calls for the fallback to be opportunistic; any psycopg exception type is in scope).

- [ ] **Step 4.6: Run the full backend suite locally**

Run: `time uv run pytest backend/tests -n 4 --dist=worksteal --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term -q`
Expected: PASS. Wall-clock should drop further (template path skips three of the four alembic invocations).

- [ ] **Step 4.7: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 4.8: Commit**

```bash
git add backend/tests/_xdist_db.py backend/tests/conftest.py backend/tests/test_xdist_db.py
git commit -m "perf(test): cache alembic migration via postgres template database"
```

---

## Task 5: CI per-test durations + wall-clock budget ratchet

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.test-duration-budget`
- Create: `scripts/bench_pytest.sh`
- Modify: `mise.toml`
- Modify: `README.md`

- [ ] **Step 5.1: Set the initial budget**

Create `.test-duration-budget`:

```
600
```

(One integer, seconds. 600 = 10 minutes. The current observed wall-clock in CI is 1215 s; targeted fixes 1-4 should drop it well below 600 s.)

- [ ] **Step 5.2: Update the CI test step**

Edit `.github/workflows/ci.yml`. Replace the `Run Python tests with coverage` step with:

```yaml
      - name: Run Python tests with coverage
        run: |
          uv run pytest -n auto --dist=worksteal --durations=30 \
            --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term \
            | tee /tmp/pytest-cov.txt
```

Append a new step after the existing `Check Python coverage ratchet`:

```yaml
      - name: Check Python test wall-clock budget
        run: |
          # Result line shape: "==== N passed, M warnings in 1215.61s (0:20:15) ===="
          # We extract the seconds value (with optional decimals) directly.
          ACTUAL=$(grep -oE 'in [0-9]+\.?[0-9]*s' /tmp/pytest-cov.txt | tail -1 \
                   | grep -oE '[0-9]+\.?[0-9]*' | awk '{print int($1)}')
          BUDGET=$(cat .test-duration-budget)
          if [ -z "$ACTUAL" ]; then
            echo "::error::Could not extract pytest duration from output"
            exit 1
          fi
          echo "Pytest wall-clock: ${ACTUAL}s (budget: ${BUDGET}s)"
          if [ "$ACTUAL" -gt "$BUDGET" ]; then
            echo "::error::Test wall-clock ${ACTUAL}s exceeds the .test-duration-budget of ${BUDGET}s. Investigate or update the budget."
            exit 1
          fi
```

- [ ] **Step 5.3: Add the local bench script**

Create `scripts/bench_pytest.sh`:

```bash
#!/usr/bin/env bash
# Time the backend pytest suite the same way CI does and compare against
# .test-duration-budget. Useful for "did my change make tests slower?"
# without parsing CI logs.
set -euo pipefail

BUDGET=$(cat "$(git rev-parse --show-toplevel)/.test-duration-budget")
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

uv run pytest -n auto --dist=worksteal --durations=30 \
  --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term \
  | tee "$TMP"

ACTUAL=$(grep -oE 'in [0-9]+\.?[0-9]*s' "$TMP" | tail -1 \
         | grep -oE '[0-9]+\.?[0-9]*' | awk '{print int($1)}')

printf "\nPytest wall-clock: %ss (budget: %ss)\n" "$ACTUAL" "$BUDGET"
if [ "$ACTUAL" -gt "$BUDGET" ]; then
  echo "Over budget by $((ACTUAL - BUDGET))s." >&2
  exit 1
fi
echo "Within budget."
```

Make it executable: `chmod +x scripts/bench_pytest.sh`.

- [ ] **Step 5.4: Add the mise task**

Edit `mise.toml`. After the existing `[tasks.bench]` block, add:

```toml
[tasks."bench:tests"]
description = "Time the backend pytest suite and compare to .test-duration-budget"
run         = "./scripts/bench_pytest.sh"
```

- [ ] **Step 5.5: Update README**

Edit `README.md`. Locate the commands table; add a row:

```
| `mise run bench:tests`     | Time the backend pytest suite and compare to `.test-duration-budget` |
```

(Place near the existing `mise run bench` row for discoverability.)

- [ ] **Step 5.6: Run the bench script locally**

Run: `mise run bench:tests`
Expected: PASS, with the wall-clock number reported well under 600 s.

- [ ] **Step 5.7: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 5.8: Commit**

```bash
git add .github/workflows/ci.yml .test-duration-budget scripts/bench_pytest.sh \
        mise.toml README.md
git commit -m "ci: log per-test durations and gate pytest wall-clock budget"
```

---

## Task 6: Docs and OPEN_THINGS update

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 6.1: Close resolved items, open follow-ups**

Edit `docs/superpowers/OPEN_THINGS.md`. Under "Active sprint: DX / CI infra hardening" → "Tidy phase":

- Mark item 1 (`Backend pytest-xdist parallelism`) as ✅ shipped (already partially marked); append a sentence: "PR-2 (`perf(test): profile and shrink the backend pytest CI job`) shipped 2026-04-30: configurable LAHC deadline (ADR 0020), template-DB alembic cache, `--durations=30`, and a `.test-duration-budget` ratchet (initial 600 s)."
- Move "Investigate the Postgres bottleneck" out of "Acknowledged deferrals" into "CI / repo automation" backlog. The PR landed the template-DB option (3) from that note; options (1) per-worker postgres-process and (2) TRUNCATE-based reset stay deferred.
- Add a new follow-up under "CI / repo automation":

  ```markdown
  - **Tighten `.test-duration-budget`.** The 2026-04-30 PR set the budget at 600 s as a generous floor. Once two or three CI runs land at the new wall-clock, lower the budget by ~20 % via a single-line PR. Repeat after the coverage-split (next item) ships.
  ```

- Mark "Configurable LAHC deadline" deferral as resolved (env var ships); leave the user-facing `?deadline_ms=` query parameter as a separate deferral.

- [ ] **Step 6.2: Run the full local suite as a final smoke test**

Run: `mise run test:py`
Expected: PASS.

Run: `mise run lint`
Expected: clean.

- [ ] **Step 6.3: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: close PR-2 in DX/CI sprint; file budget-tighten follow-up"
```

---

## Self-review

- **Spec coverage:** Tasks 1+2+3 implement Goal item 2 (LAHC override). Task 4 implements the template-DB alembic cache. Task 5 implements Goal items 1 (`--durations=30`) and 3 (budget ratchet). Task 6 closes the OPEN_THINGS bookkeeping. All five "Files touched" entries in the spec map to a task; no orphans.
- **Placeholder scan:** None remaining. Every code block is complete; every step has a runnable command and an expected outcome.
- **Type consistency:** `solve_json_with_config` signature `(json: &str, deadline_ms: Option<u64>)` matches across solver-core, solver-py PyO3 binding, `_rust.pyi`, and Python `__init__`. `run_solve(..., *, deadline_ms: int | None)` matches the route handler and the test fixture. The settings field `solve_deadline_ms: int | None = 200` accepts `0` (greedy-only iteration) and `None` (LAHC skipped via `Option::None`); both paths are exercised by Tests 1.1, 1.6, and 2.1.

## Execution handoff

Plan complete. Default for this repo (per the autopilot workflow): subagent-driven execution.
