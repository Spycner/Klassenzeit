"""Lesson ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Lesson(Base):
    """A concrete lesson assignment: class + subject + teacher + hours."""

    __tablename__ = "lessons"
    __table_args__ = (UniqueConstraint("school_class_id", "subject_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    school_class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("school_classes.id"), index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subjects.id"))
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("teachers.id"), nullable=True)
    hours_per_week: Mapped[int] = mapped_column(SmallInteger)
    preferred_block_size: Mapped[int] = mapped_column(SmallInteger, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
