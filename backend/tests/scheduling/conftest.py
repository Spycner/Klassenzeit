"""Shared factory fixtures for scheduling tests.

Each factory follows the ``_counter`` pattern for unique default names
and flushes (but never commits) within the per-test transaction so that
foreign-key constraints resolve before the next statement.

Auth helper fixtures (``create_test_user``, ``login_as``) are duplicated
here because pytest's ``--import-mode=importlib`` prevents cross-conftest
imports; fixtures must live in a conftest.py that is a direct ancestor of
the tests that use them.
"""

import uuid
from collections.abc import Awaitable, Callable
from datetime import time
from itertools import count

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.passwords import hash_password
from klassenzeit_backend.db.models.room import Room
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import Stundentafel, StundentafelEntry
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.models.week_scheme import TimeBlock, WeekScheme

# Type aliases for auth factory callables
type CreateUserFn = Callable[..., Awaitable[tuple[User, str]]]
type LoginFn = Callable[[str, str], Awaitable[None]]


@pytest.fixture
def create_test_user(db_session: AsyncSession) -> CreateUserFn:
    """Factory fixture: ``await create_test_user(email=..., password=...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a User row and flushes.
    """

    async def _create(
        *,
        email: str = "user@test.com",
        password: str = "testpassword123",  # noqa: S107
        role: str = "user",
        is_active: bool = True,
        force_password_change: bool = False,
    ) -> tuple[User, str]:
        """Create and flush a User with the given credentials.

        Args:
            email: The user's email address.
            password: Plain-text password (will be hashed).
            role: Either ``"user"`` or ``"admin"``.
            is_active: Whether the account is active.
            force_password_change: Whether the user must change password on next login.

        Returns:
            A tuple of (User ORM instance, plain-text password).
        """
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            role=role,
            is_active=is_active,
            force_password_change=force_password_change,
        )
        db_session.add(user)
        await db_session.flush()
        return user, password

    return _create


@pytest.fixture
def login_as(client: AsyncClient) -> LoginFn:
    """Factory fixture: ``await login_as(email, password)``.

    Args:
        client: The async test HTTP client (injected by pytest).

    Returns:
        An async callable that POSTs to /auth/login and asserts 204.
    """

    async def _login(email: str, password: str) -> None:
        """Authenticate the given user via /auth/login.

        Args:
            email: The user's email address.
            password: Plain-text password.
        """
        response = await client.post(
            "/auth/login",
            json={"email": email, "password": password},
        )
        assert response.status_code == 204, response.text

    return _login


# Type aliases for the factory callables
type CreateSubjectFn = Callable[..., Awaitable[Subject]]
type CreateWeekSchemeFn = Callable[..., Awaitable[WeekScheme]]
type CreateTimeBlockFn = Callable[..., Awaitable[TimeBlock]]
type CreateRoomFn = Callable[..., Awaitable[Room]]
type CreateTeacherFn = Callable[..., Awaitable[Teacher]]
type CreateStundentafelFn = Callable[..., Awaitable[Stundentafel]]
type CreateStundentafelEntryFn = Callable[..., Awaitable[StundentafelEntry]]
type CreateSchoolClassFn = Callable[..., Awaitable[SchoolClass]]

_subject_counter = count(1)
_week_scheme_counter = count(1)
_room_counter = count(1)
_teacher_counter = count(1)
_stundentafel_counter = count(1)
_school_class_counter = count(1)


@pytest.fixture
def create_subject(db_session: AsyncSession) -> CreateSubjectFn:
    """Factory fixture: ``await create_subject(name=..., short_name=...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a Subject row and flushes.
    """

    async def _create(
        *,
        name: str | None = None,
        short_name: str | None = None,
    ) -> Subject:
        """Create and flush a Subject with auto-generated unique defaults.

        Args:
            name: Subject name; auto-generated if omitted.
            short_name: Short abbreviation; auto-generated if omitted.

        Returns:
            The newly created Subject ORM instance.
        """
        n = next(_subject_counter)
        subject = Subject(
            name=name if name is not None else f"Subject {n}",
            short_name=short_name if short_name is not None else f"S{n}",
        )
        db_session.add(subject)
        await db_session.flush()
        return subject

    return _create


@pytest.fixture
def create_week_scheme(db_session: AsyncSession) -> CreateWeekSchemeFn:
    """Factory fixture: ``await create_week_scheme(name=..., description=...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a WeekScheme row and flushes.
    """

    async def _create(
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> WeekScheme:
        """Create and flush a WeekScheme with auto-generated unique defaults.

        Args:
            name: Scheme name; auto-generated if omitted.
            description: Optional free-text description.

        Returns:
            The newly created WeekScheme ORM instance.
        """
        n = next(_week_scheme_counter)
        scheme = WeekScheme(
            name=name if name is not None else f"Week Scheme {n}",
            description=description,
        )
        db_session.add(scheme)
        await db_session.flush()
        return scheme

    return _create


@pytest.fixture
def create_time_block(db_session: AsyncSession) -> CreateTimeBlockFn:
    """Factory fixture: ``await create_time_block(week_scheme_id=..., ...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a TimeBlock row and flushes.
    """

    async def _create(
        *,
        week_scheme_id: uuid.UUID,
        day_of_week: int = 0,
        position: int = 1,
        start_time: time = time(8, 0),
        end_time: time = time(8, 45),
    ) -> TimeBlock:
        """Create and flush a TimeBlock within a given WeekScheme.

        Args:
            week_scheme_id: FK to an existing WeekScheme.
            day_of_week: 0=Monday … 6=Sunday.
            position: Ordinal period position within the day.
            start_time: When the block starts.
            end_time: When the block ends.

        Returns:
            The newly created TimeBlock ORM instance.
        """
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
    """Factory fixture: ``await create_room(name=..., short_name=..., ...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a Room row and flushes.
    """

    async def _create(
        *,
        name: str | None = None,
        short_name: str | None = None,
        capacity: int | None = None,
        suitability_mode: str = "general",
    ) -> Room:
        """Create and flush a Room with auto-generated unique defaults.

        Args:
            name: Room name; auto-generated if omitted.
            short_name: Short label; auto-generated if omitted.
            capacity: Optional seating capacity.
            suitability_mode: Either ``"general"`` or ``"subject_specific"``.

        Returns:
            The newly created Room ORM instance.
        """
        n = next(_room_counter)
        room = Room(
            name=name if name is not None else f"Room {n}",
            short_name=short_name if short_name is not None else f"R{n}",
            capacity=capacity,
            suitability_mode=suitability_mode,
        )
        db_session.add(room)
        await db_session.flush()
        return room

    return _create


@pytest.fixture
def create_teacher(db_session: AsyncSession) -> CreateTeacherFn:
    """Factory fixture: ``await create_teacher(first_name=..., last_name=..., ...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a Teacher row and flushes.
    """

    async def _create(
        *,
        first_name: str = "Test",
        last_name: str | None = None,
        short_code: str | None = None,
        max_hours_per_week: int = 24,
    ) -> Teacher:
        """Create and flush a Teacher with auto-generated unique defaults.

        Args:
            first_name: Given name of the teacher.
            last_name: Family name; auto-generated if omitted.
            short_code: Unique abbreviation; auto-generated if omitted.
            max_hours_per_week: Maximum teaching hours per week.

        Returns:
            The newly created Teacher ORM instance.
        """
        n = next(_teacher_counter)
        teacher = Teacher(
            first_name=first_name,
            last_name=last_name if last_name is not None else f"Teacher{n}",
            short_code=short_code if short_code is not None else f"TC{n}",
            max_hours_per_week=max_hours_per_week,
        )
        db_session.add(teacher)
        await db_session.flush()
        return teacher

    return _create


@pytest.fixture
def create_stundentafel(db_session: AsyncSession) -> CreateStundentafelFn:
    """Factory fixture: ``await create_stundentafel(name=..., grade_level=...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a Stundentafel row and flushes.
    """

    async def _create(
        *,
        name: str | None = None,
        grade_level: int = 5,
    ) -> Stundentafel:
        """Create and flush a Stundentafel with auto-generated unique defaults.

        Args:
            name: Curriculum template name; auto-generated if omitted.
            grade_level: School year level (e.g. 5 for year 5).

        Returns:
            The newly created Stundentafel ORM instance.
        """
        n = next(_stundentafel_counter)
        tafel = Stundentafel(
            name=name if name is not None else f"Stundentafel {n}",
            grade_level=grade_level,
        )
        db_session.add(tafel)
        await db_session.flush()
        return tafel

    return _create


@pytest.fixture
def create_stundentafel_entry(db_session: AsyncSession) -> CreateStundentafelEntryFn:
    """Factory fixture: ``await create_stundentafel_entry(stundentafel_id=..., subject_id=...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a StundentafelEntry row and flushes.
    """

    async def _create(
        *,
        stundentafel_id: uuid.UUID,
        subject_id: uuid.UUID,
        hours_per_week: int = 4,
        preferred_block_size: int = 1,
    ) -> StundentafelEntry:
        """Create and flush a StundentafelEntry linking a subject to a curriculum.

        Args:
            stundentafel_id: FK to an existing Stundentafel.
            subject_id: FK to an existing Subject.
            hours_per_week: How many periods per week this subject occupies.
            preferred_block_size: Preferred consecutive-period block length.

        Returns:
            The newly created StundentafelEntry ORM instance.
        """
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
    """Factory fixture for creating a SchoolClass in the DB.

    Example: ``await create_school_class(stundentafel_id=..., week_scheme_id=...)``.

    Args:
        db_session: The per-test async DB session (injected by pytest).

    Returns:
        An async callable that inserts a SchoolClass row and flushes.
    """

    async def _create(
        *,
        name: str | None = None,
        grade_level: int = 5,
        stundentafel_id: uuid.UUID,
        week_scheme_id: uuid.UUID,
    ) -> SchoolClass:
        """Create and flush a SchoolClass with auto-generated unique defaults.

        Args:
            name: Class identifier such as ``"5a"``; auto-generated if omitted.
            grade_level: School year level.
            stundentafel_id: FK to an existing Stundentafel.
            week_scheme_id: FK to an existing WeekScheme.

        Returns:
            The newly created SchoolClass ORM instance.
        """
        n = next(_school_class_counter)
        school_class = SchoolClass(
            name=name if name is not None else f"Class{n}",
            grade_level=grade_level,
            stundentafel_id=stundentafel_id,
            week_scheme_id=week_scheme_id,
        )
        db_session.add(school_class)
        await db_session.flush()
        return school_class

    return _create
