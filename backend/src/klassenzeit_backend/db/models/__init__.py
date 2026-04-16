"""Model re-export surface.

Every new model file must be re-exported here. Alembic's ``env.py``
imports this package so ``Base.metadata`` is populated before
``target_metadata`` is read; models not re-exported are invisible to
autogenerate.
"""

from klassenzeit_backend.db.models.class_group import ClassGroup
from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.room import Room, RoomAvailability, RoomSubjectSuitability
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.session import UserSession
from klassenzeit_backend.db.models.stundentafel import Stundentafel, StundentafelEntry
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher, TeacherAvailability, TeacherQualification
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.models.week_scheme import TimeBlock, WeekScheme

__all__ = [
    "ClassGroup",
    "Lesson",
    "Room",
    "RoomAvailability",
    "RoomSubjectSuitability",
    "SchoolClass",
    "Stundentafel",
    "StundentafelEntry",
    "Subject",
    "Teacher",
    "TeacherAvailability",
    "TeacherQualification",
    "TimeBlock",
    "User",
    "UserSession",
    "WeekScheme",
]
