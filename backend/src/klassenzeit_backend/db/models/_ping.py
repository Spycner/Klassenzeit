"""Probe model used to prove the DB plumbing works.

The underscore prefix signals "throwaway — delete when a real model
lands." The first feature spec that adds a domain entity is expected
to delete this file, remove the re-export from ``__init__.py``, and
write a corrective migration that drops the ``ping`` table.
"""

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Ping(Base):
    __tablename__ = "ping"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
