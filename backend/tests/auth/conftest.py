"""Shared fixtures for auth tests.

Uses the factory-fixture pattern so tests declare ``create_test_user``
and ``login_as`` as fixture parameters — no cross-module imports needed.
"""

from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.passwords import hash_password
from klassenzeit_backend.db.models.user import User

# Type aliases for the factory callables
type CreateUserFn = Callable[..., Awaitable[tuple[User, str]]]
type LoginFn = Callable[[str, str], Awaitable[None]]


@pytest.fixture
def create_test_user(db_session: AsyncSession) -> CreateUserFn:
    """Factory fixture: ``await create_test_user(email=..., password=...)``."""

    async def _create(
        *,
        email: str = "user@test.com",
        password: str = "testpassword123",  # noqa: S107
        role: str = "user",
        is_active: bool = True,
        force_password_change: bool = False,
    ) -> tuple[User, str]:
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            role=role,
            is_active=is_active,
            force_password_change=force_password_change,
        )
        db_session.add(user)
        await db_session.flush()
        return user, password

    return _create


@pytest.fixture
def login_as(client: AsyncClient) -> LoginFn:
    """Factory fixture: ``await login_as(email, password)``."""

    async def _login(email: str, password: str) -> None:
        response = await client.post(
            "/auth/login",
            json={"email": email, "password": password},
        )
        assert response.status_code == 204, response.text

    return _login
