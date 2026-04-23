//! Greedy first-fit timetable solver. Iterates lessons, hours, time blocks, rooms
//! in caller-provided order; commits the first candidate that satisfies every hard
//! constraint. Placement failures become `UnplacedLesson` violations inside
//! `Solution`; `Err(Error::Input)` is reserved for structural input errors.

use std::collections::{HashMap, HashSet};

use crate::error::Error;
use crate::ids::{RoomId, SchoolClassId, TeacherId, TimeBlockId};
use crate::index::Indexed;
use crate::types::{Lesson, Placement, Problem, Solution, Violation, ViolationKind};
use crate::validate::{pre_solve_violations, validate_structural};

/// Solve the timetable problem using greedy first-fit placement.
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    validate_structural(problem)?;

    let idx = Indexed::new(problem);
    let mut solution = Solution {
        placements: Vec::new(),
        violations: pre_solve_violations(problem),
    };

    let mut used_teacher: HashSet<(TeacherId, TimeBlockId)> = HashSet::new();
    let mut used_class: HashSet<(SchoolClassId, TimeBlockId)> = HashSet::new();
    let mut used_room: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
    let mut hours_by_teacher: HashMap<TeacherId, u8> = HashMap::new();

    let teacher_max: HashMap<TeacherId, u8> = problem
        .teachers
        .iter()
        .map(|t| (t.id, t.max_hours_per_week))
        .collect();

    for lesson in &problem.lessons {
        // Skip placements for lessons with pre-solve violations; `pre_solve_violations`
        // already recorded one violation per hour.
        if !idx.teacher_qualified(lesson.teacher_id, lesson.subject_id) {
            continue;
        }

        for hour_index in 0..lesson.hours_per_week {
            let placed = try_place_hour(
                problem,
                lesson,
                &idx,
                &teacher_max,
                &mut used_teacher,
                &mut used_class,
                &mut used_room,
                &mut hours_by_teacher,
                &mut solution.placements,
            );
            if !placed {
                solution.violations.push(Violation {
                    kind: ViolationKind::UnplacedLesson,
                    lesson_id: lesson.id,
                    hour_index,
                    message: unplaced_reason(
                        problem,
                        lesson,
                        &idx,
                        &teacher_max,
                        &used_teacher,
                        &used_class,
                        &used_room,
                        &hours_by_teacher,
                    ),
                });
            }
        }
    }

    Ok(solution)
}

#[allow(clippy::too_many_arguments)] // Reason: internal helper; refactoring to a struct hurts clarity more than it helps
fn try_place_hour(
    problem: &Problem,
    lesson: &Lesson,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    used_teacher: &mut HashSet<(TeacherId, TimeBlockId)>,
    used_class: &mut HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &mut HashSet<(RoomId, TimeBlockId)>,
    hours_by_teacher: &mut HashMap<TeacherId, u8>,
    placements: &mut Vec<Placement>,
) -> bool {
    for tb in &problem.time_blocks {
        if used_teacher.contains(&(lesson.teacher_id, tb.id)) {
            continue;
        }
        if used_class.contains(&(lesson.school_class_id, tb.id)) {
            continue;
        }
        if idx.teacher_blocked(lesson.teacher_id, tb.id) {
            continue;
        }
        let current = hours_by_teacher
            .get(&lesson.teacher_id)
            .copied()
            .unwrap_or(0);
        let max = teacher_max.get(&lesson.teacher_id).copied().unwrap_or(0);
        if current.saturating_add(1) > max {
            continue;
        }

        for room in &problem.rooms {
            if used_room.contains(&(room.id, tb.id)) {
                continue;
            }
            if !idx.room_suits_subject(room.id, lesson.subject_id) {
                continue;
            }
            if idx.room_blocked(room.id, tb.id) {
                continue;
            }

            placements.push(Placement {
                lesson_id: lesson.id,
                time_block_id: tb.id,
                room_id: room.id,
            });
            used_teacher.insert((lesson.teacher_id, tb.id));
            used_class.insert((lesson.school_class_id, tb.id));
            used_room.insert((room.id, tb.id));
            *hours_by_teacher.entry(lesson.teacher_id).or_insert(0) += 1;
            return true;
        }
    }
    false
}

#[allow(clippy::too_many_arguments)] // Reason: diagnostic-only helper; arguments mirror try_place_hour for parity
fn unplaced_reason(
    problem: &Problem,
    lesson: &Lesson,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    used_teacher: &HashSet<(TeacherId, TimeBlockId)>,
    used_class: &HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &HashSet<(RoomId, TimeBlockId)>,
    hours_by_teacher: &HashMap<TeacherId, u8>,
) -> String {
    let current = hours_by_teacher
        .get(&lesson.teacher_id)
        .copied()
        .unwrap_or(0);
    let max = teacher_max.get(&lesson.teacher_id).copied().unwrap_or(0);
    if current >= max {
        return format!(
            "teacher {} already at max_hours_per_week ({})",
            lesson.teacher_id.0, max
        );
    }

    let any_slot_open = problem.time_blocks.iter().any(|tb| {
        !used_teacher.contains(&(lesson.teacher_id, tb.id))
            && !used_class.contains(&(lesson.school_class_id, tb.id))
            && !idx.teacher_blocked(lesson.teacher_id, tb.id)
    });
    if !any_slot_open {
        return "no free time_block for teacher and class".to_string();
    }
    let any_room_open = problem.time_blocks.iter().any(|tb| {
        problem.rooms.iter().any(|room| {
            !used_room.contains(&(room.id, tb.id))
                && idx.room_suits_subject(room.id, lesson.subject_id)
                && !idx.room_blocked(room.id, tb.id)
        })
    });
    if !any_room_open {
        return "no suitable room available at any time_block".to_string();
    }
    "no viable (time_block, room) combination".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
    use crate::types::{
        Lesson, Problem, Room, RoomBlockedTime, RoomSubjectSuitability, SchoolClass, Subject,
        Teacher, TeacherBlockedTime, TeacherQualification, TimeBlock,
    };
    use uuid::Uuid;

    fn solve_uuid(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    fn base_problem() -> Problem {
        Problem {
            time_blocks: vec![
                TimeBlock {
                    id: TimeBlockId(solve_uuid(10)),
                    day_of_week: 0,
                    position: 0,
                },
                TimeBlock {
                    id: TimeBlockId(solve_uuid(11)),
                    day_of_week: 0,
                    position: 1,
                },
            ],
            teachers: vec![Teacher {
                id: TeacherId(solve_uuid(20)),
                max_hours_per_week: 10,
            }],
            rooms: vec![Room {
                id: RoomId(solve_uuid(30)),
            }],
            subjects: vec![Subject {
                id: SubjectId(solve_uuid(40)),
            }],
            school_classes: vec![SchoolClass {
                id: SchoolClassId(solve_uuid(50)),
            }],
            lessons: vec![Lesson {
                id: LessonId(solve_uuid(60)),
                school_class_id: SchoolClassId(solve_uuid(50)),
                subject_id: SubjectId(solve_uuid(40)),
                teacher_id: TeacherId(solve_uuid(20)),
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: TeacherId(solve_uuid(20)),
                subject_id: SubjectId(solve_uuid(40)),
            }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        }
    }

    #[test]
    fn single_hour_places_into_first_slot_and_room() {
        let s = solve(&base_problem()).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.placements[0].time_block_id, TimeBlockId(solve_uuid(10)));
        assert_eq!(s.placements[0].room_id, RoomId(solve_uuid(30)));
        assert!(s.violations.is_empty());
    }

    #[test]
    fn unqualified_teacher_emits_violation_and_skips_placement() {
        let mut p = base_problem();
        p.teacher_qualifications.clear();
        let s = solve(&p).unwrap();
        assert!(s.placements.is_empty());
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::NoQualifiedTeacher);
    }

    #[test]
    fn teacher_blocked_time_prevents_placement_there() {
        let mut p = base_problem();
        p.teacher_blocked_times.push(TeacherBlockedTime {
            teacher_id: TeacherId(solve_uuid(20)),
            time_block_id: TimeBlockId(solve_uuid(10)),
        });
        let s = solve(&p).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.placements[0].time_block_id, TimeBlockId(solve_uuid(11)));
    }

    #[test]
    fn room_unsuitable_for_subject_is_skipped() {
        let mut p = base_problem();
        // Mark the sole room as suitable only for an unrelated subject, but add that
        // subject to keep validation happy. Room now suits no subject we place.
        p.subjects.push(Subject {
            id: SubjectId(solve_uuid(41)),
        });
        p.room_subject_suitabilities.push(RoomSubjectSuitability {
            room_id: RoomId(solve_uuid(30)),
            subject_id: SubjectId(solve_uuid(41)),
        });
        let s = solve(&p).unwrap();
        assert!(s.placements.is_empty());
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::UnplacedLesson);
    }

    #[test]
    fn room_blocked_time_pushes_placement_to_next_slot() {
        let mut p = base_problem();
        p.room_blocked_times.push(RoomBlockedTime {
            room_id: RoomId(solve_uuid(30)),
            time_block_id: TimeBlockId(solve_uuid(10)),
        });
        let s = solve(&p).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.placements[0].time_block_id, TimeBlockId(solve_uuid(11)));
    }

    #[test]
    fn teacher_max_hours_cap_emits_unplaced_violation() {
        let mut p = base_problem();
        p.teachers[0].max_hours_per_week = 0;
        let s = solve(&p).unwrap();
        assert!(s.placements.is_empty());
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::UnplacedLesson);
        assert!(s.violations[0].message.contains("max_hours_per_week"));
    }

    #[test]
    fn two_lessons_in_same_class_do_not_double_book_slot() {
        let mut p = base_problem();
        p.subjects.push(Subject {
            id: SubjectId(solve_uuid(41)),
        });
        p.teacher_qualifications.push(TeacherQualification {
            teacher_id: TeacherId(solve_uuid(20)),
            subject_id: SubjectId(solve_uuid(41)),
        });
        p.lessons.push(Lesson {
            id: LessonId(solve_uuid(61)),
            school_class_id: SchoolClassId(solve_uuid(50)),
            subject_id: SubjectId(solve_uuid(41)),
            teacher_id: TeacherId(solve_uuid(20)),
            hours_per_week: 1,
        });
        let s = solve(&p).unwrap();
        assert_eq!(s.placements.len(), 2);
        assert_ne!(s.placements[0].time_block_id, s.placements[1].time_block_id);
    }

    #[test]
    fn two_rooms_used_in_parallel_for_different_classes_in_same_slot() {
        let mut p = base_problem();
        // second class with its own lesson
        p.school_classes.push(SchoolClass {
            id: SchoolClassId(solve_uuid(51)),
        });
        p.teachers.push(Teacher {
            id: TeacherId(solve_uuid(21)),
            max_hours_per_week: 10,
        });
        p.teacher_qualifications.push(TeacherQualification {
            teacher_id: TeacherId(solve_uuid(21)),
            subject_id: SubjectId(solve_uuid(40)),
        });
        p.rooms.push(Room {
            id: RoomId(solve_uuid(31)),
        });
        p.lessons.push(Lesson {
            id: LessonId(solve_uuid(61)),
            school_class_id: SchoolClassId(solve_uuid(51)),
            subject_id: SubjectId(solve_uuid(40)),
            teacher_id: TeacherId(solve_uuid(21)),
            hours_per_week: 1,
        });
        let s = solve(&p).unwrap();
        assert_eq!(s.placements.len(), 2);
        // both placements happened in the first slot but in different rooms
        assert_eq!(s.placements[0].time_block_id, s.placements[1].time_block_id);
        assert_ne!(s.placements[0].room_id, s.placements[1].room_id);
    }

    #[test]
    fn structural_error_returns_err_input() {
        let mut p = base_problem();
        p.time_blocks.clear();
        let err = solve(&p).unwrap_err();
        assert!(matches!(err, Error::Input(_)));
    }
}
