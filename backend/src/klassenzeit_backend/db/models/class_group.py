"""ClassGroup ORM model (schema only — no routes)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class ClassGroup(Base):
    """A sub-group or cross-class group. Schema-only — no routes yet."""

    __tablename__ = "class_groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    school_class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("school_classes.id"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    group_type: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
