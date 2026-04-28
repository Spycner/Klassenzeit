# `violations_by_kind` enrichment for `solver.solve.done` log

**Date:** 2026-04-28
**Status:** Design approved (autopilot autonomous mode), plan pending.

## Problem

`docs/superpowers/OPEN_THINGS.md` carries the same observability gap in two places:

> Sprint item 2 follow-up (not sprint): add `violations_by_kind: dict[str, int]` to the `solver.solve.done` structured log so production can detect a sudden spike in any one kind.

> Toolchain & build friction > Structured logging (rest of backend): "Now that the typed violation taxonomy has shipped (ADR 0013), add `violations_by_kind: dict[str, int]` to `solver.solve.done` so production can spot a spike in one kind without re-deploying."

Today `solver.solve.done` is emitted by `backend/src/klassenzeit_backend/scheduling/solver_io.py:287-296` with these fields:

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

`violations_total` is a single integer. A production alert keyed on it cannot distinguish "20 placements failed because no qualified teacher exists" (a data-quality bug) from "20 placements failed because every time block is full" (a capacity constraint). Operators need a per-kind breakdown to triage incidents.

The typed taxonomy that makes this cheap shipped in ADR 0013: `solver-core` exposes `enum ViolationKind { NoQualifiedTeacher, TeacherOverCapacity, NoFreeTimeBlock, NoSuitableRoom }` (with `#[serde(rename_all = "snake_case")]`), and `backend/src/klassenzeit_backend/scheduling/schemas/schedule.py:21-31` mirrors the four strings as a Pydantic `Literal[...]`.

The wire format already carries `kind` per violation. Aggregation is a one-pass `Counter` on the parsed solution dict; the only design decisions are where to live, where to source the kind set, and how to keep the log shape stable.

## Goal

Land one `feat(scheduling)` PR titled "emit `violations_by_kind` in `solver.solve.done` log" on branch `feat/solver-violations-by-kind`. Three files change:

1. `backend/src/klassenzeit_backend/scheduling/solver_io.py` — module-level `_VIOLATION_KINDS` constant sourced from the existing `ViolationResponse.kind` Literal via `typing.get_args`, plus a private helper `_count_violations_by_kind(violations: list[dict]) -> dict[str, int]` and one new key in the `solver.solve.done` `extra=` dict.
2. `backend/tests/scheduling/test_solver_io.py` — two new unit tests for the helper plus one assertion delta inside the existing `test_run_solve_round_trips_and_logs` integration test.
3. `docs/superpowers/OPEN_THINGS.md` — strike both "follow-up" mentions of this gap; the work is now done.

After the PR, a production alert can read `violations_by_kind.no_qualified_teacher > N` directly without parsing the full violations list.

## Non-goals

- **API wire format change.** `ScheduleResponse` already returns `violations: list[ViolationResponse]` with `kind` per entry. A frontend or admin tool aggregates client-side; promoting `violations_by_kind` to the wire format is a separate decision and a separate PR. Filed in `docs/superpowers/OPEN_THINGS.md` if it becomes needed.
- **Per-violation log lines.** Tempting to log one entry per violation. Wrong granularity: log volume scales with violations, which scales with broken inputs. The aggregate count is the right granularity for an alert; the full list is already reachable via the API response or replay.
- **Generalising the helper.** YAGNI; one call site, one Literal, one closed enumeration. Producing a generic `count_by_literal(...)` for hypothetical future structured-logging fields would be premature.
- **Touching `solver-core` or the wire format.** The Rust `Solution` already carries `Vec<Violation>` with `kind` per entry; aggregation is cheap on the Python side. No PyO3 surface change.
- **Enriching `solver.solve.error`.** That event fires before `_solve_json` returns, so there is no parsed solution and no violations list. Adding an empty-dict placeholder would impose a fake-zeros payload on an event that semantically has no violations and could fire `no_qualified_teacher == 0` alerts incorrectly.
- **Frontend rendering.** The new field is operator-facing structured data, not user-facing UI. The schedule view already renders typed violations via `frontend/src/i18n/violation-keys.ts`; per-kind counts have no presentation surface today.
- **Ad-hoc instrumentation for the existing `solver.solve.error` exception path or the `solver.solve.start` event.** Both are out of scope; this PR strictly enriches the success-path log entry.
- **ADR.** No architectural decision. The change uses the typed taxonomy ADR 0013 already chose; no new ADR.

## Design

### Helper

New module-level definitions in `backend/src/klassenzeit_backend/scheduling/solver_io.py`:

```python
from typing import get_args

from klassenzeit_backend.scheduling.schemas.schedule import ViolationResponse

_VIOLATION_KINDS: tuple[str, ...] = get_args(
    ViolationResponse.model_fields["kind"].annotation
)


def _count_violations_by_kind(violations: list[dict]) -> dict[str, int]:
    """Aggregate a solver-output violation list into per-kind counts.

    Always returns one entry per known `ViolationKind`. Defensively drops
    unknown kinds so a Rust-only addition cannot crash the log path.
    """
    counts = dict.fromkeys(_VIOLATION_KINDS, 0)
    for violation in violations:
        kind = violation["kind"]
        if kind in counts:
            counts[kind] += 1
    return counts
```

The `if kind in counts` guard is intentional. Pydantic Literal validation already rejects unknown kinds at the API boundary, so they cannot reach production through the normal path; the guard exists only to keep a hypothetical Rust-side desync from raising `KeyError` inside `logger.info`. A structured-log gap on a new kind is recoverable; a runtime crash on the log path is not.

`_VIOLATION_KINDS` is computed once at module import. `typing.get_args(ViolationResponse.model_fields["kind"].annotation)` returns `('no_qualified_teacher', 'teacher_over_capacity', 'no_free_time_block', 'no_suitable_room')` because Pydantic stores the original `Literal[...]` annotation on `model_fields[name].annotation`. Verified shape against `backend/src/klassenzeit_backend/scheduling/schemas/schedule.py:21-31`.

### Log emission

`run_solve` adds one new key to the `solver.solve.done` `extra=` dict:

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

`violations_total` stays. Removing it would be a wire-format change for any consumer that already keys on it; the four-key dict is additive.

### Tests

Three test changes in `backend/tests/scheduling/test_solver_io.py`:

1. **`test_count_violations_by_kind_clean_solve_returns_zeros`** — passes `[]`, asserts `{kind: 0 for kind in _VIOLATION_KINDS}`.
2. **`test_count_violations_by_kind_aggregates_mixed_kinds`** — passes a list of three dicts with kinds `no_free_time_block`, `no_qualified_teacher`, `no_free_time_block`, asserts `{no_qualified_teacher: 1, teacher_over_capacity: 0, no_free_time_block: 2, no_suitable_room: 0}`.
3. **One-line addition to `test_run_solve_round_trips_and_logs`** — after the existing `assert "solver.solve.done" in messages`, find the matching record on `caplog.records` and assert that `record.violations_by_kind == {kind: 0 for kind in _VIOLATION_KINDS}` (the minimal-runnable-problem fixture solves cleanly so all four counts are zero).

Two new unit tests + one assertion delta. No new fixtures, no new test data. The unknown-kind defensive branch is exercised implicitly by Pydantic Literal coverage in upstream tests; a dedicated test would couple the helper's internals to the Literal source rather than to its public contract.

### `OPEN_THINGS.md` housekeeping

Two strikes:

- The bullet inside sprint item 2's "Follow-up (not sprint)" line.
- The line inside "Toolchain & build friction" > "Structured logging (rest of backend)" reading "Now that the typed violation taxonomy has shipped (ADR 0013), add `violations_by_kind: dict[str, int]` to `solver.solve.done` so production can spot a spike in one kind without re-deploying."

The remaining text in both sections (other follow-ups, broader JSON-logging library decision) stays.

### Commit split

Single commit on `feat/solver-violations-by-kind`:

- `feat(scheduling): emit violations_by_kind in solver.solve.done log`
  - `backend/src/klassenzeit_backend/scheduling/solver_io.py`: helper + log threading.
  - `backend/tests/scheduling/test_solver_io.py`: two new helper unit tests + one assertion delta.
  - `docs/superpowers/OPEN_THINGS.md`: strike both follow-up mentions.

TDD ordering inside the commit (red → green → refactor) is enforced by `superpowers:test-driven-development` during execution; the commit lands with all three changes together because the helper and the integration assertion share a single PR's worth of context and the helper has no production caller until the log line consumes it.

## Risks

- **Pydantic Literal shape drift.** If a future Pydantic upgrade changes how `model_fields[name].annotation` exposes the original `Literal[...]`, the `get_args` call could return an empty tuple, and `_VIOLATION_KINDS` would silently become `()`. Mitigated by the unit test `test_count_violations_by_kind_clean_solve_returns_zeros` (asserts the four-key dict exactly), which would fail loudly. A regression here is caught at CI.
- **Rust enum drift.** A new variant added to `solver-core::ViolationKind` without a matching Pydantic Literal update would fall into the defensive `if kind in counts` branch and be silently dropped from the log. Mitigated by Pydantic boundary validation: an unknown `kind` would 500 the API request before it ever reached the log, surfacing the desync immediately. Documented in the helper docstring.
- **Log-payload size.** Four extra integers per solve. Negligible (well under 100 bytes).
- **Backward compat with downstream log consumers.** Adding a key is non-breaking; existing consumers that read `violations_total` continue to work.

## Success criteria

- `_count_violations_by_kind` exists, is unit-tested for empty input and mixed-kind input.
- `solver.solve.done` log records carry `violations_by_kind: dict[str, int]` with all four kinds present (zeros included on clean solves).
- Existing tests in `test_solver_io.py` and `test_schedule_route.py` still pass without modification (the new assertion is additive).
- `mise run lint` and `mise run test:py` are green.
- No change to `ScheduleResponse`, no change to `solver-core`, no change to the frontend.
- Both OPEN_THINGS mentions of the gap are struck through.
