"""Heuristic teacher assignment for newly generated lessons.

Today's heuristic: process lessons in scarcity order (subjects with the
fewest qualified teachers first, then input order as a stable tiebreak)
and for each pick the first qualified active teacher (ordered by
``(short_code, id)``) whose remaining weekly capacity covers the lesson's
``hours_per_week``. Scarcity-first ensures subjects with a single
qualified teacher claim that teacher's capacity before broader subjects
fill it greedily. The function is pure: callers load the snapshot from
the DB, pass it in, and apply the returned assignments themselves.

The richer pre-pass referenced by the active-sprint algorithm phase
(FFD ordering plus soft-constraint LAHC) will replace this walk; the
function signature is the only stable contract the route relies on.
"""

import uuid
from collections.abc import Iterable

from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.teacher import Teacher


def auto_assign_teachers_for_lessons(
    lessons: Iterable[Lesson],
    teachers: list[Teacher],
    qualified_teacher_ids_by_subject: dict[uuid.UUID, set[uuid.UUID]],
    capacity_used_by_teacher: dict[uuid.UUID, int],
) -> dict[uuid.UUID, uuid.UUID]:
    """Assign one qualified teacher per lesson respecting weekly hour caps.

    Pure function: takes a fully-loaded snapshot, returns a mapping
    ``{lesson_id: teacher_id}`` for the lessons that received an assignment.
    Lessons with no eligible candidate are absent from the returned dict.

    Lessons are processed in ascending order of qualified-teacher count
    for the lesson's subject, with a stable tiebreak on input order. This
    lets a subject with a single qualified teacher claim that teacher's
    capacity before broader subjects fill it greedily.

    Args:
        lessons: New lessons to assign. Input order is preserved as the
            stable tiebreak when two lessons have the same qualified-
            teacher count.
        teachers: Active teachers, pre-ordered by ``(short_code, id)``.
            Inactive teachers must be filtered out by the caller.
        qualified_teacher_ids_by_subject: For each lesson's ``subject_id``,
            the set of teacher_ids qualified for that subject.
        capacity_used_by_teacher: Hours already committed per teacher
            across the whole school. The caller's dict is not mutated;
            the helper works on a local copy.

    Returns:
        ``{lesson_id: teacher_id}`` for assigned lessons. Lessons whose
        subject has no qualified teacher, or whose qualified teachers all
        lack remaining capacity, are absent from the result.
    """
    used = dict(capacity_used_by_teacher)
    assignments: dict[uuid.UUID, uuid.UUID] = {}
    ordered_lessons = sorted(
        lessons,
        key=lambda lesson: len(qualified_teacher_ids_by_subject.get(lesson.subject_id, set())),
    )
    for lesson in ordered_lessons:
        qualified_ids = qualified_teacher_ids_by_subject.get(lesson.subject_id, set())
        if not qualified_ids:
            continue
        for teacher in teachers:
            if teacher.id not in qualified_ids:
                continue
            spare = teacher.max_hours_per_week - used.get(teacher.id, 0)
            if spare >= lesson.hours_per_week:
                assignments[lesson.id] = teacher.id
                used[teacher.id] = used.get(teacher.id, 0) + lesson.hours_per_week
                break
    return assignments
