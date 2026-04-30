"""LessonSchoolClass association model: many-to-many between Lesson and SchoolClass."""

import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class LessonSchoolClass(Base):
    """A row in the `lesson_school_classes` join table.

    Tracks which `SchoolClass` rows a given `Lesson` serves. A lesson with
    a single membership is the prototype's original 1:1 shape; a lesson
    with multiple memberships is a cross-class lesson (e.g. a parallel
    Religionsmodell trio sharing one `lesson_group_id`).
    """

    __tablename__ = "lesson_school_classes"

    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True
    )
    school_class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id", ondelete="CASCADE"), primary_key=True
    )
