"""Pydantic schemas for subject routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

COLOR_PATTERN = r"^(chart-(1[0-2]|[1-9])|#[0-9a-fA-F]{6})$"


class SubjectCreate(BaseModel):
    """Request body for creating a subject."""

    name: str
    short_name: str
    color: str = Field(pattern=COLOR_PATTERN)


class SubjectUpdate(BaseModel):
    """Request body for patching a subject."""

    name: str | None = None
    short_name: str | None = None
    color: str | None = Field(default=None, pattern=COLOR_PATTERN)


class SubjectResponse(BaseModel):
    """Response body for a subject."""

    id: uuid.UUID
    name: str
    short_name: str
    color: str
    created_at: datetime
    updated_at: datetime
