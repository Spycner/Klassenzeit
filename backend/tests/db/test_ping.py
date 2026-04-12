"""End-to-end DB layer tests running against a real Postgres test DB.

These tests exercise the full stack: real engine, real migrations,
real session wiring. They are isolated from each other via the
``db_session`` fixture's transaction-rollback pattern — each test sees
an empty ``ping`` table at start regardless of order.
"""

from httpx import AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models._ping import Ping


async def test_migrations_create_ping_table(db_session: AsyncSession) -> None:
    result = await db_session.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'ping'"
        )
    )
    assert result.scalar_one() == "ping"


async def test_ping_roundtrip(db_session: AsyncSession) -> None:
    ping = Ping()
    db_session.add(ping)
    await db_session.commit()

    fetched = (await db_session.execute(select(Ping))).scalar_one()
    assert fetched.id is not None
    assert fetched.created_at is not None
    assert fetched.created_at.tzinfo is not None


async def test_rollback_isolation_insert(db_session: AsyncSession) -> None:
    db_session.add(Ping())
    await db_session.commit()

    count = await db_session.scalar(select(func.count()).select_from(Ping))
    assert count == 1


async def test_rollback_isolation_empty(db_session: AsyncSession) -> None:
    count = await db_session.scalar(select(func.count()).select_from(Ping))
    assert count == 0


async def test_health_endpoint_still_works(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "solver_check": "ko"}
