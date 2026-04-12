"""Pydantic schemas for subject routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class SubjectCreate(BaseModel):
    """Request body for creating a subject."""

    name: str
    short_name: str


class SubjectUpdate(BaseModel):
    """Request body for patching a subject."""

    name: str | None = None
    short_name: str | None = None


class SubjectResponse(BaseModel):
    """Response body for a subject."""

    id: uuid.UUID
    name: str
    short_name: str
    created_at: datetime
    updated_at: datetime
