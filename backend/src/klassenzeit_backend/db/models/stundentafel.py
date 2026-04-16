"""Stundentafel (curriculum template) ORM models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Stundentafel(Base):
    """A reusable curriculum template (e.g. 'Gymnasium Klasse 5 Latein')."""

    __tablename__ = "stundentafeln"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(String(100), unique=True)
    grade_level: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StundentafelEntry(Base):
    """One subject-hours pair within a Stundentafel."""

    __tablename__ = "stundentafel_entries"
    __table_args__ = (UniqueConstraint("stundentafel_id", "subject_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    stundentafel_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stundentafeln.id"), index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subjects.id"))
    hours_per_week: Mapped[int] = mapped_column(SmallInteger)
    preferred_block_size: Mapped[int] = mapped_column(SmallInteger, server_default="1")
