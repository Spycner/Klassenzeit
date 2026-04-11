"""Shared pytest fixtures for the backend test suite.

Layered fixture design:

1. ``settings`` / ``engine``          — session-scoped, bound to the test DB.
2. ``apply_migrations``               — session-scoped, autouse; resets schema once.
3. ``db_session``                     — per-test, transaction-rollback isolated.
4. ``client``                         — per-test; reuses ``db_session`` via dependency override.

Pytest is invoked from the repo root (see ``[tool.pytest.ini_options]
testpaths`` in the root ``pyproject.toml``), so every file path is
resolved relative to ``__file__``, not cwd.
"""

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from klassenzeit_backend.core.settings import Settings
from klassenzeit_backend.db.session import get_session
from klassenzeit_backend.main import app

BACKEND_ROOT = Path(__file__).resolve().parent.parent  # repo/backend
ENV_TEST = BACKEND_ROOT / ".env.test"
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"
ALEMBIC_DIR = BACKEND_ROOT / "alembic"


# ─── Layer 1: engine ────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(_env_file=str(ENV_TEST))  # ty: ignore[missing-argument, unknown-argument]


@pytest.fixture(scope="session")
async def engine(settings: Settings) -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(str(settings.database_url), pool_pre_ping=True)
    try:
        yield eng
    finally:
        await eng.dispose()


# ─── Layer 2: migrations ────────────────────────────────────────────────────


@pytest.fixture(scope="session", autouse=True)
async def apply_migrations(engine: AsyncEngine) -> None:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(ALEMBIC_DIR))
    cfg.set_main_option("sqlalchemy.url", str(engine.url))
    command.downgrade(cfg, "base")  # clean slate each session
    command.upgrade(cfg, "head")


# ─── Layer 3: per-test session with savepoint restart ──────────────────────


@pytest.fixture
async def db_session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with engine.connect() as connection:
        trans = await connection.begin()
        factory = async_sessionmaker(bind=connection, expire_on_commit=False)
        try:
            async with factory() as session:
                await session.begin_nested()

                @event.listens_for(session.sync_session, "after_transaction_end")
                def restart_savepoint(sess, transaction):
                    if transaction.nested and not transaction._parent.nested:
                        sess.begin_nested()

                yield session
        finally:
            await trans.rollback()


# ─── Layer 4: FastAPI ASGI client sharing the per-test session ─────────────


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as c:
            yield c
    finally:
        app.dependency_overrides.clear()
