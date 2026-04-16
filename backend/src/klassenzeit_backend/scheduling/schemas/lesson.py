"""Pydantic schemas for lesson routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LessonCreate(BaseModel):
    """Request body for creating a lesson."""

    school_class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None = None
    hours_per_week: int = Field(ge=1)
    preferred_block_size: int = Field(default=1, ge=1, le=2)


class LessonUpdate(BaseModel):
    """Request body for patching a lesson."""

    teacher_id: uuid.UUID | None = None
    hours_per_week: int | None = Field(default=None, ge=1)
    preferred_block_size: int | None = Field(default=None, ge=1, le=2)


class LessonClassResponse(BaseModel):
    """Embedded school class in a lesson response."""

    id: uuid.UUID
    name: str


class LessonSubjectResponse(BaseModel):
    """Embedded subject in a lesson response."""

    id: uuid.UUID
    name: str
    short_name: str


class LessonTeacherResponse(BaseModel):
    """Embedded teacher in a lesson response."""

    id: uuid.UUID
    first_name: str
    last_name: str
    short_code: str


class LessonResponse(BaseModel):
    """Response body for a lesson."""

    id: uuid.UUID
    school_class: LessonClassResponse
    subject: LessonSubjectResponse
    teacher: LessonTeacherResponse | None
    hours_per_week: int
    preferred_block_size: int
    created_at: datetime
    updated_at: datetime
