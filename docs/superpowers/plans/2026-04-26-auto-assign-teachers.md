# Auto-assign teachers during generate-lessons: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `POST /api/classes/{id}/generate-lessons` so newly created lessons get a qualified teacher pinned automatically (first qualified teacher with spare capacity, respecting `Teacher.max_hours_per_week`). Drop the back-channel `/__test__/assign-teachers-grundschule` plumbing.

**Architecture:** New pure helper `auto_assign_teachers_for_lessons` in `backend/src/klassenzeit_backend/scheduling/teacher_assignment.py`. The route loads the snapshot (active teachers ordered by short_code, qualifications by subject, hours-already-used per teacher) and calls the helper, which returns `{lesson_id: teacher_id}`. The route applies the assignments in-memory and reuses the existing `db.commit()` flow. Cleanup deletes the now-unused back-channel route, helper, and dict.

**Tech Stack:** FastAPI + SQLAlchemy async, pytest + httpx, Playwright. Conventional Commits via cocogitto. Lefthook pre-commit (ruff, ty, vulture, biome, clippy).

Spec: [`docs/superpowers/specs/2026-04-26-auto-assign-teachers-design.md`](../specs/2026-04-26-auto-assign-teachers-design.md). Five commits on branch `feat/auto-assign-teachers`.

---

## Task 1: Red integration test for happy-path teacher auto-assignment

**Files:**
- Modify: `backend/tests/scheduling/test_lessons.py` (append one test after `test_generate_lessons_skips_existing`).

The test exercises the simplest path: one class, one Stundentafel entry, one qualified teacher with plenty of spare capacity. Today the route returns the lesson with `teacher: null`; after Task 2 it returns the teacher's id. This is the red test.

- [ ] **Step 1.1: Append the failing test**

Insert after the existing `test_generate_lessons_skips_existing` function in `backend/tests/scheduling/test_lessons.py`:

```python
async def test_generate_lessons_assigns_qualified_teacher(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /classes/{id}/generate-lessons pins a qualified teacher with spare capacity.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@les-aa1.com", role="admin")
    await login_as("admin@les-aa1.com", "testpassword123")

    subject_id = await _create_subject(client, "Mathematik-AA", "MaAA")
    scheme_id = await _setup_week_scheme_for_lessons(client, "Scheme LAA1")
    tafel_id = await _setup_stundentafel_for_lessons(client, "Tafel LAA1", 5)
    await client.post(
        f"/api/stundentafeln/{tafel_id}/entries",
        json={"subject_id": subject_id, "hours_per_week": 4, "preferred_block_size": 1},
    )
    class_id = await _create_school_class(client, "5a-LAA1", 5, tafel_id, scheme_id)
    teacher_id = await _create_teacher(client, "Anna", "Auto", "AUT1")
    qual_resp = await client.put(
        f"/api/teachers/{teacher_id}/qualifications",
        json={"subject_ids": [subject_id]},
    )
    assert qual_resp.status_code == 200, qual_resp.text

    resp = await client.post(f"/api/classes/{class_id}/generate-lessons")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert len(body) == 1
    assert body[0]["teacher"] is not None
    assert body[0]["teacher"]["id"] == teacher_id
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `mise run test:py -- backend/tests/scheduling/test_lessons.py::test_generate_lessons_assigns_qualified_teacher -v`

Expected: FAIL with `assert body[0]["teacher"] is not None` (the response's `teacher` field is `None` today because the route never sets `teacher_id` on the new Lesson rows).

- [ ] **Step 1.3: Commit the red test**

Run:

```bash
git add backend/tests/scheduling/test_lessons.py
git commit -m "$(cat <<'EOF'
test(backend): red test for teacher auto-assignment in generate-lessons

Exercises the happy path: one class, one Stundentafel entry, one
qualified teacher with capacity. Asserts the response's lesson has
teacher pinned. Fails today because generate-lessons leaves teacher_id
NULL on every new lesson; greens in the next commit.
EOF
)"
```

Note: lefthook runs `mise run lint` + the full test suite on pre-push, but pre-commit runs lint only. The red test commit is allowed; it only blocks at push time.

---

## Task 2: Helper module and route wiring

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/teacher_assignment.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/lessons.py`
- Modify: `backend/tests/scheduling/test_lessons.py` (add two more integration tests)

This is the green commit. It introduces the helper, wires it into the route, and adds the two regression tests for the "no qualified teacher" and "capacity exceeded" branches.

- [ ] **Step 2.1: Create the helper module**

Create `backend/src/klassenzeit_backend/scheduling/teacher_assignment.py` with the full content:

```python
"""Heuristic teacher assignment for newly generated lessons.

Today's heuristic: walk lessons in their input order; for each, pick the
first qualified active teacher (ordered by ``(short_code, id)``) whose
remaining weekly capacity covers the lesson's ``hours_per_week``. The
function is pure: callers load the snapshot from the DB, pass it in, and
apply the returned assignments themselves.

The richer pre-pass referenced by the active-sprint algorithm phase
(FFD ordering plus soft-constraint LAHC) will replace this walk; the
function signature is the only stable contract the route relies on.
"""

import uuid
from collections.abc import Iterable

from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.teacher import Teacher


def auto_assign_teachers_for_lessons(
    lessons: Iterable[Lesson],
    teachers: list[Teacher],
    qualified_teacher_ids_by_subject: dict[uuid.UUID, set[uuid.UUID]],
    capacity_used_by_teacher: dict[uuid.UUID, int],
) -> dict[uuid.UUID, uuid.UUID]:
    """Assign one qualified teacher per lesson respecting weekly hour caps.

    Pure function: takes a fully-loaded snapshot, returns a mapping
    ``{lesson_id: teacher_id}`` for the lessons that received an assignment.
    Lessons with no eligible candidate are absent from the returned dict.

    Args:
        lessons: New lessons to assign. Iteration order is significant:
            assignments run in this order, so ordering controls priority
            on tight capacity.
        teachers: Active teachers, pre-ordered by ``(short_code, id)``.
            Inactive teachers must be filtered out by the caller.
        qualified_teacher_ids_by_subject: For each lesson's ``subject_id``,
            the set of teacher_ids qualified for that subject.
        capacity_used_by_teacher: Hours already committed per teacher
            across the whole school. The caller's dict is not mutated;
            the helper works on a local copy.

    Returns:
        ``{lesson_id: teacher_id}`` for assigned lessons. Lessons whose
        subject has no qualified teacher, or whose qualified teachers all
        lack remaining capacity, are absent from the result.
    """
    used = dict(capacity_used_by_teacher)
    assignments: dict[uuid.UUID, uuid.UUID] = {}
    for lesson in lessons:
        qualified_ids = qualified_teacher_ids_by_subject.get(lesson.subject_id, set())
        if not qualified_ids:
            continue
        for teacher in teachers:
            if teacher.id not in qualified_ids:
                continue
            spare = teacher.max_hours_per_week - used.get(teacher.id, 0)
            if spare >= lesson.hours_per_week:
                assignments[lesson.id] = teacher.id
                used[teacher.id] = used.get(teacher.id, 0) + lesson.hours_per_week
                break
    return assignments
```

- [ ] **Step 2.2: Wire the helper into the route**

Open `backend/src/klassenzeit_backend/scheduling/routes/lessons.py` and apply two changes.

First, extend the imports near the top of the file (replace the existing block that ends at the `from klassenzeit_backend.scheduling.schemas.lesson import (...)` line):

```python
"""CRUD routes for the Lesson entity, plus the generate-lessons endpoint."""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import require_admin
from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import StundentafelEntry
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher, TeacherQualification
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session
from klassenzeit_backend.scheduling.schemas.lesson import (
    LessonClassResponse,
    LessonCreate,
    LessonResponse,
    LessonSubjectResponse,
    LessonTeacherResponse,
    LessonUpdate,
)
from klassenzeit_backend.scheduling.teacher_assignment import (
    auto_assign_teachers_for_lessons,
)

logger = logging.getLogger(__name__)
```

Second, replace the body of `generate_lessons_from_stundentafel` (the function that starts on the existing `@generate_router.post("/classes/{class_id}/generate-lessons", ...)` decorator). Keep the docstring; the body becomes:

```python
    result = await db.execute(select(SchoolClass).where(SchoolClass.id == class_id))
    school_class = result.scalar_one_or_none()
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")

    entries_result = await db.execute(
        select(StundentafelEntry)
        .where(StundentafelEntry.stundentafel_id == school_class.stundentafel_id)
        .order_by(StundentafelEntry.subject_id)
    )
    entries = entries_result.scalars().all()

    existing_result = await db.execute(
        select(Lesson.subject_id).where(Lesson.school_class_id == class_id)
    )
    existing_subject_ids = {row[0] for row in existing_result.all()}

    created: list[Lesson] = []
    for entry in entries:
        if entry.subject_id in existing_subject_ids:
            continue
        lesson = Lesson(
            school_class_id=class_id,
            subject_id=entry.subject_id,
            teacher_id=None,
            hours_per_week=entry.hours_per_week,
            preferred_block_size=entry.preferred_block_size,
        )
        db.add(lesson)
        created.append(lesson)

    await db.flush()

    teachers_result = await db.execute(
        select(Teacher)
        .where(Teacher.is_active.is_(True))
        .order_by(Teacher.short_code, Teacher.id)
    )
    teachers = list(teachers_result.scalars().all())

    quals_result = await db.execute(
        select(TeacherQualification.subject_id, TeacherQualification.teacher_id)
    )
    qualified_teacher_ids_by_subject: dict[uuid.UUID, set[uuid.UUID]] = {}
    for subject_id, teacher_id in quals_result.all():
        qualified_teacher_ids_by_subject.setdefault(subject_id, set()).add(teacher_id)

    used_result = await db.execute(
        select(Lesson.teacher_id, func.sum(Lesson.hours_per_week))
        .where(Lesson.teacher_id.is_not(None))
        .group_by(Lesson.teacher_id)
    )
    capacity_used_by_teacher: dict[uuid.UUID, int] = {
        row[0]: int(row[1] or 0) for row in used_result.all()
    }
    for teacher in teachers:
        capacity_used_by_teacher.setdefault(teacher.id, 0)

    assignments = auto_assign_teachers_for_lessons(
        lessons=created,
        teachers=teachers,
        qualified_teacher_ids_by_subject=qualified_teacher_ids_by_subject,
        capacity_used_by_teacher=capacity_used_by_teacher,
    )
    for lesson in created:
        teacher_id = assignments.get(lesson.id)
        if teacher_id is not None:
            lesson.teacher_id = teacher_id

    await db.commit()

    logger.info(
        "generate_lessons.done",
        extra={
            "school_class_id": str(class_id),
            "lessons_created": len(created),
            "teachers_assigned": len(assignments),
        },
    )

    responses = []
    for lesson in created:
        await db.refresh(lesson)
        responses.append(await _build_lesson_response(db, lesson))
    return responses
```

Two notes on the diff: the `entries` query gains `.order_by(StundentafelEntry.subject_id)` so the iteration order is deterministic. The `created` list is now annotated `list[Lesson]` for `ty`'s benefit. The `db.commit()` moves before the response build (was after in the existing code) so `db.refresh` reads persisted state; the existing code commits at the very end, but with the `lesson.teacher_id = ...` mutation we want the commit to flush both creation and assignment in one round-trip before re-reading via `_build_lesson_response`.

- [ ] **Step 2.3: Run the red test from Task 1 and verify it passes**

Run: `mise run test:py -- backend/tests/scheduling/test_lessons.py::test_generate_lessons_assigns_qualified_teacher -v`

Expected: PASS.

- [ ] **Step 2.4: Add the two regression integration tests**

Append to `backend/tests/scheduling/test_lessons.py` (after the test added in Task 1):

```python
async def test_generate_lessons_leaves_teacher_null_when_no_qualified_teacher(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /classes/{id}/generate-lessons leaves teacher null when no teacher is qualified.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@les-aa2.com", role="admin")
    await login_as("admin@les-aa2.com", "testpassword123")

    subject_id = await _create_subject(client, "Astronomie-AA", "AsAA")
    other_subject_id = await _create_subject(client, "Geographie-AA", "GeAA")
    scheme_id = await _setup_week_scheme_for_lessons(client, "Scheme LAA2")
    tafel_id = await _setup_stundentafel_for_lessons(client, "Tafel LAA2", 6)
    await client.post(
        f"/api/stundentafeln/{tafel_id}/entries",
        json={"subject_id": subject_id, "hours_per_week": 2, "preferred_block_size": 1},
    )
    class_id = await _create_school_class(client, "6a-LAA2", 6, tafel_id, scheme_id)
    teacher_id = await _create_teacher(client, "Bert", "Bystander", "BYS1")
    await client.put(
        f"/api/teachers/{teacher_id}/qualifications",
        json={"subject_ids": [other_subject_id]},
    )

    resp = await client.post(f"/api/classes/{class_id}/generate-lessons")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert len(body) == 1
    assert body[0]["teacher"] is None


async def test_generate_lessons_respects_existing_teacher_capacity(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """The first qualified teacher is skipped when their spare capacity is too small.

    Two qualified teachers exist. Teacher A sorts earlier by short_code but
    has only 2 spare hours; the new lesson needs 3. The route must fall
    through to Teacher B.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@les-aa3.com", role="admin")
    await login_as("admin@les-aa3.com", "testpassword123")

    subject_id = await _create_subject(client, "Werken-AA", "WeAA")
    scheme_id = await _setup_week_scheme_for_lessons(client, "Scheme LAA3")
    tafel_id_pre = await _setup_stundentafel_for_lessons(client, "Tafel LAA3-pre", 7)
    tafel_id = await _setup_stundentafel_for_lessons(client, "Tafel LAA3", 7)
    class_pre_id = await _create_school_class(client, "7a-LAA3-pre", 7, tafel_id_pre, scheme_id)
    class_id = await _create_school_class(client, "7a-LAA3", 7, tafel_id, scheme_id)

    teacher_a_id = await _create_teacher(client, "Anke", "Alpha", "AAA1")
    teacher_b_id = await _create_teacher(client, "Bea", "Beta", "BBB1")
    await client.put(
        f"/api/teachers/{teacher_a_id}/qualifications",
        json={"subject_ids": [subject_id]},
    )
    await client.put(
        f"/api/teachers/{teacher_b_id}/qualifications",
        json={"subject_ids": [subject_id]},
    )

    pre_lesson_resp = await client.post(
        "/api/lessons",
        json={
            "school_class_id": class_pre_id,
            "subject_id": subject_id,
            "teacher_id": teacher_a_id,
            "hours_per_week": 22,
        },
    )
    assert pre_lesson_resp.status_code == 201, pre_lesson_resp.text

    await client.post(
        f"/api/stundentafeln/{tafel_id}/entries",
        json={"subject_id": subject_id, "hours_per_week": 3, "preferred_block_size": 1},
    )

    resp = await client.post(f"/api/classes/{class_id}/generate-lessons")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert len(body) == 1
    assert body[0]["teacher"] is not None
    assert body[0]["teacher"]["id"] == teacher_b_id
```

The pre-lesson uses `hours_per_week=22` against Teacher A's default `max_hours_per_week=24` (set by `_create_teacher`), leaving 2 spare; the new entry requires 3, so the route falls through to Teacher B.

- [ ] **Step 2.5: Run all three integration tests and verify they pass**

Run: `mise run test:py -- backend/tests/scheduling/test_lessons.py -v -k "generate_lessons"`

Expected: PASS (the three new tests plus the pre-existing `test_generate_lessons_from_stundentafel`, `test_generate_lessons_skips_existing`, and `test_lesson_requires_admin`).

- [ ] **Step 2.6: Run the full Python suite to confirm no regressions**

Run: `mise run test:py`

Expected: PASS. The Grundschule solvability test still passes today because it still calls `assign_teachers_for_demo_grundschule_lessons` after generate-lessons; the auto-assign sets the same teacher_ids for some lessons, and the manual call overwrites them. Net effect: the manual call wins, behavior is unchanged. We unwind that in Task 4.

- [ ] **Step 2.7: Run lint to confirm clean**

Run: `mise run lint`

Expected: PASS.

- [ ] **Step 2.8: Commit the helper, route changes, and regression tests**

Run:

```bash
git add backend/src/klassenzeit_backend/scheduling/teacher_assignment.py \
        backend/src/klassenzeit_backend/scheduling/routes/lessons.py \
        backend/tests/scheduling/test_lessons.py
git commit -m "$(cat <<'EOF'
feat(backend): auto-assign qualified teacher in generate-lessons

POST /api/classes/{id}/generate-lessons now pins a qualified active
teacher per new lesson, picking the first one (ordered by short_code, id)
whose remaining weekly capacity covers the lesson's hours. Lessons with
no eligible candidate stay teacher_id NULL.

The heuristic lives in scheduling/teacher_assignment.py as a pure
function so it can be unit-tested independently and replaced wholesale
when sprint PR 7 (FFD ordering) lands. The route loads the snapshot,
calls the helper, applies the returned assignments, and emits one
generate_lessons.done structured log line.

Greens the red test from the previous commit and adds two regression
tests for the no-qualified-teacher and capacity-exceeded branches.
EOF
)"
```

---

## Task 3: Helper unit tests

**Files:**
- Create: `backend/tests/scheduling/test_teacher_assignment.py`

Eleven cases covering the helper in isolation. No DB session; teachers and lessons are constructed as plain ORM instances (SQLAlchemy permits this without a session for unbound objects).

- [ ] **Step 3.1: Write the unit test file**

Create `backend/tests/scheduling/test_teacher_assignment.py` with:

```python
"""Unit tests for ``auto_assign_teachers_for_lessons``."""

import uuid

from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.teacher import Teacher
from klassenzeit_backend.scheduling.teacher_assignment import (
    auto_assign_teachers_for_lessons,
)


def _teacher(short_code: str, max_hours: int, teacher_id: uuid.UUID | None = None) -> Teacher:
    return Teacher(
        id=teacher_id or uuid.uuid4(),
        first_name="Test",
        last_name=short_code,
        short_code=short_code,
        max_hours_per_week=max_hours,
        is_active=True,
    )


def _lesson(subject_id: uuid.UUID, hours: int, lesson_id: uuid.UUID | None = None) -> Lesson:
    return Lesson(
        id=lesson_id or uuid.uuid4(),
        school_class_id=uuid.uuid4(),
        subject_id=subject_id,
        teacher_id=None,
        hours_per_week=hours,
        preferred_block_size=1,
    )


def test_auto_assign_happy_path() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {lesson.id: teacher.id}


def test_auto_assign_orders_by_short_code() -> None:
    subject_id = uuid.uuid4()
    teacher_a = _teacher("AAA", 28)
    teacher_b = _teacher("BBB", 28)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher_a, teacher_b],
        qualified_teacher_ids_by_subject={subject_id: {teacher_a.id, teacher_b.id}},
        capacity_used_by_teacher={teacher_a.id: 0, teacher_b.id: 0},
    )

    assert assignments == {lesson.id: teacher_a.id}


def test_auto_assign_falls_through_on_capacity_overflow() -> None:
    subject_id = uuid.uuid4()
    teacher_a = _teacher("AAA", 5)
    teacher_b = _teacher("BBB", 28)
    lesson = _lesson(subject_id, 6)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher_a, teacher_b],
        qualified_teacher_ids_by_subject={subject_id: {teacher_a.id, teacher_b.id}},
        capacity_used_by_teacher={teacher_a.id: 0, teacher_b.id: 0},
    )

    assert assignments == {lesson.id: teacher_b.id}


def test_auto_assign_leaves_lesson_unassigned_when_no_qualified_teacher() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: set()},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {}


def test_auto_assign_leaves_lesson_unassigned_when_subject_missing_from_map() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {}


def test_auto_assign_leaves_lesson_unassigned_when_all_qualified_teachers_full() -> None:
    subject_id = uuid.uuid4()
    teacher_a = _teacher("AAA", 4)
    teacher_b = _teacher("BBB", 4)
    lesson = _lesson(subject_id, 5)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher_a, teacher_b],
        qualified_teacher_ids_by_subject={subject_id: {teacher_a.id, teacher_b.id}},
        capacity_used_by_teacher={teacher_a.id: 0, teacher_b.id: 0},
    )

    assert assignments == {}


def test_auto_assign_multiple_lessons_share_one_teacher_up_to_cap() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lessons = [_lesson(subject_id, 5), _lesson(subject_id, 5), _lesson(subject_id, 5)]

    assignments = auto_assign_teachers_for_lessons(
        lessons=lessons,
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {lessons[0].id: teacher.id, lessons[1].id: teacher.id, lessons[2].id: teacher.id}


def test_auto_assign_in_flight_capacity_exceeds_cap_for_third_lesson() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 25)
    lessons = [_lesson(subject_id, 10), _lesson(subject_id, 10), _lesson(subject_id, 10)]

    assignments = auto_assign_teachers_for_lessons(
        lessons=lessons,
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {lessons[0].id: teacher.id, lessons[1].id: teacher.id}


def test_auto_assign_pre_existing_capacity_blocks_first_choice() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson_too_big = _lesson(subject_id, 3)
    lesson_fits = _lesson(subject_id, 2)

    used = {teacher.id: 26}
    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson_too_big, lesson_fits],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher=used,
    )

    assert assignments == {lesson_fits.id: teacher.id}


def test_auto_assign_does_not_mutate_callers_capacity_dict() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson = _lesson(subject_id, 4)
    used = {teacher.id: 0}
    used_before = dict(used)

    auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher=used,
    )

    assert used == used_before


def test_auto_assign_stable_tiebreak_on_id() -> None:
    subject_id = uuid.uuid4()
    lower_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    higher_id = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
    teacher_low = _teacher("XXX", 28, teacher_id=lower_id)
    teacher_high = _teacher("XXX", 28, teacher_id=higher_id)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher_low, teacher_high],
        qualified_teacher_ids_by_subject={subject_id: {teacher_low.id, teacher_high.id}},
        capacity_used_by_teacher={teacher_low.id: 0, teacher_high.id: 0},
    )

    assert assignments == {lesson.id: teacher_low.id}
```

The last test pre-orders the teachers list with `teacher_low` first to mirror the route's `order_by(Teacher.short_code, Teacher.id)`; the helper itself does not re-sort, so the test asserts the helper consumes the supplied order rather than that it sorts internally.

- [ ] **Step 3.2: Run the new unit tests**

Run: `mise run test:py -- backend/tests/scheduling/test_teacher_assignment.py -v`

Expected: PASS, 11 tests.

- [ ] **Step 3.3: Run lint**

Run: `mise run lint`

Expected: PASS.

- [ ] **Step 3.4: Commit the unit tests**

Run:

```bash
git add backend/tests/scheduling/test_teacher_assignment.py
git commit -m "$(cat <<'EOF'
test(backend): unit tests for auto_assign_teachers_for_lessons

Eleven cases cover the helper in isolation: happy path, deterministic
short_code ordering, capacity overflow fallback, missing qualifications,
exhausted capacity, multi-lesson capacity sharing, in-flight tracking,
pre-existing capacity blocking the first choice, caller-snapshot
non-mutation, and stable tiebreak on teacher id.
EOF
)"
```

---

## Task 4: Drop the back-channel teacher-assignment helper, route, and dict

**Files:**
- Modify: `backend/src/klassenzeit_backend/seed/demo_grundschule.py` (delete `TEACHER_ASSIGNMENTS` and `assign_teachers_for_demo_grundschule_lessons`).
- Modify: `backend/src/klassenzeit_backend/testing/router.py` (delete the `/__test__/assign-teachers-grundschule` route).
- Modify: `backend/tests/testing/test_router.py` (delete the test for the deleted endpoint).
- Modify: `backend/tests/seed/test_demo_grundschule_solvability.py` (drop the manual call, add a no-NULL assertion).
- Modify: `frontend/e2e/flows/grundschule-smoke.spec.ts` (drop the back-channel `request.post` block).

`vulture` is the safety net: any leftover symbol fails the pre-push run.

- [ ] **Step 4.1: Delete `TEACHER_ASSIGNMENTS` and `assign_teachers_for_demo_grundschule_lessons`**

Open `backend/src/klassenzeit_backend/seed/demo_grundschule.py`. Remove the entire `TEACHER_ASSIGNMENTS` dict (currently lines 263 through 305 inclusive, ending with the closing triple-quoted string). Remove the entire `assign_teachers_for_demo_grundschule_lessons` function that follows (currently lines 308 through the end of the file).

The file's `from sqlalchemy import select, update` line at the top will lose its `update` user (the deleted function was the only caller). Update that import to `from sqlalchemy import select`.

Verify the resulting file ends with the existing `await session.flush()` line that closes `seed_demo_grundschule`, with no trailing function definitions.

- [ ] **Step 4.2: Delete the testing router endpoint and its import**

Open `backend/src/klassenzeit_backend/testing/router.py`. Remove the `assign_teachers_for_demo_grundschule_lessons` import and the entire `testing_assign_teachers_grundschule` function (the `@testing_router.post("/assign-teachers-grundschule", ...)` block and its body, currently lines 67 through 79).

The remaining import block should read:

```python
from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule
```

The remaining file ends with `testing_seed_grundschule`'s `return Response(status_code=status.HTTP_204_NO_CONTENT)` line.

- [ ] **Step 4.3: Delete the testing-router test**

Open `backend/tests/testing/test_router.py`. Find and delete the test that drives `/__test__/assign-teachers-grundschule`. Identify it by searching for the literal `"/__test__/assign-teachers-grundschule"` string; the enclosing `async def test_…` function (with its docstring and body) is what to remove.

Run: `grep -n "assign-teachers-grundschule" backend/tests/testing/test_router.py` from the repo root before editing to confirm the line. After editing, the same grep must return no matches.

- [ ] **Step 4.4: Update the solvability test**

Open `backend/tests/seed/test_demo_grundschule_solvability.py`. Apply three edits:

1. Replace the import block:

```python
from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule
```

(Drop `assign_teachers_for_demo_grundschule_lessons`; add `Lesson` for the new assertion.)

2. Add `from sqlalchemy import func, select` at the top of the imports if `func` is not already imported (existing file already imports `select`).

3. Replace the body lines that read:

```python
    await assign_teachers_for_demo_grundschule_lessons(db_session)
    await db_session.flush()
```

with:

```python
    unassigned_count = (
        await db_session.execute(
            select(func.count()).select_from(Lesson).where(Lesson.teacher_id.is_(None))
        )
    ).scalar_one()
    assert unassigned_count == 0, "auto-assign left some lessons unassigned"
```

The rest of the test body (the per-class `POST /schedule` loop and its assertions) stays unchanged.

- [ ] **Step 4.5: Update the smoke spec**

Open `frontend/e2e/flows/grundschule-smoke.spec.ts`. Remove these three lines (and the explanatory comment two lines above them):

```ts
// Back-channel: pin teacher_id on every generated lesson in one request so the
// solver sees a fully-specified problem on the upcoming POST /schedule.
const assignResp = await request.post(`${BACKEND_URL}/__test__/assign-teachers-grundschule`);
expect(assignResp.ok(), await assignResp.text()).toBeTruthy();
```

The Playwright spec must still assert the existing post-condition (Deutsch in 1a's grid). No other changes.

- [ ] **Step 4.6: Run the Python suite**

Run: `mise run test:py`

Expected: PASS, including the modified `test_demo_grundschule_solvability.py` (the no-NULL assertion holds because the auto-assign covers all 106 lesson-hours; per the spec's hand-checked walk: FIS 28 + MUE 27 + SCH 9 + WEB 6 + BEC 18 + HOF 18 = 106h within caps).

- [ ] **Step 4.7: Run the Playwright suite**

Run: `mise run e2e`

Expected: PASS. The smoke spec now reaches `Generate schedule` with auto-assign-pinned teachers; the assertion that "Deutsch" appears in 1a's grid still holds.

If `e2e` is slow on the local machine, fall back to `cd frontend && mise exec -- pnpm exec playwright test e2e/flows/grundschule-smoke.spec.ts` for a single-file run.

- [ ] **Step 4.8: Run lint to confirm `vulture` is clean**

Run: `mise run lint`

Expected: PASS. If `vulture` flags a leftover symbol (e.g. an unused `update` import that survived Step 4.1), remove it and re-run.

- [ ] **Step 4.9: Commit the cleanup**

Run:

```bash
git add backend/src/klassenzeit_backend/seed/demo_grundschule.py \
        backend/src/klassenzeit_backend/testing/router.py \
        backend/tests/testing/test_router.py \
        backend/tests/seed/test_demo_grundschule_solvability.py \
        frontend/e2e/flows/grundschule-smoke.spec.ts
git commit -m "$(cat <<'EOF'
refactor(backend): drop back-channel teacher-assignment helper, route, and dict

The Grundschule demo no longer needs a manual teacher-pinning step
between generate-lessons and POST /schedule, so the back-channel
plumbing comes out:

- TEACHER_ASSIGNMENTS dict and assign_teachers_for_demo_grundschule_lessons
  function in seed/demo_grundschule.py
- /__test__/assign-teachers-grundschule route in testing/router.py and
  its test
- the manual-call line in tests/seed/test_demo_grundschule_solvability.py
  (replaced by an explicit "no NULL teacher_id after generate-lessons"
  assertion)
- the request.post block in frontend/e2e/flows/grundschule-smoke.spec.ts

vulture is the safety net for any leftover symbol.
EOF
)"
```

---

## Task 5: Mark OPEN_THINGS shipped and capture the toast follow-up

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 5.1: Update the active-sprint tidy item**

Open `docs/superpowers/OPEN_THINGS.md`. Locate the active-sprint > tidy phase entry for item 3:

```md
3. **Auto-assign teachers during generate-lessons.** `[P1]` Extend `POST /api/classes/{id}/generate-lessons` ...
```

Replace its body with:

```md
3. **Auto-assign teachers during generate-lessons.** `[P1]` ✅ Shipped 2026-04-26. PR `feat/auto-assign-teachers`: `POST /api/classes/{id}/generate-lessons` now picks the first qualified active teacher (ordered by `(short_code, id)`) whose remaining weekly capacity covers the lesson, via the pure helper `scheduling/teacher_assignment.py:auto_assign_teachers_for_lessons`. Closes the back-channel-teacher gap surfaced by the Grundschule smoke spec; `TEACHER_ASSIGNMENTS`, `assign_teachers_for_demo_grundschule_lessons`, and `/__test__/assign-teachers-grundschule` are removed. Sprint PR 7 (FFD ordering + `SolveConfig`) replaces this placeholder pre-pass when it lands. Follow-up (not sprint): a "X teachers auto-assigned" toast on the existing "Generate lessons" success surface (see Product capabilities below).
```

- [ ] **Step 5.2: Add the toast follow-up under Product capabilities**

In the `### Product capabilities` section of `OPEN_THINGS.md`, append at the end of the bulleted list:

```md
- **Auto-assign-teachers count in the "Generate lessons" toast.** The `POST /api/classes/{id}/generate-lessons` response now contains a `teacher` object on each pinned lesson. The success toast still reads `N lessons created`; a follow-on `M teachers auto-assigned` line (or interpolated copy) would surface the heuristic's outcome to admins, including the case where some lessons stayed null because no qualified teacher had capacity. Needs i18n keys in en + de and a count derived from the response. Skipped in the auto-assign-teachers PR (#TBD) because it is UX polish on top of the wire change. Surfaced during the auto-assign-teachers PR.
```

- [ ] **Step 5.3: Run lint to confirm clean**

Run: `mise run lint`

Expected: PASS.

- [ ] **Step 5.4: Commit the docs update**

Run:

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "$(cat <<'EOF'
docs: mark OPEN_THINGS auto-assign-teachers shipped, file toast follow-up

Tidy item 3 lands in this PR; the toast-polish follow-up for surfacing
"M teachers auto-assigned" on the existing "Generate lessons" success
toast is filed under Product capabilities for a later pass.
EOF
)"
```

---

## Self-review

**Spec coverage check.** Walk each spec section and confirm it maps to a task:

- Helper module + signature: Task 2 (Step 2.1).
- Route wiring (snapshot loading, helper call, mutation, log): Task 2 (Step 2.2).
- Logging line: Task 2 (Step 2.2).
- Error handling (no new error path): Task 2's helper code returns an empty dict on degenerate inputs; covered.
- Helper unit tests, all 11 cases: Task 3.
- Endpoint integration tests, all 3 cases: Task 1 (1 test) + Task 2 (2 tests).
- Solvability test update: Task 4 (Step 4.4).
- Smoke spec update: Task 4 (Step 4.5).
- Cleanup deletions across seed + testing router + testing test: Task 4 (Steps 4.1, 4.2, 4.3).
- OPEN_THINGS update: Task 5.

**Placeholder scan.** No "TBD", "TODO", "implement later", or "fill in details" in the plan body. The OPEN_THINGS edit text contains a literal `#TBD` placeholder for the PR number, which is expected: the PR number is unknown until Task 7 of the autopilot opens it; whoever runs Step 5.2 substitutes it once known. (If running this plan outside the autopilot context, replace `#TBD` with the actual PR number before committing.)

**Type consistency.** `auto_assign_teachers_for_lessons` is referenced consistently across Tasks 2 and 3. The route's call-site in Step 2.2 matches the signature in Step 2.1. The unit-test helpers `_teacher` and `_lesson` match the ORM constructors' field names. `qualified_teacher_ids_by_subject` and `capacity_used_by_teacher` use the same names everywhere.

**Subagent-driven execution.** Tasks 1, 2, 3 share `backend/tests/scheduling/test_lessons.py` (Task 1 appends one test; Task 2 appends two more) and `scheduling/routes/lessons.py` (Task 2 only); they must run sequentially. Task 4 touches files no other task touches; could in principle run after Task 3 finishes, but its tests depend on Task 2's behavior, so still sequential. Task 5 is doc-only and could run in parallel with Task 4 but the OPEN_THINGS update reads cleaner once the cleanup has landed; keep it last. Net: dispatch all five tasks one at a time to fresh `general-purpose` subagents.
