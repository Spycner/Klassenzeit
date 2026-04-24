"""End-to-end feasibility: seed + generate lessons + assign teachers + solve.

Drives the full flow through the HTTP test client so lesson generation,
solver invocation, and placement persistence all run as they would in
production, plus a teacher-assignment step that production currently
expects the user to perform (either via the UI or by extending the
generate-lessons endpoint later). The per-test db_session is shared via
the existing dependency override, so the route handlers' commits are
nested savepoint restarts, rolled back at test teardown.

The `TEACHER_ASSIGNMENTS` mapping below is a valid greedy assignment
derived in the spec's feasibility analysis. Each (class, subject) maps
to one qualified teacher whose aggregate hours stay within
`max_hours_per_week`. If the seed's teacher qualifications or hour caps
change, this mapping needs to be regenerated.
"""

from collections.abc import Awaitable, Callable

from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule

CreateUserFn = Callable[..., Awaitable[tuple[User, str]]]
LoginFn = Callable[[str, str], Awaitable[None]]


TEACHER_ASSIGNMENTS: dict[tuple[str, str], str] = {
    ("1a", "D"): "MUE",
    ("1a", "M"): "MUE",
    ("1a", "SU"): "MUE",
    ("1a", "RE"): "BEC",
    ("1a", "KU"): "MUE",
    ("1a", "WE"): "SCH",
    ("1a", "MU"): "BEC",
    ("1a", "SP"): "HOF",
    ("1a", "FÖ"): "BEC",
    ("2a", "D"): "SCH",
    ("2a", "M"): "SCH",
    ("2a", "SU"): "SCH",
    ("2a", "RE"): "BEC",
    ("2a", "KU"): "MUE",
    ("2a", "WE"): "SCH",
    ("2a", "MU"): "BEC",
    ("2a", "SP"): "HOF",
    ("2a", "FÖ"): "BEC",
    ("3a", "D"): "WEB",
    ("3a", "M"): "WEB",
    ("3a", "SU"): "WEB",
    ("3a", "E"): "WEB",
    ("3a", "RE"): "BEC",
    ("3a", "KU"): "HOF",
    ("3a", "WE"): "SCH",
    ("3a", "MU"): "BEC",
    ("3a", "SP"): "HOF",
    ("3a", "FÖ"): "HOF",
    ("4a", "D"): "FIS",
    ("4a", "M"): "FIS",
    ("4a", "SU"): "FIS",
    ("4a", "E"): "FIS",
    ("4a", "RE"): "BEC",
    ("4a", "KU"): "HOF",
    ("4a", "WE"): "SCH",
    ("4a", "MU"): "BEC",
    ("4a", "SP"): "HOF",
    ("4a", "FÖ"): "HOF",
}


async def _assign_teachers_for_demo_grundschule_lessons(db: AsyncSession) -> None:
    """Pin `teacher_id` on every seeded Lesson per TEACHER_ASSIGNMENTS.

    The solver currently treats lessons with `teacher_id IS NULL` as absent
    from the problem (see `build_problem_json` in `scheduling/solver_io.py`).
    The production demo flow expects the user to assign teachers manually
    between `generate-lessons` and `POST /schedule`; this helper does the
    equivalent for the test.
    """
    rows = (
        await db.execute(
            select(Lesson.id, SchoolClass.name, Subject.short_name)
            .join(SchoolClass, SchoolClass.id == Lesson.school_class_id)
            .join(Subject, Subject.id == Lesson.subject_id)
        )
    ).all()
    teacher_id_by_short_code = {
        row[0]: row[1] for row in (await db.execute(select(Teacher.short_code, Teacher.id))).all()
    }
    for lesson_id, class_name, subject_short in rows:
        short_code = TEACHER_ASSIGNMENTS[(class_name, subject_short)]
        teacher_id = teacher_id_by_short_code[short_code]
        await db.execute(update(Lesson).where(Lesson.id == lesson_id).values(teacher_id=teacher_id))


async def test_seeded_grundschule_solves_with_zero_violations(
    db_session: AsyncSession,
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    await seed_demo_grundschule(db_session)
    await db_session.flush()

    admin, password = await create_test_user(
        email="admin-seedtest@example.com",
        password="seed-test-password-12345",  # noqa: S106
        role="admin",
    )
    await login_as(admin.email, password)

    class_rows = (
        (await db_session.execute(select(SchoolClass).order_by(SchoolClass.grade_level)))
        .scalars()
        .all()
    )
    assert [c.name for c in class_rows] == ["1a", "2a", "3a", "4a"]

    for school_class in class_rows:
        gen_resp = await client.post(f"/api/classes/{school_class.id}/generate-lessons")
        assert gen_resp.status_code == 201, gen_resp.text
        lessons = gen_resp.json()
        assert len(lessons) in (9, 10), (school_class.name, len(lessons))

    await _assign_teachers_for_demo_grundschule_lessons(db_session)
    await db_session.flush()

    for school_class in class_rows:
        sched_resp = await client.post(f"/api/classes/{school_class.id}/schedule")
        assert sched_resp.status_code == 200, sched_resp.text
        body = sched_resp.json()
        assert body["violations"] == [], (school_class.name, body["violations"])
        assert len(body["placements"]) > 0, school_class.name
