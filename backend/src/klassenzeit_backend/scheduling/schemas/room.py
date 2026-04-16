"""Pydantic schemas for room routes."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class RoomCreate(BaseModel):
    """Request body for creating a room."""

    name: str
    short_name: str
    capacity: int | None = Field(default=None, ge=1)
    suitability_mode: Literal["general", "specialized"] = "general"


class RoomUpdate(BaseModel):
    """Request body for patching a room."""

    name: str | None = None
    short_name: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    suitability_mode: Literal["general", "specialized"] | None = None


class SuitabilitySubjectResponse(BaseModel):
    """Subject in a room's suitability list."""

    id: uuid.UUID
    name: str
    short_name: str


class AvailabilityResponse(BaseModel):
    """Time block in a room's availability list."""

    time_block_id: uuid.UUID
    day_of_week: int
    position: int


class RoomListResponse(BaseModel):
    """Response body for a room in list view."""

    id: uuid.UUID
    name: str
    short_name: str
    capacity: int | None
    suitability_mode: str
    created_at: datetime
    updated_at: datetime


class RoomDetailResponse(BaseModel):
    """Response body for a room detail view."""

    id: uuid.UUID
    name: str
    short_name: str
    capacity: int | None
    suitability_mode: str
    suitability_subjects: list[SuitabilitySubjectResponse]
    availability: list[AvailabilityResponse]
    created_at: datetime
    updated_at: datetime


class SuitabilityReplaceRequest(BaseModel):
    """Request body for replacing a room's suitability list."""

    subject_ids: list[uuid.UUID]


class AvailabilityReplaceRequest(BaseModel):
    """Request body for replacing a room's availability list."""

    time_block_ids: list[uuid.UUID]
