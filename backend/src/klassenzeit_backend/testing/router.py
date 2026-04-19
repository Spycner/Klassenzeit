"""Test-only HTTP endpoints.

These endpoints exist to let Playwright (or other black-box test drivers)
control backend state without going through the real API. The module must
only be mounted when ``settings.env == "test"``. See
``klassenzeit_backend.testing.mount``.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.base import Base
from klassenzeit_backend.db.session import get_session

testing_router = APIRouter(prefix="/__test__", tags=["testing"])

# Tables that must survive a reset. ``alembic_version`` is managed outside
# SQLAlchemy metadata; ``users`` and ``sessions`` stay so the Playwright
# storageState cookie remains valid between tests.
PRESERVED_TABLES: frozenset[str] = frozenset({"users", "sessions", "alembic_version"})


@testing_router.get("/health")
async def testing_health() -> dict[str, str]:
    """Trivial readiness probe used by the Playwright webServer."""
    return {"status": "ok"}


@testing_router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def testing_reset(session: Annotated[AsyncSession, Depends(get_session)]) -> Response:
    """Truncate all entity tables, preserving users and sessions.

    Returns 204 with no body.
    """
    tables = [t for t in Base.metadata.sorted_tables if t.name not in PRESERVED_TABLES]
    if tables:
        names = ", ".join(f'"{t.name}"' for t in tables)
        await session.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
