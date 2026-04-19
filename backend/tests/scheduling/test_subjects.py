"""Integration tests for the Subject CRUD routes."""

import uuid
from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient

from klassenzeit_backend.db.models.user import User

pytestmark = pytest.mark.anyio

# Type aliases matching the factory fixtures defined in conftest.py
type CreateUserFn = Callable[..., Awaitable[tuple[User, str]]]
type LoginFn = Callable[[str, str], Awaitable[None]]


async def test_create_subject(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /subjects creates a new subject and returns 201 with the full body.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    response = await client.post("/api/subjects", json={"name": "Mathematik", "short_name": "Ma"})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Mathematik"
    assert body["short_name"] == "Ma"
    assert "id" in body


async def test_create_subject_duplicate_name(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /subjects with a duplicate name returns 409 Conflict.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin2@test.com", role="admin")
    await login_as("admin2@test.com", "testpassword123")
    await client.post("/api/subjects", json={"name": "Deutsch", "short_name": "De"})
    response = await client.post("/api/subjects", json={"name": "Deutsch", "short_name": "D2"})
    assert response.status_code == 409


async def test_list_subjects(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """GET /subjects returns all subjects.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin3@test.com", role="admin")
    await login_as("admin3@test.com", "testpassword123")
    await client.post("/api/subjects", json={"name": "Englisch", "short_name": "En"})
    await client.post("/api/subjects", json={"name": "Biologie", "short_name": "Bi"})
    response = await client.get("/api/subjects")
    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 2
    names = [s["name"] for s in body]
    assert "Englisch" in names
    assert "Biologie" in names


async def test_get_subject(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """GET /subjects/{id} returns a single subject by ID.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin4@test.com", role="admin")
    await login_as("admin4@test.com", "testpassword123")
    create_resp = await client.post("/api/subjects", json={"name": "Chemie", "short_name": "Ch"})
    subject_id = create_resp.json()["id"]
    response = await client.get(f"/api/subjects/{subject_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == subject_id
    assert body["name"] == "Chemie"


async def test_get_subject_not_found(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """GET /subjects/{id} returns 404 for an unknown UUID.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin5@test.com", role="admin")
    await login_as("admin5@test.com", "testpassword123")
    response = await client.get(f"/api/subjects/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_update_subject(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PATCH /subjects/{id} updates only the fields provided; others remain unchanged.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin6@test.com", role="admin")
    await login_as("admin6@test.com", "testpassword123")
    create_resp = await client.post("/api/subjects", json={"name": "Physik", "short_name": "Ph"})
    subject_id = create_resp.json()["id"]
    response = await client.patch(f"/api/subjects/{subject_id}", json={"name": "Physik neu"})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Physik neu"
    assert body["short_name"] == "Ph"


async def test_delete_subject(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """DELETE /subjects/{id} removes the subject; subsequent GET returns 404.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin7@test.com", role="admin")
    await login_as("admin7@test.com", "testpassword123")
    create_resp = await client.post("/api/subjects", json={"name": "Kunst", "short_name": "Ku"})
    subject_id = create_resp.json()["id"]
    delete_resp = await client.delete(f"/api/subjects/{subject_id}")
    assert delete_resp.status_code == 204
    get_resp = await client.get(f"/api/subjects/{subject_id}")
    assert get_resp.status_code == 404


async def test_delete_subject_not_found(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """DELETE /subjects/{id} returns 404 for an unknown UUID.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin8@test.com", role="admin")
    await login_as("admin8@test.com", "testpassword123")
    response = await client.delete(f"/api/subjects/{uuid.uuid4()}")
    assert response.status_code == 404


async def test_delete_subject_referenced_by_lesson(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """DELETE /subjects/{id} returns 409 when a lesson references it.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    subj_resp = await client.post("/api/subjects", json={"name": "Mathematik", "short_name": "Ma"})
    subject_id = subj_resp.json()["id"]
    scheme_resp = await client.post("/api/week-schemes", json={"name": "Test Scheme"})
    tafel_resp = await client.post(
        "/api/stundentafeln", json={"name": "Test Tafel", "grade_level": 5}
    )
    class_resp = await client.post(
        "/api/classes",
        json={
            "name": "5a",
            "grade_level": 5,
            "stundentafel_id": tafel_resp.json()["id"],
            "week_scheme_id": scheme_resp.json()["id"],
        },
    )
    await client.post(
        "/api/lessons",
        json={
            "school_class_id": class_resp.json()["id"],
            "subject_id": subject_id,
            "hours_per_week": 4,
        },
    )
    response = await client.delete(f"/api/subjects/{subject_id}")
    assert response.status_code == 409


async def test_subject_requires_admin(client: AsyncClient) -> None:
    """GET /subjects without authentication returns 401 Unauthorized.

    Args:
        client: The async test HTTP client (no session cookie set).
    """
    response = await client.get("/api/subjects")
    assert response.status_code == 401
