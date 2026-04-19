"""Test-only HTTP endpoints.

These endpoints exist to let Playwright (or other black-box test drivers)
control backend state without going through the real API. The module must
only be mounted when ``settings.env == "test"``. See
``klassenzeit_backend.testing.mount``.
"""

from fastapi import APIRouter

testing_router = APIRouter(prefix="/__test__", tags=["testing"])


@testing_router.get("/health")
async def testing_health() -> dict[str, str]:
    """Trivial readiness probe used by the Playwright webServer."""
    return {"status": "ok"}
