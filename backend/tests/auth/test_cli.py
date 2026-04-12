"""Tests for the create-admin CLI command.

The core DB function (``create_admin_in_db``) is tested via the ``db_session``
fixture — full integration, rollback-isolated. CLI validation is tested
separately.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.cli import create_admin_in_db
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
    with pytest.raises(ValueError, match="already exists"):
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
