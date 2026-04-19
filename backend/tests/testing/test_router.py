"""Integration tests for the test-only router."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models import Subject, User


async def test_health_returns_ok(client: AsyncClient) -> None:
    """GET /__test__/health returns 200 with a simple body."""
    response = await client.get("/__test__/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_reset_truncates_entity_tables(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_user,
    login_as,
) -> None:
    """POST /__test__/reset wipes subjects (and other entity tables)."""
    # Need an admin user to call /subjects
    await create_test_user(email="admin@reset-test.com", role="admin")
    await login_as("admin@reset-test.com", "testpassword123")

    subject = Subject(name="Temp", short_name="TMP")
    db_session.add(subject)
    await db_session.flush()

    # Confirm the row is visible through the app.
    pre_resp = await client.get("/subjects")
    assert pre_resp.status_code == 200
    assert any(s["name"] == "Temp" for s in pre_resp.json())

    response = await client.post("/__test__/reset")
    assert response.status_code == 204

    # After reset, expire the session cache so we see the actual DB state.
    db_session.expire_all()

    post_resp = await client.get("/subjects")
    assert post_resp.status_code == 200
    assert post_resp.json() == []


async def test_reset_preserves_users_and_sessions(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_user,
) -> None:
    """POST /__test__/reset does NOT truncate users or sessions."""
    await create_test_user(email="keep@test.com")
    await db_session.commit()

    response = await client.post("/__test__/reset")
    assert response.status_code == 204

    db_session.expire_all()
    result = await db_session.execute(select(User).where(User.email == "keep@test.com"))
    assert result.scalar_one_or_none() is not None
