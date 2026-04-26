"""End-to-end feasibility: seed + generate lessons + assign teachers + solve.

Drives the full flow through the HTTP test client so lesson generation,
solver invocation, and placement persistence all run as they would in
production, plus a teacher-assignment step that production currently
expects the user to perform (either via the UI or by extending the
generate-lessons endpoint later). The per-test db_session is shared via
the existing dependency override, so the route handlers' commits are
nested savepoint restarts, rolled back at test teardown.
"""

from collections.abc import Awaitable, Callable

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule

CreateUserFn = Callable[..., Awaitable[tuple[User, str]]]
LoginFn = Callable[[str, str], Awaitable[None]]


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
        assert len(lessons) in (8, 9), (school_class.name, len(lessons))

    unassigned_count = (
        await db_session.execute(
            select(func.count()).select_from(Lesson).where(Lesson.teacher_id.is_(None))
        )
    ).scalar_one()
    assert unassigned_count == 0, "auto-assign left some lessons unassigned"

    for school_class in class_rows:
        sched_resp = await client.post(f"/api/classes/{school_class.id}/schedule")
        assert sched_resp.status_code == 200, sched_resp.text
        body = sched_resp.json()
        assert body["violations"] == [], (school_class.name, body["violations"])
        assert len(body["placements"]) > 0, school_class.name
