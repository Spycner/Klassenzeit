"""Tests for the /health endpoint.

Verifies the full stack: FastAPI routing + async client + real call into
the klassenzeit_solver PyO3 binding. The solver is not mocked.
"""

from httpx import ASGITransport, AsyncClient

from klassenzeit_backend.main import app


async def test_health_returns_ok_and_exercises_solver() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "ok", "solver_check": "ko"}
