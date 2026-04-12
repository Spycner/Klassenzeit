# API Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CRUD API routes and database models for the core scheduling domain — week schemes, subjects, rooms, teachers, Stundentafeln, school classes, and lessons.

**Architecture:** Twelve new DB tables in a single Alembic migration. Seven route modules under `scheduling/routes/`, each with an `APIRouter` included from `main.py`. Pydantic schemas live in `scheduling/schemas/`. All routes are admin-only via the existing `require_admin` dependency. As a prerequisite, existing auth schemas are extracted from inline route definitions into `auth/schemas/` to establish the pattern project-wide.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Alembic, Postgres 17, pytest + httpx

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `backend/src/klassenzeit_backend/auth/schemas/__init__.py` | Package marker |
| `backend/src/klassenzeit_backend/auth/schemas/login.py` | `LoginRequest` (extracted from routes/login.py) |
| `backend/src/klassenzeit_backend/auth/schemas/me.py` | `MeResponse`, `ChangePasswordRequest` (extracted from routes/me.py) |
| `backend/src/klassenzeit_backend/auth/schemas/admin.py` | `CreateUserRequest`, `UserResponse`, `UserListItem`, `ResetPasswordRequest` (extracted from routes/admin.py) |
| `backend/src/klassenzeit_backend/db/models/week_scheme.py` | `WeekScheme`, `TimeBlock` ORM models |
| `backend/src/klassenzeit_backend/db/models/subject.py` | `Subject` ORM model |
| `backend/src/klassenzeit_backend/db/models/room.py` | `Room`, `RoomSubjectSuitability`, `RoomAvailability` ORM models |
| `backend/src/klassenzeit_backend/db/models/teacher.py` | `Teacher`, `TeacherQualification`, `TeacherAvailability` ORM models |
| `backend/src/klassenzeit_backend/db/models/stundentafel.py` | `Stundentafel`, `StundentafelEntry` ORM models |
| `backend/src/klassenzeit_backend/db/models/school_class.py` | `SchoolClass` ORM model |
| `backend/src/klassenzeit_backend/db/models/lesson.py` | `Lesson` ORM model |
| `backend/src/klassenzeit_backend/db/models/class_group.py` | `ClassGroup` ORM model (schema only, no routes) |
| `backend/src/klassenzeit_backend/scheduling/__init__.py` | Package marker |
| `backend/src/klassenzeit_backend/scheduling/schemas/__init__.py` | Package marker |
| `backend/src/klassenzeit_backend/scheduling/schemas/week_scheme.py` | WeekScheme + TimeBlock Pydantic schemas |
| `backend/src/klassenzeit_backend/scheduling/schemas/subject.py` | Subject Pydantic schemas |
| `backend/src/klassenzeit_backend/scheduling/schemas/room.py` | Room Pydantic schemas |
| `backend/src/klassenzeit_backend/scheduling/schemas/teacher.py` | Teacher Pydantic schemas |
| `backend/src/klassenzeit_backend/scheduling/schemas/stundentafel.py` | Stundentafel Pydantic schemas |
| `backend/src/klassenzeit_backend/scheduling/schemas/school_class.py` | SchoolClass Pydantic schemas |
| `backend/src/klassenzeit_backend/scheduling/schemas/lesson.py` | Lesson Pydantic schemas |
| `backend/src/klassenzeit_backend/scheduling/routes/__init__.py` | `scheduling_router` collecting sub-routers |
| `backend/src/klassenzeit_backend/scheduling/routes/week_schemes.py` | WeekScheme + TimeBlock CRUD routes |
| `backend/src/klassenzeit_backend/scheduling/routes/subjects.py` | Subject CRUD routes |
| `backend/src/klassenzeit_backend/scheduling/routes/rooms.py` | Room CRUD + suitability + availability routes |
| `backend/src/klassenzeit_backend/scheduling/routes/teachers.py` | Teacher CRUD + qualifications + availability routes |
| `backend/src/klassenzeit_backend/scheduling/routes/stundentafeln.py` | Stundentafel + entry CRUD routes |
| `backend/src/klassenzeit_backend/scheduling/routes/school_classes.py` | SchoolClass CRUD routes |
| `backend/src/klassenzeit_backend/scheduling/routes/lessons.py` | Lesson CRUD + generate-lessons routes |
| `backend/tests/scheduling/__init__.py` | Package marker |
| `backend/tests/scheduling/conftest.py` | Shared factory fixtures |
| `backend/tests/scheduling/test_week_schemes.py` | WeekScheme + TimeBlock tests |
| `backend/tests/scheduling/test_subjects.py` | Subject tests |
| `backend/tests/scheduling/test_rooms.py` | Room tests |
| `backend/tests/scheduling/test_teachers.py` | Teacher tests |
| `backend/tests/scheduling/test_stundentafeln.py` | Stundentafel tests |
| `backend/tests/scheduling/test_school_classes.py` | SchoolClass tests |
| `backend/tests/scheduling/test_lessons.py` | Lesson tests |

### Modified files

| File | Change |
|---|---|
| `backend/src/klassenzeit_backend/auth/routes/login.py` | Remove inline `LoginRequest`, import from `auth/schemas/login.py` |
| `backend/src/klassenzeit_backend/auth/routes/me.py` | Remove inline schemas, import from `auth/schemas/me.py` |
| `backend/src/klassenzeit_backend/auth/routes/admin.py` | Remove inline schemas, import from `auth/schemas/admin.py` |
| `backend/src/klassenzeit_backend/db/models/__init__.py` | Add re-exports for all new models |
| `backend/src/klassenzeit_backend/main.py` | Include `scheduling_router` |

---

## Task 1: Extract auth schemas into `auth/schemas/`

Refactor existing inline Pydantic models out of auth route files into a dedicated schemas subdirectory. Pure move — no behaviour change. All existing tests must still pass.

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/schemas/__init__.py`
- Create: `backend/src/klassenzeit_backend/auth/schemas/login.py`
- Create: `backend/src/klassenzeit_backend/auth/schemas/me.py`
- Create: `backend/src/klassenzeit_backend/auth/schemas/admin.py`
- Modify: `backend/src/klassenzeit_backend/auth/routes/login.py`
- Modify: `backend/src/klassenzeit_backend/auth/routes/me.py`
- Modify: `backend/src/klassenzeit_backend/auth/routes/admin.py`

- [ ] **Step 1: Create `auth/schemas/login.py`**

```python
"""Pydantic schemas for login routes."""

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Credentials for login."""

    email: EmailStr
    password: str
```

- [ ] **Step 2: Create `auth/schemas/me.py`**

```python
"""Pydantic schemas for current-user routes."""

import uuid

from pydantic import BaseModel


class MeResponse(BaseModel):
    """Current user profile."""

    id: uuid.UUID
    email: str
    role: str
    force_password_change: bool


class ChangePasswordRequest(BaseModel):
    """Password change payload."""

    current_password: str
    new_password: str
```

- [ ] **Step 3: Create `auth/schemas/admin.py`**

```python
"""Pydantic schemas for admin user-management routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class CreateUserRequest(BaseModel):
    """Admin request to create a new user."""

    email: EmailStr
    password: str
    role: str = "user"


class UserResponse(BaseModel):
    """Returned after creating a user."""

    id: uuid.UUID
    email: str
    role: str


class UserListItem(BaseModel):
    """Single item in the user list."""

    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    last_login_at: datetime | None


class ResetPasswordRequest(BaseModel):
    """Admin request to reset a user's password."""

    new_password: str
```

- [ ] **Step 4: Create `auth/schemas/__init__.py`**

```python
"""Auth Pydantic schemas."""
```

- [ ] **Step 5: Update route files to import from schemas**

In `backend/src/klassenzeit_backend/auth/routes/login.py`:
- Remove the `LoginRequest` class definition
- Add: `from klassenzeit_backend.auth.schemas.login import LoginRequest`

In `backend/src/klassenzeit_backend/auth/routes/me.py`:
- Remove `MeResponse` and `ChangePasswordRequest` class definitions
- Add: `from klassenzeit_backend.auth.schemas.me import ChangePasswordRequest, MeResponse`

In `backend/src/klassenzeit_backend/auth/routes/admin.py`:
- Remove `CreateUserRequest`, `UserResponse`, `UserListItem`, `ResetPasswordRequest` class definitions
- Add: `from klassenzeit_backend.auth.schemas.admin import CreateUserRequest, ResetPasswordRequest, UserListItem, UserResponse`
- Remove any now-unused imports (e.g. `EmailStr`, `datetime` if only used by schemas)

- [ ] **Step 6: Run all tests**

Run: `mise run test:py`
Expected: All existing auth tests pass — this is a pure refactor.

- [ ] **Step 7: Run linters**

Run: `mise run lint`
Expected: All checks pass. Unused imports should be caught and removed.

- [ ] **Step 8: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/schemas/ backend/src/klassenzeit_backend/auth/routes/
git commit -m "refactor(auth): extract Pydantic schemas into auth/schemas/"
```

---

## Task 2: Scheduling DB models — WeekScheme, TimeBlock, Subject

Create the first three models and wire them into Alembic. No routes yet — just models and a migration.

**Files:**
- Create: `backend/src/klassenzeit_backend/db/models/week_scheme.py`
- Create: `backend/src/klassenzeit_backend/db/models/subject.py`
- Modify: `backend/src/klassenzeit_backend/db/models/__init__.py`

- [ ] **Step 1: Create `db/models/subject.py`**

```python
"""Subject ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Subject(Base):
    """A school subject (e.g. Mathematik, Deutsch, Sport)."""

    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(100), unique=True)
    short_name: Mapped[str] = mapped_column(String(10), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 2: Create `db/models/week_scheme.py`**

```python
"""WeekScheme and TimeBlock ORM models."""

import uuid
from datetime import datetime, time

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, Text, Time, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class WeekScheme(Base):
    """An admin-defined weekly time grid."""

    __tablename__ = "week_schemes"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TimeBlock(Base):
    """A single period within a WeekScheme (e.g. Monday period 1, 08:00-08:45)."""

    __tablename__ = "time_blocks"
    __table_args__ = (
        UniqueConstraint("week_scheme_id", "day_of_week", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    week_scheme_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("week_schemes.id"), index=True
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger)
    position: Mapped[int] = mapped_column(SmallInteger)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
```

- [ ] **Step 3: Update `db/models/__init__.py`**

Add the new imports and re-exports:

```python
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.week_scheme import TimeBlock, WeekScheme
```

Add `Subject`, `TimeBlock`, `WeekScheme` to `__all__`.

- [ ] **Step 4: Verify models are visible to Alembic**

Run: `uv run python -c "from klassenzeit_backend.db.models import Subject, WeekScheme, TimeBlock; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/db/models/
git commit -m "feat(db): add WeekScheme, TimeBlock, Subject models"
```

---

## Task 3: Scheduling DB models — Room, Teacher, and join tables

**Files:**
- Create: `backend/src/klassenzeit_backend/db/models/room.py`
- Create: `backend/src/klassenzeit_backend/db/models/teacher.py`
- Modify: `backend/src/klassenzeit_backend/db/models/__init__.py`

- [ ] **Step 1: Create `db/models/room.py`**

```python
"""Room ORM models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Room(Base):
    """A physical room (classroom, lab, gym, pool, etc.)."""

    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(100), unique=True)
    short_name: Mapped[str] = mapped_column(String(20), unique=True)
    capacity: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    suitability_mode: Mapped[str] = mapped_column(
        String(16), server_default="general"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RoomSubjectSuitability(Base):
    """M:N join between Room and Subject for suitability rules."""

    __tablename__ = "room_subject_suitabilities"

    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id"), primary_key=True
    )


class RoomAvailability(Base):
    """Whitelist of time blocks when a room is available."""

    __tablename__ = "room_availabilities"

    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True
    )
    time_block_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("time_blocks.id"), primary_key=True
    )
```

- [ ] **Step 2: Create `db/models/teacher.py`**

```python
"""Teacher ORM models."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Teacher(Base):
    """A teacher who can be assigned to lessons."""

    __tablename__ = "teachers"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    short_code: Mapped[str] = mapped_column(String(10), unique=True)
    max_hours_per_week: Mapped[int] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TeacherQualification(Base):
    """M:N join between Teacher and Subject."""

    __tablename__ = "teacher_qualifications"

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id"), primary_key=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subjects.id"), primary_key=True
    )


class TeacherAvailability(Base):
    """Per-time-block availability status for a teacher."""

    __tablename__ = "teacher_availabilities"

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id"), primary_key=True
    )
    time_block_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("time_blocks.id"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(16))
```

- [ ] **Step 3: Update `db/models/__init__.py`**

Add imports:

```python
from klassenzeit_backend.db.models.room import Room, RoomAvailability, RoomSubjectSuitability
from klassenzeit_backend.db.models.teacher import Teacher, TeacherAvailability, TeacherQualification
```

Add all six to `__all__`.

- [ ] **Step 4: Verify imports**

Run: `uv run python -c "from klassenzeit_backend.db.models import Room, Teacher, RoomSubjectSuitability, TeacherQualification; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/db/models/
git commit -m "feat(db): add Room, Teacher models and join tables"
```

---

## Task 4: Scheduling DB models — Stundentafel, SchoolClass, Lesson, ClassGroup

**Files:**
- Create: `backend/src/klassenzeit_backend/db/models/stundentafel.py`
- Create: `backend/src/klassenzeit_backend/db/models/school_class.py`
- Create: `backend/src/klassenzeit_backend/db/models/lesson.py`
- Create: `backend/src/klassenzeit_backend/db/models/class_group.py`
- Modify: `backend/src/klassenzeit_backend/db/models/__init__.py`

- [ ] **Step 1: Create `db/models/stundentafel.py`**

```python
"""Stundentafel (curriculum template) ORM models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Stundentafel(Base):
    """A reusable curriculum template (e.g. 'Gymnasium Klasse 5 Latein')."""

    __tablename__ = "stundentafeln"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(100), unique=True)
    grade_level: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StundentafelEntry(Base):
    """One subject-hours pair within a Stundentafel."""

    __tablename__ = "stundentafel_entries"
    __table_args__ = (
        UniqueConstraint("stundentafel_id", "subject_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    stundentafel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stundentafeln.id"), index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subjects.id"))
    hours_per_week: Mapped[int] = mapped_column(SmallInteger)
    preferred_block_size: Mapped[int] = mapped_column(
        SmallInteger, server_default="1"
    )
```

- [ ] **Step 2: Create `db/models/school_class.py`**

```python
"""SchoolClass ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class SchoolClass(Base):
    """A class/group of students (e.g. '5a', '10b')."""

    __tablename__ = "school_classes"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(20), unique=True)
    grade_level: Mapped[int] = mapped_column(SmallInteger)
    stundentafel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stundentafeln.id")
    )
    week_scheme_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("week_schemes.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 3: Create `db/models/lesson.py`**

```python
"""Lesson ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Lesson(Base):
    """A concrete lesson assignment: class + subject + teacher + hours."""

    __tablename__ = "lessons"
    __table_args__ = (
        UniqueConstraint("school_class_id", "subject_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    school_class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id"), index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subjects.id"))
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teachers.id"), nullable=True
    )
    hours_per_week: Mapped[int] = mapped_column(SmallInteger)
    preferred_block_size: Mapped[int] = mapped_column(
        SmallInteger, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 4: Create `db/models/class_group.py`**

```python
"""ClassGroup ORM model (schema only — no routes)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class ClassGroup(Base):
    """A sub-group or cross-class group. Schema-only — no routes yet."""

    __tablename__ = "class_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=func.gen_random_uuid()
    )
    school_class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))
    group_type: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

- [ ] **Step 5: Update `db/models/__init__.py`**

Add imports:

```python
from klassenzeit_backend.db.models.class_group import ClassGroup
from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import Stundentafel, StundentafelEntry
```

Add all five to `__all__`.

- [ ] **Step 6: Verify all models import**

Run: `uv run python -c "from klassenzeit_backend.db.models import Stundentafel, StundentafelEntry, SchoolClass, Lesson, ClassGroup; print('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/db/models/
git commit -m "feat(db): add Stundentafel, SchoolClass, Lesson, ClassGroup models"
```

---

## Task 5: Alembic migration for all scheduling tables

Generate and verify the migration for all twelve new tables.

**Files:**
- Create: `backend/alembic/versions/<auto>_add_scheduling_tables.py` (autogenerated)

- [ ] **Step 1: Start the dev database**

Run: `mise run db:up`
Expected: Postgres container running on port 5433.

- [ ] **Step 2: Apply existing migrations**

Run: `cd backend && uv run alembic upgrade head`
Expected: All existing migrations applied.

- [ ] **Step 3: Generate migration**

Run: `cd backend && uv run alembic revision --autogenerate -m "add scheduling tables"`
Expected: New migration file created with 12 `create_table` operations.

- [ ] **Step 4: Review generated migration**

Open the generated file and verify:
- Tables created: `week_schemes`, `time_blocks`, `subjects`, `rooms`, `room_subject_suitabilities`, `room_availabilities`, `teachers`, `teacher_qualifications`, `teacher_availabilities`, `stundentafeln`, `stundentafel_entries`, `school_classes`, `lessons`, `class_groups`
- All unique constraints, composite PKs, and foreign keys are present
- `downgrade()` drops all tables in reverse dependency order

- [ ] **Step 5: Apply migration**

Run: `cd backend && uv run alembic upgrade head`
Expected: Migration applied without errors.

- [ ] **Step 6: Verify round-trip**

Run: `cd backend && uv run alembic downgrade -1 && uv run alembic upgrade head`
Expected: Clean downgrade and re-upgrade.

- [ ] **Step 7: Run existing tests**

Run: `mise run test:py`
Expected: All existing tests still pass (migration applies cleanly in test setup).

- [ ] **Step 8: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(db): add scheduling tables migration"
```

---

## Task 6: Scheduling test fixtures

Create shared factory fixtures that all scheduling test files will use.

**Files:**
- Create: `backend/tests/scheduling/__init__.py`
- Create: `backend/tests/scheduling/conftest.py`

- [ ] **Step 1: Create `tests/scheduling/__init__.py`**

Empty file.

- [ ] **Step 2: Create `tests/scheduling/conftest.py`**

```python
"""Shared factory fixtures for scheduling tests."""

import uuid
from collections.abc import Awaitable, Callable
from datetime import time

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.room import Room
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import Stundentafel, StundentafelEntry
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher
from klassenzeit_backend.db.models.week_scheme import TimeBlock, WeekScheme


type CreateSubjectFn = Callable[..., Awaitable[Subject]]
type CreateWeekSchemeFn = Callable[..., Awaitable[WeekScheme]]
type CreateTimeBlockFn = Callable[..., Awaitable[TimeBlock]]
type CreateRoomFn = Callable[..., Awaitable[Room]]
type CreateTeacherFn = Callable[..., Awaitable[Teacher]]
type CreateStundentafelFn = Callable[..., Awaitable[Stundentafel]]
type CreateStundentafelEntryFn = Callable[..., Awaitable[StundentafelEntry]]
type CreateSchoolClassFn = Callable[..., Awaitable[SchoolClass]]


@pytest.fixture
def create_subject(db_session: AsyncSession) -> CreateSubjectFn:
    """Factory fixture to create a Subject."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        short_name: str | None = None,
    ) -> Subject:
        nonlocal _counter
        _counter += 1
        subject = Subject(
            name=name or f"Subject {_counter}",
            short_name=short_name or f"S{_counter}",
        )
        db_session.add(subject)
        await db_session.flush()
        return subject

    return _create


@pytest.fixture
def create_week_scheme(db_session: AsyncSession) -> CreateWeekSchemeFn:
    """Factory fixture to create a WeekScheme."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> WeekScheme:
        nonlocal _counter
        _counter += 1
        scheme = WeekScheme(
            name=name or f"Scheme {_counter}",
            description=description,
        )
        db_session.add(scheme)
        await db_session.flush()
        return scheme

    return _create


@pytest.fixture
def create_time_block(db_session: AsyncSession) -> CreateTimeBlockFn:
    """Factory fixture to create a TimeBlock."""

    async def _create(
        *,
        week_scheme_id: uuid.UUID,
        day_of_week: int = 0,
        position: int = 1,
        start_time: time = time(8, 0),
        end_time: time = time(8, 45),
    ) -> TimeBlock:
        block = TimeBlock(
            week_scheme_id=week_scheme_id,
            day_of_week=day_of_week,
            position=position,
            start_time=start_time,
            end_time=end_time,
        )
        db_session.add(block)
        await db_session.flush()
        return block

    return _create


@pytest.fixture
def create_room(db_session: AsyncSession) -> CreateRoomFn:
    """Factory fixture to create a Room."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        short_name: str | None = None,
        capacity: int | None = None,
        suitability_mode: str = "general",
    ) -> Room:
        nonlocal _counter
        _counter += 1
        room = Room(
            name=name or f"Room {_counter}",
            short_name=short_name or f"R{_counter}",
            capacity=capacity,
            suitability_mode=suitability_mode,
        )
        db_session.add(room)
        await db_session.flush()
        return room

    return _create


@pytest.fixture
def create_teacher(db_session: AsyncSession) -> CreateTeacherFn:
    """Factory fixture to create a Teacher."""
    _counter = 0

    async def _create(
        *,
        first_name: str = "Test",
        last_name: str | None = None,
        short_code: str | None = None,
        max_hours_per_week: int = 24,
    ) -> Teacher:
        nonlocal _counter
        _counter += 1
        teacher = Teacher(
            first_name=first_name,
            last_name=last_name or f"Teacher{_counter}",
            short_code=short_code or f"T{_counter}",
            max_hours_per_week=max_hours_per_week,
        )
        db_session.add(teacher)
        await db_session.flush()
        return teacher

    return _create


@pytest.fixture
def create_stundentafel(db_session: AsyncSession) -> CreateStundentafelFn:
    """Factory fixture to create a Stundentafel."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        grade_level: int = 5,
    ) -> Stundentafel:
        nonlocal _counter
        _counter += 1
        tafel = Stundentafel(
            name=name or f"Stundentafel {_counter}",
            grade_level=grade_level,
        )
        db_session.add(tafel)
        await db_session.flush()
        return tafel

    return _create


@pytest.fixture
def create_stundentafel_entry(db_session: AsyncSession) -> CreateStundentafelEntryFn:
    """Factory fixture to create a StundentafelEntry."""

    async def _create(
        *,
        stundentafel_id: uuid.UUID,
        subject_id: uuid.UUID,
        hours_per_week: int = 4,
        preferred_block_size: int = 1,
    ) -> StundentafelEntry:
        entry = StundentafelEntry(
            stundentafel_id=stundentafel_id,
            subject_id=subject_id,
            hours_per_week=hours_per_week,
            preferred_block_size=preferred_block_size,
        )
        db_session.add(entry)
        await db_session.flush()
        return entry

    return _create


@pytest.fixture
def create_school_class(db_session: AsyncSession) -> CreateSchoolClassFn:
    """Factory fixture to create a SchoolClass."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        grade_level: int = 5,
        stundentafel_id: uuid.UUID,
        week_scheme_id: uuid.UUID,
    ) -> SchoolClass:
        nonlocal _counter
        _counter += 1
        school_class = SchoolClass(
            name=name or f"{grade_level}{chr(96 + _counter)}",
            grade_level=grade_level,
            stundentafel_id=stundentafel_id,
            week_scheme_id=week_scheme_id,
        )
        db_session.add(school_class)
        await db_session.flush()
        return school_class

    return _create


@pytest.fixture
def admin_client(
    client: AsyncClient, create_test_user, login_as
) -> AsyncClient:
    """Return a client logged in as admin. Must be awaited in a setup block."""

    async def _setup() -> AsyncClient:
        await create_test_user(email="admin@test.com", role="admin")
        await login_as("admin@test.com", "testpassword123")
        return client

    # Return the coroutine — tests call: client = await admin_client_setup()
    # Actually, we can't do this cleanly as a fixture. Instead, each test
    # file will use create_test_user + login_as directly, matching the auth
    # test pattern. Remove this fixture.
    raise NotImplementedError
```

Wait — looking at the auth test pattern more carefully, each test calls `create_test_user` and `login_as` inline. That's the established pattern. Drop the `admin_client` fixture and keep the factories only. Update the file:

```python
"""Shared factory fixtures for scheduling tests."""

import uuid
from collections.abc import Awaitable, Callable
from datetime import time

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.room import Room
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import Stundentafel, StundentafelEntry
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher
from klassenzeit_backend.db.models.week_scheme import TimeBlock, WeekScheme


type CreateSubjectFn = Callable[..., Awaitable[Subject]]
type CreateWeekSchemeFn = Callable[..., Awaitable[WeekScheme]]
type CreateTimeBlockFn = Callable[..., Awaitable[TimeBlock]]
type CreateRoomFn = Callable[..., Awaitable[Room]]
type CreateTeacherFn = Callable[..., Awaitable[Teacher]]
type CreateStundentafelFn = Callable[..., Awaitable[Stundentafel]]
type CreateStundentafelEntryFn = Callable[..., Awaitable[StundentafelEntry]]
type CreateSchoolClassFn = Callable[..., Awaitable[SchoolClass]]


@pytest.fixture
def create_subject(db_session: AsyncSession) -> CreateSubjectFn:
    """Factory fixture to create a Subject."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        short_name: str | None = None,
    ) -> Subject:
        nonlocal _counter
        _counter += 1
        subject = Subject(
            name=name or f"Subject {_counter}",
            short_name=short_name or f"S{_counter}",
        )
        db_session.add(subject)
        await db_session.flush()
        return subject

    return _create


@pytest.fixture
def create_week_scheme(db_session: AsyncSession) -> CreateWeekSchemeFn:
    """Factory fixture to create a WeekScheme."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> WeekScheme:
        nonlocal _counter
        _counter += 1
        scheme = WeekScheme(
            name=name or f"Scheme {_counter}",
            description=description,
        )
        db_session.add(scheme)
        await db_session.flush()
        return scheme

    return _create


@pytest.fixture
def create_time_block(db_session: AsyncSession) -> CreateTimeBlockFn:
    """Factory fixture to create a TimeBlock."""

    async def _create(
        *,
        week_scheme_id: uuid.UUID,
        day_of_week: int = 0,
        position: int = 1,
        start_time: time = time(8, 0),
        end_time: time = time(8, 45),
    ) -> TimeBlock:
        block = TimeBlock(
            week_scheme_id=week_scheme_id,
            day_of_week=day_of_week,
            position=position,
            start_time=start_time,
            end_time=end_time,
        )
        db_session.add(block)
        await db_session.flush()
        return block

    return _create


@pytest.fixture
def create_room(db_session: AsyncSession) -> CreateRoomFn:
    """Factory fixture to create a Room."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        short_name: str | None = None,
        capacity: int | None = None,
        suitability_mode: str = "general",
    ) -> Room:
        nonlocal _counter
        _counter += 1
        room = Room(
            name=name or f"Room {_counter}",
            short_name=short_name or f"R{_counter}",
            capacity=capacity,
            suitability_mode=suitability_mode,
        )
        db_session.add(room)
        await db_session.flush()
        return room

    return _create


@pytest.fixture
def create_teacher(db_session: AsyncSession) -> CreateTeacherFn:
    """Factory fixture to create a Teacher."""
    _counter = 0

    async def _create(
        *,
        first_name: str = "Test",
        last_name: str | None = None,
        short_code: str | None = None,
        max_hours_per_week: int = 24,
    ) -> Teacher:
        nonlocal _counter
        _counter += 1
        teacher = Teacher(
            first_name=first_name,
            last_name=last_name or f"Teacher{_counter}",
            short_code=short_code or f"T{_counter}",
            max_hours_per_week=max_hours_per_week,
        )
        db_session.add(teacher)
        await db_session.flush()
        return teacher

    return _create


@pytest.fixture
def create_stundentafel(db_session: AsyncSession) -> CreateStundentafelFn:
    """Factory fixture to create a Stundentafel."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        grade_level: int = 5,
    ) -> Stundentafel:
        nonlocal _counter
        _counter += 1
        tafel = Stundentafel(
            name=name or f"Stundentafel {_counter}",
            grade_level=grade_level,
        )
        db_session.add(tafel)
        await db_session.flush()
        return tafel

    return _create


@pytest.fixture
def create_stundentafel_entry(db_session: AsyncSession) -> CreateStundentafelEntryFn:
    """Factory fixture to create a StundentafelEntry."""

    async def _create(
        *,
        stundentafel_id: uuid.UUID,
        subject_id: uuid.UUID,
        hours_per_week: int = 4,
        preferred_block_size: int = 1,
    ) -> StundentafelEntry:
        entry = StundentafelEntry(
            stundentafel_id=stundentafel_id,
            subject_id=subject_id,
            hours_per_week=hours_per_week,
            preferred_block_size=preferred_block_size,
        )
        db_session.add(entry)
        await db_session.flush()
        return entry

    return _create


@pytest.fixture
def create_school_class(db_session: AsyncSession) -> CreateSchoolClassFn:
    """Factory fixture to create a SchoolClass."""
    _counter = 0

    async def _create(
        *,
        name: str | None = None,
        grade_level: int = 5,
        stundentafel_id: uuid.UUID,
        week_scheme_id: uuid.UUID,
    ) -> SchoolClass:
        nonlocal _counter
        _counter += 1
        school_class = SchoolClass(
            name=name or f"{grade_level}{chr(96 + _counter)}",
            grade_level=grade_level,
            stundentafel_id=stundentafel_id,
            week_scheme_id=week_scheme_id,
        )
        db_session.add(school_class)
        await db_session.flush()
        return school_class

    return _create
```

- [ ] **Step 3: Commit**

```bash
git add backend/tests/scheduling/
git commit -m "test: add scheduling factory fixtures"
```

---

## Task 7: Subject routes + schemas + tests

The simplest CRUD entity — good starting point to establish the pattern.

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/__init__.py`
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/__init__.py`
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/subject.py`
- Create: `backend/src/klassenzeit_backend/scheduling/routes/__init__.py`
- Create: `backend/src/klassenzeit_backend/scheduling/routes/subjects.py`
- Create: `backend/tests/scheduling/test_subjects.py`
- Modify: `backend/src/klassenzeit_backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/scheduling/test_subjects.py`:

```python
"""Tests for subject CRUD routes."""

from httpx import AsyncClient


async def test_create_subject(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """POST /subjects creates a subject and returns 201."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    response = await client.post(
        "/subjects", json={"name": "Mathematik", "short_name": "Ma"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Mathematik"
    assert body["short_name"] == "Ma"
    assert "id" in body


async def test_create_subject_duplicate_name(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """POST /subjects returns 409 on duplicate name."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    await client.post("/subjects", json={"name": "Mathematik", "short_name": "Ma"})
    response = await client.post(
        "/subjects", json={"name": "Mathematik", "short_name": "Ma2"}
    )
    assert response.status_code == 409


async def test_list_subjects(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """GET /subjects returns all subjects."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    await client.post("/subjects", json={"name": "Mathematik", "short_name": "Ma"})
    await client.post("/subjects", json={"name": "Deutsch", "short_name": "De"})
    response = await client.get("/subjects")
    assert response.status_code == 200
    assert len(response.json()) == 2


async def test_get_subject(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """GET /subjects/{id} returns a single subject."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    create_resp = await client.post(
        "/subjects", json={"name": "Mathematik", "short_name": "Ma"}
    )
    subject_id = create_resp.json()["id"]
    response = await client.get(f"/subjects/{subject_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Mathematik"


async def test_get_subject_not_found(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """GET /subjects/{id} returns 404 for unknown ID."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    response = await client.get("/subjects/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_update_subject(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """PATCH /subjects/{id} updates fields."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    create_resp = await client.post(
        "/subjects", json={"name": "Mathematik", "short_name": "Ma"}
    )
    subject_id = create_resp.json()["id"]
    response = await client.patch(
        f"/subjects/{subject_id}", json={"name": "Mathe"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Mathe"
    assert response.json()["short_name"] == "Ma"


async def test_delete_subject(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """DELETE /subjects/{id} removes the subject."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    create_resp = await client.post(
        "/subjects", json={"name": "Mathematik", "short_name": "Ma"}
    )
    subject_id = create_resp.json()["id"]
    response = await client.delete(f"/subjects/{subject_id}")
    assert response.status_code == 204
    get_resp = await client.get(f"/subjects/{subject_id}")
    assert get_resp.status_code == 404


async def test_delete_subject_not_found(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """DELETE /subjects/{id} returns 404 for unknown ID."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    response = await client.delete(
        "/subjects/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404


async def test_subject_requires_admin(client: AsyncClient) -> None:
    """Subject routes return 401 without auth."""
    response = await client.get("/subjects")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest backend/tests/scheduling/test_subjects.py -v`
Expected: All tests FAIL (routes don't exist yet).

- [ ] **Step 3: Create package markers**

Create empty `__init__.py` files:
- `backend/src/klassenzeit_backend/scheduling/__init__.py` with docstring `"""Scheduling domain — schemas, routes."""`
- `backend/src/klassenzeit_backend/scheduling/schemas/__init__.py` with docstring `"""Scheduling Pydantic schemas."""`
- `backend/src/klassenzeit_backend/scheduling/routes/__init__.py` — see step 5.

- [ ] **Step 4: Create `scheduling/schemas/subject.py`**

```python
"""Pydantic schemas for subject routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class SubjectCreate(BaseModel):
    """Request body for creating a subject."""

    name: str
    short_name: str


class SubjectUpdate(BaseModel):
    """Request body for patching a subject."""

    name: str | None = None
    short_name: str | None = None


class SubjectResponse(BaseModel):
    """Response body for a subject."""

    id: uuid.UUID
    name: str
    short_name: str
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 5: Create `scheduling/routes/subjects.py`**

```python
"""Subject CRUD routes."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import require_admin
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session
from klassenzeit_backend.scheduling.schemas.subject import (
    SubjectCreate,
    SubjectResponse,
    SubjectUpdate,
)

from typing import Annotated
from fastapi import Depends

router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_subject(
    body: SubjectCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SubjectResponse:
    """Create a new subject."""
    subject = Subject(name=body.name, short_name=body.short_name)
    db.add(subject)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Subject with this name or short_name already exists",
        )
    await db.refresh(subject)
    return SubjectResponse(
        id=subject.id,
        name=subject.name,
        short_name=subject.short_name,
        created_at=subject.created_at,
        updated_at=subject.updated_at,
    )


@router.get("")
async def list_subjects(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[SubjectResponse]:
    """List all subjects."""
    result = await db.execute(select(Subject).order_by(Subject.name))
    subjects = result.scalars().all()
    return [
        SubjectResponse(
            id=s.id,
            name=s.name,
            short_name=s.short_name,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in subjects
    ]


async def _get_subject(db: AsyncSession, subject_id: uuid.UUID) -> Subject:
    """Load a subject by ID or raise 404."""
    result = await db.execute(select(Subject).where(Subject.id == subject_id))
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found"
        )
    return subject


@router.get("/{subject_id}")
async def get_subject(
    subject_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SubjectResponse:
    """Get a single subject by ID."""
    subject = await _get_subject(db, subject_id)
    return SubjectResponse(
        id=subject.id,
        name=subject.name,
        short_name=subject.short_name,
        created_at=subject.created_at,
        updated_at=subject.updated_at,
    )


@router.patch("/{subject_id}")
async def update_subject(
    subject_id: uuid.UUID,
    body: SubjectUpdate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SubjectResponse:
    """Partially update a subject."""
    subject = await _get_subject(db, subject_id)
    if body.name is not None:
        subject.name = body.name
    if body.short_name is not None:
        subject.short_name = body.short_name
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Subject with this name or short_name already exists",
        )
    await db.refresh(subject)
    return SubjectResponse(
        id=subject.id,
        name=subject.name,
        short_name=subject.short_name,
        created_at=subject.created_at,
        updated_at=subject.updated_at,
    )


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    subject_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Delete a subject. Returns 409 if referenced by other entities."""
    subject = await _get_subject(db, subject_id)
    await db.delete(subject)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Subject is referenced by other entities",
        )
```

- [ ] **Step 6: Create `scheduling/routes/__init__.py`**

```python
"""Scheduling route collection."""

from fastapi import APIRouter

from klassenzeit_backend.scheduling.routes.subjects import router as subjects_router

scheduling_router = APIRouter()
scheduling_router.include_router(subjects_router)
```

- [ ] **Step 7: Wire into `main.py`**

In `backend/src/klassenzeit_backend/main.py`, add:

```python
from klassenzeit_backend.scheduling.routes import scheduling_router
```

And after `app.include_router(auth_router)`:

```python
app.include_router(scheduling_router)
```

- [ ] **Step 8: Run tests**

Run: `uv run pytest backend/tests/scheduling/test_subjects.py -v`
Expected: All tests PASS.

- [ ] **Step 9: Run full test suite + lint**

Run: `mise run test:py && mise run lint`
Expected: All tests pass, no lint errors.

- [ ] **Step 10: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/ backend/tests/scheduling/test_subjects.py backend/src/klassenzeit_backend/main.py
git commit -m "feat(api): add Subject CRUD routes"
```

---

## Task 8: WeekScheme + TimeBlock routes + schemas + tests

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/week_scheme.py`
- Create: `backend/src/klassenzeit_backend/scheduling/routes/week_schemes.py`
- Create: `backend/tests/scheduling/test_week_schemes.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/scheduling/test_week_schemes.py`. Cover:
- `test_create_week_scheme` — POST /week-schemes, 201
- `test_create_week_scheme_duplicate_name` — 409
- `test_list_week_schemes` — GET /week-schemes, 200
- `test_get_week_scheme_with_time_blocks` — GET /week-schemes/{id}, includes nested time_blocks
- `test_update_week_scheme` — PATCH, 200
- `test_delete_week_scheme` — DELETE, 204
- `test_delete_week_scheme_referenced_by_class` — 409 (needs create_school_class fixture — skip this test for now, add in Task 13)
- `test_create_time_block` — POST /week-schemes/{id}/time-blocks, 201
- `test_create_time_block_duplicate_position` — 409
- `test_update_time_block` — PATCH, 200
- `test_delete_time_block` — DELETE, 204
- `test_week_scheme_requires_admin` — 401

Follow the exact same test pattern as Task 7 (inline admin setup per test, assert status codes and body fields).

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest backend/tests/scheduling/test_week_schemes.py -v`
Expected: All FAIL.

- [ ] **Step 3: Create `scheduling/schemas/week_scheme.py`**

```python
"""Pydantic schemas for week scheme and time block routes."""

import uuid
from datetime import datetime, time

from pydantic import BaseModel


class TimeBlockCreate(BaseModel):
    """Request body for creating a time block."""

    day_of_week: int
    position: int
    start_time: time
    end_time: time


class TimeBlockUpdate(BaseModel):
    """Request body for patching a time block."""

    day_of_week: int | None = None
    position: int | None = None
    start_time: time | None = None
    end_time: time | None = None


class TimeBlockResponse(BaseModel):
    """Response body for a time block."""

    id: uuid.UUID
    day_of_week: int
    position: int
    start_time: time
    end_time: time


class WeekSchemeCreate(BaseModel):
    """Request body for creating a week scheme."""

    name: str
    description: str | None = None


class WeekSchemeUpdate(BaseModel):
    """Request body for patching a week scheme."""

    name: str | None = None
    description: str | None = None


class WeekSchemeListResponse(BaseModel):
    """Response body for a week scheme in list view (no time blocks)."""

    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class WeekSchemeDetailResponse(BaseModel):
    """Response body for a week scheme detail view (with time blocks)."""

    id: uuid.UUID
    name: str
    description: str | None
    time_blocks: list[TimeBlockResponse]
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Create `scheduling/routes/week_schemes.py`**

Implement all WeekScheme and TimeBlock routes following the same pattern as `subjects.py`:
- `POST /week-schemes` — create scheme
- `GET /week-schemes` — list (no time blocks)
- `GET /week-schemes/{id}` — detail with time blocks (query TimeBlock where week_scheme_id matches, ordered by day_of_week, position)
- `PATCH /week-schemes/{id}` — partial update
- `DELETE /week-schemes/{id}` — delete (IntegrityError → 409)
- `POST /week-schemes/{scheme_id}/time-blocks` — create block
- `PATCH /week-schemes/{scheme_id}/time-blocks/{block_id}` — update block (verify block belongs to scheme)
- `DELETE /week-schemes/{scheme_id}/time-blocks/{block_id}` — delete block

Private helper: `_get_week_scheme(db, scheme_id)` and `_get_time_block(db, scheme_id, block_id)`.

- [ ] **Step 5: Wire into `scheduling/routes/__init__.py`**

Add import and `scheduling_router.include_router(week_schemes_router)`.

- [ ] **Step 6: Run tests**

Run: `uv run pytest backend/tests/scheduling/test_week_schemes.py -v`
Expected: All PASS.

- [ ] **Step 7: Run full suite + lint**

Run: `mise run test:py && mise run lint`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/ backend/tests/scheduling/test_week_schemes.py
git commit -m "feat(api): add WeekScheme and TimeBlock CRUD routes"
```

---

## Task 9: Room routes + schemas + tests

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/room.py`
- Create: `backend/src/klassenzeit_backend/scheduling/routes/rooms.py`
- Create: `backend/tests/scheduling/test_rooms.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/scheduling/test_rooms.py`. Cover:
- `test_create_room` — POST /rooms, 201, default suitability_mode=general
- `test_create_specialized_room` — with suitability_mode=specialized
- `test_create_room_duplicate_name` — 409
- `test_list_rooms` — GET /rooms, 200
- `test_get_room_detail` — GET /rooms/{id}, includes suitability_subjects and availability
- `test_update_room` — PATCH, 200
- `test_delete_room` — DELETE, 204
- `test_replace_suitability` — PUT /rooms/{id}/suitability, replaces list
- `test_replace_availability` — PUT /rooms/{id}/availability, replaces list (needs create_week_scheme + create_time_block fixtures)
- `test_room_requires_admin` — 401

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Create `scheduling/schemas/room.py`**

```python
"""Pydantic schemas for room routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class RoomCreate(BaseModel):
    """Request body for creating a room."""

    name: str
    short_name: str
    capacity: int | None = None
    suitability_mode: str = "general"


class RoomUpdate(BaseModel):
    """Request body for patching a room."""

    name: str | None = None
    short_name: str | None = None
    capacity: int | None = None
    suitability_mode: str | None = None


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
```

- [ ] **Step 4: Create `scheduling/routes/rooms.py`**

Implement all Room routes:
- Standard CRUD (POST, GET list, GET detail, PATCH, DELETE)
- `PUT /rooms/{id}/suitability` — delete all existing RoomSubjectSuitability rows for this room, insert new ones from `subject_ids`
- `PUT /rooms/{id}/availability` — delete all existing RoomAvailability rows, insert new ones from `time_block_ids`
- Detail view joins through RoomSubjectSuitability → Subject and RoomAvailability → TimeBlock to return enriched responses
- Room DELETE cascades suitabilities and availabilities (via `ondelete="CASCADE"` on FK)

- [ ] **Step 5: Wire into `scheduling/routes/__init__.py`**

- [ ] **Step 6: Run tests**

Run: `uv run pytest backend/tests/scheduling/test_rooms.py -v`
Expected: All PASS.

- [ ] **Step 7: Full suite + lint**

- [ ] **Step 8: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/ backend/tests/scheduling/test_rooms.py
git commit -m "feat(api): add Room CRUD with suitability and availability routes"
```

---

## Task 10: Teacher routes + schemas + tests

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/teacher.py`
- Create: `backend/src/klassenzeit_backend/scheduling/routes/teachers.py`
- Create: `backend/tests/scheduling/test_teachers.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/scheduling/test_teachers.py`. Cover:
- `test_create_teacher` — POST /teachers, 201
- `test_create_teacher_duplicate_short_code` — 409
- `test_list_teachers` — GET /teachers, 200
- `test_list_teachers_filter_active` — GET /teachers?active=true
- `test_get_teacher_detail` — GET /teachers/{id}, includes qualifications and availability
- `test_update_teacher` — PATCH, 200
- `test_delete_teacher_soft_deletes` — DELETE, 204, sets is_active=false
- `test_replace_qualifications` — PUT /teachers/{id}/qualifications
- `test_replace_availability` — PUT /teachers/{id}/availability with status entries
- `test_teacher_requires_admin` — 401

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Create `scheduling/schemas/teacher.py`**

```python
"""Pydantic schemas for teacher routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class TeacherCreate(BaseModel):
    """Request body for creating a teacher."""

    first_name: str
    last_name: str
    short_code: str
    max_hours_per_week: int


class TeacherUpdate(BaseModel):
    """Request body for patching a teacher."""

    first_name: str | None = None
    last_name: str | None = None
    short_code: str | None = None
    max_hours_per_week: int | None = None


class QualificationResponse(BaseModel):
    """Subject in a teacher's qualification list."""

    id: uuid.UUID
    name: str
    short_name: str


class TeacherAvailabilityEntry(BaseModel):
    """Single availability entry in responses."""

    time_block_id: uuid.UUID
    day_of_week: int
    position: int
    status: str


class TeacherListResponse(BaseModel):
    """Response body for a teacher in list view."""

    id: uuid.UUID
    first_name: str
    last_name: str
    short_code: str
    max_hours_per_week: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TeacherDetailResponse(BaseModel):
    """Response body for a teacher detail view."""

    id: uuid.UUID
    first_name: str
    last_name: str
    short_code: str
    max_hours_per_week: int
    is_active: bool
    qualifications: list[QualificationResponse]
    availability: list[TeacherAvailabilityEntry]
    created_at: datetime
    updated_at: datetime


class QualificationsReplaceRequest(BaseModel):
    """Request body for replacing a teacher's qualifications."""

    subject_ids: list[uuid.UUID]


class AvailabilityEntryInput(BaseModel):
    """Single availability entry in request."""

    time_block_id: uuid.UUID
    status: str


class AvailabilityReplaceRequest(BaseModel):
    """Request body for replacing a teacher's availability."""

    entries: list[AvailabilityEntryInput]
```

- [ ] **Step 4: Create `scheduling/routes/teachers.py`**

Implement all Teacher routes:
- Standard CRUD (POST, GET list with `?active` filter, GET detail, PATCH, DELETE as soft-delete)
- DELETE sets `is_active = False` instead of actually deleting
- `PUT /teachers/{id}/qualifications` — delete all TeacherQualification rows, insert from `subject_ids`
- `PUT /teachers/{id}/availability` — delete all TeacherAvailability rows, insert from `entries` list (each has `time_block_id` + `status`)
- Detail view joins through TeacherQualification → Subject and TeacherAvailability → TimeBlock
- Validate `status` in availability entries is one of `available`, `preferred`, `unavailable` (raise 422)

- [ ] **Step 5: Wire into `scheduling/routes/__init__.py`**

- [ ] **Step 6: Run tests, full suite + lint**

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/ backend/tests/scheduling/test_teachers.py
git commit -m "feat(api): add Teacher CRUD with qualifications and availability routes"
```

---

## Task 11: Stundentafel routes + schemas + tests

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/stundentafel.py`
- Create: `backend/src/klassenzeit_backend/scheduling/routes/stundentafeln.py`
- Create: `backend/tests/scheduling/test_stundentafeln.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/scheduling/test_stundentafeln.py`. Cover:
- `test_create_stundentafel` — POST /stundentafeln, 201
- `test_create_stundentafel_duplicate_name` — 409
- `test_list_stundentafeln` — GET, 200
- `test_get_stundentafel_with_entries` — GET /{id}, includes nested entries with subject info
- `test_update_stundentafel` — PATCH, 200
- `test_delete_stundentafel` — DELETE, 204
- `test_create_entry` — POST /stundentafeln/{id}/entries, 201
- `test_create_entry_duplicate_subject` — 409
- `test_update_entry` — PATCH, 200
- `test_delete_entry` — DELETE, 204
- `test_stundentafel_requires_admin` — 401

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Create `scheduling/schemas/stundentafel.py`**

```python
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
```

- [ ] **Step 4: Create `scheduling/routes/stundentafeln.py`**

Implement all Stundentafel + entry routes:
- Standard CRUD for Stundentafel (POST, GET list, GET detail, PATCH, DELETE with FK protection)
- Detail GET joins StundentafelEntry → Subject for enriched entries
- Nested CRUD for entries: POST (409 on duplicate subject), PATCH, DELETE
- Entry routes verify the entry belongs to the parent Stundentafel

- [ ] **Step 5: Wire into `scheduling/routes/__init__.py`**

- [ ] **Step 6: Run tests, full suite + lint**

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/ backend/tests/scheduling/test_stundentafeln.py
git commit -m "feat(api): add Stundentafel and entry CRUD routes"
```

---

## Task 12: SchoolClass routes + schemas + tests

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/school_class.py`
- Create: `backend/src/klassenzeit_backend/scheduling/routes/school_classes.py`
- Create: `backend/tests/scheduling/test_school_classes.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/scheduling/test_school_classes.py`. Cover:
- `test_create_school_class` — POST /classes, 201 (needs stundentafel + week_scheme created via API first)
- `test_create_school_class_duplicate_name` — 409
- `test_list_school_classes` — GET, 200
- `test_get_school_class` — GET /{id}, 200
- `test_update_school_class` — PATCH, 200
- `test_delete_school_class` — DELETE, 204
- `test_school_class_requires_admin` — 401

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Create `scheduling/schemas/school_class.py`**

```python
"""Pydantic schemas for school class routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class SchoolClassCreate(BaseModel):
    """Request body for creating a school class."""

    name: str
    grade_level: int
    stundentafel_id: uuid.UUID
    week_scheme_id: uuid.UUID


class SchoolClassUpdate(BaseModel):
    """Request body for patching a school class."""

    name: str | None = None
    grade_level: int | None = None
    stundentafel_id: uuid.UUID | None = None
    week_scheme_id: uuid.UUID | None = None


class SchoolClassResponse(BaseModel):
    """Response body for a school class."""

    id: uuid.UUID
    name: str
    grade_level: int
    stundentafel_id: uuid.UUID
    week_scheme_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Create `scheduling/routes/school_classes.py`**

Standard CRUD. DELETE returns 409 if lessons reference the class (IntegrityError catch).

- [ ] **Step 5: Wire into `scheduling/routes/__init__.py`**

- [ ] **Step 6: Run tests, full suite + lint**

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/ backend/tests/scheduling/test_school_classes.py
git commit -m "feat(api): add SchoolClass CRUD routes"
```

---

## Task 13: Lesson routes + schemas + tests

**Files:**
- Create: `backend/src/klassenzeit_backend/scheduling/schemas/lesson.py`
- Create: `backend/src/klassenzeit_backend/scheduling/routes/lessons.py`
- Create: `backend/tests/scheduling/test_lessons.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/scheduling/test_lessons.py`. Cover:
- `test_create_lesson` — POST /lessons, 201
- `test_create_lesson_without_teacher` — teacher_id=null, 201
- `test_create_lesson_duplicate_class_subject` — 409
- `test_list_lessons` — GET /lessons, 200
- `test_list_lessons_filter_by_class` — GET /lessons?class_id=...
- `test_list_lessons_filter_by_teacher` — GET /lessons?teacher_id=...
- `test_get_lesson` — GET /lessons/{id}, includes nested class/subject/teacher
- `test_update_lesson_assign_teacher` — PATCH, assign teacher_id
- `test_delete_lesson` — DELETE, 204
- `test_generate_lessons_from_stundentafel` — POST /classes/{id}/generate-lessons, 201
- `test_generate_lessons_skips_existing` — existing lessons not duplicated
- `test_lesson_requires_admin` — 401

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Create `scheduling/schemas/lesson.py`**

```python
"""Pydantic schemas for lesson routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class LessonCreate(BaseModel):
    """Request body for creating a lesson."""

    school_class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None = None
    hours_per_week: int
    preferred_block_size: int = 1


class LessonUpdate(BaseModel):
    """Request body for patching a lesson."""

    teacher_id: uuid.UUID | None = None
    hours_per_week: int | None = None
    preferred_block_size: int | None = None


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
```

- [ ] **Step 4: Create `scheduling/routes/lessons.py`**

Implement all Lesson routes:
- `POST /lessons` — create with FK validation (class, subject, teacher all exist)
- `GET /lessons` — list with optional filters `class_id`, `teacher_id`, `subject_id` (applied via `where` clauses)
- `GET /lessons/{id}` — detail with joined class/subject/teacher info
- `PATCH /lessons/{id}` — partial update
- `DELETE /lessons/{id}` — hard delete
- `POST /classes/{class_id}/generate-lessons`:
  1. Load the class and its Stundentafel
  2. Load all StundentafelEntry rows for that Stundentafel
  3. For each entry, check if a Lesson already exists for (class_id, subject_id)
  4. If not, create a Lesson with `teacher_id=None`, hours and block size from the entry
  5. Return list of all created lessons

Note: The `generate-lessons` route cannot live on the lessons router (which has `prefix="/lessons"`) because the path is `/classes/{id}/generate-lessons`. Instead, create a second router in the same file: `generate_router = APIRouter(tags=["lessons"])` with the `@generate_router.post("/classes/{class_id}/generate-lessons", ...)` route. Export both routers and include both in `scheduling/routes/__init__.py`.

- [ ] **Step 5: Wire into `scheduling/routes/__init__.py`**

- [ ] **Step 6: Run tests, full suite + lint**

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/scheduling/ backend/tests/scheduling/test_lessons.py
git commit -m "feat(api): add Lesson CRUD and generate-lessons routes"
```

---

## Task 14: Cross-entity FK protection tests

Add tests that were deferred from earlier tasks because they require multiple entity types to exist.

**Files:**
- Modify: `backend/tests/scheduling/test_week_schemes.py`
- Modify: `backend/tests/scheduling/test_subjects.py`
- Modify: `backend/tests/scheduling/test_rooms.py`

- [ ] **Step 1: Add FK protection test to test_week_schemes.py**

```python
async def test_delete_week_scheme_referenced_by_class(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """DELETE /week-schemes/{id} returns 409 when referenced by a class."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    # Create dependencies
    scheme_resp = await client.post(
        "/week-schemes", json={"name": "Test Scheme"}
    )
    scheme_id = scheme_resp.json()["id"]
    tafel_resp = await client.post(
        "/stundentafeln", json={"name": "Test Tafel", "grade_level": 5}
    )
    tafel_id = tafel_resp.json()["id"]
    await client.post(
        "/classes",
        json={
            "name": "5a",
            "grade_level": 5,
            "stundentafel_id": tafel_id,
            "week_scheme_id": scheme_id,
        },
    )
    # Try to delete the scheme
    response = await client.delete(f"/week-schemes/{scheme_id}")
    assert response.status_code == 409
```

- [ ] **Step 2: Add FK protection test to test_subjects.py**

```python
async def test_delete_subject_referenced_by_lesson(
    client: AsyncClient, create_test_user, login_as
) -> None:
    """DELETE /subjects/{id} returns 409 when referenced by a lesson."""
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    # Create subject
    subj_resp = await client.post(
        "/subjects", json={"name": "Mathematik", "short_name": "Ma"}
    )
    subject_id = subj_resp.json()["id"]
    # Create dependencies for a lesson
    scheme_resp = await client.post(
        "/week-schemes", json={"name": "Test Scheme"}
    )
    tafel_resp = await client.post(
        "/stundentafeln", json={"name": "Test Tafel", "grade_level": 5}
    )
    class_resp = await client.post(
        "/classes",
        json={
            "name": "5a",
            "grade_level": 5,
            "stundentafel_id": tafel_resp.json()["id"],
            "week_scheme_id": scheme_resp.json()["id"],
        },
    )
    await client.post(
        "/lessons",
        json={
            "school_class_id": class_resp.json()["id"],
            "subject_id": subject_id,
            "hours_per_week": 4,
        },
    )
    # Try to delete the subject
    response = await client.delete(f"/subjects/{subject_id}")
    assert response.status_code == 409
```

- [ ] **Step 3: Run full suite + lint**

Run: `mise run test:py && mise run lint`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/scheduling/
git commit -m "test: add cross-entity FK protection tests"
```

---

## Task 15: Update OPEN_THINGS and documentation

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`
- Modify: `docs/architecture/database.md` (if it exists — add scheduling tables)

- [ ] **Step 1: Update OPEN_THINGS.md**

Remove the "API surface" bullet from the product capabilities section. Add any new deferred items discovered during implementation (bulk import, Stundentafel cloning, audit trail, etc.).

- [ ] **Step 2: Update database.md**

Add documentation for the new scheduling tables, following the existing format.

- [ ] **Step 3: Final lint + full test run**

Run: `mise run lint && mise run test:py`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: update OPEN_THINGS and database docs for scheduling tables"
```
