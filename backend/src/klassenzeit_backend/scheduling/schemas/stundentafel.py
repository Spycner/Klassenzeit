"""Pydantic schemas for Stundentafel routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class StundentafelCreate(BaseModel):
    """Request body for creating a Stundentafel."""

    name: str
    grade_level: int


class StundentafelUpdate(BaseModel):
    """Request body for patching a Stundentafel."""

    name: str | None = None
    grade_level: int | None = None


class EntrySubjectResponse(BaseModel):
    """Embedded subject in a Stundentafel entry."""

    id: uuid.UUID
    name: str
    short_name: str


class StundentafelEntryResponse(BaseModel):
    """Response body for a Stundentafel entry."""

    id: uuid.UUID
    subject: EntrySubjectResponse
    hours_per_week: int
    preferred_block_size: int


class StundentafelListResponse(BaseModel):
    """Response body for a Stundentafel in list view."""

    id: uuid.UUID
    name: str
    grade_level: int
    created_at: datetime
    updated_at: datetime


class StundentafelDetailResponse(BaseModel):
    """Response body for a Stundentafel detail view."""

    id: uuid.UUID
    name: str
    grade_level: int
    entries: list[StundentafelEntryResponse]
    created_at: datetime
    updated_at: datetime


class EntryCreate(BaseModel):
    """Request body for adding an entry to a Stundentafel."""

    subject_id: uuid.UUID
    hours_per_week: int
    preferred_block_size: int = 1


class EntryUpdate(BaseModel):
    """Request body for patching a Stundentafel entry."""

    hours_per_week: int | None = None
    preferred_block_size: int | None = None
