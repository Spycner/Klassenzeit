"""Admin user management routes."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import require_admin
from klassenzeit_backend.auth.passwords import (
    PasswordValidationError,
    hash_password,
    validate_password,
)
from klassenzeit_backend.auth.sessions import delete_user_sessions
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session

if TYPE_CHECKING:
    from klassenzeit_backend.core.settings import Settings

router = APIRouter(prefix="/auth/admin", tags=["auth-admin"])


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "user"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: str


class UserListItem(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    last_login_at: datetime | None


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: CreateUserRequest,
    request: Request,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> UserResponse:
    settings: Settings = request.app.state.settings
    email = body.email.lower()

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    try:
        validate_password(body.password, min_length=settings.password_min_length)
    except PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()

    return UserResponse(id=user.id, email=user.email, role=user.role)


@router.get("/users")
async def admin_list_users(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
    active: bool | None = None,
) -> list[UserListItem]:
    stmt = select(User)
    if active is not None:
        stmt = stmt.where(User.is_active == active)
    result = await db.execute(stmt.order_by(User.created_at))
    return [
        UserListItem(
            id=u.id,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            last_login_at=u.last_login_at,
        )
        for u in result.scalars()
    ]


async def _get_target_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return user


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def admin_reset_password(
    user_id: uuid.UUID,
    body: ResetPasswordRequest,
    request: Request,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    settings: Settings = request.app.state.settings
    try:
        validate_password(body.new_password, min_length=settings.password_min_length)
    except PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    user = await _get_target_user(db, user_id)
    user.password_hash = hash_password(body.new_password)
    user.force_password_change = True
    await delete_user_sessions(db, user.id)
    await db.commit()


@router.post("/users/{user_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def admin_deactivate_user(
    user_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await _get_target_user(db, user_id)
    user.is_active = False
    await delete_user_sessions(db, user.id)
    await db.commit()


@router.post("/users/{user_id}/activate", status_code=status.HTTP_204_NO_CONTENT)
async def admin_activate_user(
    user_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await _get_target_user(db, user_id)
    user.is_active = True
    await db.commit()
