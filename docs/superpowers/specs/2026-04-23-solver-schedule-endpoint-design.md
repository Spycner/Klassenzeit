# PyO3 solve binding + `POST /api/classes/{id}/schedule`

**Date:** 2026-04-23
**Status:** Design approved, plan pending.

## Problem

`solver-core` shipped in PR #118 with a working greedy first-fit algorithm and a JSON adapter (`solve_json`). The binding that lets Python call it, and the HTTP endpoint that lets the frontend trigger it, do not yet exist. Sprint step 1 in `docs/superpowers/OPEN_THINGS.md` names both explicitly: until they land, no user action in the app produces a schedule, and sprint steps 2-5 (persistence, schedule view, Grundschule seed, E2E smoke) stay blocked behind step 1.

The existing `solver-py` binding still exposes `reverse_chars`, a placeholder from the initial scaffolding that never had product value. The `/health` endpoint uses `reverse_chars("ok")` as a "the binding is wired" smoke check, which is now misleading because the real binding isn't there yet.

## Goal

Ship two aligned surfaces in one PR:

1. **`solver-py` real binding.** Replace `reverse_chars` with `solve_json(problem_json: str) -> str` — a thin PyO3 wrapper around `solver_core::solve_json`. Release the GIL during the call, map `solver_core::Error::Input` to `PyValueError`, and publish an updated `.pyi` stub + Python re-export.
2. **`POST /api/classes/{class_id}/schedule` endpoint.** Given a `class_id`, load the whole school's entities (the solver needs global teacher/room contention), assemble a `Problem` JSON, run the solver off the event loop, filter the resulting `Solution` to placements and violations for lessons belonging to the requested class, and return it as a typed `ScheduleResponse`. Structured logging around the boundary captures start, end, duration, and outcome.

No persistence. Calling the endpoint twice in a row runs the solver twice; the second response has no memory of the first. Sprint step 2 introduces the `scheduled_lesson` table.

## Non-goals

- **Placement persistence.** Sprint step 2's concern. Persisting would need a new table, a migration, a `GET /schedule` endpoint, and re-solve semantics; each is its own design question and blurs this PR's review.
- **`SolveConfig` (timeout, seed).** No `SolveConfig` struct exists in `solver-core` yet (Backlog item under "Solver algorithm"). The endpoint accepts an empty body today. When `SolveConfig` lands, extending the endpoint with an optional Pydantic request body is additive.
- **Active-week-scheme resolution.** The prototype treats each class's `week_scheme_id` FK as its own scheme and rejects solves that mix schemes across classes. OPEN_THINGS keeps the `active` flag deferred.
- **Solver cancellation.** `asyncio.to_thread` can't actually cancel a Rust thread. `asyncio.wait_for` would bound request latency but leave the thread running. Prototype skips both; structured logs will make a slow solve visible.
- **JSON-logging adoption.** Broader JSON-logging of the backend is a separate Toolchain item. This PR uses `logger.info("event_name", extra={...})` — stdlib-compatible fields a future JSON formatter picks up for free.
- **Frontend schedule view.** Sprint step 3's concern. The response type is designed so step 3 can consume it directly, but no React code ships here.
- **E2E coverage.** Sprint step 5's concern.

## Design

### `solver-py` binding

`solver/solver-py/src/lib.rs` exposes exactly one pyfunction:

```rust
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Solve a timetable problem supplied as JSON and return the resulting
/// Solution as JSON. Releases the GIL for the duration of the solve.
#[pyfunction]
fn solve_json(py: Python<'_>, problem_json: &str) -> PyResult<String> {
    py.allow_threads(|| solver_core::solve_json(problem_json))
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pymodule]
fn _rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(solve_json, m)?)?;
    Ok(())
}
```

`solver_core::Error::Input` is the only variant the core crate defines today. It maps to `PyValueError` per `solver/CLAUDE.md`'s "client mistake" guidance. Future solver-internal errors (hypothetical `Error::Internal`) would map to `PyRuntimeError`; not yet needed.

Re-export: `solver/solver-py/python/klassenzeit_solver/__init__.py` becomes

```python
"""Python bindings for the Klassenzeit constraint solver."""

from ._rust import solve_json

__all__ = ["solve_json"]
```

`.pyi` stubs (`_rust.pyi` and `__init__.pyi`):

```python
def solve_json(problem_json: str) -> str: ...
```

### Backend module layout

Three new files under `backend/src/klassenzeit_backend/scheduling/`:

- `solver_io.py` — problem builder, shared-week-scheme check, solve runner, per-class filter. Pure helper module; no FastAPI imports.
- `schemas/schedule.py` — Pydantic `ScheduleResponse`, `PlacementResponse`, `ViolationResponse`.
- `routes/schedule.py` — `schedule_router` with the POST handler and structured logging.

`routes/__init__.py` mounts `schedule_router` into `scheduling_router` alongside the existing per-aggregate routers.

`main.py` changes:

- Remove `from klassenzeit_solver import reverse_chars`.
- Change `/health` body from `{"status": "ok", "solver_check": reverse_chars("ok")}` to `{"status": "ok"}`.

The binding fail-fast is preserved by the transitive import chain `main.py → scheduling_router → schedule_router → solver_io → klassenzeit_solver`. If the binding is broken, app boot fails loudly at import time.

### Route surface

```
POST /api/classes/{class_id}/schedule
Auth: admin session (Depends(require_admin))
Request body: none
Response body (200): ScheduleResponse
Error responses:
  404 class_id not found
  422 class's week_scheme has no time_blocks
  422 classes involved in the solve reference different week_schemes
```

`ScheduleResponse` shape:

```python
class PlacementResponse(BaseModel):
    lesson_id: UUID
    time_block_id: UUID
    room_id: UUID

class ViolationResponse(BaseModel):
    kind: Literal["no_qualified_teacher", "unplaced_lesson"]
    lesson_id: UUID
    hour_index: int
    message: str

class ScheduleResponse(BaseModel):
    placements: list[PlacementResponse]
    violations: list[ViolationResponse]
```

Field names and shapes match `solver_core::Solution` one-to-one: the response is the solver's output, filtered. `Literal[...]` on `kind` mirrors `solver_core::ViolationKind` so the frontend can exhaustively switch on it. If `solver-core` adds a third `ViolationKind` variant later, Pydantic validation will surface the drift with a clear parse error in backend tests.

### Problem building (`solver_io.build_problem_json`)

Signature: `async def build_problem_json(db: AsyncSession, class_id: UUID) -> tuple[str, set[UUID], dict[str, int]]`.

Returns a 3-tuple: the JSON Problem string ready for the binding, the set of lesson IDs belonging to the requested class (filter key for the Solution), and a dict of input-shape counts for the `solver.solve.start` log entry.

Steps:

1. Load the requested `SchoolClass` row (`db.get(SchoolClass, class_id)`); raise 404 if missing.
2. Load `TimeBlock` rows with `week_scheme_id == class.week_scheme_id`. If empty, raise 422 "class's week_scheme has no time_blocks configured".
3. Load all `Lesson` rows with `teacher_id IS NOT NULL` across every class. Lessons without an assigned teacher cannot be placed (the solver's structural validation requires a known `teacher_id`), so they drop out of the solve input.
4. Collect distinct `school_class_id` values from the loaded lessons plus the requested class id, and verify every referenced class shares the same `week_scheme_id` as the requested class. On mismatch, raise 422 "classes referenced in this solve use different week_schemes".
5. Load the `Teacher`, `Room`, `Subject`, and `SchoolClass` rows that the lesson set references.
6. Load the `TeacherQualification`, `TeacherAvailability`, `RoomAvailability`, and `RoomSubjectSuitability` rows whose foreign keys land inside the entity sets loaded in step 5.
7. **Teacher availability transform.** `TeacherAvailability` has a `status` field (per `backend/src/klassenzeit_backend/db/models/teacher.py`). Emit a `TeacherBlockedTime` entry for every row with `status != "available"`. Rows with `status == "available"` drop out — the solver only knows "blocked", and the absence of an entry means "available".
8. **Room availability transform.** `RoomAvailability` is a whitelist: a row `(room_id, time_block_id)` means "this room is available in that slot". A room with *zero* rows is universally available (matches the opt-in editor UX). A room with *at least one* row is available only in the listed slots; emit `RoomBlockedTime(room_id, tb)` for every loaded time_block `tb` not on that room's whitelist.
9. Pre-validate `rooms` is non-empty and `time_blocks` is non-empty at the backend layer. Empty rooms → 422 "no rooms configured; cannot solve". Empty time_blocks already caught in step 2. These mirror `solver-core`'s structural checks so the backend returns a clean 422 instead of letting a 500 bubble out of the binding.
10. Serialize each collection into a plain dict matching the `solver_core::Problem` JSON shape (snake_case, UUIDs as strings), then `json.dumps` the wrapping dict.

The input-shape counts dict contains the cardinalities used by `solver.solve.start`: `time_blocks`, `teachers`, `rooms`, `subjects`, `school_classes`, `lessons`, `teacher_qualifications`, `teacher_blocked_times`, `room_blocked_times`, `room_subject_suitabilities`.

### Solve runner (`solver_io.run_solve`)

```python
import asyncio
import json
import time
import logging
from klassenzeit_solver import solve_json as _solve_json

logger = logging.getLogger(__name__)

async def run_solve(problem_json: str, school_class_id: UUID, input_counts: dict[str, int]) -> dict:
    logger.info("solver.solve.start", extra={"school_class_id": str(school_class_id), **input_counts})
    started = time.monotonic()
    try:
        solution_json = await asyncio.to_thread(_solve_json, problem_json)
    except (ValueError, RuntimeError) as exc:
        duration_ms = (time.monotonic() - started) * 1000.0
        logger.error(
            "solver.solve.error",
            extra={"school_class_id": str(school_class_id), "duration_ms": duration_ms, "exc_class": type(exc).__name__},
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
        },
    )
    return solution
```

`solver.solve.done` records *total* placement and violation counts. The route handler adds the per-class counts in a follow-up log after filtering.

### Per-class filter (`solver_io.filter_solution_for_class`)

```python
def filter_solution_for_class(solution: dict, class_lesson_ids: set[UUID]) -> dict:
    placements = [p for p in solution["placements"] if UUID(p["lesson_id"]) in class_lesson_ids]
    violations = [v for v in solution["violations"] if UUID(v["lesson_id"]) in class_lesson_ids]
    return {"placements": placements, "violations": violations}
```

Simple, pure, O(n). Unit-testable without DB or binding.

### Route handler

```python
@schedule_router.post("/classes/{class_id}/schedule", tags=["schedule"])
async def generate_schedule_for_class(
    class_id: UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ScheduleResponse:
    problem_json, class_lesson_ids, input_counts = await solver_io.build_problem_json(db, class_id)
    solution = await solver_io.run_solve(problem_json, class_id, input_counts)
    filtered = solver_io.filter_solution_for_class(solution, class_lesson_ids)
    logger.info(
        "solver.solve.filtered",
        extra={
            "school_class_id": str(class_id),
            "placements_for_class": len(filtered["placements"]),
            "violations_for_class": len(filtered["violations"]),
        },
    )
    return ScheduleResponse.model_validate(filtered)
```

Error mapping is handled inside `build_problem_json` (404, 422) and inside the binding (`PyValueError` → FastAPI 500 via default handler). No `try / except` in the route; exceptions surface with the structured-logging crumbs already emitted by `run_solve`.

### Error handling summary

| Failure | HTTP | Source | Logged as |
|---|---|---|---|
| Unknown `class_id` | 404 | `build_problem_json` step 1 | (none, standard FastAPI) |
| Empty `time_blocks` in class's week_scheme | 422 | `build_problem_json` step 2 | (none) |
| Mixed `week_scheme_id`s across solve input | 422 | `build_problem_json` step 4 | (none) |
| Empty `rooms` table | 422 | `build_problem_json` step 9 | (none) |
| `solve_json` raises `ValueError` | 500 | binding (`Error::Input`) | `solver.solve.error` |
| `solve_json` raises `RuntimeError` | 500 | binding | `solver.solve.error` |

422 cases return `{"detail": "..."}` — consistent with existing backend conventions. A typed `code` field would be nicer for frontend branching, but no other endpoint uses it yet and introducing it here would be churn. Revisit when a second endpoint needs client-distinguishable 422s.

### Logging shape

Three events at the solver boundary:

| Event | Level | Fields |
|---|---|---|
| `solver.solve.start` | INFO | `school_class_id`, `time_blocks`, `teachers`, `rooms`, `subjects`, `school_classes`, `lessons` |
| `solver.solve.done` | INFO | `school_class_id`, `duration_ms`, `placements_total`, `violations_total` |
| `solver.solve.filtered` | INFO | `school_class_id`, `placements_for_class`, `violations_for_class` |
| `solver.solve.error` | ERROR | `school_class_id`, `duration_ms`, `exc_class`, + `exc_info` |

All via `logger.info(event_name, extra={...})` on the module's `logging.getLogger(__name__)`. No new logging library adopted this PR.

## Testing

Three test surfaces, one per layer, following `superpowers:test-driven-development` red-green-refactor per chunk.

### `solver-py` binding tests (`solver/solver-py/tests/test_bindings.py`)

Rewrite, replacing the four `reverse_chars` tests with:

1. `test_solve_json_minimal_problem_round_trips` — build a one-lesson Problem dict in Python with `json.dumps`, call `solve_json`, parse the result, assert exactly one placement and zero violations.
2. `test_solve_json_raises_value_error_on_malformed_json` — pass `"not json"`, assert `pytest.raises(ValueError)`.
3. `test_solve_json_raises_value_error_on_empty_time_blocks` — Problem with `"time_blocks": []`, assert `pytest.raises(ValueError)`.
4. `test_solve_json_releases_gil` — run two `solve_json` calls on a mildly-loaded Problem from two `threading.Thread`s; assert the wall-clock elapsed is less than `1.7×` a single-threaded call. Sanity check only; not a strict performance contract.

`uv run pytest solver/solver-py/tests` runs them. Maturin rebuild via `mise run solver:rebuild` before the tests pick up changes in `solver-py/src/lib.rs`.

### Backend io-helper tests (`backend/tests/scheduling/test_solver_io.py`)

New file. Fixtures build a small in-DB scenario (one class, one subject, one teacher qualified, one room suitable, three time blocks, one 2-hour lesson). Covers:

- `build_problem_json_returns_populated_shape` — assertions on keys and cardinalities of the serialized Problem.
- `build_problem_json_raises_404_for_unknown_class` — `HTTPException` match with `status_code == 404`.
- `build_problem_json_raises_422_when_week_scheme_has_no_time_blocks`.
- `build_problem_json_raises_422_on_mixed_week_schemes` — seed two classes with different week schemes, expect the 422.
- `build_problem_json_raises_422_when_rooms_table_empty`.
- `build_problem_json_transforms_teacher_availability_status` — seed a `TeacherAvailability` with `status="blocked"` and another with `status="available"`; assert the resulting Problem's `teacher_blocked_times` contains only the former.
- `build_problem_json_transforms_room_availability_whitelist` — seed a room with one `RoomAvailability` row and three time blocks; assert the Problem's `room_blocked_times` contains entries for the two un-listed blocks.
- `build_problem_json_leaves_room_unblocked_when_whitelist_empty` — room with zero `RoomAvailability` rows produces zero `room_blocked_times` entries for that room.
- `build_problem_json_returns_class_lesson_ids` — set equality on the returned second-tuple element.
- `filter_solution_for_class_keeps_only_class_lessons` — pure unit test with hand-built Solution dict.
- `filter_solution_for_class_drops_violations_for_other_classes`.

### Backend route tests (`backend/tests/scheduling/test_schedule_route.py`)

New file. Uses the existing `client` + admin-session fixtures. Covers:

- `test_schedule_post_returns_404_for_unknown_class`.
- `test_schedule_post_returns_422_without_time_blocks`.
- `test_schedule_post_returns_422_on_mixed_week_schemes`.
- `test_schedule_post_returns_422_when_rooms_table_empty`.
- `test_schedule_post_returns_200_with_empty_lists_when_no_lessons`.
- `test_schedule_post_returns_200_with_placements_on_happy_path` — seed a solvable class, assert placement count equals the class's total `hours_per_week`, all `lesson_id`s belong to the class, zero violations.
- `test_schedule_post_filters_out_other_classes_placements` — seed two classes, both solvable, call the endpoint for class A, assert every returned `lesson_id` is in class A's lessons.
- `test_schedule_post_logs_solve_start_and_done` — use `caplog` to capture records, assert both events appear with the expected `extra` keys.

### `/health` regression

`backend/tests/test_main.py` — the existing assertion on `solver_check` drops to match the new `{"status": "ok"}` body.

### Test commands before every commit

- `cargo nextest run --workspace` (solver tree stays green).
- `uv run pytest` (backend + solver-py).
- `mise run lint` (clippy, ruff, ty, vulture, biome, machete, cargo fmt, actionlint).
- `mise run solver:rebuild` after changes to `solver-py/src/lib.rs` and before the solver-py pytest run.

## Dependencies

No new workspace dependencies. `solver-py` already pins `pyo3 = "0.28"` with `extension-module`. The backend already has `sqlalchemy[asyncio]`, `pydantic`, `fastapi`, `logging`. `solver_io.py` adds no runtime imports outside stdlib + already-present packages.

## Commit plan

Per Q12 of the brainstorm:

1. **`feat(solver): solve_json binding replaces reverse_chars placeholder`.** Atomic solver rewrite spanning both crates. Content:
   - Remove `reverse_chars` from `solver-core/src/lib.rs` plus its three unit tests.
   - Delete `solver/solver-core/tests/proptest_reverse.rs`.
   - Replace `py_reverse_chars` with `solve_json` in `solver-py/src/lib.rs`.
   - Update `klassenzeit_solver/__init__.py`, `__init__.pyi`, `_rust.pyi` to re-export `solve_json`.
   - Rewrite `solver-py/tests/test_bindings.py` with the four new binding tests.
   - Bare `solver` scope per the solver CLAUDE.md exception ("paired change genuinely spans both crates").

2. **`feat(backend): POST /api/classes/{id}/schedule runs solver off the event loop`.** Backend-only. Content:
   - Add `scheduling/solver_io.py`, `scheduling/schemas/schedule.py`, `scheduling/routes/schedule.py`.
   - Wire `schedule_router` into `scheduling_router`.
   - Remove `reverse_chars` import and `solver_check` field from `main.py`'s `/health`.
   - Update `backend/tests/test_main.py` to drop the removed key.
   - Add `backend/tests/scheduling/test_solver_io.py` and `test_schedule_route.py`.

Plus the autopilot docs commits (spec, plan, OPEN_THINGS update, optional ADR) interleaved per the workflow.

## Rollout and follow-ups

- **OPEN_THINGS.md updates.** Remove sprint step 1. Remove "Remove `reverse_chars` from `solver-core` and `solver-py`" from Toolchain. Remove "Structured logging around the solve boundary" from "Pay down alongside the sprint" (the solve-boundary wrapping is shipped; the broader JSON-logging item stays).
- **ADR decision.** The endpoint contract is stable enough to be worth freezing in an ADR ("Solver integration: PyO3 binding + compute-only endpoint, global solve filtered per class"). Marginal call — write the ADR if no other decision in this PR stands out, skip it otherwise.
- **Sprint step 2** builds on this: `scheduled_lesson` table, `POST /schedule` upserting rows, `GET /schedule` reading back per class. Step 2's spec will treat the response shape of this endpoint as the persistence target.
- **Sprint step 3** builds against `ScheduleResponse` directly. No frontend changes land in this PR, but the generated OpenAPI types will include the endpoint on the next `mise run fe:types` run (CI-side).

## Deviations from OPEN_THINGS step 1 wording

Two clarifications vs the sprint item text:

- The item says `POST /api/school-classes/{id}/schedule`. Existing scheduling routes use `/api/classes/{class_id}/...` (see `generate-lessons`). This PR follows the existing convention; `school-classes` vs `classes` is a URL-slug choice, not a semantic one.
- The item says "returns the placement". This PR returns `{placements, violations}` — the solver's Solution shape, filtered to this class's lessons. Returning only placements would drop the violation surface the UI needs to show why a lesson didn't get scheduled.

## Open questions

None that block implementation. The ADR question above is binary and can be decided while writing the step-6 docs pass.
