"""CRUD routes for the Lesson entity, plus the generate-lessons endpoint."""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import require_admin
from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.db.models.stundentafel import StundentafelEntry
from klassenzeit_backend.db.models.subject import Subject
from klassenzeit_backend.db.models.teacher import Teacher, TeacherQualification
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session
from klassenzeit_backend.scheduling.schemas.lesson import (
    LessonClassResponse,
    LessonCreate,
    LessonResponse,
    LessonSubjectResponse,
    LessonTeacherResponse,
    LessonUpdate,
)
from klassenzeit_backend.scheduling.teacher_assignment import (
    auto_assign_teachers_for_lessons,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lessons", tags=["lessons"])
generate_router = APIRouter(tags=["lessons"])


async def _get_lesson(db: AsyncSession, lesson_id: uuid.UUID) -> Lesson:
    """Load a Lesson by primary key or raise 404.

    Args:
        db: Active async database session.
        lesson_id: UUID of the lesson to load.

    Returns:
        The matching Lesson ORM instance.

    Raises:
        HTTPException: 404 if no lesson with that ID exists.
    """
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return lesson


async def _build_lesson_response(db: AsyncSession, lesson: Lesson) -> LessonResponse:
    """Construct a LessonResponse by loading related class, subject and teacher.

    Args:
        db: Active async database session.
        lesson: The Lesson ORM instance to build a response for.

    Returns:
        A fully populated LessonResponse including nested entities.
    """
    class_result = await db.execute(
        select(SchoolClass).where(SchoolClass.id == lesson.school_class_id)
    )
    school_class = class_result.scalar_one()

    subj_result = await db.execute(select(Subject).where(Subject.id == lesson.subject_id))
    subject = subj_result.scalar_one()

    teacher_resp = None
    if lesson.teacher_id:
        teacher_result = await db.execute(select(Teacher).where(Teacher.id == lesson.teacher_id))
        teacher = teacher_result.scalar_one()
        teacher_resp = LessonTeacherResponse(
            id=teacher.id,
            first_name=teacher.first_name,
            last_name=teacher.last_name,
            short_code=teacher.short_code,
        )

    return LessonResponse(
        id=lesson.id,
        school_class=LessonClassResponse(id=school_class.id, name=school_class.name),
        subject=LessonSubjectResponse(
            id=subject.id,
            name=subject.name,
            short_name=subject.short_name,
        ),
        teacher=teacher_resp,
        hours_per_week=lesson.hours_per_week,
        preferred_block_size=lesson.preferred_block_size,
        created_at=lesson.created_at,
        updated_at=lesson.updated_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_lesson(
    body: LessonCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> LessonResponse:
    """Create a new lesson linking a class, subject and optional teacher.

    Args:
        body: Fields for the new lesson.
        _admin: Injected admin user (enforces authentication).
        db: Injected async database session.

    Returns:
        The created lesson as a LessonResponse.

    Raises:
        HTTPException: 409 if a lesson for this class+subject pair already exists.
    """
    lesson = Lesson(
        school_class_id=body.school_class_id,
        subject_id=body.subject_id,
        teacher_id=body.teacher_id,
        hours_per_week=body.hours_per_week,
        preferred_block_size=body.preferred_block_size,
    )
    db.add(lesson)
    try:
        await db.commit()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A lesson for this class and subject already exists.",
        ) from exc
    await db.refresh(lesson)
    return await _build_lesson_response(db, lesson)


@router.get("")
async def list_lessons(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
    class_id: uuid.UUID | None = None,
    teacher_id: uuid.UUID | None = None,
    subject_id: uuid.UUID | None = None,
) -> list[LessonResponse]:
    """Return all lessons, with optional filters by class, teacher or subject.

    Args:
        _admin: Injected admin user (enforces authentication).
        db: Injected async database session.
        class_id: Optional filter — only lessons for this school class.
        teacher_id: Optional filter — only lessons assigned to this teacher.
        subject_id: Optional filter — only lessons for this subject.

    Returns:
        List of lessons matching the applied filters.
    """
    stmt = select(Lesson)
    if class_id is not None:
        stmt = stmt.where(Lesson.school_class_id == class_id)
    if teacher_id is not None:
        stmt = stmt.where(Lesson.teacher_id == teacher_id)
    if subject_id is not None:
        stmt = stmt.where(Lesson.subject_id == subject_id)
    result = await db.execute(stmt)
    lessons = result.scalars().all()
    return [await _build_lesson_response(db, lesson) for lesson in lessons]


@router.get("/{lesson_id}")
async def get_lesson(
    lesson_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> LessonResponse:
    """Fetch a single lesson by ID with joined class, subject and teacher data.

    Args:
        lesson_id: UUID path parameter identifying the lesson.
        _admin: Injected admin user (enforces authentication).
        db: Injected async database session.

    Returns:
        The matching lesson as a LessonResponse.

    Raises:
        HTTPException: 404 if no lesson with that ID exists.
    """
    lesson = await _get_lesson(db, lesson_id)
    return await _build_lesson_response(db, lesson)


@router.patch("/{lesson_id}")
async def update_lesson(
    lesson_id: uuid.UUID,
    body: LessonUpdate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> LessonResponse:
    """Partially update a lesson's teacher, hours or preferred block size.

    Args:
        lesson_id: UUID path parameter identifying the lesson to patch.
        body: Fields to update; omitted fields remain unchanged.
        _admin: Injected admin user (enforces authentication).
        db: Injected async database session.

    Returns:
        The updated lesson as a LessonResponse.

    Raises:
        HTTPException: 404 if no lesson with that ID exists.
    """
    lesson = await _get_lesson(db, lesson_id)
    if body.teacher_id is not None:
        lesson.teacher_id = body.teacher_id
    if body.hours_per_week is not None:
        lesson.hours_per_week = body.hours_per_week
    if body.preferred_block_size is not None:
        lesson.preferred_block_size = body.preferred_block_size
    await db.commit()
    await db.refresh(lesson)
    return await _build_lesson_response(db, lesson)


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(
    lesson_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """Delete a lesson by ID.

    Args:
        lesson_id: UUID path parameter identifying the lesson to delete.
        _admin: Injected admin user (enforces authentication).
        db: Injected async database session.

    Raises:
        HTTPException: 404 if no lesson with that ID exists.
    """
    lesson = await _get_lesson(db, lesson_id)
    await db.delete(lesson)
    await db.commit()


@generate_router.post("/classes/{class_id}/generate-lessons", status_code=status.HTTP_201_CREATED)
async def generate_lessons_from_stundentafel(
    class_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> list[LessonResponse]:
    """Bulk-create lessons for a class from its associated Stundentafel.

    Only creates lessons for subjects not already assigned to the class.
    Subjects that already have a lesson are silently skipped.

    Args:
        class_id: UUID path parameter identifying the school class.
        _admin: Injected admin user (enforces authentication).
        db: Injected async database session.

    Returns:
        List of newly created LessonResponse objects (may be empty if all exist).

    Raises:
        HTTPException: 404 if no school class with that ID exists.
    """
    result = await db.execute(select(SchoolClass).where(SchoolClass.id == class_id))
    school_class = result.scalar_one_or_none()
    if school_class is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")

    entries_result = await db.execute(
        select(StundentafelEntry)
        .where(StundentafelEntry.stundentafel_id == school_class.stundentafel_id)
        .order_by(StundentafelEntry.subject_id)
    )
    entries = entries_result.scalars().all()

    existing_result = await db.execute(
        select(Lesson.subject_id).where(Lesson.school_class_id == class_id)
    )
    existing_subject_ids = {row[0] for row in existing_result.all()}

    created: list[Lesson] = []
    for entry in entries:
        if entry.subject_id in existing_subject_ids:
            continue
        lesson = Lesson(
            school_class_id=class_id,
            subject_id=entry.subject_id,
            teacher_id=None,
            hours_per_week=entry.hours_per_week,
            preferred_block_size=entry.preferred_block_size,
        )
        db.add(lesson)
        created.append(lesson)

    await db.flush()

    teachers_result = await db.execute(
        select(Teacher).where(Teacher.is_active.is_(True)).order_by(Teacher.short_code, Teacher.id)
    )
    teachers = list(teachers_result.scalars().all())

    quals_result = await db.execute(
        select(TeacherQualification.subject_id, TeacherQualification.teacher_id)
    )
    qualified_teacher_ids_by_subject: dict[uuid.UUID, set[uuid.UUID]] = {}
    for subject_id, teacher_id in quals_result.all():
        qualified_teacher_ids_by_subject.setdefault(subject_id, set()).add(teacher_id)

    used_result = await db.execute(
        select(Lesson.teacher_id, func.sum(Lesson.hours_per_week))
        .where(Lesson.teacher_id.is_not(None))
        .group_by(Lesson.teacher_id)
    )
    capacity_used_by_teacher: dict[uuid.UUID, int] = {
        row[0]: int(row[1] or 0) for row in used_result.all()
    }
    for teacher in teachers:
        capacity_used_by_teacher.setdefault(teacher.id, 0)

    assignments = auto_assign_teachers_for_lessons(
        lessons=created,
        teachers=teachers,
        qualified_teacher_ids_by_subject=qualified_teacher_ids_by_subject,
        capacity_used_by_teacher=capacity_used_by_teacher,
    )
    for lesson in created:
        teacher_id = assignments.get(lesson.id)
        if teacher_id is not None:
            lesson.teacher_id = teacher_id

    await db.commit()

    logger.info(
        "generate_lessons.done",
        extra={
            "school_class_id": str(class_id),
            "lessons_created": len(created),
            "teachers_assigned": len(assignments),
        },
    )

    responses = []
    for lesson in created:
        await db.refresh(lesson)
        responses.append(await _build_lesson_response(db, lesson))
    return responses
