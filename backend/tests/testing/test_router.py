"""Integration tests for the test-only router."""

from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
    """GET /__test__/health returns 200 with a simple body."""
    response = await client.get("/__test__/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
