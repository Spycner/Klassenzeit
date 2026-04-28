# `violations_by_kind` log enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `violations_by_kind: dict[str, int]` key to the `solver.solve.done` structured log entry so production can detect a sudden spike in any one violation kind without re-deploying.

**Architecture:** A module-level helper `_count_violations_by_kind` in `backend/src/klassenzeit_backend/scheduling/solver_io.py` aggregates the parsed solver output's `violations` list into a per-kind count dict. The kind set is sourced from the existing `ViolationResponse.kind` Pydantic `Literal[...]` via `typing.get_args` so adding a fifth kind in the future updates only one place. The helper is unit-tested in isolation; one assertion delta inside the existing `test_run_solve_round_trips_and_logs` test proves the field flows into the log record's `extra` dict.

**Tech Stack:** Python 3.13, FastAPI logging, Pydantic 2.x `model_fields`, `typing.get_args`, pytest, pytest-asyncio.

**Spec:** [`docs/superpowers/specs/2026-04-28-violations-by-kind-log-design.md`](../specs/2026-04-28-violations-by-kind-log-design.md)

---

## File Structure

- **Modify:** `backend/src/klassenzeit_backend/scheduling/solver_io.py`
  - Add `from typing import get_args` to imports.
  - Add `from klassenzeit_backend.scheduling.schemas.schedule import ViolationResponse` to imports.
  - Add module-level `_VIOLATION_KINDS: tuple[str, ...]` constant.
  - Add module-level `_count_violations_by_kind(violations: list[dict]) -> dict[str, int]` helper.
  - Thread `violations_by_kind` into the `solver.solve.done` `extra=` dict.
- **Modify:** `backend/tests/scheduling/test_solver_io.py`
  - Two new sync unit tests for the helper.
  - One assertion delta inside the existing async `test_run_solve_round_trips_and_logs`.
- **Modify:** `docs/superpowers/OPEN_THINGS.md`
  - Strike both follow-up mentions of the gap.

Single PR, single commit on branch `feat/solver-violations-by-kind`. The implementation commit is preceded only by the spec commit (`docs: add violations_by_kind log design spec`) and this plan commit (`docs: add violations_by_kind log implementation plan`).

---

## Task 1: Helper unit tests (red)

**Files:**
- Modify: `backend/tests/scheduling/test_solver_io.py`

- [ ] **Step 1: Add imports for the helper and the kind constant**

At the top of `backend/tests/scheduling/test_solver_io.py`, add the helper and the constant to the existing import line that pulls from `klassenzeit_backend.scheduling.solver_io`. Today the file imports `run_solve`; extend that import.

Find this line (current top of the file):

```python
from klassenzeit_backend.scheduling.solver_io import run_solve
```

Replace with:

```python
from klassenzeit_backend.scheduling.solver_io import (
    _VIOLATION_KINDS,
    _count_violations_by_kind,
    run_solve,
)
```

The leading underscore is intentional: these are module-private but legitimately accessed by the same package's tests. This pattern is already used elsewhere in the backend test suite for module-private fixtures.

- [ ] **Step 2: Write the failing helper unit tests**

Append to `backend/tests/scheduling/test_solver_io.py` (after the existing `test_run_solve_logs_error_and_reraises` test, end of file):

```python
def test_count_violations_by_kind_clean_solve_returns_zeros() -> None:
    counts = _count_violations_by_kind([])
    assert counts == dict.fromkeys(_VIOLATION_KINDS, 0)
    assert set(counts) == {
        "no_qualified_teacher",
        "teacher_over_capacity",
        "no_free_time_block",
        "no_suitable_room",
    }


def test_count_violations_by_kind_aggregates_mixed_kinds() -> None:
    violations: list[dict] = [
        {"kind": "no_free_time_block", "lesson_id": "x", "hour_index": 0},
        {"kind": "no_qualified_teacher", "lesson_id": "y", "hour_index": 0},
        {"kind": "no_free_time_block", "lesson_id": "z", "hour_index": 0},
    ]
    counts = _count_violations_by_kind(violations)
    assert counts == {
        "no_qualified_teacher": 1,
        "teacher_over_capacity": 0,
        "no_free_time_block": 2,
        "no_suitable_room": 0,
    }
```

The first test pins the kind set itself: if `typing.get_args` against the Pydantic Literal ever returns an empty tuple (e.g. a future Pydantic upgrade changes how `model_fields[name].annotation` is exposed), the second `assert set(counts) == {...}` line fires immediately rather than the helper silently degrading.

- [ ] **Step 3: Run the new tests to verify they fail**

```bash
mise run test:py -- backend/tests/scheduling/test_solver_io.py::test_count_violations_by_kind_clean_solve_returns_zeros backend/tests/scheduling/test_solver_io.py::test_count_violations_by_kind_aggregates_mixed_kinds -v
```

Expected: both tests fail at import time with `ImportError: cannot import name '_VIOLATION_KINDS' from 'klassenzeit_backend.scheduling.solver_io'`. This is a valid red.

(The pre-commit `ty check` gate that the backend CLAUDE.md warns about does not bite here because we are running `pytest` directly via `mise run test:py`, not committing yet. The red commit lands together with the green implementation in Task 2 to satisfy `ty`.)

- [ ] **Step 4: Do not commit yet**

The test additions land together with the implementation in Task 2's commit. This avoids a red commit that fails `ty`'s `unresolved-import` gate.

---

## Task 2: Helper implementation + log threading (green)

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/solver_io.py`

- [ ] **Step 1: Read the current top of `solver_io.py` to confirm the import block shape**

```bash
head -40 backend/src/klassenzeit_backend/scheduling/solver_io.py
```

This is a verification step, not a code edit. The file currently imports `asyncio`, `json`, `logging`, `time`, `from uuid import UUID`, `from sqlalchemy.ext.asyncio import AsyncSession`, plus its own `klassenzeit_solver._solve_json` import. The new imports go at the bottom of the same import block.

- [ ] **Step 2: Add the new imports**

Find the existing `from uuid import UUID` line in `backend/src/klassenzeit_backend/scheduling/solver_io.py`. After the project-internal imports block (after the `from klassenzeit_solver import _solve_json` or equivalent line), add:

```python
from typing import get_args

from klassenzeit_backend.scheduling.schemas.schedule import ViolationResponse
```

Place `from typing import get_args` with the other stdlib imports (it is stdlib). Place the `ViolationResponse` import with project-internal imports.

If the file already imports from `typing`, merge: e.g. `from typing import Any, get_args`. Re-running `mise run fmt` afterwards will sort canonically.

- [ ] **Step 3: Add the module-level constant and helper**

Below the existing `logger = logging.getLogger(__name__)` line in `backend/src/klassenzeit_backend/scheduling/solver_io.py`, add:

```python
_VIOLATION_KINDS: tuple[str, ...] = get_args(
    ViolationResponse.model_fields["kind"].annotation
)


def _count_violations_by_kind(violations: list[dict]) -> dict[str, int]:
    """Aggregate a solver-output violation list into per-kind counts.

    Always returns one entry per known ``ViolationKind``. Defensively drops
    unknown kinds so a Rust-only addition cannot crash the log path; an
    unknown kind would already be rejected at the API boundary by Pydantic
    Literal validation, so this guard exists only to keep ``logger.info``
    from raising ``KeyError`` in a hypothetical desync.
    """
    counts = dict.fromkeys(_VIOLATION_KINDS, 0)
    for violation in violations:
        kind = violation["kind"]
        if kind in counts:
            counts[kind] += 1
    return counts
```

- [ ] **Step 4: Thread `violations_by_kind` into the `solver.solve.done` log call**

Locate the existing call (currently at `backend/src/klassenzeit_backend/scheduling/solver_io.py:287-296`):

```python
    logger.info(
        "solver.solve.done",
        extra={
            "school_class_id": str(school_class_id),
            "duration_ms": duration_ms,
            "placements_total": len(solution["placements"]),
            "violations_total": len(solution["violations"]),
            "soft_score": solution.get("soft_score", 0),
        },
    )
```

Replace with:

```python
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
```

`violations_total` stays. The new key sits between it and `soft_score` so the field order reads "totals first, breakdown next, soft score last".

- [ ] **Step 5: Run all `test_solver_io.py` tests to verify they pass**

```bash
mise run test:py -- backend/tests/scheduling/test_solver_io.py -v
```

Expected: every test in the file passes, including the two new helper tests added in Task 1. If `ty` complains about `ViolationResponse.model_fields["kind"].annotation` returning `Any`, that is fine: `get_args` accepts `Any` and the runtime contract is what we are testing.

If a Pydantic-version mismatch causes `model_fields["kind"].annotation` to be `None` or otherwise yield an empty tuple, the `test_count_violations_by_kind_clean_solve_returns_zeros` test fails at its `assert set(counts) == {...}` line, surfacing the issue.

- [ ] **Step 6: Run the integration test that exists today to confirm it still passes (no assertion delta yet)**

```bash
mise run test:py -- backend/tests/scheduling/test_schedule_route.py -v
```

Expected: every test in the file passes. This catches any accidental regression from the new `extra=` key (e.g. logger backend that disallows reserved attribute names).

- [ ] **Step 7: Do not commit yet**

The integration assertion delta lands in Task 3, then Task 4 commits all three changes together.

---

## Task 3: Integration assertion delta

**Files:**
- Modify: `backend/tests/scheduling/test_solver_io.py`

- [ ] **Step 1: Locate the existing `test_run_solve_round_trips_and_logs` test**

It is the second-to-last function in the file (immediately before `test_run_solve_logs_error_and_reraises`). The body currently ends with:

```python
    messages = [r.message for r in caplog.records]
    assert "solver.solve.start" in messages
    assert "solver.solve.done" in messages
```

- [ ] **Step 2: Add the integration assertion**

Replace the closing block of `test_run_solve_round_trips_and_logs` with:

```python
    messages = [r.message for r in caplog.records]
    assert "solver.solve.start" in messages
    assert "solver.solve.done" in messages

    done = next(r for r in caplog.records if r.message == "solver.solve.done")
    assert done.violations_by_kind == dict.fromkeys(_VIOLATION_KINDS, 0)
```

The minimal-runnable-problem fixture in this test produces a clean solve (one placement, zero violations), so the four-key zero dict is the expected shape. If the fixture ever changes to produce violations, the test will tell us by failing on this line.

- [ ] **Step 3: Run the integration test to verify it passes**

```bash
mise run test:py -- backend/tests/scheduling/test_solver_io.py::test_run_solve_round_trips_and_logs -v
```

Expected: PASS.

- [ ] **Step 4: Run the full backend test suite as a final sanity check**

```bash
mise run test:py -v
```

Expected: every test passes. Pay attention to anything in `test_schedule_route.py` that asserts on log-record shape; the additive new key should not break any assertion that uses `assert <key> in record.__dict__` style.

- [ ] **Step 5: Run the linter**

```bash
mise run lint
```

Expected: green. `ruff` may want to reorder the new imports; if so, `mise run fmt` fixes it.

If `ty` flags `ViolationResponse.model_fields["kind"].annotation` as `Any`, that is acceptable: the runtime contract is covered by the unit tests, and the backend CLAUDE.md notes that `ty` does not honor `# type: ignore` pragmas. Per the same CLAUDE.md, prefer concrete types over silencing; here the concrete type is whatever Pydantic exposes, so a temporary `cast(tuple[str, ...], get_args(...))` is acceptable if `ty` blocks. Do not add it preemptively; only if `ty` blocks the commit.

---

## Task 4: OPEN_THINGS.md housekeeping + commit

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Locate the sprint item 2 follow-up bullet**

Open `docs/superpowers/OPEN_THINGS.md`. Find the line in section "Active sprint > Tidy phase > 2. Structured violation taxonomy" that reads:

```text
Follow-up (not sprint): add `violations_by_kind: dict[str, int]` to the `solver.solve.done` structured log so production can detect a sudden spike in any one kind.
```

- [ ] **Step 2: Strike that follow-up reference**

Replace the entire `Follow-up (not sprint):` sentence on that line with the closing-period that ends the prior sentence. Concretely, remove the trailing " Follow-up (not sprint): add ..." string from that bullet so the bullet ends at the prior sentence's period and the trailing follow-up is gone. The rest of the bullet (description of what shipped, ADR 0013 reference) stays as-is.

If that bullet has multiple follow-ups, only strike the `violations_by_kind` one. The shipped-2026-04-25 description line is the historical record and stays.

- [ ] **Step 3: Locate the "Toolchain & build friction > Structured logging (rest of backend)" line**

Find the sub-sentence that currently reads:

```text
Now that the typed violation taxonomy has shipped (ADR 0013), add `violations_by_kind: dict[str, int]` to `solver.solve.done` so production can spot a spike in one kind without re-deploying.
```

- [ ] **Step 4: Strike that sentence**

Remove the entire `Now that the typed violation taxonomy ... without re-deploying.` sentence from the bullet. The bullet's preceding text (broader JSON-logging library decision, frontend `solver-py` follow-up) stays.

- [ ] **Step 5: Verify no other OPEN_THINGS reference to this gap remains**

```bash
grep -n "violations_by_kind" docs/superpowers/OPEN_THINGS.md
```

Expected: no output (the gap is filed).

- [ ] **Step 6: Commit everything**

```bash
git add backend/src/klassenzeit_backend/scheduling/solver_io.py \
        backend/tests/scheduling/test_solver_io.py \
        docs/superpowers/OPEN_THINGS.md
git commit -m "feat(scheduling): emit violations_by_kind in solver.solve.done log"
```

The commit message follows Conventional Commits with the `scheduling` scope (matches the file's location and the existing structured-logging commits in this directory). Lefthook's `pre-commit` runs `mise run lint`; `cog verify` enforces the message shape.

If pre-commit fails on a fixable issue (`ruff format` reorder, `ty` cast nudge), apply the fix, re-stage, and re-commit. Per the root CLAUDE.md, do not amend; create a new commit.

---

## Self-Review

**Spec coverage:**

- Helper signature and module-level constant — Task 2.
- Source kind set from Pydantic Literal via `typing.get_args` — Task 2 (`get_args(ViolationResponse.model_fields["kind"].annotation)`).
- Log threading into `solver.solve.done` only, leave `solver.solve.error` alone — Task 2.
- Two unit tests + one integration assertion delta — Tasks 1 and 3.
- OPEN_THINGS housekeeping at both mention sites — Task 4.
- Single `feat(scheduling)` commit — Task 4.
- Defensive `if kind in counts` guard — Task 2 helper body.
- No wire format change, no frontend, no Rust — confirmed by file scope.

**Placeholder scan:** None. Every step has either a concrete code block or a concrete shell command.

**Type consistency:** `_count_violations_by_kind` accepts `list[dict]` and returns `dict[str, int]` consistently across Tasks 1, 2, and 3. `_VIOLATION_KINDS` is `tuple[str, ...]` in both the spec and the plan. The integration assertion compares `done.violations_by_kind` against `dict.fromkeys(_VIOLATION_KINDS, 0)`, which the helper unit test also pins.
