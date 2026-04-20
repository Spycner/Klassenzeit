"""Integration tests for the Room CRUD routes with suitability and availability."""

from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient

from klassenzeit_backend.db.models.user import User

pytestmark = pytest.mark.anyio

# Type aliases matching the factory fixtures defined in conftest.py
type CreateUserFn = Callable[..., Awaitable[tuple[User, str]]]
type LoginFn = Callable[[str, str], Awaitable[None]]


async def test_create_room(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /rooms creates a room with default suitability_mode=general and returns 201.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room1.com", role="admin")
    await login_as("admin@room1.com", "testpassword123")
    response = await client.post(
        "/api/rooms",
        json={"name": "Room A", "short_name": "A", "capacity": 30},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Room A"
    assert body["short_name"] == "A"
    assert body["capacity"] == 30
    assert body["suitability_mode"] == "general"
    assert "id" in body


async def test_create_specialized_room(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /rooms with suitability_mode=specialized returns 201 with the correct mode.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room2.com", role="admin")
    await login_as("admin@room2.com", "testpassword123")
    response = await client.post(
        "/api/rooms",
        json={"name": "Lab 1", "short_name": "L1", "suitability_mode": "specialized"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["suitability_mode"] == "specialized"
    assert body["capacity"] is None


async def test_create_room_duplicate_name(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """POST /rooms with a duplicate name or short_name returns 409 Conflict.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room3.com", role="admin")
    await login_as("admin@room3.com", "testpassword123")
    await client.post("/api/rooms", json={"name": "Dup Room", "short_name": "DR"})
    response = await client.post("/api/rooms", json={"name": "Dup Room", "short_name": "DR2"})
    assert response.status_code == 409


async def test_list_rooms(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """GET /rooms returns all rooms without nested suitability or availability data.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room4.com", role="admin")
    await login_as("admin@room4.com", "testpassword123")
    await client.post("/api/rooms", json={"name": "Alpha Room", "short_name": "AR"})
    await client.post("/api/rooms", json={"name": "Beta Room", "short_name": "BR"})
    response = await client.get("/api/rooms")
    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 2
    names = [r["name"] for r in body]
    assert "Alpha Room" in names
    assert "Beta Room" in names
    for item in body:
        assert "suitability_subjects" not in item
        assert "availability" not in item


async def test_get_room_detail(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """GET /rooms/{id} returns room detail with suitability_subjects and availability.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room5.com", role="admin")
    await login_as("admin@room5.com", "testpassword123")

    # Create the room
    room_resp = await client.post("/api/rooms", json={"name": "Detail Room", "short_name": "DT"})
    room_id = room_resp.json()["id"]

    # Create a subject and assign as suitability
    subj_resp = await client.post("/api/subjects", json={"name": "Physics", "short_name": "PHY"})
    subject_id = subj_resp.json()["id"]
    await client.put(f"/api/rooms/{room_id}/suitability", json={"subject_ids": [subject_id]})

    # Create a week scheme + time block for availability
    ws_resp = await client.post("/api/week-schemes", json={"name": "Detail Week Scheme"})
    ws_id = ws_resp.json()["id"]
    tb_resp = await client.post(
        f"/api/week-schemes/{ws_id}/time-blocks",
        json={"day_of_week": 0, "position": 1, "start_time": "08:00:00", "end_time": "08:45:00"},
    )
    tb_id = tb_resp.json()["id"]
    await client.put(f"/api/rooms/{room_id}/availability", json={"time_block_ids": [tb_id]})

    response = await client.get(f"/api/rooms/{room_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == room_id
    assert body["name"] == "Detail Room"
    assert "suitability_subjects" in body
    assert len(body["suitability_subjects"]) == 1
    assert body["suitability_subjects"][0]["name"] == "Physics"
    assert "availability" in body
    assert len(body["availability"]) == 1
    assert body["availability"][0]["time_block_id"] == tb_id
    assert body["availability"][0]["day_of_week"] == 0
    assert body["availability"][0]["position"] == 1


async def test_update_room(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PATCH /rooms/{id} updates only the supplied fields and returns 200.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room6.com", role="admin")
    await login_as("admin@room6.com", "testpassword123")
    room_resp = await client.post(
        "/api/rooms", json={"name": "Old Room Name", "short_name": "ORN", "capacity": 20}
    )
    room_id = room_resp.json()["id"]
    response = await client.patch(
        f"/api/rooms/{room_id}", json={"name": "New Room Name", "capacity": 25}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "New Room Name"
    assert body["short_name"] == "ORN"
    assert body["capacity"] == 25


async def test_delete_room(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """DELETE /rooms/{id} removes the room; subsequent GET returns 404.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room7.com", role="admin")
    await login_as("admin@room7.com", "testpassword123")
    room_resp = await client.post(
        "/api/rooms", json={"name": "To Delete Room", "short_name": "TDR"}
    )
    room_id = room_resp.json()["id"]
    delete_resp = await client.delete(f"/api/rooms/{room_id}")
    assert delete_resp.status_code == 204
    get_resp = await client.get(f"/api/rooms/{room_id}")
    assert get_resp.status_code == 404


async def test_replace_suitability(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PUT /rooms/{id}/suitability replaces the suitability list and returns the detail.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room8.com", role="admin")
    await login_as("admin@room8.com", "testpassword123")

    room_resp = await client.post("/api/rooms", json={"name": "Suit Room", "short_name": "SR"})
    room_id = room_resp.json()["id"]

    # Create two subjects
    math_resp = await client.post(
        "/api/subjects", json={"name": "Mathematics", "short_name": "MAT"}
    )
    chem_resp = await client.post("/api/subjects", json={"name": "Chemistry", "short_name": "CHE"})
    math_id = math_resp.json()["id"]
    chem_id = chem_resp.json()["id"]

    # Set initial suitability to math only
    first_put = await client.put(
        f"/api/rooms/{room_id}/suitability", json={"subject_ids": [math_id]}
    )
    assert first_put.status_code == 200
    first_body = first_put.json()
    assert len(first_body["suitability_subjects"]) == 1
    assert first_body["suitability_subjects"][0]["name"] == "Mathematics"

    # Replace with chemistry only — math should be gone
    second_put = await client.put(
        f"/api/rooms/{room_id}/suitability", json={"subject_ids": [chem_id]}
    )
    assert second_put.status_code == 200
    second_body = second_put.json()
    assert len(second_body["suitability_subjects"]) == 1
    assert second_body["suitability_subjects"][0]["name"] == "Chemistry"

    # Confirm via GET
    detail = await client.get(f"/api/rooms/{room_id}")
    assert len(detail.json()["suitability_subjects"]) == 1
    assert detail.json()["suitability_subjects"][0]["id"] == chem_id


async def test_replace_room_availability(
    client: AsyncClient,
    create_test_user: CreateUserFn,
    login_as: LoginFn,
) -> None:
    """PUT /rooms/{id}/availability replaces the availability list and returns the detail.

    Creates a week scheme with two time blocks via the API, then verifies that
    the room's availability is replaced correctly.

    Args:
        client: The async test HTTP client.
        create_test_user: Factory fixture for inserting a User into the DB.
        login_as: Factory fixture for authenticating via /auth/login.
    """
    await create_test_user(email="admin@room9.com", role="admin")
    await login_as("admin@room9.com", "testpassword123")

    room_resp = await client.post("/api/rooms", json={"name": "Avail Room", "short_name": "AVR"})
    room_id = room_resp.json()["id"]

    # Create week scheme and two time blocks
    ws_resp = await client.post("/api/week-schemes", json={"name": "Avail Test Scheme"})
    ws_id = ws_resp.json()["id"]
    tb1_resp = await client.post(
        f"/api/week-schemes/{ws_id}/time-blocks",
        json={"day_of_week": 1, "position": 1, "start_time": "08:00:00", "end_time": "08:45:00"},
    )
    tb2_resp = await client.post(
        f"/api/week-schemes/{ws_id}/time-blocks",
        json={"day_of_week": 1, "position": 2, "start_time": "09:00:00", "end_time": "09:45:00"},
    )
    tb1_id = tb1_resp.json()["id"]
    tb2_id = tb2_resp.json()["id"]

    # Set availability to both time blocks
    first_put = await client.put(
        f"/api/rooms/{room_id}/availability", json={"time_block_ids": [tb1_id, tb2_id]}
    )
    assert first_put.status_code == 200
    first_body = first_put.json()
    assert len(first_body["availability"]) == 2

    # Replace with only the second time block
    second_put = await client.put(
        f"/api/rooms/{room_id}/availability", json={"time_block_ids": [tb2_id]}
    )
    assert second_put.status_code == 200
    second_body = second_put.json()
    assert len(second_body["availability"]) == 1
    assert second_body["availability"][0]["time_block_id"] == tb2_id

    # Confirm via GET
    detail = await client.get(f"/api/rooms/{room_id}")
    avail = detail.json()["availability"]
    assert len(avail) == 1
    assert avail[0]["time_block_id"] == tb2_id
    assert avail[0]["day_of_week"] == 1
    assert avail[0]["position"] == 2


async def test_room_requires_admin(client: AsyncClient) -> None:
    """GET /rooms without authentication returns 401 Unauthorized.

    Args:
        client: The async test HTTP client (no session cookie set).
    """
    response = await client.get("/api/rooms")
    assert response.status_code == 401
