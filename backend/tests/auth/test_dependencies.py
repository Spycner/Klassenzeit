"""Tests for get_current_user and require_admin dependencies."""

import uuid

from httpx import AsyncClient


async def test_unauthenticated_returns_401(client: AsyncClient) -> None:
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


async def test_invalid_session_cookie_returns_401(client: AsyncClient) -> None:
    client.cookies.set("kz_session", "not-a-uuid")
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


async def test_nonexistent_session_returns_401(client: AsyncClient) -> None:
    client.cookies.set("kz_session", str(uuid.uuid4()))
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


async def test_inactive_user_returns_401(
    client: AsyncClient,
    create_test_user,
) -> None:
    _, pw = await create_test_user(email="inactive@test.com", is_active=False)
    response = await client.post(
        "/api/auth/login",
        json={"email": "inactive@test.com", "password": pw},
    )
    assert response.status_code == 401
