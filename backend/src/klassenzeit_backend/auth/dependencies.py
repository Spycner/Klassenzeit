"""FastAPI auth dependencies.

``get_current_user`` reads the ``kz_session`` cookie, looks up the
session in the DB, loads the user, and returns it. Raises 401 if
anything is missing or invalid.

``require_admin`` wraps ``get_current_user`` and checks role.
"""

import uuid
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.sessions import lookup_session
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_session)],
    kz_session: Annotated[str | None, Cookie()] = None,
) -> User:
    """Return the authenticated user or raise 401."""
    if kz_session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        session_id = uuid.UUID(kz_session)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED) from None

    session = await lookup_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    return user


async def require_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Return the authenticated admin user or raise 403."""
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return user
