"""Schemas for login/logout routes."""

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Request body for email/password login."""

    email: EmailStr
    password: str
