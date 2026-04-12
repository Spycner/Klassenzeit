"""Current-user routes: /auth/me and /auth/change-password."""

import uuid
from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import get_current_user
from klassenzeit_backend.auth.passwords import (
    PasswordValidationError,
    hash_password,
    validate_password,
    verify_password,
)
from klassenzeit_backend.auth.sessions import delete_user_sessions
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session

if TYPE_CHECKING:
    from klassenzeit_backend.core.settings import Settings

router = APIRouter(prefix="/auth", tags=["auth"])


class MeResponse(BaseModel):
    """Response body for the current user profile."""

    id: uuid.UUID
    email: str
    role: str
    force_password_change: bool


class ChangePasswordRequest(BaseModel):
    """Request body for changing the current user's password."""

    current_password: str
    new_password: str


@router.get("/me")
async def auth_me(
    user: Annotated[User, Depends(get_current_user)],
) -> MeResponse:
    """Return the current authenticated user's profile."""
    return MeResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        force_password_change=user.force_password_change,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
    kz_session: Annotated[str | None, Cookie()] = None,
) -> None:
    """Change the current user's password and invalidate other sessions."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    settings: Settings = request.app.state.settings
    try:
        validate_password(body.new_password, min_length=settings.password_min_length)
    except PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    user.password_hash = hash_password(body.new_password)
    user.force_password_change = False

    # Invalidate all other sessions
    current_session_id = uuid.UUID(kz_session) if kz_session else None
    await delete_user_sessions(db, user.id, exclude_session_id=current_session_id)
    await db.commit()
