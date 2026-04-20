"""Tests for admin user management routes."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.user import User


async def test_create_user(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    response = await client.post(
        "/api/auth/admin/users",
        json={
            "email": "newuser@test.com",
            "password": "a-secure-passphrase",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "newuser@test.com"
    assert body["role"] == "user"
    assert "id" in body


async def test_create_user_with_admin_role(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="admin2@test.com", role="admin")
    await login_as("admin2@test.com", "testpassword123")
    response = await client.post(
        "/api/auth/admin/users",
        json={
            "email": "newadmin@test.com",
            "password": "a-secure-passphrase",
            "role": "admin",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "admin"


async def test_create_user_duplicate_email_returns_409(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="dupadmin@test.com", role="admin")
    await login_as("dupadmin@test.com", "testpassword123")
    await client.post(
        "/api/auth/admin/users",
        json={"email": "dup@test.com", "password": "a-secure-passphrase"},
    )
    response = await client.post(
        "/api/auth/admin/users",
        json={"email": "dup@test.com", "password": "another-passphrase!"},
    )
    assert response.status_code == 409


async def test_create_user_weak_password_returns_422(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="weakadmin@test.com", role="admin")
    await login_as("weakadmin@test.com", "testpassword123")
    response = await client.post(
        "/api/auth/admin/users",
        json={"email": "weak@test.com", "password": "short"},
    )
    assert response.status_code == 422


async def test_non_admin_returns_403(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="regular@test.com", role="user")
    await login_as("regular@test.com", "testpassword123")
    response = await client.post(
        "/api/auth/admin/users",
        json={"email": "x@test.com", "password": "a-secure-passphrase"},
    )
    assert response.status_code == 403


async def test_list_users(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="listadmin@test.com", role="admin")
    await login_as("listadmin@test.com", "testpassword123")
    await client.post(
        "/api/auth/admin/users",
        json={"email": "listme@test.com", "password": "a-secure-passphrase"},
    )
    response = await client.get("/api/auth/admin/users")
    assert response.status_code == 200
    emails = [u["email"] for u in response.json()]
    assert "listadmin@test.com" in emails
    assert "listme@test.com" in emails


async def test_list_users_filter_active(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="filteradmin@test.com", role="admin")
    await login_as("filteradmin@test.com", "testpassword123")
    await client.post(
        "/api/auth/admin/users",
        json={"email": "willdeactivate@test.com", "password": "a-secure-passphrase"},
    )
    users = (await client.get("/api/auth/admin/users")).json()
    uid = next(u["id"] for u in users if u["email"] == "willdeactivate@test.com")
    await client.post(f"/api/auth/admin/users/{uid}/deactivate")

    active = await client.get("/api/auth/admin/users?active=true")
    active_emails = [u["email"] for u in active.json()]
    assert "willdeactivate@test.com" not in active_emails

    inactive = await client.get("/api/auth/admin/users?active=false")
    inactive_emails = [u["email"] for u in inactive.json()]
    assert "willdeactivate@test.com" in inactive_emails


async def test_reset_password(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="resetadmin@test.com", role="admin")
    await login_as("resetadmin@test.com", "testpassword123")
    create_resp = await client.post(
        "/api/auth/admin/users",
        json={"email": "resetme@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    response = await client.post(
        f"/api/auth/admin/users/{uid}/reset-password",
        json={"new_password": "a-new-secure-passphrase"},
    )
    assert response.status_code == 204


async def test_reset_password_sets_force_flag(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="forceadmin@test.com", role="admin")
    await login_as("forceadmin@test.com", "testpassword123")
    create_resp = await client.post(
        "/api/auth/admin/users",
        json={"email": "forcereset@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    await client.post(
        f"/api/auth/admin/users/{uid}/reset-password",
        json={"new_password": "a-new-secure-passphrase"},
    )
    # Verify force flag directly via DB query
    result = await db_session.execute(select(User).where(User.email == "forcereset@test.com"))
    user = result.scalar_one()
    assert user.force_password_change is True


async def test_deactivate_user(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="deactadmin@test.com", role="admin")
    await login_as("deactadmin@test.com", "testpassword123")
    create_resp = await client.post(
        "/api/auth/admin/users",
        json={"email": "deactme@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    response = await client.post(f"/api/auth/admin/users/{uid}/deactivate")
    assert response.status_code == 204


async def test_deactivated_user_cannot_login(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="deactlogin@test.com", role="admin")
    await login_as("deactlogin@test.com", "testpassword123")
    create_resp = await client.post(
        "/api/auth/admin/users",
        json={"email": "blocked@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    await client.post(f"/api/auth/admin/users/{uid}/deactivate")
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "blocked@test.com", "password": "a-secure-passphrase"},
    )
    assert login_resp.status_code == 401


async def test_activate_user(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="actadmin@test.com", role="admin")
    await login_as("actadmin@test.com", "testpassword123")
    create_resp = await client.post(
        "/api/auth/admin/users",
        json={"email": "reactivate@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    await client.post(f"/api/auth/admin/users/{uid}/deactivate")
    response = await client.post(f"/api/auth/admin/users/{uid}/activate")
    assert response.status_code == 204
