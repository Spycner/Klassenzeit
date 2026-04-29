//! First Fit Decreasing greedy timetable solver. Sorts lessons by
//! eligibility (most constrained first) via `ordering::ffd_order`, then
//! commits the first hard-constraint-satisfying (time block, room) for each
//! lesson-hour. Placement failures become typed violations
//! (`TeacherOverCapacity`, `NoFreeTimeBlock`, `NoSuitableRoom`) inside
//! `Solution`; `Err(Error::Input)` is reserved for structural input errors.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use crate::error::Error;
use crate::ids::{RoomId, SchoolClassId, TeacherId, TimeBlockId};
use crate::index::Indexed;
use crate::types::{
    ConstraintWeights, Lesson, Placement, Problem, Solution, SolveConfig, Violation, ViolationKind,
};
use crate::validate::{pre_solve_violations, validate_structural};

/// Solve the timetable problem using lowest-delta greedy placement followed
/// by a 200ms LAHC local-search pass. Active default soft-constraint weights
/// are `class_gap = teacher_gap = prefer_early_period = avoid_first_period = 1`.
/// Callers wanting greedy-only behaviour (no LAHC pass) construct their own
/// [`SolveConfig`] with `deadline: None` and call [`solve_with_config`] directly.
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    let active_default = SolveConfig {
        weights: ConstraintWeights {
            class_gap: 1,
            teacher_gap: 1,
            prefer_early_period: 1,
            avoid_first_period: 1,
        },
        deadline: Some(Duration::from_millis(200)),
        ..SolveConfig::default()
    };
    solve_with_config(problem, &active_default)
}

/// Solve the timetable problem with explicit configuration. Iterates lessons
/// in FFD order; for each lesson-hour, picks the hard-feasible
/// `(time_block, room)` candidate that minimises the running soft-score
/// (sum of weighted gap-hours per `(class, day)` and `(teacher, day)`
/// partition).
pub fn solve_with_config(problem: &Problem, config: &SolveConfig) -> Result<Solution, Error> {
    validate_structural(problem)?;

    let idx = Indexed::new(problem);
    let mut solution = Solution {
        placements: Vec::new(),
        violations: pre_solve_violations(problem),
        soft_score: 0,
    };

    let mut state = GreedyState::new();
    let teacher_max: HashMap<TeacherId, u8> = problem
        .teachers
        .iter()
        .map(|t| (t.id, t.max_hours_per_week))
        .collect();

    // Iterate time-blocks in (day, position) order and rooms in id order so
    // the lowest-delta picker can prune later candidates whose tiebreak rank
    // they could no longer beat. Sorting once amortises across all placements.
    let mut tb_order: Vec<usize> = (0..problem.time_blocks.len()).collect();
    tb_order.sort_unstable_by_key(|&i| {
        let tb = &problem.time_blocks[i];
        (tb.day_of_week, tb.position, tb.id.0)
    });
    let mut room_order: Vec<usize> = (0..problem.rooms.len()).collect();
    room_order.sort_unstable_by_key(|&i| problem.rooms[i].id.0);

    let order = crate::ordering::ffd_order(problem, &idx);
    for &lesson_idx in &order {
        let lesson = &problem.lessons[lesson_idx];
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
                &config.weights,
                &mut state,
                &mut solution.placements,
                &tb_order,
                &room_order,
            );
            if !placed {
                solution.violations.push(Violation {
                    kind: unplaced_kind(
                        problem,
                        lesson,
                        &idx,
                        &teacher_max,
                        &state.used_teacher,
                        &state.used_class,
                        &state.hours_by_teacher,
                    ),
                    lesson_id: lesson.id,
                    hour_index,
                });
            }
        }
    }

    crate::lahc::run(
        problem,
        &idx,
        config,
        &mut solution.placements,
        &mut state.class_positions,
        &mut state.teacher_positions,
        &mut state.used_teacher,
        &mut state.used_class,
        &mut state.used_room,
        &mut state.soft_score,
    );

    solution.soft_score = state.soft_score;
    Ok(solution)
}

/// Mutable bookkeeping shared across all lesson-hour placements during one
/// greedy solve. Hard-constraint sets prevent double-booking; partition maps
/// and `soft_score` enable O(1) candidate scoring without reiterating placed
/// lessons.
struct GreedyState {
    used_teacher: HashSet<(TeacherId, TimeBlockId)>,
    used_class: HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: HashSet<(RoomId, TimeBlockId)>,
    hours_by_teacher: HashMap<TeacherId, u8>,
    class_positions: HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: HashMap<(TeacherId, u8), Vec<u8>>,
    soft_score: u32,
}

impl GreedyState {
    fn new() -> Self {
        Self {
            used_teacher: HashSet::new(),
            used_class: HashSet::new(),
            used_room: HashSet::new(),
            hours_by_teacher: HashMap::new(),
            class_positions: HashMap::new(),
            teacher_positions: HashMap::new(),
            soft_score: 0,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct Candidate {
    tb_id: TimeBlockId,
    room_id: RoomId,
    day: u8,
    position: u8,
    score: u32,
}

fn candidate_score(
    state: &GreedyState,
    class: SchoolClassId,
    teacher: TeacherId,
    day: u8,
    pos: u8,
    weights: &ConstraintWeights,
    subject_pref: u32,
) -> u32 {
    let class_partition = state.class_positions.get(&(class, day));
    let teacher_partition = state.teacher_positions.get(&(teacher, day));
    let class_old = gap_count_partition(class_partition).saturating_mul(weights.class_gap);
    let teacher_old = gap_count_partition(teacher_partition).saturating_mul(weights.teacher_gap);
    let class_new = crate::score::gap_count_after_insert(class_partition, pos)
        .saturating_mul(weights.class_gap);
    let teacher_new = crate::score::gap_count_after_insert(teacher_partition, pos)
        .saturating_mul(weights.teacher_gap);
    // Invariant: state.soft_score >= class_old + teacher_old (each partition's
    // contribution is part of the running sum). u32 subtraction is safe.
    state.soft_score - class_old - teacher_old + class_new + teacher_new + subject_pref
}

fn gap_count_partition(positions: Option<&Vec<u8>>) -> u32 {
    match positions {
        Some(p) => crate::score::gap_count(p),
        None => 0,
    }
}

#[allow(clippy::too_many_arguments)] // Reason: internal helper; refactoring to a struct hurts clarity more than it helps
fn try_place_hour(
    problem: &Problem,
    lesson: &Lesson,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    weights: &ConstraintWeights,
    state: &mut GreedyState,
    placements: &mut Vec<Placement>,
    tb_order: &[usize],
    room_order: &[usize],
) -> bool {
    let class = lesson.school_class_id;
    let teacher = lesson.teacher_id;

    // Look up the subject once; it does not change across tb iterations.
    let subject = problem
        .subjects
        .iter()
        .find(|s| s.id == lesson.subject_id)
        .expect("validate_structural ensures every lesson.subject_id resolves");

    let mut best: Option<Candidate> = None;
    'tb_loop: for &tb_idx in tb_order {
        let tb = &problem.time_blocks[tb_idx];
        if state.used_teacher.contains(&(teacher, tb.id)) {
            continue;
        }
        if state.used_class.contains(&(class, tb.id)) {
            continue;
        }
        if idx.teacher_blocked(teacher, tb.id) {
            continue;
        }
        let current = state.hours_by_teacher.get(&teacher).copied().unwrap_or(0);
        let max = teacher_max.get(&teacher).copied().unwrap_or(0);
        if current.saturating_add(1) > max {
            continue;
        }
        let subject_pref = crate::score::subject_preference_score(subject, tb, weights);
        // tb-level invariant: candidate_score depends only on (day, position),
        // not on room. Compute once per tb.
        let score = candidate_score(
            state,
            class,
            teacher,
            tb.day_of_week,
            tb.position,
            weights,
            subject_pref,
        );
        // Pruning: if this tb's score can't beat the current best, the room
        // tiebreak rule (day, position, room.id) cannot make a higher-score
        // candidate win, so skip the inner room scan.
        if let Some(b) = &best {
            if score >= b.score {
                continue;
            }
        }

        for &room_idx in room_order {
            let room = &problem.rooms[room_idx];
            if state.used_room.contains(&(room.id, tb.id)) {
                continue;
            }
            if !idx.room_suits_subject(room.id, lesson.subject_id) {
                continue;
            }
            if idx.room_blocked(room.id, tb.id) {
                continue;
            }
            // Rooms iterated in id order; the first feasible is the lowest
            // room.id at this tb, so it wins the (day, position, room.id)
            // tiebreak among any rooms here. Take it and stop scanning.
            best = Some(Candidate {
                tb_id: tb.id,
                room_id: room.id,
                day: tb.day_of_week,
                position: tb.position,
                score,
            });
            break;
        }

        // Early exit: if we just took a candidate at delta=0 (score equals
        // the running soft_score), no later tb can beat it. tb_order is
        // sorted by (day, position, tb.id), so this is the lowest-tiebreak
        // delta=0 candidate available.
        if let Some(b) = &best {
            if b.score == state.soft_score && b.tb_id == tb.id {
                break 'tb_loop;
            }
        }
    }

    let Some(c) = best else {
        return false;
    };

    placements.push(Placement {
        lesson_id: lesson.id,
        time_block_id: c.tb_id,
        room_id: c.room_id,
    });
    state.used_teacher.insert((teacher, c.tb_id));
    state.used_class.insert((class, c.tb_id));
    state.used_room.insert((c.room_id, c.tb_id));
    *state.hours_by_teacher.entry(teacher).or_insert(0) += 1;

    let class_positions = state.class_positions.entry((class, c.day)).or_default();
    let ins = class_positions
        .binary_search(&c.position)
        .unwrap_or_else(|i| i);
    class_positions.insert(ins, c.position);
    let teacher_positions = state.teacher_positions.entry((teacher, c.day)).or_default();
    let ins = teacher_positions
        .binary_search(&c.position)
        .unwrap_or_else(|i| i);
    teacher_positions.insert(ins, c.position);
    state.soft_score = c.score;
    true
}

fn unplaced_kind(
    problem: &Problem,
    lesson: &Lesson,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    used_teacher: &HashSet<(TeacherId, TimeBlockId)>,
    used_class: &HashSet<(SchoolClassId, TimeBlockId)>,
    hours_by_teacher: &HashMap<TeacherId, u8>,
) -> ViolationKind {
    let current = hours_by_teacher
        .get(&lesson.teacher_id)
        .copied()
        .unwrap_or(0);
    let max = teacher_max.get(&lesson.teacher_id).copied().unwrap_or(0);
    if current >= max {
        return ViolationKind::TeacherOverCapacity;
    }

    let any_slot_open = problem.time_blocks.iter().any(|tb| {
        !used_teacher.contains(&(lesson.teacher_id, tb.id))
            && !used_class.contains(&(lesson.school_class_id, tb.id))
            && !idx.teacher_blocked(lesson.teacher_id, tb.id)
    });
    if !any_slot_open {
        return ViolationKind::NoFreeTimeBlock;
    }
    ViolationKind::NoSuitableRoom
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

    /// Greedy-only invocation. Active default `solve()` adds a 200ms LAHC pass
    /// that this module's structural unit tests do not benefit from; using a
    /// fresh `SolveConfig` with `deadline: None` keeps these tests fast.
    fn greedy_solve(problem: &Problem) -> Result<Solution, Error> {
        solve_with_config(
            problem,
            &SolveConfig {
                weights: ConstraintWeights {
                    class_gap: 1,
                    teacher_gap: 1,
                    ..ConstraintWeights::default()
                },
                ..SolveConfig::default()
            },
        )
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
                prefer_early_periods: false,
                avoid_first_period: false,
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
                preferred_block_size: 1,
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
        let s = greedy_solve(&base_problem()).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.placements[0].time_block_id, TimeBlockId(solve_uuid(10)));
        assert_eq!(s.placements[0].room_id, RoomId(solve_uuid(30)));
        assert!(s.violations.is_empty());
    }

    #[test]
    fn unqualified_teacher_emits_violation_and_skips_placement() {
        let mut p = base_problem();
        p.teacher_qualifications.clear();
        let s = greedy_solve(&p).unwrap();
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
        let s = greedy_solve(&p).unwrap();
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
            prefer_early_periods: false,
            avoid_first_period: false,
        });
        p.room_subject_suitabilities.push(RoomSubjectSuitability {
            room_id: RoomId(solve_uuid(30)),
            subject_id: SubjectId(solve_uuid(41)),
        });
        let s = greedy_solve(&p).unwrap();
        assert!(s.placements.is_empty());
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::NoSuitableRoom);
    }

    #[test]
    fn room_blocked_time_pushes_placement_to_next_slot() {
        let mut p = base_problem();
        p.room_blocked_times.push(RoomBlockedTime {
            room_id: RoomId(solve_uuid(30)),
            time_block_id: TimeBlockId(solve_uuid(10)),
        });
        let s = greedy_solve(&p).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.placements[0].time_block_id, TimeBlockId(solve_uuid(11)));
    }

    #[test]
    fn teacher_max_hours_cap_emits_teacher_over_capacity() {
        let mut p = base_problem();
        p.teachers[0].max_hours_per_week = 0;
        let s = greedy_solve(&p).unwrap();
        assert!(s.placements.is_empty());
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::TeacherOverCapacity);
    }

    #[test]
    fn no_free_time_block_when_class_slots_are_filled_blocks_second_lesson() {
        let mut p = base_problem();
        // base_problem has 2 time_blocks. Add a second subject + lesson whose teacher is
        // qualified for both subjects, then block the teacher in time_block 1 to leave only
        // time_block 0 free; the first lesson takes block 0, the second cannot place.
        p.subjects.push(Subject {
            id: SubjectId(solve_uuid(41)),
            prefer_early_periods: false,
            avoid_first_period: false,
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
            preferred_block_size: 1,
        });
        p.teacher_blocked_times.push(TeacherBlockedTime {
            teacher_id: TeacherId(solve_uuid(20)),
            time_block_id: TimeBlockId(solve_uuid(11)),
        });
        let s = greedy_solve(&p).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::NoFreeTimeBlock);
    }

    #[test]
    fn two_lessons_in_same_class_do_not_double_book_slot() {
        let mut p = base_problem();
        p.subjects.push(Subject {
            id: SubjectId(solve_uuid(41)),
            prefer_early_periods: false,
            avoid_first_period: false,
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
            preferred_block_size: 1,
        });
        let s = greedy_solve(&p).unwrap();
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
            preferred_block_size: 1,
        });
        let s = greedy_solve(&p).unwrap();
        assert_eq!(s.placements.len(), 2);
        // both placements happened in the first slot but in different rooms
        assert_eq!(s.placements[0].time_block_id, s.placements[1].time_block_id);
        assert_ne!(s.placements[0].room_id, s.placements[1].room_id);
    }

    #[test]
    fn structural_error_returns_err_input() {
        let mut p = base_problem();
        p.time_blocks.clear();
        let err = greedy_solve(&p).unwrap_err();
        assert!(matches!(err, Error::Input(_)));
    }

    #[test]
    fn lowest_delta_picks_gap_minimising_slot_for_class() {
        // Lesson A is forced to position 3; lesson B (unconstrained second teacher)
        // should pick position 2 under lowest-delta to minimise class-gap, not
        // position 0 (which first-fit would pick).
        let mut p = base_problem();
        p.time_blocks = vec![
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
            TimeBlock {
                id: TimeBlockId(solve_uuid(12)),
                day_of_week: 0,
                position: 2,
            },
            TimeBlock {
                id: TimeBlockId(solve_uuid(13)),
                day_of_week: 0,
                position: 3,
            },
        ];
        for tb_id in [10u8, 11, 12] {
            p.teacher_blocked_times.push(TeacherBlockedTime {
                teacher_id: TeacherId(solve_uuid(20)),
                time_block_id: TimeBlockId(solve_uuid(tb_id)),
            });
        }
        p.subjects.push(Subject {
            id: SubjectId(solve_uuid(41)),
            prefer_early_periods: false,
            avoid_first_period: false,
        });
        p.teachers.push(Teacher {
            id: TeacherId(solve_uuid(21)),
            max_hours_per_week: 10,
        });
        p.teacher_qualifications.push(TeacherQualification {
            teacher_id: TeacherId(solve_uuid(21)),
            subject_id: SubjectId(solve_uuid(41)),
        });
        p.lessons.push(Lesson {
            id: LessonId(solve_uuid(61)),
            school_class_id: SchoolClassId(solve_uuid(50)),
            subject_id: SubjectId(solve_uuid(41)),
            teacher_id: TeacherId(solve_uuid(21)),
            hours_per_week: 1,
            preferred_block_size: 1,
        });

        let s = greedy_solve(&p).unwrap();
        assert_eq!(s.placements.len(), 2);
        let lesson_a = s
            .placements
            .iter()
            .find(|x| x.lesson_id == LessonId(solve_uuid(60)))
            .unwrap();
        assert_eq!(lesson_a.time_block_id, TimeBlockId(solve_uuid(13)));
        let lesson_b = s
            .placements
            .iter()
            .find(|x| x.lesson_id == LessonId(solve_uuid(61)))
            .unwrap();
        assert_eq!(lesson_b.time_block_id, TimeBlockId(solve_uuid(12)));
        assert_eq!(s.soft_score, 0);
    }

    #[test]
    fn lowest_delta_picks_gap_minimising_slot_for_teacher() {
        // Two classes share teacher 20. Lesson A places at the lowest free slot;
        // lesson B (different class, same teacher) should pick the slot adjacent
        // to A under lowest-delta, not the lowest-index free slot.
        let mut p = base_problem();
        p.time_blocks = vec![
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
            TimeBlock {
                id: TimeBlockId(solve_uuid(12)),
                day_of_week: 0,
                position: 2,
            },
            TimeBlock {
                id: TimeBlockId(solve_uuid(13)),
                day_of_week: 0,
                position: 3,
            },
        ];
        for tb_id in [10u8, 11] {
            p.teacher_blocked_times.push(TeacherBlockedTime {
                teacher_id: TeacherId(solve_uuid(20)),
                time_block_id: TimeBlockId(solve_uuid(tb_id)),
            });
        }
        p.school_classes.push(SchoolClass {
            id: SchoolClassId(solve_uuid(51)),
        });
        p.lessons.push(Lesson {
            id: LessonId(solve_uuid(61)),
            school_class_id: SchoolClassId(solve_uuid(51)),
            subject_id: SubjectId(solve_uuid(40)),
            teacher_id: TeacherId(solve_uuid(20)),
            hours_per_week: 1,
            preferred_block_size: 1,
        });
        p.teachers[0].max_hours_per_week = 10;

        let s = greedy_solve(&p).unwrap();
        assert_eq!(s.placements.len(), 2);
        let lesson_a = s
            .placements
            .iter()
            .find(|x| x.lesson_id == LessonId(solve_uuid(60)))
            .unwrap();
        let lesson_b = s
            .placements
            .iter()
            .find(|x| x.lesson_id == LessonId(solve_uuid(61)))
            .unwrap();
        let pos_a = p
            .time_blocks
            .iter()
            .find(|tb| tb.id == lesson_a.time_block_id)
            .unwrap()
            .position;
        let pos_b = p
            .time_blocks
            .iter()
            .find(|tb| tb.id == lesson_b.time_block_id)
            .unwrap()
            .position;
        assert_eq!(
            pos_a.abs_diff(pos_b),
            1,
            "lessons should be adjacent under lowest-delta teacher-gap"
        );
        assert_eq!(s.soft_score, 0);
    }

    #[test]
    fn greedy_avoids_position_zero_for_avoid_first_subject_when_alternative_exists() {
        let mut p = base_problem();
        p.time_blocks.push(TimeBlock {
            id: TimeBlockId(solve_uuid(12)),
            day_of_week: 0,
            position: 2,
        });
        // Mark the only subject as avoid_first.
        p.subjects[0].avoid_first_period = true;
        // Active default solve(p) uses weight 1 for each axis; lesson should
        // place at position 1 (the lowest-id non-zero alternative), not 0.
        let s = solve_with_config(
            &p,
            &SolveConfig {
                weights: ConstraintWeights {
                    class_gap: 1,
                    teacher_gap: 1,
                    prefer_early_period: 1,
                    avoid_first_period: 1,
                },
                ..SolveConfig::default()
            },
        )
        .unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_ne!(
            s.placements[0].time_block_id,
            TimeBlockId(solve_uuid(10)),
            "expected the avoid-first subject to skip position 0"
        );
    }

    #[test]
    fn greedy_packs_prefer_early_subject_into_lower_positions_when_multiple_hours() {
        // Two-hour lesson of a prefer-early subject across a four-block day.
        // With prefer_early weight = 1, positions 0 and 1 should win over
        // 2 and 3 because their cumulative position cost (0+1=1) beats
        // (0+2=2) or any later combination.
        let mut p = base_problem();
        p.time_blocks = vec![
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
            TimeBlock {
                id: TimeBlockId(solve_uuid(12)),
                day_of_week: 0,
                position: 2,
            },
            TimeBlock {
                id: TimeBlockId(solve_uuid(13)),
                day_of_week: 0,
                position: 3,
            },
        ];
        p.lessons[0].hours_per_week = 2;
        p.subjects[0].prefer_early_periods = true;
        let s = solve_with_config(
            &p,
            &SolveConfig {
                weights: ConstraintWeights {
                    class_gap: 1,
                    teacher_gap: 1,
                    prefer_early_period: 1,
                    avoid_first_period: 1,
                },
                ..SolveConfig::default()
            },
        )
        .unwrap();
        assert_eq!(s.placements.len(), 2);
        let positions: Vec<u8> = s
            .placements
            .iter()
            .map(|pl| {
                p.time_blocks
                    .iter()
                    .find(|tb| tb.id == pl.time_block_id)
                    .unwrap()
                    .position
            })
            .collect();
        assert_eq!(
            positions
                .iter()
                .copied()
                .collect::<std::collections::HashSet<_>>(),
            std::collections::HashSet::from([0u8, 1u8])
        );
    }
}
