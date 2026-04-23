"""Pydantic response schemas for the schedule endpoint.

Mirrors the `solver_core::Solution` wire format, filtered to a single school
class's lessons by the route handler.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class PlacementResponse(BaseModel):
    """One placed lesson-hour: which lesson, in which time block, in which room."""

    lesson_id: UUID
    time_block_id: UUID
    room_id: UUID


class ViolationResponse(BaseModel):
    """One hard-constraint violation emitted by the solver."""

    kind: Literal["no_qualified_teacher", "unplaced_lesson"]
    lesson_id: UUID
    hour_index: int = Field(ge=0)
    message: str


class ScheduleResponse(BaseModel):
    """Per-class filtered solver output for `POST /api/classes/{id}/schedule`."""

    placements: list[PlacementResponse]
    violations: list[ViolationResponse]
