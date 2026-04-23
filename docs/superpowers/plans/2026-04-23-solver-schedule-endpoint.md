# Solver binding + `POST /api/classes/{id}/schedule` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `reverse_chars` placeholder in `solver-py` with a real `solve_json` PyO3 binding, and add `POST /api/classes/{class_id}/schedule` that loads the school's entities, runs the solver off the event loop, filters the result to the requested class's lessons, and returns a typed Pydantic response.

**Architecture:** Atomic solver rewrite (both crates in one commit) plus a layered backend endpoint (Pydantic response schema, a pure-helper `solver_io.py` with problem-builder / solve-runner / per-class filter, and a thin route handler with structured logging). Global solve, per-class response. No persistence.

**Tech Stack:** Rust 1.85 + PyO3 0.28 + maturin, FastAPI + SQLAlchemy async + Pydantic, pytest + uv, Python 3.13. `asyncio.to_thread` for off-loop execution. stdlib `logging` with `extra={}` for structured fields.

---

## File structure

**Modify (solver workspace, one atomic commit):**

- `solver/solver-core/src/lib.rs` — remove `reverse_chars` and its three unit tests.
- `solver/solver-core/tests/proptest_reverse.rs` — delete file.
- `solver/solver-py/src/lib.rs` — replace `py_reverse_chars` with `solve_json`.
- `solver/solver-py/python/klassenzeit_solver/__init__.py` — re-export `solve_json`.
- `solver/solver-py/python/klassenzeit_solver/__init__.pyi` — `solve_json` stub.
- `solver/solver-py/python/klassenzeit_solver/_rust.pyi` — `solve_json` stub.
- `solver/solver-py/tests/test_bindings.py` — rewrite with 4 `solve_json` tests.

**Create (backend, one atomic commit):**

- `backend/src/klassenzeit_backend/scheduling/schemas/schedule.py` — `PlacementResponse`, `ViolationResponse`, `ScheduleResponse`.
- `backend/src/klassenzeit_backend/scheduling/solver_io.py` — `build_problem_json`, `run_solve`, `filter_solution_for_class`.
- `backend/src/klassenzeit_backend/scheduling/routes/schedule.py` — `schedule_router` + POST handler.
- `backend/tests/scheduling/test_solver_io.py` — io-helper tests.
- `backend/tests/scheduling/test_schedule_route.py` — route tests.

**Modify (backend, same commit):**

- `backend/src/klassenzeit_backend/scheduling/routes/__init__.py` — mount `schedule_router`.
- `backend/src/klassenzeit_backend/main.py` — drop `reverse_chars` import, remove `solver_check` from `/health`.
- `backend/tests/test_main.py` — drop `solver_check` assertion.

---

### Task 1: Replace `reverse_chars` with `solve_json` in the solver binding

**Files:**
- Modify: `solver/solver-py/tests/test_bindings.py`
- Modify: `solver/solver-py/src/lib.rs`
- Modify: `solver/solver-py/python/klassenzeit_solver/__init__.py`
- Modify: `solver/solver-py/python/klassenzeit_solver/__init__.pyi`
- Modify: `solver/solver-py/python/klassenzeit_solver/_rust.pyi`
- Modify: `solver/solver-core/src/lib.rs`
- Delete: `solver/solver-core/tests/proptest_reverse.rs`

TDD red-green-refactor: rewrite the binding tests first, watch them fail because `solve_json` is not exported, then replace `reverse_chars` everywhere.

- [ ] **Step 1.1: Rewrite `solver-py/tests/test_bindings.py` with four failing `solve_json` tests**

Replace the entire file contents with:

```python
"""Contract tests for the klassenzeit_solver PyO3 binding.

These exercise the wrapper layer: JSON marshalling, error conversion, and GIL
release. They are intentionally thin — the algorithm is covered by
`solver-core`'s Rust tests.
"""

import json
import threading
import time
import uuid

import pytest

from klassenzeit_solver import solve_json


def _uuid(n: int) -> str:
    return str(uuid.UUID(bytes=bytes([n]) * 16))


def _minimal_problem() -> dict:
    tb = _uuid(10)
    teacher = _uuid(20)
    room = _uuid(30)
    subject = _uuid(40)
    class_id = _uuid(50)
    lesson = _uuid(60)
    return {
        "time_blocks": [{"id": tb, "day_of_week": 0, "position": 0}],
        "teachers": [{"id": teacher, "max_hours_per_week": 5}],
        "rooms": [{"id": room}],
        "subjects": [{"id": subject}],
        "school_classes": [{"id": class_id}],
        "lessons": [
            {
                "id": lesson,
                "school_class_id": class_id,
                "subject_id": subject,
                "teacher_id": teacher,
                "hours_per_week": 1,
            }
        ],
        "teacher_qualifications": [{"teacher_id": teacher, "subject_id": subject}],
        "teacher_blocked_times": [],
        "room_blocked_times": [],
        "room_subject_suitabilities": [],
    }


def test_solve_json_minimal_problem_round_trips() -> None:
    result = json.loads(solve_json(json.dumps(_minimal_problem())))
    assert len(result["placements"]) == 1
    assert result["violations"] == []


def test_solve_json_raises_value_error_on_malformed_json() -> None:
    with pytest.raises(ValueError):
        solve_json("not json")


def test_solve_json_raises_value_error_on_empty_time_blocks() -> None:
    problem = _minimal_problem()
    problem["time_blocks"] = []
    with pytest.raises(ValueError):
        solve_json(json.dumps(problem))


def test_solve_json_releases_gil() -> None:
    """Two threads solving in parallel should not serialise on the GIL.

    The solver's work is pure Rust; `py.allow_threads` wraps the call so other
    Python threads can run. With the GIL released, two concurrent solves should
    finish in well under 2× the single-solve wall-clock time on any machine
    where the solver takes more than a few microseconds.
    """

    problem_json = json.dumps(_minimal_problem())

    def _solve_once() -> None:
        for _ in range(50):
            solve_json(problem_json)

    # Warm up to exclude maturin/binding import overhead.
    _solve_once()

    single_start = time.perf_counter()
    _solve_once()
    single_duration = time.perf_counter() - single_start

    parallel_start = time.perf_counter()
    threads = [threading.Thread(target=_solve_once) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    parallel_duration = time.perf_counter() - parallel_start

    assert parallel_duration < 1.7 * single_duration, (
        f"parallel solves took {parallel_duration:.3f}s vs single {single_duration:.3f}s; "
        "GIL likely not released"
    )
```

- [ ] **Step 1.2: Rewrite `solver-py/src/lib.rs` to expose `solve_json`**

Replace the entire file contents with:

```rust
//! solver-py — thin PyO3 wrapper over solver-core. Only glue lives here.

#![deny(missing_docs)]

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Solve a timetable problem supplied as a JSON string and return the resulting
/// Solution as a JSON string. Releases the GIL during the call so parallel
/// Python threads are not serialised behind the interpreter lock.
#[pyfunction]
fn solve_json(py: Python<'_>, problem_json: &str) -> PyResult<String> {
    py.allow_threads(|| solver_core::solve_json(problem_json))
        .map_err(|e| PyValueError::new_err(e.to_string()))
}

/// Python module exposing solver-core functions.
#[pymodule]
fn _rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(solve_json, m)?)?;
    Ok(())
}
```

- [ ] **Step 1.3: Update `__init__.py` and both `.pyi` stubs**

Overwrite `solver/solver-py/python/klassenzeit_solver/__init__.py`:

```python
"""Python bindings for the Klassenzeit constraint solver."""

from ._rust import solve_json

__all__ = ["solve_json"]
```

Overwrite `solver/solver-py/python/klassenzeit_solver/_rust.pyi`:

```python
def solve_json(problem_json: str) -> str: ...
```

Overwrite `solver/solver-py/python/klassenzeit_solver/__init__.pyi`:

```python
def solve_json(problem_json: str) -> str: ...
```

- [ ] **Step 1.4: Remove `reverse_chars` from `solver-core/src/lib.rs`**

Edit `solver/solver-core/src/lib.rs`, replacing the whole file with:

```rust
//! solver-core — pure Rust solver logic. No Python, no PyO3.

#![deny(missing_docs)]

pub mod error;
pub mod ids;
pub(crate) mod index;
pub mod json;
pub mod solve;
pub mod types;
pub mod validate;

pub use error::Error;
pub use ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
pub use json::{error_envelope_json, solve_json};
pub use solve::solve;
pub use types::{
    Lesson, Placement, Problem, Room, RoomBlockedTime, RoomSubjectSuitability, SchoolClass,
    Solution, Subject, Teacher, TeacherBlockedTime, TeacherQualification, TimeBlock, Violation,
    ViolationKind,
};
```

The three `reverse_chars` unit tests inside `mod tests` go with the function.

- [ ] **Step 1.5: Delete `solver/solver-core/tests/proptest_reverse.rs`**

Run:

```bash
git rm solver/solver-core/tests/proptest_reverse.rs
```

- [ ] **Step 1.6: Rebuild the binding and run the full test suite for both crates**

```bash
mise run solver:rebuild
cargo nextest run -p solver-core
cargo nextest run -p solver-py
uv run pytest solver/solver-py/tests
mise run lint
```

Expected:
- `cargo nextest run -p solver-core`: all tests pass (unit + integration + remaining property tests).
- `cargo nextest run -p solver-py`: passes (no Rust-side unit tests; compiles clean).
- `uv run pytest solver/solver-py/tests`: the four new tests pass.
- `mise run lint`: clippy clean, ruff clean, ty clean, cargo fmt clean, machete clean.

- [ ] **Step 1.7: Stage + commit (main session only)**

The subagent does NOT commit. Main session stages and commits:

```bash
git add solver/ && git commit -m "feat(solver): solve_json binding replaces reverse_chars placeholder"
```

---

### Task 2: Add Pydantic response schemas

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/schedule.py`

- [ ] **Step 2.1: Write `scheduling/schemas/schedule.py`**

Create the file with:

```python
"""Pydantic response schemas for the schedule endpoint.

Mirrors the `solver_core::Solution` wire format, filtered to a single school
class's lessons by the route handler.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class PlacementResponse(BaseModel):
    """One placed lesson-hour: which lesson, in which time block, in which room."""

    lesson_id: UUID
    time_block_id: UUID
    room_id: UUID


class ViolationResponse(BaseModel):
    """One hard-constraint violation emitted by the solver."""

    kind: Literal["no_qualified_teacher", "unplaced_lesson"]
    lesson_id: UUID
    hour_index: int = Field(ge=0)
    message: str


class ScheduleResponse(BaseModel):
    """Per-class filtered solver output for `POST /api/classes/{id}/schedule`."""

    placements: list[PlacementResponse]
    violations: list[ViolationResponse]
```

No tests for this file directly; schema correctness is covered by the route tests in Task 6.

- [ ] **Step 2.2: Run lint**

```bash
mise run lint:py
```

Expected: clean.

---

### Task 3: Add `solver_io.py` module skeleton plus `filter_solution_for_class` (pure function + tests)

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/solver_io.py`
- Create: `backend/tests/scheduling/test_solver_io.py`

This task seeds the file with just the pure function and its tests so later tasks can extend it without conflicts. Pure fn, no DB, no binding.

- [ ] **Step 3.1: Write the failing tests for `filter_solution_for_class`**

Create `backend/tests/scheduling/test_solver_io.py`:

```python
"""Tests for solver_io.py — Problem building, solve runner, per-class filter."""

from uuid import UUID, uuid4

from klassenzeit_backend.scheduling.solver_io import filter_solution_for_class


def test_filter_solution_for_class_keeps_only_class_lessons() -> None:
    class_lesson = uuid4()
    other_lesson = uuid4()
    solution = {
        "placements": [
            {"lesson_id": str(class_lesson), "time_block_id": str(uuid4()), "room_id": str(uuid4())},
            {"lesson_id": str(other_lesson), "time_block_id": str(uuid4()), "room_id": str(uuid4())},
        ],
        "violations": [],
    }
    filtered = filter_solution_for_class(solution, {class_lesson})
    assert len(filtered["placements"]) == 1
    assert UUID(filtered["placements"][0]["lesson_id"]) == class_lesson


def test_filter_solution_for_class_drops_violations_for_other_classes() -> None:
    class_lesson = uuid4()
    other_lesson = uuid4()
    solution = {
        "placements": [],
        "violations": [
            {"kind": "unplaced_lesson", "lesson_id": str(class_lesson), "hour_index": 0, "message": "x"},
            {"kind": "unplaced_lesson", "lesson_id": str(other_lesson), "hour_index": 0, "message": "y"},
        ],
    }
    filtered = filter_solution_for_class(solution, {class_lesson})
    assert len(filtered["violations"]) == 1
    assert UUID(filtered["violations"][0]["lesson_id"]) == class_lesson


def test_filter_solution_for_class_empty_input() -> None:
    filtered = filter_solution_for_class({"placements": [], "violations": []}, set())
    assert filtered == {"placements": [], "violations": []}
```

- [ ] **Step 3.2: Run the test to confirm it fails**

```bash
uv run pytest backend/tests/scheduling/test_solver_io.py -v
```

Expected: `ModuleNotFoundError: No module named 'klassenzeit_backend.scheduling.solver_io'`.

- [ ] **Step 3.3: Create `scheduling/solver_io.py` with just the pure filter function**

Create `backend/src/klassenzeit_backend/scheduling/solver_io.py`:

```python
"""Solver IO: problem building, solve runner, per-class response filter.

Sits between the route handler and the PyO3 binding. Route handlers use the
three exported helpers (`build_problem_json`, `run_solve`, `filter_solution_for_class`).
"""

from __future__ import annotations

from uuid import UUID


def filter_solution_for_class(solution: dict, class_lesson_ids: set[UUID]) -> dict:
    """Keep only placements and violations whose lesson belongs to this class."""
    placements = [p for p in solution["placements"] if UUID(p["lesson_id"]) in class_lesson_ids]
    violations = [v for v in solution["violations"] if UUID(v["lesson_id"]) in class_lesson_ids]
    return {"placements": placements, "violations": violations}
```

- [ ] **Step 3.4: Run the test to confirm it passes**

```bash
uv run pytest backend/tests/scheduling/test_solver_io.py -v
```

Expected: all three tests pass.

---

### Task 4: Extend `solver_io.py` with `build_problem_json` and its tests

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/solver_io.py`
- Modify: `backend/tests/scheduling/test_solver_io.py`

The Problem-builder loads the school's entities, transforms TeacherAvailability/RoomAvailability to the solver's blocked-times shape, and pre-validates. The tests need DB fixtures; use the existing `backend/tests/db/` patterns.

Existing DB fixture conventions live in `backend/tests/db/conftest.py`; reuse `async_session` (or its equivalent) rather than spinning up a new fixture.

- [ ] **Step 4.1: Skim the existing DB fixture patterns**

Read:
- `backend/tests/db/conftest.py` — session fixture names and shapes.
- `backend/tests/conftest.py` (root) — top-level fixtures.
- Any existing `backend/tests/scheduling/conftest.py` if it exists.

Pick the fixture that yields an `AsyncSession`. Call it `db` in the new test file for consistency.

- [ ] **Step 4.2: Add failing tests for `build_problem_json`**

Append to `backend/tests/scheduling/test_solver_io.py`. The exact fixture names depend on what the conftest provides; the below assumes a fixture `db: AsyncSession` and a factory pattern for seeding entities. Adapt imports and fixtures to match what exists.

```python
import json
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.room import Room, RoomAvailability
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import Stundentafel
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher, TeacherAvailability, TeacherQualification
from klassenzeit_backend.db.models.week_scheme import TimeBlock, WeekScheme
from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.scheduling.solver_io import build_problem_json


async def _seed_minimal_solvable_school(db: AsyncSession) -> SchoolClass:
    """Seed a single-class, single-lesson, single-room minimal problem. Returns the class."""
    scheme = WeekScheme(name="Standard")
    db.add(scheme)
    await db.flush()
    tb = TimeBlock(week_scheme_id=scheme.id, day_of_week=0, position=0,
                   start_time="08:00", end_time="08:45")
    db.add(tb)
    subject = Subject(name="Deutsch", short_name="D")
    db.add(subject)
    tafel = Stundentafel(name="1-2", grade_level=1)
    db.add(tafel)
    teacher = Teacher(first_name="Anna", last_name="Schmidt",
                      short_code="ASC", max_hours_per_week=28, is_active=True)
    db.add(teacher)
    room = Room(name="Raum 1", short_name="R1", capacity=24)
    db.add(room)
    await db.flush()
    db.add(TeacherQualification(teacher_id=teacher.id, subject_id=subject.id))
    cls = SchoolClass(name="1a", grade_level=1,
                      stundentafel_id=tafel.id, week_scheme_id=scheme.id)
    db.add(cls)
    await db.flush()
    lesson = Lesson(school_class_id=cls.id, subject_id=subject.id,
                    teacher_id=teacher.id, hours_per_week=1, preferred_block_size=1)
    db.add(lesson)
    await db.flush()
    return cls


@pytest.mark.asyncio
async def test_build_problem_json_returns_populated_shape(db: AsyncSession) -> None:
    cls = await _seed_minimal_solvable_school(db)
    problem_json, class_lesson_ids, counts = await build_problem_json(db, cls.id)
    problem = json.loads(problem_json)
    assert set(problem.keys()) == {
        "time_blocks", "teachers", "rooms", "subjects", "school_classes",
        "lessons", "teacher_qualifications", "teacher_blocked_times",
        "room_blocked_times", "room_subject_suitabilities",
    }
    assert len(problem["time_blocks"]) == 1
    assert len(problem["lessons"]) == 1
    assert len(class_lesson_ids) == 1
    assert counts["lessons"] == 1


@pytest.mark.asyncio
async def test_build_problem_json_raises_404_for_unknown_class(db: AsyncSession) -> None:
    import uuid as _uuid
    with pytest.raises(HTTPException) as excinfo:
        await build_problem_json(db, _uuid.uuid4())
    assert excinfo.value.status_code == 404


@pytest.mark.asyncio
async def test_build_problem_json_raises_422_when_week_scheme_has_no_time_blocks(
    db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    # Remove the single time block.
    from sqlalchemy import delete
    await db.execute(delete(TimeBlock))
    await db.flush()
    with pytest.raises(HTTPException) as excinfo:
        await build_problem_json(db, cls.id)
    assert excinfo.value.status_code == 422
    assert "time_blocks" in excinfo.value.detail.lower()


@pytest.mark.asyncio
async def test_build_problem_json_raises_422_when_rooms_table_empty(
    db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    from sqlalchemy import delete
    await db.execute(delete(Room))
    await db.flush()
    with pytest.raises(HTTPException) as excinfo:
        await build_problem_json(db, cls.id)
    assert excinfo.value.status_code == 422
    assert "rooms" in excinfo.value.detail.lower()


@pytest.mark.asyncio
async def test_build_problem_json_raises_422_on_mixed_week_schemes(db: AsyncSession) -> None:
    cls_a = await _seed_minimal_solvable_school(db)
    # Create a second class on a different scheme with a lesson.
    scheme_b = WeekScheme(name="Alternate")
    db.add(scheme_b)
    tafel_b = Stundentafel(name="1-2-alt", grade_level=1)
    db.add(tafel_b)
    await db.flush()
    cls_b = SchoolClass(name="1b", grade_level=1,
                        stundentafel_id=tafel_b.id, week_scheme_id=scheme_b.id)
    db.add(cls_b)
    await db.flush()
    # Reuse cls_a's subject/teacher so the lesson has valid FKs.
    from sqlalchemy import select
    subject = (await db.execute(select(Subject))).scalar_one()
    teacher = (await db.execute(select(Teacher))).scalar_one()
    db.add(Lesson(school_class_id=cls_b.id, subject_id=subject.id,
                  teacher_id=teacher.id, hours_per_week=1, preferred_block_size=1))
    await db.flush()
    with pytest.raises(HTTPException) as excinfo:
        await build_problem_json(db, cls_a.id)
    assert excinfo.value.status_code == 422
    assert "week_scheme" in excinfo.value.detail


@pytest.mark.asyncio
async def test_build_problem_json_transforms_teacher_availability_status(
    db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    from sqlalchemy import select
    teacher = (await db.execute(select(Teacher))).scalar_one()
    tb = (await db.execute(select(TimeBlock))).scalar_one()
    db.add(TeacherAvailability(teacher_id=teacher.id, time_block_id=tb.id, status="blocked"))
    await db.flush()
    problem_json, _, _ = await build_problem_json(db, cls.id)
    problem = json.loads(problem_json)
    assert len(problem["teacher_blocked_times"]) == 1
    assert problem["teacher_blocked_times"][0]["teacher_id"] == str(teacher.id)


@pytest.mark.asyncio
async def test_build_problem_json_teacher_availability_available_is_not_blocked(
    db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    from sqlalchemy import select
    teacher = (await db.execute(select(Teacher))).scalar_one()
    tb = (await db.execute(select(TimeBlock))).scalar_one()
    db.add(TeacherAvailability(teacher_id=teacher.id, time_block_id=tb.id, status="available"))
    await db.flush()
    problem_json, _, _ = await build_problem_json(db, cls.id)
    problem = json.loads(problem_json)
    assert problem["teacher_blocked_times"] == []


@pytest.mark.asyncio
async def test_build_problem_json_transforms_room_availability_whitelist(
    db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    # Add a second and third time block so the whitelist has meaning.
    from sqlalchemy import select
    scheme = (await db.execute(select(WeekScheme))).scalar_one()
    tb1 = (await db.execute(select(TimeBlock))).scalar_one()
    tb2 = TimeBlock(week_scheme_id=scheme.id, day_of_week=0, position=1,
                    start_time="08:50", end_time="09:35")
    tb3 = TimeBlock(week_scheme_id=scheme.id, day_of_week=0, position=2,
                    start_time="09:40", end_time="10:25")
    db.add_all([tb2, tb3])
    room = (await db.execute(select(Room))).scalar_one()
    await db.flush()
    # Whitelist: the room is available only in tb1.
    db.add(RoomAvailability(room_id=room.id, time_block_id=tb1.id))
    await db.flush()
    problem_json, _, _ = await build_problem_json(db, cls.id)
    problem = json.loads(problem_json)
    blocked_tb_ids = {entry["time_block_id"] for entry in problem["room_blocked_times"]
                      if entry["room_id"] == str(room.id)}
    assert blocked_tb_ids == {str(tb2.id), str(tb3.id)}


@pytest.mark.asyncio
async def test_build_problem_json_room_without_whitelist_is_unblocked(
    db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    problem_json, _, _ = await build_problem_json(db, cls.id)
    problem = json.loads(problem_json)
    assert problem["room_blocked_times"] == []
```

- [ ] **Step 4.3: Run the tests to confirm they fail**

```bash
uv run pytest backend/tests/scheduling/test_solver_io.py -v
```

Expected: every new test fails (ImportError or NameError on `build_problem_json`).

- [ ] **Step 4.4: Implement `build_problem_json` in `solver_io.py`**

Append to `backend/src/klassenzeit_backend/scheduling/solver_io.py`:

```python
import json
import logging
from uuid import UUID as _UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.room import Room, RoomAvailability, RoomSubjectSuitability
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import (
    Teacher,
    TeacherAvailability,
    TeacherQualification,
)
from klassenzeit_backend.db.models.week_scheme import TimeBlock

logger = logging.getLogger(__name__)


async def build_problem_json(
    db: AsyncSession, class_id: UUID
) -> tuple[str, set[UUID], dict[str, int]]:
    """Load the school-wide solver input for the class and serialize it to JSON.

    Returns (problem_json, class_lesson_ids, input_counts).

    Raises:
        HTTPException: 404 if the class doesn't exist, 422 on a pre-solve data
            invariant (no time_blocks for the class's week_scheme, empty rooms
            table, classes referencing different week_schemes).
    """
    requested_class = await db.get(SchoolClass, class_id)
    if requested_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")

    time_blocks = (
        await db.execute(
            select(TimeBlock).where(TimeBlock.week_scheme_id == requested_class.week_scheme_id)
        )
    ).scalars().all()
    if not time_blocks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="class's week_scheme has no time_blocks configured",
        )

    lessons = (
        await db.execute(select(Lesson).where(Lesson.teacher_id.is_not(None)))
    ).scalars().all()

    involved_class_ids = {l.school_class_id for l in lessons} | {requested_class.id}
    involved_classes = (
        await db.execute(select(SchoolClass).where(SchoolClass.id.in_(involved_class_ids)))
    ).scalars().all()
    mismatched = [c for c in involved_classes if c.week_scheme_id != requested_class.week_scheme_id]
    if mismatched:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "classes referenced in this solve use different week_schemes: "
                + ", ".join(str(c.id) for c in mismatched)
            ),
        )

    rooms = (await db.execute(select(Room))).scalars().all()
    if not rooms:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="no rooms configured; cannot solve",
        )

    teacher_ids = {l.teacher_id for l in lessons}
    subject_ids = {l.subject_id for l in lessons}
    teachers = (
        (await db.execute(select(Teacher).where(Teacher.id.in_(teacher_ids)))).scalars().all()
        if teacher_ids else []
    )
    subjects = (
        (await db.execute(select(Subject).where(Subject.id.in_(subject_ids)))).scalars().all()
        if subject_ids else []
    )

    time_block_ids = {tb.id for tb in time_blocks}
    room_ids = {r.id for r in rooms}
    teacher_qualifications = (
        await db.execute(
            select(TeacherQualification).where(
                TeacherQualification.teacher_id.in_(teacher_ids or {_UUID(int=0)}),
                TeacherQualification.subject_id.in_(subject_ids or {_UUID(int=0)}),
            )
        )
    ).scalars().all()

    teacher_availabilities = (
        await db.execute(
            select(TeacherAvailability).where(
                TeacherAvailability.teacher_id.in_(teacher_ids or {_UUID(int=0)}),
                TeacherAvailability.time_block_id.in_(time_block_ids),
            )
        )
    ).scalars().all()

    room_availabilities = (
        await db.execute(
            select(RoomAvailability).where(
                RoomAvailability.room_id.in_(room_ids),
                RoomAvailability.time_block_id.in_(time_block_ids),
            )
        )
    ).scalars().all()

    room_subject_suitabilities = (
        await db.execute(
            select(RoomSubjectSuitability).where(
                RoomSubjectSuitability.room_id.in_(room_ids),
                RoomSubjectSuitability.subject_id.in_(subject_ids or {_UUID(int=0)}),
            )
        )
    ).scalars().all()

    # Transform TeacherAvailability → TeacherBlockedTime (solver speaks "blocked").
    teacher_blocked_times = [
        {"teacher_id": str(a.teacher_id), "time_block_id": str(a.time_block_id)}
        for a in teacher_availabilities
        if a.status != "available"
    ]

    # Transform RoomAvailability whitelist → RoomBlockedTime.
    whitelist_by_room: dict[UUID, set[UUID]] = {}
    for ra in room_availabilities:
        whitelist_by_room.setdefault(ra.room_id, set()).add(ra.time_block_id)
    room_blocked_times = []
    for room in rooms:
        whitelist = whitelist_by_room.get(room.id)
        if whitelist is None:
            continue  # zero entries → universally available
        for tb in time_blocks:
            if tb.id not in whitelist:
                room_blocked_times.append(
                    {"room_id": str(room.id), "time_block_id": str(tb.id)}
                )

    problem = {
        "time_blocks": [
            {"id": str(tb.id), "day_of_week": tb.day_of_week, "position": tb.position}
            for tb in time_blocks
        ],
        "teachers": [
            {"id": str(t.id), "max_hours_per_week": t.max_hours_per_week} for t in teachers
        ],
        "rooms": [{"id": str(r.id)} for r in rooms],
        "subjects": [{"id": str(s.id)} for s in subjects],
        "school_classes": [{"id": str(c.id)} for c in involved_classes],
        "lessons": [
            {
                "id": str(l.id),
                "school_class_id": str(l.school_class_id),
                "subject_id": str(l.subject_id),
                "teacher_id": str(l.teacher_id),
                "hours_per_week": l.hours_per_week,
            }
            for l in lessons
        ],
        "teacher_qualifications": [
            {"teacher_id": str(q.teacher_id), "subject_id": str(q.subject_id)}
            for q in teacher_qualifications
        ],
        "teacher_blocked_times": teacher_blocked_times,
        "room_blocked_times": room_blocked_times,
        "room_subject_suitabilities": [
            {"room_id": str(s.room_id), "subject_id": str(s.subject_id)}
            for s in room_subject_suitabilities
        ],
    }

    class_lesson_ids = {l.id for l in lessons if l.school_class_id == requested_class.id}

    counts = {
        "time_blocks": len(problem["time_blocks"]),
        "teachers": len(problem["teachers"]),
        "rooms": len(problem["rooms"]),
        "subjects": len(problem["subjects"]),
        "school_classes": len(problem["school_classes"]),
        "lessons": len(problem["lessons"]),
        "teacher_qualifications": len(problem["teacher_qualifications"]),
        "teacher_blocked_times": len(problem["teacher_blocked_times"]),
        "room_blocked_times": len(problem["room_blocked_times"]),
        "room_subject_suitabilities": len(problem["room_subject_suitabilities"]),
    }

    return json.dumps(problem), class_lesson_ids, counts
```

Note the `_UUID(int=0)` fallback in the `.in_(teacher_ids or {_UUID(int=0)})` pattern: an empty `set` in an `IN (...)` clause raises in some SQLAlchemy/driver combinations. Using a set with a sentinel UUID that no real row matches keeps the query valid when the entity set is empty (e.g., a class with zero lessons).

- [ ] **Step 4.5: Run the tests to confirm they pass**

```bash
uv run pytest backend/tests/scheduling/test_solver_io.py -v
```

Expected: all tests pass. Iterate on the implementation if any fail — the test is the spec.

- [ ] **Step 4.6: Run lint**

```bash
mise run lint:py
```

Expected: clean.

---

### Task 5: Extend `solver_io.py` with `run_solve`

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/solver_io.py`
- Modify: `backend/tests/scheduling/test_solver_io.py`

`run_solve` wraps the binding call in `asyncio.to_thread` and emits the three structured log events.

- [ ] **Step 5.1: Add failing tests**

Append to `backend/tests/scheduling/test_solver_io.py`:

```python
import logging
from uuid import uuid4 as _uuid4

from klassenzeit_backend.scheduling.solver_io import run_solve


@pytest.mark.asyncio
async def test_run_solve_round_trips_and_logs(caplog: pytest.LogCaptureFixture) -> None:
    # Reuse the minimal solvable problem from the binding tests.
    teacher = str(_uuid4())
    tb = str(_uuid4())
    subject = str(_uuid4())
    room = str(_uuid4())
    klass = str(_uuid4())
    lesson = str(_uuid4())
    problem = {
        "time_blocks": [{"id": tb, "day_of_week": 0, "position": 0}],
        "teachers": [{"id": teacher, "max_hours_per_week": 5}],
        "rooms": [{"id": room}],
        "subjects": [{"id": subject}],
        "school_classes": [{"id": klass}],
        "lessons": [{
            "id": lesson,
            "school_class_id": klass,
            "subject_id": subject,
            "teacher_id": teacher,
            "hours_per_week": 1,
        }],
        "teacher_qualifications": [{"teacher_id": teacher, "subject_id": subject}],
        "teacher_blocked_times": [],
        "room_blocked_times": [],
        "room_subject_suitabilities": [],
    }

    caplog.set_level(logging.INFO, logger="klassenzeit_backend.scheduling.solver_io")
    class_id = _uuid4()
    solution = await run_solve(
        json.dumps(problem), class_id, {"lessons": 1, "time_blocks": 1}
    )
    assert len(solution["placements"]) == 1
    assert solution["violations"] == []

    events = [r.message for r in caplog.records]
    assert "solver.solve.start" in events
    assert "solver.solve.done" in events


@pytest.mark.asyncio
async def test_run_solve_logs_error_and_reraises(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.ERROR, logger="klassenzeit_backend.scheduling.solver_io")
    class_id = _uuid4()
    with pytest.raises(ValueError):
        await run_solve("not json", class_id, {"lessons": 0})
    assert any(r.message == "solver.solve.error" for r in caplog.records)
```

- [ ] **Step 5.2: Run the tests to confirm they fail**

```bash
uv run pytest backend/tests/scheduling/test_solver_io.py::test_run_solve_round_trips_and_logs backend/tests/scheduling/test_solver_io.py::test_run_solve_logs_error_and_reraises -v
```

Expected: `ImportError` on `run_solve`.

- [ ] **Step 5.3: Implement `run_solve` in `solver_io.py`**

Append to `backend/src/klassenzeit_backend/scheduling/solver_io.py`:

```python
import asyncio
import time

from klassenzeit_solver import solve_json as _solve_json


async def run_solve(
    problem_json: str, school_class_id: UUID, input_counts: dict[str, int]
) -> dict:
    """Run the solver off the event loop, emit structured log events, return the Solution dict."""
    logger.info(
        "solver.solve.start",
        extra={"school_class_id": str(school_class_id), **input_counts},
    )
    started = time.monotonic()
    try:
        solution_json = await asyncio.to_thread(_solve_json, problem_json)
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
        },
    )
    return solution
```

- [ ] **Step 5.4: Run the tests to confirm they pass**

```bash
uv run pytest backend/tests/scheduling/test_solver_io.py -v
```

Expected: all `solver_io` tests pass (the existing ones plus the two new `run_solve` tests).

- [ ] **Step 5.5: Run lint**

```bash
mise run lint:py
```

Expected: clean.

---

### Task 6: Add the schedule route handler and its tests

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/routes/schedule.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/__init__.py`
- Create: `backend/tests/scheduling/test_schedule_route.py`

- [ ] **Step 6.1: Read the existing route __init__ to learn the mounting pattern**

Read `backend/src/klassenzeit_backend/scheduling/routes/__init__.py` to see how `classes_router`, `lessons_router`, etc. are wired into `scheduling_router`. Follow the same pattern for `schedule_router`.

- [ ] **Step 6.2: Write failing route tests**

Create `backend/tests/scheduling/test_schedule_route.py`. Use the existing authenticated-client fixture pattern (look at `backend/tests/scheduling/test_*_route.py` or the equivalent for an admin-authenticated `client`). The test file uses whatever fixture name the other route tests use for an admin-logged-in test client.

```python
"""Tests for POST /api/classes/{class_id}/schedule."""

import logging
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# Seed helpers: reuse the factory from test_solver_io.py via pytest conftest if extracted,
# otherwise inline the same seed.
from backend.tests.scheduling.test_solver_io import _seed_minimal_solvable_school


@pytest.mark.asyncio
async def test_schedule_post_returns_404_for_unknown_class(
    authed_client: AsyncClient,
) -> None:
    resp = await authed_client.post(f"/api/classes/{uuid.uuid4()}/schedule")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_schedule_post_returns_200_with_placements_on_happy_path(
    authed_client: AsyncClient, db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    await db.commit()
    resp = await authed_client.post(f"/api/classes/{cls.id}/schedule")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["placements"]) == 1
    assert body["violations"] == []


@pytest.mark.asyncio
async def test_schedule_post_returns_422_without_time_blocks(
    authed_client: AsyncClient, db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    from sqlalchemy import delete
    from klassenzeit_backend.db.models.week_scheme import TimeBlock
    await db.execute(delete(TimeBlock))
    await db.commit()
    resp = await authed_client.post(f"/api/classes/{cls.id}/schedule")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_schedule_post_returns_422_when_rooms_table_empty(
    authed_client: AsyncClient, db: AsyncSession,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    from sqlalchemy import delete
    from klassenzeit_backend.db.models.room import Room
    await db.execute(delete(Room))
    await db.commit()
    resp = await authed_client.post(f"/api/classes/{cls.id}/schedule")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_schedule_post_filters_out_other_classes_placements(
    authed_client: AsyncClient, db: AsyncSession,
) -> None:
    # Seed two classes sharing the same scheme, with one lesson each.
    cls_a = await _seed_minimal_solvable_school(db)
    from sqlalchemy import select
    from klassenzeit_backend.db.models.school_class import SchoolClass
    from klassenzeit_backend.db.models.subject import Subject
    from klassenzeit_backend.db.models.teacher import Teacher
    from klassenzeit_backend.db.models.week_scheme import TimeBlock
    from klassenzeit_backend.db.models.stundentafel import Stundentafel
    from klassenzeit_backend.db.models.lesson import Lesson
    scheme_id = cls_a.week_scheme_id
    tafel = (await db.execute(select(Stundentafel))).scalar_one()
    subject = (await db.execute(select(Subject))).scalar_one()
    teacher = (await db.execute(select(Teacher))).scalar_one()
    # Need a second time block so both lessons can be placed.
    tb2 = TimeBlock(week_scheme_id=scheme_id, day_of_week=0, position=1,
                    start_time="08:50", end_time="09:35")
    db.add(tb2)
    cls_b = SchoolClass(name="1b", grade_level=1,
                        stundentafel_id=tafel.id, week_scheme_id=scheme_id)
    db.add(cls_b)
    await db.flush()
    db.add(Lesson(school_class_id=cls_b.id, subject_id=subject.id,
                  teacher_id=teacher.id, hours_per_week=1, preferred_block_size=1))
    await db.commit()
    resp = await authed_client.post(f"/api/classes/{cls_a.id}/schedule")
    assert resp.status_code == 200
    body = resp.json()
    # Every returned placement must belong to cls_a's lessons.
    class_a_lesson_ids = {
        str(l.id) for l in
        (await db.execute(select(Lesson).where(Lesson.school_class_id == cls_a.id))).scalars().all()
    }
    for p in body["placements"]:
        assert p["lesson_id"] in class_a_lesson_ids


@pytest.mark.asyncio
async def test_schedule_post_logs_solve_start_and_done(
    authed_client: AsyncClient, db: AsyncSession, caplog: pytest.LogCaptureFixture,
) -> None:
    cls = await _seed_minimal_solvable_school(db)
    await db.commit()
    caplog.set_level(logging.INFO, logger="klassenzeit_backend.scheduling.solver_io")
    resp = await authed_client.post(f"/api/classes/{cls.id}/schedule")
    assert resp.status_code == 200
    events = {r.message for r in caplog.records}
    assert "solver.solve.start" in events
    assert "solver.solve.done" in events
```

If the existing route tests use fixture names that differ from `authed_client` and `db`, rename accordingly at the top of the file. Do not invent a new fixture; reuse what's already conventional in `backend/tests/`.

- [ ] **Step 6.3: Run the tests to confirm they fail**

```bash
uv run pytest backend/tests/scheduling/test_schedule_route.py -v
```

Expected: all fail (route not registered, 404 on POST).

- [ ] **Step 6.4: Implement the route**

Create `backend/src/klassenzeit_backend/scheduling/routes/schedule.py`:

```python
"""POST /api/classes/{class_id}/schedule — run the solver for a single class."""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import require_admin
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session
from klassenzeit_backend.scheduling import solver_io
from klassenzeit_backend.scheduling.schemas.schedule import ScheduleResponse

router = APIRouter(tags=["schedule"])
logger = logging.getLogger(__name__)


@router.post("/classes/{class_id}/schedule")
async def generate_schedule_for_class(
    class_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ScheduleResponse:
    """Run the solver for the given class and return per-class placements and violations.

    Args:
        class_id: UUID path parameter identifying the school class.
        _admin: Injected admin user (enforces authentication).
        db: Injected async database session.

    Returns:
        `ScheduleResponse` with placements and violations scoped to this class.

    Raises:
        HTTPException: 404 if the class doesn't exist; 422 if the class's
            week_scheme has no time_blocks, if other classes in the solve use a
            different week_scheme, or if the rooms table is empty.
    """
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

- [ ] **Step 6.5: Wire the router in `scheduling/routes/__init__.py`**

Edit `backend/src/klassenzeit_backend/scheduling/routes/__init__.py` to import and mount `schedule.router`. Match the exact style of the neighbouring router wiring; do not guess at the existing shape — read the file first and mirror it.

For example, if the file currently looks like:

```python
from fastapi import APIRouter
from .classes import router as classes_router
from .lessons import generate_router, router as lessons_router
# ...

scheduling_router = APIRouter()
scheduling_router.include_router(classes_router)
scheduling_router.include_router(lessons_router)
scheduling_router.include_router(generate_router)
# ...
```

…add:

```python
from .schedule import router as schedule_router
# ...
scheduling_router.include_router(schedule_router)
```

- [ ] **Step 6.6: Run the tests to confirm they pass**

```bash
uv run pytest backend/tests/scheduling/test_schedule_route.py -v
```

Expected: all pass.

- [ ] **Step 6.7: Run the full backend test suite**

```bash
uv run pytest backend/tests -v
```

Expected: all pre-existing tests still pass.

---

### Task 7: Drop `reverse_chars` from `/health` and its test

**Files:**
- Modify: `backend/src/klassenzeit_backend/main.py`
- Modify: `backend/tests/test_main.py`

- [ ] **Step 7.1: Read the existing `/health` test**

Read `backend/tests/test_main.py` to see the exact assertion shape — pick the test name that covers `/health` and what it asserts about `solver_check`.

- [ ] **Step 7.2: Update the test to drop `solver_check`**

Edit the relevant assertion so the test expects `{"status": "ok"}` (no `solver_check` key). Do not invent a new test structure; only remove the one key.

- [ ] **Step 7.3: Run the test to confirm it fails**

```bash
uv run pytest backend/tests/test_main.py -v
```

Expected: the `/health` test fails — the endpoint still returns `solver_check`.

- [ ] **Step 7.4: Update `backend/main.py`**

Remove the `reverse_chars` import and edit `/health`:

```python
# Remove this line:
# from klassenzeit_solver import reverse_chars
```

Change:

```python
@health_router.get("/health")
async def health() -> dict[str, str]:
    """Return a simple health-check response with a solver smoke test."""
    return {"status": "ok", "solver_check": reverse_chars("ok")}
```

to:

```python
@health_router.get("/health")
async def health() -> dict[str, str]:
    """Return a simple health-check response."""
    return {"status": "ok"}
```

- [ ] **Step 7.5: Run the test to confirm it passes**

```bash
uv run pytest backend/tests/test_main.py -v
```

Expected: pass.

- [ ] **Step 7.6: Run the full suite + lint**

```bash
uv run pytest backend/tests -v
mise run lint
```

Expected: all green. Ruff/vulture should not complain about the removed import; the one that was there is gone.

- [ ] **Step 7.7: Stage + commit the backend work (main session only)**

Subagents do not commit. Main session stages and commits after Tasks 2-7 have all passed:

```bash
git add backend/
git commit -m "feat(backend): POST /api/classes/{id}/schedule runs solver off the event loop"
```

---

## Post-implementation steps (main session)

After every task's subagent has returned and the two feat commits have landed:

1. **Run the full workspace suite locally** to catch cross-workspace regressions:

   ```bash
   cargo nextest run --workspace
   uv run pytest
   mise run lint
   ```

2. **Hand-smoke the endpoint** against the dev DB:

   ```bash
   mise run db:up
   mise run db:migrate
   mise run dev &  # wait a few seconds for startup
   # Seed the e2e admin to get a login session, then curl POST /api/classes/<uuid>/schedule
   ```

3. **Finalize docs** (autopilot step 6):

   - `claude-md-management:revise-claude-md` to pull session learnings into CLAUDE.md.
   - `claude-md-management:claude-md-improver` to audit the edits.
   - Update `docs/superpowers/OPEN_THINGS.md`: remove sprint step 1, remove the two bundled cleanup items, note step 2 as next.
   - Decide ADR or skip; if writing, file as `docs/adr/0010-solver-integration-boundary.md` and index in `docs/adr/README.md`.

4. **Skill audit**, push, open PR (autopilot step 7).

---

## Self-review notes

**Spec coverage:**

- Binding `solve_json` + GIL release: Task 1.
- `reverse_chars` removal (core + py): Task 1.
- `.pyi` stubs: Task 1.
- Pydantic `ScheduleResponse`: Task 2.
- `filter_solution_for_class`: Task 3.
- `build_problem_json` (all five numbered failure modes + TeacherAvailability/RoomAvailability transforms): Task 4.
- `run_solve` + structured logging (`solver.solve.start`, `solver.solve.done`, `solver.solve.error`): Task 5.
- Route handler + `solver.solve.filtered` log: Task 6.
- `/health` cleanup: Task 7.

**Type consistency:** `build_problem_json` returns `tuple[str, set[UUID], dict[str, int]]` at every call site. `run_solve` takes and returns dicts (not Pydantic models); `ScheduleResponse.model_validate(filtered_dict)` is how the dict crosses the typing boundary at the route layer. `filter_solution_for_class(solution: dict, class_lesson_ids: set[UUID]) -> dict` is consistent across Task 3 and Task 6.

**Placeholder scan:** None.
