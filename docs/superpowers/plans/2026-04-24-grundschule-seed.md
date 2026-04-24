# Grundschule Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `uv run klassenzeit-backend seed-grundschule` that seeds a realistic Hessen Grundschule demo (WeekScheme + 30 TimeBlocks, 10 Subjects, 4 Stundentafeln + 38 entries, 4 SchoolClasses, 6 Teachers + 22 Qualifications, 7 Rooms + 28 Suitabilities) such that the solver emits zero hard violations on generated lessons.

**Architecture:** New package `klassenzeit_backend.seed` with a single `demo_grundschule.py` module that exports `seed_demo_grundschule(session: AsyncSession) -> None`. A Typer subcommand `seed-grundschule` on the existing CLI wraps the coroutine in a session + single commit, refusing to run when `settings.env == "prod"`. Three test files (shape, rollback, solvability) exercise the seed end-to-end.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Typer + pytest-asyncio on the backend; solver-py (PyO3) for the solvability test.

**Spec:** `docs/superpowers/specs/2026-04-24-grundschule-seed-design.md`

---

## File Structure

**New files:**
- `backend/src/klassenzeit_backend/seed/__init__.py` — empty package marker.
- `backend/src/klassenzeit_backend/seed/demo_grundschule.py` — constants + `seed_demo_grundschule` coroutine + helpers.
- `backend/tests/seed/__init__.py` — empty package marker.
- `backend/tests/seed/test_demo_grundschule_shape.py` — entity-count + FK-integrity + hour-sum assertions.
- `backend/tests/seed/test_demo_grundschule_rollback.py` — fail-fast transactional rollback assertion.
- `backend/tests/seed/test_demo_grundschule_solvability.py` — seed + generate-lessons + solve end-to-end, asserting zero violations per class.

**Modified files:**
- `backend/src/klassenzeit_backend/cli.py` — add the `seed_grundschule` Typer command alongside the existing three.
- `docs/superpowers/OPEN_THINGS.md` — strike the shipped sprint step 1 item, point step 2 at the new Typer command.

Single-file seed module per spec (one cohesive artifact, ~250 lines). No per-entity module split. Helpers prefixed with `demo_grundschule_` per the unique-function-names rule.

---

## Task 1: Create empty package markers

**Files:**
- Create: `backend/src/klassenzeit_backend/seed/__init__.py`
- Create: `backend/tests/seed/__init__.py`

- [ ] **Step 1: Create the source package marker**

```bash
touch backend/src/klassenzeit_backend/seed/__init__.py
```

Content: empty file.

- [ ] **Step 2: Create the test package marker**

```bash
touch backend/tests/seed/__init__.py
```

Content: empty file.

- [ ] **Step 3: Sanity-check the paths**

```bash
ls backend/src/klassenzeit_backend/seed/ backend/tests/seed/
```

Expected: each dir contains exactly `__init__.py`.

No commit yet; rolled into Task 4.

---

## Task 2: Write the failing shape test

**Files:**
- Create: `backend/tests/seed/test_demo_grundschule_shape.py`

- [ ] **Step 1: Write the shape test file**

```python
"""Shape + FK-integrity assertions for seed_demo_grundschule.

Runs against the per-test db_session fixture (nested savepoint, rolled back
at teardown). The seed coroutine is called without a commit; tests read via
the same session.
"""

from datetime import time, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.room import Room, RoomSubjectSuitability
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import Stundentafel, StundentafelEntry
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher, TeacherQualification
from klassenzeit_backend.db.models.week_scheme import TimeBlock, WeekScheme
from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule


async def _count(session: AsyncSession, model: type) -> int:
    """Helper: SELECT count(*) for ``model``."""
    result = await session.execute(select(func.count()).select_from(model))
    return int(result.scalar_one())


@pytest.fixture
async def seeded_session(db_session: AsyncSession) -> AsyncSession:
    """Pre-seed the db_session and yield it for per-test assertions."""
    await seed_demo_grundschule(db_session)
    await db_session.flush()
    return db_session


async def test_seed_creates_expected_entity_counts(
    seeded_session: AsyncSession,
) -> None:
    assert await _count(seeded_session, Subject) == 10
    assert await _count(seeded_session, WeekScheme) == 1
    assert await _count(seeded_session, TimeBlock) == 30
    assert await _count(seeded_session, Stundentafel) == 4
    assert await _count(seeded_session, StundentafelEntry) == 38
    assert await _count(seeded_session, SchoolClass) == 4
    assert await _count(seeded_session, Teacher) == 6
    assert await _count(seeded_session, TeacherQualification) == 22
    assert await _count(seeded_session, Room) == 7
    assert await _count(seeded_session, RoomSubjectSuitability) == 28


async def test_time_blocks_span_five_days_six_periods_forty_five_minutes(
    seeded_session: AsyncSession,
) -> None:
    result = await seeded_session.execute(select(TimeBlock))
    blocks = list(result.scalars().all())
    assert len(blocks) == 30

    days = {b.day_of_week for b in blocks}
    assert days == {0, 1, 2, 3, 4}, days

    positions_per_day: dict[int, set[int]] = {}
    for b in blocks:
        positions_per_day.setdefault(b.day_of_week, set()).add(b.position)
    for day, positions in positions_per_day.items():
        assert positions == {1, 2, 3, 4, 5, 6}, (day, positions)

    forty_five = timedelta(minutes=45)
    for b in blocks:
        # TimeBlock.start_time and end_time are datetime.time; subtract via dummy date.
        from datetime import datetime

        delta = datetime.combine(datetime.min, b.end_time) - datetime.combine(
            datetime.min, b.start_time
        )
        assert delta == forty_five, b


async def test_school_class_grade_matches_stundentafel_grade(
    seeded_session: AsyncSession,
) -> None:
    rows = (
        await seeded_session.execute(
            select(SchoolClass.name, SchoolClass.grade_level, Stundentafel.grade_level)
            .join(Stundentafel, SchoolClass.stundentafel_id == Stundentafel.id)
            .order_by(SchoolClass.grade_level)
        )
    ).all()
    assert [(r[0], r[1], r[2]) for r in rows] == [
        ("1a", 1, 1),
        ("2a", 2, 2),
        ("3a", 3, 3),
        ("4a", 4, 4),
    ]


async def test_stundentafel_hour_sums_match_hessen_reference(
    seeded_session: AsyncSession,
) -> None:
    rows = (
        await seeded_session.execute(
            select(
                Stundentafel.grade_level,
                func.sum(StundentafelEntry.hours_per_week),
            )
            .join(StundentafelEntry, StundentafelEntry.stundentafel_id == Stundentafel.id)
            .group_by(Stundentafel.grade_level)
            .order_by(Stundentafel.grade_level)
        )
    ).all()
    assert [(r[0], int(r[1])) for r in rows] == [
        (1, 23),
        (2, 23),
        (3, 26),
        (4, 26),
    ]


async def test_teacher_qualifications_reference_existing_rows(
    seeded_session: AsyncSession,
) -> None:
    rows = (
        await seeded_session.execute(
            select(TeacherQualification.teacher_id, TeacherQualification.subject_id)
        )
    ).all()
    teacher_ids = {
        row[0] for row in (await seeded_session.execute(select(Teacher.id))).all()
    }
    subject_ids = {
        row[0] for row in (await seeded_session.execute(select(Subject.id))).all()
    }
    for tq_teacher, tq_subject in rows:
        assert tq_teacher in teacher_ids
        assert tq_subject in subject_ids


async def test_room_suitabilities_encode_specialty_split(
    seeded_session: AsyncSession,
) -> None:
    rows = (
        await seeded_session.execute(
            select(Room.short_name, Subject.short_name)
            .join(RoomSubjectSuitability, RoomSubjectSuitability.room_id == Room.id)
            .join(Subject, Subject.id == RoomSubjectSuitability.subject_id)
        )
    ).all()
    pairs = {(r[0], r[1]) for r in rows}

    for klassenraum in ("1a", "2a", "3a", "4a"):
        for subject in ("D", "M", "SU", "RE", "E", "FÖ"):
            assert (klassenraum, subject) in pairs, (klassenraum, subject)

    assert ("TH", "SP") in pairs
    assert ("MU-R", "MU") in pairs
    assert ("WE-R", "KU") in pairs
    assert ("WE-R", "WE") in pairs

    specialty_subjects = {"SP", "MU", "KU", "WE"}
    for klassenraum in ("1a", "2a", "3a", "4a"):
        for subject in specialty_subjects:
            assert (klassenraum, subject) not in pairs, (klassenraum, subject)


async def test_week_scheme_has_expected_period_times(
    seeded_session: AsyncSession,
) -> None:
    scheme = (
        await seeded_session.execute(
            select(WeekScheme).where(WeekScheme.name == "Grundschule Zeitraster")
        )
    ).scalar_one()
    rows = (
        await seeded_session.execute(
            select(TimeBlock.position, TimeBlock.start_time, TimeBlock.end_time)
            .where(TimeBlock.week_scheme_id == scheme.id, TimeBlock.day_of_week == 0)
            .order_by(TimeBlock.position)
        )
    ).all()
    assert [(r[0], r[1], r[2]) for r in rows] == [
        (1, time(8, 0), time(8, 45)),
        (2, time(8, 45), time(9, 30)),
        (3, time(9, 50), time(10, 35)),
        (4, time(10, 35), time(11, 20)),
        (5, time(11, 35), time(12, 20)),
        (6, time(12, 20), time(13, 5)),
    ]
```

Note the bare `time(13, 5)` instead of `time(13, 05)` — Python rejects leading zeros in integer literals, so use `5`. The schedule table still reads 13:05 through normal time printing.

- [ ] **Step 2: Verify the test fails at collection time**

Run: `cd backend && uv run pytest tests/seed/test_demo_grundschule_shape.py -v`
Expected: every test errors on collection with `ModuleNotFoundError: No module named 'klassenzeit_backend.seed.demo_grundschule'` (or similar import failure). Red confirmed.

No commit yet.

---

## Task 3: Write the failing rollback test

**Files:**
- Create: `backend/tests/seed/test_demo_grundschule_rollback.py`

- [ ] **Step 1: Write the rollback test**

```python
"""Rollback test: seed_demo_grundschule must fail atomically on duplicate name.

Pre-inserts a Subject named ``Deutsch`` (which the seed also inserts), then
invokes ``seed_demo_grundschule`` inside a nested savepoint. The unique-name
IntegrityError must bubble up, and the DB must retain exactly the one
pre-existing Subject after the rollback.
"""

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule


async def test_seed_rolls_back_on_duplicate_subject_name(
    db_session: AsyncSession,
) -> None:
    pre_existing = Subject(name="Deutsch", short_name="PRE", color="chart-1")
    db_session.add(pre_existing)
    await db_session.flush()

    await db_session.begin_nested()  # inner savepoint so the outer fixture rollback stays intact
    try:
        with pytest.raises(IntegrityError):
            await seed_demo_grundschule(db_session)
            await db_session.flush()
    finally:
        # rollback the inner savepoint; event listener restarts a new nested savepoint
        await db_session.rollback()

    subject_count = int(
        (
            await db_session.execute(select(func.count()).select_from(Subject))
        ).scalar_one()
    )
    assert subject_count == 1

    remaining = (await db_session.execute(select(Subject))).scalar_one()
    assert remaining.name == "Deutsch"
    assert remaining.short_name == "PRE"
```

- [ ] **Step 2: Verify the test fails at collection time**

Run: `cd backend && uv run pytest tests/seed/test_demo_grundschule_rollback.py -v`
Expected: `ModuleNotFoundError: No module named 'klassenzeit_backend.seed.demo_grundschule'`. Red confirmed.

No commit yet.

---

## Task 4: Commit the red tests

- [ ] **Step 1: Verify nothing else changed**

Run: `git status`
Expected: only the new test files + both empty `__init__.py` markers are untracked.

- [ ] **Step 2: Stage and commit**

```bash
git add backend/src/klassenzeit_backend/seed/__init__.py \
        backend/tests/seed/__init__.py \
        backend/tests/seed/test_demo_grundschule_shape.py \
        backend/tests/seed/test_demo_grundschule_rollback.py
git commit -m "test(backend): add demo_grundschule seed shape and rollback tests"
```

The pre-commit hook runs `ruff`, `ty`, `vulture`, `cargo fmt`, `clippy`, `machete`, `biome`, `actionlint`, `check_unique_fns`. Expect green except for possible `vulture` noise on the empty `__init__.py` (expected to be clean; vulture ignores `__init__.py`).

---

## Task 5: Implement the seed module constants and coroutine

**Files:**
- Create: `backend/src/klassenzeit_backend/seed/demo_grundschule.py`

- [ ] **Step 1: Write the full module**

```python
"""Hessen Grundschule demo seed.

One-shot seed that creates the entities needed for the end-to-end
"login → click Generate → see a timetable" demo flow. See
``docs/superpowers/specs/2026-04-24-grundschule-seed-design.md`` for the
full design including the mapping from real Hessen Grundschule
constraints to schema columns.

Scope ends before ``lessons`` and ``scheduled_lessons``; those are created
by the ``generate-lessons`` and ``POST /schedule`` routes respectively.
"""

from datetime import time
from typing import NamedTuple

from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.room import Room, RoomSubjectSuitability
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import Stundentafel, StundentafelEntry
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher, TeacherQualification
from klassenzeit_backend.db.models.week_scheme import TimeBlock, WeekScheme

WEEK_SCHEME_NAME = "Grundschule Zeitraster"
WEEK_SCHEME_DESCRIPTION = (
    "Hessen Grundschule Halbtag: 5 Tage, 6 Stunden a 45 Minuten, "
    "Hofpausen nach der 2. und 4. Stunde."
)


class _PeriodTimes(NamedTuple):
    position: int
    start: time
    end: time


_PERIODS: tuple[_PeriodTimes, ...] = (
    _PeriodTimes(1, time(8, 0), time(8, 45)),
    _PeriodTimes(2, time(8, 45), time(9, 30)),
    _PeriodTimes(3, time(9, 50), time(10, 35)),
    _PeriodTimes(4, time(10, 35), time(11, 20)),
    _PeriodTimes(5, time(11, 35), time(12, 20)),
    _PeriodTimes(6, time(12, 20), time(13, 5)),
)

_DAYS_MON_TO_FRI: tuple[int, ...] = (0, 1, 2, 3, 4)


class _SubjectSpec(NamedTuple):
    name: str
    short_name: str
    color: str


_SUBJECTS: tuple[_SubjectSpec, ...] = (
    _SubjectSpec("Deutsch", "D", "chart-1"),
    _SubjectSpec("Mathematik", "M", "chart-2"),
    _SubjectSpec("Sachunterricht", "SU", "chart-3"),
    _SubjectSpec("Religion / Ethik", "RE", "chart-4"),
    _SubjectSpec("Englisch", "E", "chart-5"),
    _SubjectSpec("Kunst", "KU", "chart-1"),
    _SubjectSpec("Werken", "WE", "chart-2"),
    _SubjectSpec("Musik", "MU", "chart-3"),
    _SubjectSpec("Sport", "SP", "chart-4"),
    _SubjectSpec("Förderunterricht", "FÖ", "chart-5"),
)


# Per-Stundentafel subject → hours mapping. Keyed by subject short_name.
_GRADE_1_2_HOURS: dict[str, int] = {
    "D": 6,
    "M": 5,
    "SU": 2,
    "RE": 2,
    "KU": 1,
    "WE": 1,
    "MU": 1,
    "SP": 3,
    "FÖ": 2,
}

_GRADE_3_4_HOURS: dict[str, int] = {
    "D": 5,
    "M": 5,
    "SU": 4,
    "E": 2,
    "RE": 2,
    "KU": 1,
    "WE": 1,
    "MU": 1,
    "SP": 3,
    "FÖ": 2,
}


class _TeacherSpec(NamedTuple):
    first_name: str
    last_name: str
    short_code: str
    max_hours_per_week: int
    qualified_subject_short_names: tuple[str, ...]


_TEACHERS: tuple[_TeacherSpec, ...] = (
    _TeacherSpec("Anna", "Müller", "MUE", 28, ("D", "M", "SU", "KU")),
    _TeacherSpec("Beate", "Schmidt", "SCH", 28, ("D", "M", "SU", "WE")),
    _TeacherSpec("Carsten", "Weber", "WEB", 28, ("D", "M", "SU", "E")),
    _TeacherSpec("Dana", "Fischer", "FIS", 28, ("D", "M", "SU", "E")),
    _TeacherSpec("Eva", "Becker", "BEC", 18, ("RE", "MU", "FÖ")),
    _TeacherSpec("Frank", "Hoffmann", "HOF", 21, ("SP", "KU", "FÖ")),
)


class _RoomSpec(NamedTuple):
    name: str
    short_name: str
    capacity: int | None
    suitable_subject_short_names: tuple[str, ...]


_KLASSENRAUM_SUITABLE_SUBJECTS: tuple[str, ...] = ("D", "M", "SU", "RE", "E", "FÖ")

_ROOMS: tuple[_RoomSpec, ...] = (
    _RoomSpec("Klasse 1a", "1a", 25, _KLASSENRAUM_SUITABLE_SUBJECTS),
    _RoomSpec("Klasse 2a", "2a", 25, _KLASSENRAUM_SUITABLE_SUBJECTS),
    _RoomSpec("Klasse 3a", "3a", 25, _KLASSENRAUM_SUITABLE_SUBJECTS),
    _RoomSpec("Klasse 4a", "4a", 25, _KLASSENRAUM_SUITABLE_SUBJECTS),
    _RoomSpec("Turnhalle", "TH", None, ("SP",)),
    _RoomSpec("Musikraum", "MU-R", 30, ("MU",)),
    _RoomSpec("Werkraum", "WE-R", 20, ("KU", "WE")),
)


class _SchoolClassSpec(NamedTuple):
    name: str
    grade_level: int


_SCHOOL_CLASSES: tuple[_SchoolClassSpec, ...] = (
    _SchoolClassSpec("1a", 1),
    _SchoolClassSpec("2a", 2),
    _SchoolClassSpec("3a", 3),
    _SchoolClassSpec("4a", 4),
)


async def seed_demo_grundschule(session: AsyncSession) -> None:
    """Seed a realistic einzügige Hessen Grundschule into ``session``.

    Caller owns the transaction: this coroutine only ``flush()``es so FK
    lookups resolve. Commit once at the end, or rollback on error.

    Raises:
        sqlalchemy.exc.IntegrityError: on any unique-name collision. The
            caller is expected to rollback the outer transaction and
            surface the error to the user.
    """
    # 1. Week scheme + time blocks
    week_scheme = WeekScheme(
        name=WEEK_SCHEME_NAME,
        description=WEEK_SCHEME_DESCRIPTION,
    )
    session.add(week_scheme)
    await session.flush()

    for day in _DAYS_MON_TO_FRI:
        for period in _PERIODS:
            session.add(
                TimeBlock(
                    week_scheme_id=week_scheme.id,
                    day_of_week=day,
                    position=period.position,
                    start_time=period.start,
                    end_time=period.end,
                )
            )
    await session.flush()

    # 2. Subjects
    subjects_by_short: dict[str, Subject] = {}
    for spec in _SUBJECTS:
        subject = Subject(name=spec.name, short_name=spec.short_name, color=spec.color)
        session.add(subject)
        subjects_by_short[spec.short_name] = subject
    await session.flush()

    # 3. Stundentafeln + entries
    tafel_hours_by_grade: dict[int, dict[str, int]] = {
        1: _GRADE_1_2_HOURS,
        2: _GRADE_1_2_HOURS,
        3: _GRADE_3_4_HOURS,
        4: _GRADE_3_4_HOURS,
    }
    tafeln_by_grade: dict[int, Stundentafel] = {}
    for grade, hours_by_short in tafel_hours_by_grade.items():
        tafel = Stundentafel(name=f"Grundschule {grade}", grade_level=grade)
        session.add(tafel)
        tafeln_by_grade[grade] = tafel
    await session.flush()

    for grade, tafel in tafeln_by_grade.items():
        for subject_short, hours in tafel_hours_by_grade[grade].items():
            session.add(
                StundentafelEntry(
                    stundentafel_id=tafel.id,
                    subject_id=subjects_by_short[subject_short].id,
                    hours_per_week=hours,
                    preferred_block_size=1,
                )
            )
    await session.flush()

    # 4. School classes
    for spec in _SCHOOL_CLASSES:
        session.add(
            SchoolClass(
                name=spec.name,
                grade_level=spec.grade_level,
                stundentafel_id=tafeln_by_grade[spec.grade_level].id,
                week_scheme_id=week_scheme.id,
            )
        )
    await session.flush()

    # 5. Teachers + qualifications
    for teacher_spec in _TEACHERS:
        teacher = Teacher(
            first_name=teacher_spec.first_name,
            last_name=teacher_spec.last_name,
            short_code=teacher_spec.short_code,
            max_hours_per_week=teacher_spec.max_hours_per_week,
            is_active=True,
        )
        session.add(teacher)
        await session.flush()
        for subject_short in teacher_spec.qualified_subject_short_names:
            session.add(
                TeacherQualification(
                    teacher_id=teacher.id,
                    subject_id=subjects_by_short[subject_short].id,
                )
            )
    await session.flush()

    # 6. Rooms + suitabilities
    for room_spec in _ROOMS:
        room = Room(
            name=room_spec.name,
            short_name=room_spec.short_name,
            capacity=room_spec.capacity,
        )
        session.add(room)
        await session.flush()
        for subject_short in room_spec.suitable_subject_short_names:
            session.add(
                RoomSubjectSuitability(
                    room_id=room.id,
                    subject_id=subjects_by_short[subject_short].id,
                )
            )
    await session.flush()
```

- [ ] **Step 2: Type-check the new module**

Run: `cd backend && uv run ty check src/klassenzeit_backend/seed/demo_grundschule.py`
Expected: no errors.

- [ ] **Step 3: Run the shape tests**

Run: `cd backend && uv run pytest tests/seed/test_demo_grundschule_shape.py -v`
Expected: all shape tests pass.

- [ ] **Step 4: Run the rollback test**

Run: `cd backend && uv run pytest tests/seed/test_demo_grundschule_rollback.py -v`
Expected: passes (the second WeekScheme insert is not the one that conflicts; the second Subject insert of "Deutsch" triggers the IntegrityError during step 2 of the seed).

- [ ] **Step 5: Run both test files together**

Run: `cd backend && uv run pytest tests/seed/ -v`
Expected: all green.

No commit yet; Task 6 adds the CLI command before the feat commit.

---

## Task 6: Add the Typer CLI command

**Files:**
- Modify: `backend/src/klassenzeit_backend/cli.py` — insert `seed_grundschule` command after `seed_e2e_admin` (around line 143).

- [ ] **Step 1: Add the import and command**

Edit `backend/src/klassenzeit_backend/cli.py` to add this block **after** the existing `seed_e2e_admin` command (just before `def main()`):

```python
async def _run_seed_grundschule() -> None:
    settings = get_settings()
    engine = create_async_engine(str(settings.database_url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session:
            await seed_demo_grundschule(session)
            await session.commit()
    finally:
        await engine.dispose()


@cli.command()
def seed_grundschule() -> None:
    """Seed a demo Hessen Grundschule (4 classes, 6 teachers, 7 rooms).

    Refuses to run when ``KZ_ENV=prod``. On unique-name conflicts, the seed
    aborts atomically and prints a reset hint.
    """
    settings = get_settings()
    if settings.env == "prod":
        typer.echo("seed-grundschule is disabled in production", err=True)
        raise typer.Exit(code=1)
    try:
        asyncio.run(_run_seed_grundschule())
    except IntegrityError as exc:
        typer.echo(
            f"Seed aborted (integrity error): {exc.orig}\n"
            "The database already contains conflicting rows. "
            "Reset with `mise run db:reset` (dev) or the /__test__/reset "
            "endpoint (test) and try again.",
            err=True,
        )
        raise typer.Exit(code=1) from exc
    typer.echo("Grundschule demo seeded successfully.")
```

Add the supporting imports at the top of the file (next to the existing imports):

```python
from sqlalchemy.exc import IntegrityError

from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule
```

- [ ] **Step 2: Verify the CLI still loads**

Run: `cd backend && uv run klassenzeit-backend --help`
Expected: help output lists four commands: `create-admin`, `cleanup-sessions`, `seed-e2e-admin`, `seed-grundschule`.

- [ ] **Step 3: Verify the help text of the new command**

Run: `cd backend && uv run klassenzeit-backend seed-grundschule --help`
Expected: help output with the docstring.

- [ ] **Step 4: Type-check the CLI**

Run: `cd backend && uv run ty check src/klassenzeit_backend/cli.py`
Expected: no errors.

- [ ] **Step 5: Dry-run with the dev DB**

Run (only if Postgres is up and you have a clean DB; skip in CI):
```bash
mise run db:reset 2>&1 | tail -5
mise run db:migrate 2>&1 | tail -5
cd backend && uv run klassenzeit-backend seed-grundschule
```
Expected output: `Grundschule demo seeded successfully.`

If the DB has pre-existing rows, instead expect:
```
Seed aborted (integrity error): ...
The database already contains conflicting rows. Reset with `mise run db:reset`...
```

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && uv run pytest -q`
Expected: all green.

---

## Task 7: Commit the feat

- [ ] **Step 1: Review the staged diff**

Run: `git diff --stat`
Expected: `backend/src/klassenzeit_backend/cli.py` (modified) and `backend/src/klassenzeit_backend/seed/demo_grundschule.py` (new).

- [ ] **Step 2: Stage and commit**

```bash
git add backend/src/klassenzeit_backend/cli.py \
        backend/src/klassenzeit_backend/seed/demo_grundschule.py
git commit -m "feat(backend): implement demo_grundschule seed module and CLI command"
```

Expect pre-commit lint to pass. If it flags `check_unique_fns.py` on the helper functions, rename the offender with a `demo_grundschule_` prefix and re-stage; re-running the plan's Task 5 Step 3 will confirm tests still pass.

---

## Task 8: Write the solvability test

**Files:**
- Create: `backend/tests/seed/test_demo_grundschule_solvability.py`

- [ ] **Step 1: Write the solvability test**

```python
"""End-to-end feasibility: seed → generate lessons → solve → zero violations.

Drives the full flow through the HTTP test client so lesson generation,
solver invocation, and placement persistence all run as they would in
production. The per-test db_session is shared via the existing dependency
override, so the route handlers' commits are nested savepoint restarts,
rolled back at test teardown.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule


async def test_seeded_grundschule_solves_with_zero_violations(
    db_session: AsyncSession,
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    # 1. Seed the school.
    await seed_demo_grundschule(db_session)
    await db_session.flush()

    # 2. Create an admin and log in so the route's require_admin dep passes.
    admin, password = await create_test_user(
        email="admin@seedtest.local",
        password="seed-test-password-12345",
        role="admin",
    )
    await login_as(admin.email, password)

    # 3. Enumerate the four seeded classes.
    class_rows = (
        await db_session.execute(select(SchoolClass).order_by(SchoolClass.grade_level))
    ).scalars().all()
    assert [c.name for c in class_rows] == ["1a", "2a", "3a", "4a"]

    # 4. For each class: generate lessons, then generate schedule, assert no violations.
    for school_class in class_rows:
        gen_resp = await client.post(
            f"/api/classes/{school_class.id}/generate-lessons"
        )
        assert gen_resp.status_code == 201, gen_resp.text
        lessons = gen_resp.json()
        assert len(lessons) in (9, 10), (school_class.name, len(lessons))

        sched_resp = await client.post(f"/api/classes/{school_class.id}/schedule")
        assert sched_resp.status_code == 200, sched_resp.text
        body = sched_resp.json()
        assert body["violations"] == [], (
            school_class.name,
            body["violations"],
        )
        assert len(body["placements"]) > 0, school_class.name
```

- [ ] **Step 2: Run the solvability test**

Run: `cd backend && uv run pytest tests/seed/test_demo_grundschule_solvability.py -v`
Expected: passes. Each class's `violations` list is empty.

- [ ] **Step 3: If the test fails with `UnplacedLesson` or `TeacherOverCapacity` violations, tune the seed**

Most likely tightness points (per spec Risks):

1. **Becker over capacity**: RE (8h) + MU (4h) + FÖ ≤ 18h. Solver might try Becker for all FÖ; if so, widen FÖ qualifications: add a Klassenlehrer (e.g. Müller) to FÖ. Edit `_TEACHERS` in `demo_grundschule.py`:
   ```python
   _TeacherSpec("Anna", "Müller", "MUE", 28, ("D", "M", "SU", "KU", "FÖ")),
   ```
   Rerun the shape test (FÖ qualifications count goes from 2 to 3, so the shape-test assertion `TeacherQualification == 22` bumps to 23). Update that assertion in `test_demo_grundschule_shape.py`.

2. **Hoffmann over capacity on SP + KU**: 12h + 4h = 16h, within 21h cap. Unlikely to trip.

3. **Overall infeasibility**: 98h of demand vs 151h of teacher capacity is comfortable. If the solver still fails, the issue is likely a missing `room_subject_suitability` combination. Double-check with:
   ```bash
   cd backend && uv run pytest tests/seed/test_demo_grundschule_shape.py::test_room_suitabilities_encode_specialty_split -v
   ```

Repeat step 2 after any fix until green.

- [ ] **Step 4: Run the full seed test file**

Run: `cd backend && uv run pytest tests/seed/ -v`
Expected: all green, including the pre-existing shape and rollback tests.

---

## Task 9: Commit the solvability test

- [ ] **Step 1: Stage and commit**

```bash
git add backend/tests/seed/test_demo_grundschule_solvability.py
```

If Task 8 Step 3 required tuning the seed to pass:
```bash
git add backend/src/klassenzeit_backend/seed/demo_grundschule.py \
        backend/tests/seed/test_demo_grundschule_shape.py
```

Then:
```bash
git commit -m "test(backend): add demo_grundschule seed solvability test"
```

Pre-commit should pass.

---

## Task 10: Update `OPEN_THINGS.md`

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md:11-13` — strike the shipped step 1 item, renumber, tighten the remaining step 2 wording.

- [ ] **Step 1: Read the current paragraph**

Read lines 11 through 13 to confirm the current text matches the spec's understanding.

- [ ] **Step 2: Update the sprint paragraph**

Change the paragraph starting "Steps 1 ... 2 ... and 3 ... shipped." from:

```
Steps 1 (PyO3 binding + `POST /api/classes/{id}/schedule` compute endpoint), 2 (placement persistence: `scheduled_lessons` table, per-class upsert on POST, `GET /api/classes/{id}/schedule`), and 3 (frontend `/schedule` route with class picker, `kz-ws-grid` week grid, and Generate action) shipped. Remaining steps:

1. **Realistic Hessen Grundschule seed.** A one-shot `uv run python -m klassenzeit_backend.seed.demo_grundschule` that creates the week scheme, Stundentafeln for grades 1 to 4, plausible teachers / rooms, and a pair of classes ready to generate lessons + schedule. Also feeds the Playwright E2E. Reference figures captured below.
2. **E2E smoke test.** One Playwright spec that hits `/login`, runs the seed via a test-only endpoint, clicks through generate-lessons + generate-schedule, and asserts the grid renders.
```

to:

```
Steps 1 (PyO3 binding + `POST /api/classes/{id}/schedule` compute endpoint), 2 (placement persistence: `scheduled_lessons` table, per-class upsert on POST, `GET /api/classes/{id}/schedule`), 3 (frontend `/schedule` route with class picker, `kz-ws-grid` week grid, and Generate action), and 4 (`uv run klassenzeit-backend seed-grundschule` Typer command that creates an einzügige Hessen Grundschule demo; see `docs/superpowers/specs/2026-04-24-grundschule-seed-design.md`) shipped. Remaining step:

1. **E2E smoke test.** One Playwright spec that hits `/login`, invokes the seed via a `/__test__/seed-grundschule` endpoint that wraps `seed_demo_grundschule`, clicks through generate-lessons + generate-schedule, and asserts the grid renders.
```

Keep the "Hessen Grundschule reference data (for step 2)" heading as-is but fix the heading to "(for the E2E smoke step)" since the literal step numbers have shifted. In the same edit, drop the last paragraph of that section ("Weiterer Rechercheauftrag vor dem Seeden: ...") because the research has been done and the outcome is captured in the spec's "Research notes" table. Replace it with a single sentence: "Research was completed during the seed's brainstorm (`/tmp/kz-brainstorm/brainstorm.md`, Q3) and mapped to schema columns in the seed design spec's Research notes table."

- [ ] **Step 3: Verify the file is still well-formed markdown**

Run: `rg "^# |^## " docs/superpowers/OPEN_THINGS.md | head -20`
Expected: headings render in the same top-level structure.

---

## Task 11: Commit the docs update

- [ ] **Step 1: Stage and commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: mark grundschule seed as shipped in OPEN_THINGS"
```

---

## Task 12: Whole-branch sanity pass

- [ ] **Step 1: Lint the whole repo**

Run: `mise run lint`
Expected: all linters green. The existing DESIGN.md warnings (button-primary / button-secondary contrast) are pre-existing and unrelated.

- [ ] **Step 2: Run the full test suite**

Run: `mise run test`
Expected: all Rust + Python + frontend tests green. Seed tests run under the `test:py` task.

- [ ] **Step 3: Verify git log shape**

Run: `git log --oneline master..HEAD`
Expected: five commits in order (the spec commit from autopilot step 3 plus the four from this plan):
1. `docs: add grundschule seed design spec`
2. `test(backend): add demo_grundschule seed shape and rollback tests`
3. `feat(backend): implement demo_grundschule seed module and CLI command`
4. `test(backend): add demo_grundschule seed solvability test`
5. `docs: mark grundschule seed as shipped in OPEN_THINGS`

- [ ] **Step 4: Handoff to /autopilot step 6 (finalize docs)**

No further action in this plan; the autopilot workflow picks up from here.
