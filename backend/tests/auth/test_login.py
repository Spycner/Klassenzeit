"""Tests for POST /auth/login and POST /auth/logout."""

from httpx import AsyncClient


async def test_login_returns_204_and_sets_cookie(
    client: AsyncClient,
    create_test_user,
) -> None:
    _, pw = await create_test_user(email="login@test.com")
    response = await client.post(
        "/auth/login",
        json={"email": "login@test.com", "password": pw},
    )
    assert response.status_code == 204
    assert "kz_session" in response.cookies


async def test_login_wrong_password_returns_401(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="wrong@test.com")
    response = await client.post(
        "/auth/login",
        json={"email": "wrong@test.com", "password": "wrongpassword!!"},
    )
    assert response.status_code == 401


async def test_login_nonexistent_email_returns_401(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/auth/login",
        json={"email": "nobody@test.com", "password": "doesntmatter!!"},
    )
    assert response.status_code == 401


async def test_login_inactive_user_returns_401(
    client: AsyncClient,
    create_test_user,
) -> None:
    _, pw = await create_test_user(email="inactive@test.com", is_active=False)
    response = await client.post(
        "/auth/login",
        json={"email": "inactive@test.com", "password": pw},
    )
    assert response.status_code == 401


async def test_login_is_case_insensitive(
    client: AsyncClient,
    create_test_user,
) -> None:
    _, pw = await create_test_user(email="case@test.com")
    response = await client.post(
        "/auth/login",
        json={"email": "CASE@TEST.COM", "password": pw},
    )
    assert response.status_code == 204


async def test_login_rate_limit_returns_429(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="rate@test.com")
    for _ in range(5):
        await client.post(
            "/auth/login",
            json={"email": "rate@test.com", "password": "wrongpassword!!"},
        )
    response = await client.post(
        "/auth/login",
        json={"email": "rate@test.com", "password": "wrongpassword!!"},
    )
    assert response.status_code == 429
    assert "Retry-After" in response.headers


async def test_login_rate_limit_counts_nonexistent_email(
    client: AsyncClient,
) -> None:
    for _ in range(5):
        await client.post(
            "/auth/login",
            json={"email": "ghost@test.com", "password": "wrongpassword!!"},
        )
    response = await client.post(
        "/auth/login",
        json={"email": "ghost@test.com", "password": "wrongpassword!!"},
    )
    assert response.status_code == 429


async def test_logout_returns_204_and_clears_cookie(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    _, pw = await create_test_user(email="logout@test.com")
    await login_as("logout@test.com", pw)
    response = await client.post("/auth/logout")
    assert response.status_code == 204
    assert "kz_session" in response.headers.get("set-cookie", "")


async def test_logout_without_session_returns_401(
    client: AsyncClient,
) -> None:
    response = await client.post("/auth/logout")
    assert response.status_code == 401


async def test_double_logout_returns_401(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    _, pw = await create_test_user(email="double@test.com")
    await login_as("double@test.com", pw)
    first = await client.post("/auth/logout")
    assert first.status_code == 204
    client.cookies.delete("kz_session")
    second = await client.post("/auth/logout")
    assert second.status_code == 401
