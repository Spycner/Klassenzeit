"""Integration tests for the WeekScheme and TimeBlock CRUD routes."""

from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient

from klassenzeit_backend.db.models.user import User

pytestmark = pytest.mark.anyio

# Type aliases matching the factory fixtures defined in conftest.py
type CreateUserFn = Callable[..., Awaitable[tuple[User, str]]]
type LoginFn = Callable[[str, str], Awaitable[None]]


async def test_create_week_scheme(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /week-schemes creates a new week scheme and returns 201 with the full body.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws1.com", role="admin")
    await login_as("admin@ws1.com", "testpassword123")
    response = await client.post(
        "/api/week-schemes",
        json={"name": "Standard Week", "description": "5-day standard schedule"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Standard Week"
    assert body["description"] == "5-day standard schedule"
    assert "id" in body


async def test_create_week_scheme_duplicate_name(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /week-schemes with a duplicate name returns 409 Conflict.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws2.com", role="admin")
    await login_as("admin@ws2.com", "testpassword123")
    await client.post("/api/week-schemes", json={"name": "Duplicate Scheme"})
    response = await client.post("/api/week-schemes", json={"name": "Duplicate Scheme"})
    assert response.status_code == 409


async def test_list_week_schemes(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """GET /week-schemes returns all week schemes without time blocks.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws3.com", role="admin")
    await login_as("admin@ws3.com", "testpassword123")
    await client.post("/api/week-schemes", json={"name": "Alpha Week"})
    await client.post("/api/week-schemes", json={"name": "Beta Week"})
    response = await client.get("/api/week-schemes")
    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 2
    names = [s["name"] for s in body]
    assert "Alpha Week" in names
    assert "Beta Week" in names
    # List response must not contain time_blocks key
    for item in body:
        assert "time_blocks" not in item


async def test_get_week_scheme_with_time_blocks(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """GET /week-schemes/{id} returns the scheme with nested time blocks.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws4.com", role="admin")
    await login_as("admin@ws4.com", "testpassword123")
    create_resp = await client.post("/api/week-schemes", json={"name": "Detail Week"})
    scheme_id = create_resp.json()["id"]
    await client.post(
        f"/api/week-schemes/{scheme_id}/time-blocks",
        json={"day_of_week": 0, "position": 1, "start_time": "08:00:00", "end_time": "08:45:00"},
    )
    await client.post(
        f"/api/week-schemes/{scheme_id}/time-blocks",
        json={"day_of_week": 0, "position": 2, "start_time": "09:00:00", "end_time": "09:45:00"},
    )
    response = await client.get(f"/api/week-schemes/{scheme_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == scheme_id
    assert body["name"] == "Detail Week"
    assert "time_blocks" in body
    assert len(body["time_blocks"]) == 2
    positions = [tb["position"] for tb in body["time_blocks"]]
    assert positions == [1, 2]


async def test_update_week_scheme(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PATCH /week-schemes/{id} updates only the supplied fields.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws5.com", role="admin")
    await login_as("admin@ws5.com", "testpassword123")
    create_resp = await client.post(
        "/api/week-schemes", json={"name": "Old Name", "description": "original"}
    )
    scheme_id = create_resp.json()["id"]
    response = await client.patch(f"/api/week-schemes/{scheme_id}", json={"name": "New Name"})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "New Name"
    assert body["description"] == "original"


async def test_delete_week_scheme(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """DELETE /week-schemes/{id} removes the scheme; subsequent GET returns 404.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws6.com", role="admin")
    await login_as("admin@ws6.com", "testpassword123")
    create_resp = await client.post("/api/week-schemes", json={"name": "To Delete"})
    scheme_id = create_resp.json()["id"]
    delete_resp = await client.delete(f"/api/week-schemes/{scheme_id}")
    assert delete_resp.status_code == 204
    get_resp = await client.get(f"/api/week-schemes/{scheme_id}")
    assert get_resp.status_code == 404


async def test_create_time_block(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /week-schemes/{id}/time-blocks creates a time block and returns 201.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws7.com", role="admin")
    await login_as("admin@ws7.com", "testpassword123")
    create_resp = await client.post("/api/week-schemes", json={"name": "Block Week"})
    scheme_id = create_resp.json()["id"]
    response = await client.post(
        f"/api/week-schemes/{scheme_id}/time-blocks",
        json={"day_of_week": 1, "position": 1, "start_time": "08:00:00", "end_time": "08:45:00"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["day_of_week"] == 1
    assert body["position"] == 1
    assert "id" in body


async def test_create_time_block_duplicate_position(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /week-schemes/{id}/time-blocks with duplicate day+position returns 409.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws8.com", role="admin")
    await login_as("admin@ws8.com", "testpassword123")
    create_resp = await client.post("/api/week-schemes", json={"name": "Dup Block Week"})
    scheme_id = create_resp.json()["id"]
    await client.post(
        f"/api/week-schemes/{scheme_id}/time-blocks",
        json={"day_of_week": 2, "position": 3, "start_time": "10:00:00", "end_time": "10:45:00"},
    )
    response = await client.post(
        f"/api/week-schemes/{scheme_id}/time-blocks",
        json={"day_of_week": 2, "position": 3, "start_time": "11:00:00", "end_time": "11:45:00"},
    )
    assert response.status_code == 409


async def test_update_time_block(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PATCH /week-schemes/{id}/time-blocks/{block_id} updates the specified fields.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws9.com", role="admin")
    await login_as("admin@ws9.com", "testpassword123")
    create_resp = await client.post("/api/week-schemes", json={"name": "Update Block Week"})
    scheme_id = create_resp.json()["id"]
    block_resp = await client.post(
        f"/api/week-schemes/{scheme_id}/time-blocks",
        json={"day_of_week": 3, "position": 1, "start_time": "08:00:00", "end_time": "08:45:00"},
    )
    block_id = block_resp.json()["id"]
    response = await client.patch(
        f"/api/week-schemes/{scheme_id}/time-blocks/{block_id}",
        json={"start_time": "09:00:00", "end_time": "09:45:00"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["start_time"] == "09:00:00"
    assert body["end_time"] == "09:45:00"
    assert body["day_of_week"] == 3
    assert body["position"] == 1


async def test_delete_time_block(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """DELETE /week-schemes/{id}/time-blocks/{block_id} removes the block; GET detail shows it gone.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@ws10.com", role="admin")
    await login_as("admin@ws10.com", "testpassword123")
    create_resp = await client.post("/api/week-schemes", json={"name": "Delete Block Week"})
    scheme_id = create_resp.json()["id"]
    block_resp = await client.post(
        f"/api/week-schemes/{scheme_id}/time-blocks",
        json={"day_of_week": 4, "position": 1, "start_time": "08:00:00", "end_time": "08:45:00"},
    )
    block_id = block_resp.json()["id"]
    delete_resp = await client.delete(f"/api/week-schemes/{scheme_id}/time-blocks/{block_id}")
    assert delete_resp.status_code == 204
    get_resp = await client.get(f"/api/week-schemes/{scheme_id}")
    body = get_resp.json()
    block_ids = [tb["id"] for tb in body["time_blocks"]]
    assert block_id not in block_ids


async def test_delete_week_scheme_referenced_by_class(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """DELETE /week-schemes/{id} returns 409 when a class references it.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    scheme_resp = await client.post("/api/week-schemes", json={"name": "Test Scheme"})
    scheme_id = scheme_resp.json()["id"]
    tafel_resp = await client.post(
        "/api/stundentafeln", json={"name": "Test Tafel", "grade_level": 5}
    )
    tafel_id = tafel_resp.json()["id"]
    await client.post(
        "/api/classes",
        json={
            "name": "5a",
            "grade_level": 5,
            "stundentafel_id": tafel_id,
            "week_scheme_id": scheme_id,
        },
    )
    response = await client.delete(f"/api/week-schemes/{scheme_id}")
    assert response.status_code == 409


async def test_week_scheme_requires_admin(client: AsyncClient) -> None:
    """GET /week-schemes without authentication returns 401 Unauthorized.

    Args:
        client: The async test HTTP client (no session cookie set).
    """
    response = await client.get("/api/week-schemes")
    assert response.status_code == 401
