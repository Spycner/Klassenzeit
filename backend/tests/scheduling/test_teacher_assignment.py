"""Unit tests for ``auto_assign_teachers_for_lessons``."""

import uuid

from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.teacher import Teacher
from klassenzeit_backend.scheduling.teacher_assignment import (
    auto_assign_teachers_for_lessons,
)


def _teacher(short_code: str, max_hours: int, teacher_id: uuid.UUID | None = None) -> Teacher:
    return Teacher(
        id=teacher_id or uuid.uuid4(),
        first_name="Test",
        last_name=short_code,
        short_code=short_code,
        max_hours_per_week=max_hours,
        is_active=True,
    )


def _lesson(subject_id: uuid.UUID, hours: int, lesson_id: uuid.UUID | None = None) -> Lesson:
    return Lesson(
        id=lesson_id or uuid.uuid4(),
        school_class_id=uuid.uuid4(),
        subject_id=subject_id,
        teacher_id=None,
        hours_per_week=hours,
        preferred_block_size=1,
    )


def test_auto_assign_happy_path() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {lesson.id: teacher.id}


def test_auto_assign_orders_by_short_code() -> None:
    subject_id = uuid.uuid4()
    teacher_a = _teacher("AAA", 28)
    teacher_b = _teacher("BBB", 28)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher_a, teacher_b],
        qualified_teacher_ids_by_subject={subject_id: {teacher_a.id, teacher_b.id}},
        capacity_used_by_teacher={teacher_a.id: 0, teacher_b.id: 0},
    )

    assert assignments == {lesson.id: teacher_a.id}


def test_auto_assign_falls_through_on_capacity_overflow() -> None:
    subject_id = uuid.uuid4()
    teacher_a = _teacher("AAA", 5)
    teacher_b = _teacher("BBB", 28)
    lesson = _lesson(subject_id, 6)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher_a, teacher_b],
        qualified_teacher_ids_by_subject={subject_id: {teacher_a.id, teacher_b.id}},
        capacity_used_by_teacher={teacher_a.id: 0, teacher_b.id: 0},
    )

    assert assignments == {lesson.id: teacher_b.id}


def test_auto_assign_leaves_lesson_unassigned_when_no_qualified_teacher() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: set()},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {}


def test_auto_assign_leaves_lesson_unassigned_when_subject_missing_from_map() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {}


def test_auto_assign_leaves_lesson_unassigned_when_all_qualified_teachers_full() -> None:
    subject_id = uuid.uuid4()
    teacher_a = _teacher("AAA", 4)
    teacher_b = _teacher("BBB", 4)
    lesson = _lesson(subject_id, 5)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher_a, teacher_b],
        qualified_teacher_ids_by_subject={subject_id: {teacher_a.id, teacher_b.id}},
        capacity_used_by_teacher={teacher_a.id: 0, teacher_b.id: 0},
    )

    assert assignments == {}


def test_auto_assign_multiple_lessons_share_one_teacher_up_to_cap() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lessons = [_lesson(subject_id, 5), _lesson(subject_id, 5), _lesson(subject_id, 5)]

    assignments = auto_assign_teachers_for_lessons(
        lessons=lessons,
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {
        lessons[0].id: teacher.id,
        lessons[1].id: teacher.id,
        lessons[2].id: teacher.id,
    }


def test_auto_assign_in_flight_capacity_exceeds_cap_for_third_lesson() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 25)
    lessons = [_lesson(subject_id, 10), _lesson(subject_id, 10), _lesson(subject_id, 10)]

    assignments = auto_assign_teachers_for_lessons(
        lessons=lessons,
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher={teacher.id: 0},
    )

    assert assignments == {lessons[0].id: teacher.id, lessons[1].id: teacher.id}


def test_auto_assign_pre_existing_capacity_blocks_first_choice() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson_too_big = _lesson(subject_id, 3)
    lesson_fits = _lesson(subject_id, 2)

    used = {teacher.id: 26}
    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson_too_big, lesson_fits],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher=used,
    )

    assert assignments == {lesson_fits.id: teacher.id}


def test_auto_assign_does_not_mutate_callers_capacity_dict() -> None:
    subject_id = uuid.uuid4()
    teacher = _teacher("AAA", 28)
    lesson = _lesson(subject_id, 4)
    used = {teacher.id: 0}
    used_before = dict(used)

    auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher],
        qualified_teacher_ids_by_subject={subject_id: {teacher.id}},
        capacity_used_by_teacher=used,
    )

    assert used == used_before


def test_auto_assign_stable_tiebreak_on_id() -> None:
    subject_id = uuid.uuid4()
    lower_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    higher_id = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")
    teacher_low = _teacher("XXX", 28, teacher_id=lower_id)
    teacher_high = _teacher("XXX", 28, teacher_id=higher_id)
    lesson = _lesson(subject_id, 4)

    assignments = auto_assign_teachers_for_lessons(
        lessons=[lesson],
        teachers=[teacher_low, teacher_high],
        qualified_teacher_ids_by_subject={subject_id: {teacher_low.id, teacher_high.id}},
        capacity_used_by_teacher={teacher_low.id: 0, teacher_high.id: 0},
    )

    assert assignments == {lesson.id: teacher_low.id}


def test_auto_assign_scarce_subject_claims_shared_teacher_first() -> None:
    """Subject with one qualified teacher claims that teacher's capacity before
    a broader subject sharing the teacher fills it greedily."""
    scarce_subject = uuid.uuid4()
    broad_subject = uuid.uuid4()
    shared_teacher = _teacher("AAA", 4)
    backup_teacher = _teacher("BBB", 28)
    scarce_lesson = _lesson(scarce_subject, 2)
    broad_lesson_filling_first = _lesson(broad_subject, 4)

    assignments = auto_assign_teachers_for_lessons(
        # Input order has the broad lesson first; without scarcity-priority
        # the shared teacher would be filled by the broad lesson and the
        # scarce lesson would have no qualified teacher with spare capacity.
        lessons=[broad_lesson_filling_first, scarce_lesson],
        teachers=[shared_teacher, backup_teacher],
        qualified_teacher_ids_by_subject={
            scarce_subject: {shared_teacher.id},
            broad_subject: {shared_teacher.id, backup_teacher.id},
        },
        capacity_used_by_teacher={shared_teacher.id: 0, backup_teacher.id: 0},
    )

    assert assignments == {
        scarce_lesson.id: shared_teacher.id,
        broad_lesson_filling_first.id: backup_teacher.id,
    }
