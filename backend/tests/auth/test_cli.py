"""Tests for the create-admin CLI command.

The core DB function (``create_admin_in_db``) is tested via the ``db_session``
fixture — full integration, rollback-isolated. CLI validation is tested
separately.
"""

import asyncio
from collections.abc import Generator

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from typer.testing import CliRunner

from klassenzeit_backend.cli import E2E_ADMIN_EMAIL, DuplicateEmailError, cli, create_admin_in_db
from klassenzeit_backend.core.settings import Settings, get_settings
from klassenzeit_backend.db.models.user import User


async def test_create_admin_in_db_happy_path(db_session: AsyncSession) -> None:
    user = await create_admin_in_db(
        db_session,
        email="cliadmin@test.com",
        password="a-secure-passphrase",  # noqa: S106
    )
    assert user.email == "cliadmin@test.com"
    assert user.role == "admin"

    result = await db_session.execute(select(User).where(User.email == "cliadmin@test.com"))
    assert result.scalar_one_or_none() is not None


async def test_create_admin_in_db_duplicate_email(db_session: AsyncSession) -> None:
    await create_admin_in_db(
        db_session,
        email="dupecli@test.com",
        password="a-secure-passphrase",  # noqa: S106
    )
    with pytest.raises(DuplicateEmailError):
        await create_admin_in_db(
            db_session,
            email="dupecli@test.com",
            password="another-passphrase!",  # noqa: S106
        )


async def test_create_admin_in_db_validates_password(db_session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="at least"):
        await create_admin_in_db(
            db_session,
            email="shortpw@test.com",
            password="short",  # noqa: S106
        )


# ─── seed-e2e-admin CLI tests ────────────────────────────────────────────────
# These tests invoke the real CLI runner which commits to the test DB.
# A teardown fixture removes the fixed e2e admin user after the test so rows
# don't leak between test runs.


@pytest.fixture
def cleanup_e2e_admin(settings: Settings) -> Generator:
    """Delete the fixed e2e admin user from the DB after each CLI test."""
    yield  # test runs here

    async def _delete() -> None:
        engine = create_async_engine(str(settings.database_url))
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as session:
                await session.execute(delete(User).where(User.email == E2E_ADMIN_EMAIL))
                await session.commit()
        finally:
            await engine.dispose()

    asyncio.run(_delete())


def test_seed_e2e_admin_refuses_non_test_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """seed-e2e-admin exits 1 when KZ_ENV is not 'test'."""
    monkeypatch.setenv("KZ_ENV", "dev")
    get_settings.cache_clear()
    try:
        runner = CliRunner()
        result = runner.invoke(cli, ["seed-e2e-admin"])
        assert result.exit_code == 1
        assert "KZ_ENV=test" in result.stderr
    finally:
        get_settings.cache_clear()


def test_seed_e2e_admin_creates_admin(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    cleanup_e2e_admin: None,
) -> None:
    """seed-e2e-admin creates the fixed e2e admin user with role 'admin'."""
    monkeypatch.setenv("KZ_DATABASE_URL", str(settings.database_url))
    runner = CliRunner()
    result = runner.invoke(cli, ["seed-e2e-admin"])
    assert result.exit_code == 0, result.stdout

    async def _fetch_role() -> str | None:
        engine = create_async_engine(str(settings.database_url))
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as session:
                row = await session.execute(select(User).where(User.email == E2E_ADMIN_EMAIL))
                user = row.scalar_one_or_none()
                return user.role if user is not None else None
        finally:
            await engine.dispose()

    role = asyncio.run(_fetch_role())
    assert role == "admin"


def test_seed_e2e_admin_is_idempotent(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    cleanup_e2e_admin: None,
) -> None:
    """Running seed-e2e-admin twice does not fail."""
    monkeypatch.setenv("KZ_DATABASE_URL", str(settings.database_url))
    runner = CliRunner()
    first = runner.invoke(cli, ["seed-e2e-admin"])
    assert first.exit_code == 0, first.stdout
    second = runner.invoke(cli, ["seed-e2e-admin"])
    assert second.exit_code == 0, second.stdout
