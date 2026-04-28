//! Pure soft-score function for `Solution` placements. Used by the lowest-delta
//! greedy in `solve.rs` and by the future LAHC local search.

use std::collections::HashMap;

use crate::ids::{LessonId, SchoolClassId, TeacherId, TimeBlockId};
use crate::types::{ConstraintWeights, Lesson, Placement, Problem, TimeBlock};

/// Compute the total weighted soft-score for a placement set.
///
/// Partitions `placements` by `(school_class_id, day_of_week)` and
/// `(teacher_id, day_of_week)`, then sums weighted gap-hours per partition.
pub fn score_solution(
    problem: &Problem,
    placements: &[Placement],
    weights: &ConstraintWeights,
) -> u32 {
    if weights.class_gap == 0 && weights.teacher_gap == 0 {
        return 0;
    }
    let tb_lookup: HashMap<TimeBlockId, &TimeBlock> =
        problem.time_blocks.iter().map(|tb| (tb.id, tb)).collect();
    let lesson_lookup: HashMap<LessonId, &Lesson> =
        problem.lessons.iter().map(|l| (l.id, l)).collect();

    let mut by_class_day: HashMap<(SchoolClassId, u8), Vec<u8>> = HashMap::new();
    let mut by_teacher_day: HashMap<(TeacherId, u8), Vec<u8>> = HashMap::new();

    for p in placements {
        let tb = tb_lookup[&p.time_block_id];
        let lesson = lesson_lookup[&p.lesson_id];
        by_class_day
            .entry((lesson.school_class_id, tb.day_of_week))
            .or_default()
            .push(tb.position);
        by_teacher_day
            .entry((lesson.teacher_id, tb.day_of_week))
            .or_default()
            .push(tb.position);
    }

    let class_gaps: u32 = by_class_day
        .into_values()
        .map(|mut v| {
            v.sort_unstable();
            v.dedup();
            gap_count(&v)
        })
        .sum();
    let teacher_gaps: u32 = by_teacher_day
        .into_values()
        .map(|mut v| {
            v.sort_unstable();
            v.dedup();
            gap_count(&v)
        })
        .sum();

    weights.class_gap.saturating_mul(class_gaps) + weights.teacher_gap.saturating_mul(teacher_gaps)
}

/// Count gap-hours in a sorted, deduplicated `positions` slice. A gap-hour is
/// an ordinal strictly between `positions.first()` and `positions.last()` that
/// does not appear in `positions`.
pub(crate) fn gap_count(positions: &[u8]) -> u32 {
    if positions.len() < 2 {
        return 0;
    }
    let span = u32::from(*positions.last().unwrap() - *positions.first().unwrap());
    let count = u32::try_from(positions.len()).unwrap_or(u32::MAX);
    span + 1 - count
}

/// Count gap-hours in `positions` after inserting `pos`. Returns 0 when the
/// resulting slice would have fewer than two distinct positions. When `pos` is
/// already present the length is unchanged (deduplication); when absent the
/// length grows by one. Caller must pass a sorted, deduplicated slice.
pub(crate) fn gap_count_after_insert(positions: Option<&Vec<u8>>, pos: u8) -> u32 {
    let Some(positions) = positions else {
        return 0;
    };
    if positions.is_empty() {
        return 0;
    }
    let already_present = positions.binary_search(&pos).is_ok();
    let len_after = if already_present {
        positions.len()
    } else {
        positions.len() + 1
    };
    if len_after < 2 {
        return 0;
    }
    let first = *positions.first().unwrap();
    let last = *positions.last().unwrap();
    let new_min = first.min(pos);
    let new_max = last.max(pos);
    let span = u32::from(new_max - new_min);
    let count = u32::try_from(len_after).unwrap_or(u32::MAX);
    span + 1 - count
}

/// Count gap-hours in `positions` after removing `pos`. Symmetric to
/// `gap_count_after_insert`. Returns 0 if removal leaves fewer than two
/// elements; returns `gap_count(positions)` if `pos` is not present
/// (defensive: LAHC only removes positions it has just placed, so the absent
/// branch should never fire in production).
pub(crate) fn gap_count_after_remove(positions: &[u8], pos: u8) -> u32 {
    let Ok(removed_at) = positions.binary_search(&pos) else {
        return gap_count(positions);
    };
    let len_after = positions.len() - 1;
    if len_after < 2 {
        return 0;
    }
    let new_first = if removed_at == 0 {
        positions[1]
    } else {
        positions[0]
    };
    let new_last = if removed_at == positions.len() - 1 {
        positions[positions.len() - 2]
    } else {
        positions[positions.len() - 1]
    };
    let span = u32::from(new_last - new_first);
    let count = u32::try_from(len_after).unwrap_or(u32::MAX);
    span + 1 - count
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
    use crate::types::{
        Lesson, Placement, Problem, Room, SchoolClass, Subject, Teacher, TeacherQualification,
        TimeBlock,
    };
    use uuid::Uuid;

    fn score_uuid(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    fn three_block_one_class_problem() -> Problem {
        Problem {
            time_blocks: vec![
                TimeBlock {
                    id: TimeBlockId(score_uuid(10)),
                    day_of_week: 0,
                    position: 0,
                },
                TimeBlock {
                    id: TimeBlockId(score_uuid(11)),
                    day_of_week: 0,
                    position: 1,
                },
                TimeBlock {
                    id: TimeBlockId(score_uuid(12)),
                    day_of_week: 0,
                    position: 2,
                },
            ],
            teachers: vec![Teacher {
                id: TeacherId(score_uuid(20)),
                max_hours_per_week: 10,
            }],
            rooms: vec![Room {
                id: RoomId(score_uuid(30)),
            }],
            subjects: vec![Subject {
                id: SubjectId(score_uuid(40)),
            }],
            school_classes: vec![SchoolClass {
                id: SchoolClassId(score_uuid(50)),
            }],
            lessons: vec![Lesson {
                id: LessonId(score_uuid(60)),
                school_class_id: SchoolClassId(score_uuid(50)),
                subject_id: SubjectId(score_uuid(40)),
                teacher_id: TeacherId(score_uuid(20)),
                hours_per_week: 2,
            }],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: TeacherId(score_uuid(20)),
                subject_id: SubjectId(score_uuid(40)),
            }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        }
    }

    fn place(lesson_id: u8, tb_id: u8) -> Placement {
        Placement {
            lesson_id: LessonId(score_uuid(lesson_id)),
            time_block_id: TimeBlockId(score_uuid(tb_id)),
            room_id: RoomId(score_uuid(30)),
        }
    }

    #[test]
    fn empty_placements_score_zero() {
        let p = three_block_one_class_problem();
        let weights = ConstraintWeights {
            class_gap: 5,
            teacher_gap: 7,
        };
        assert_eq!(score_solution(&p, &[], &weights), 0);
    }

    #[test]
    fn single_placement_scores_zero() {
        let p = three_block_one_class_problem();
        let weights = ConstraintWeights {
            class_gap: 5,
            teacher_gap: 7,
        };
        let placements = [place(60, 10)];
        assert_eq!(score_solution(&p, &placements, &weights), 0);
    }

    #[test]
    fn contiguous_placements_score_zero() {
        let p = three_block_one_class_problem();
        let weights = ConstraintWeights {
            class_gap: 5,
            teacher_gap: 7,
        };
        let placements = [place(60, 10), place(60, 11)];
        assert_eq!(score_solution(&p, &placements, &weights), 0);
    }

    #[test]
    fn one_gap_scores_class_plus_teacher_weights() {
        // Class 50 and teacher 20 both have placements at positions 0 and 2 with
        // a gap at position 1. Each partition contributes one gap-hour.
        let p = three_block_one_class_problem();
        let weights = ConstraintWeights {
            class_gap: 5,
            teacher_gap: 7,
        };
        let placements = [place(60, 10), place(60, 12)];
        assert_eq!(score_solution(&p, &placements, &weights), 12);
    }

    #[test]
    fn weights_compose_linearly() {
        let p = three_block_one_class_problem();
        let placements = [place(60, 10), place(60, 12)];
        let w1 = ConstraintWeights {
            class_gap: 1,
            teacher_gap: 0,
        };
        let w2 = ConstraintWeights {
            class_gap: 2,
            teacher_gap: 0,
        };
        assert_eq!(score_solution(&p, &placements, &w1), 1);
        assert_eq!(score_solution(&p, &placements, &w2), 2);
    }

    #[test]
    fn cross_day_placements_do_not_combine() {
        let mut p = three_block_one_class_problem();
        p.time_blocks.push(TimeBlock {
            id: TimeBlockId(score_uuid(13)),
            day_of_week: 1,
            position: 0,
        });
        let weights = ConstraintWeights {
            class_gap: 5,
            teacher_gap: 7,
        };
        let placements = [place(60, 10), place(60, 13)];
        assert_eq!(score_solution(&p, &placements, &weights), 0);
    }

    #[test]
    fn zero_weights_short_circuit_to_zero() {
        let p = three_block_one_class_problem();
        let weights = ConstraintWeights::default();
        let placements = [place(60, 10), place(60, 12)];
        assert_eq!(score_solution(&p, &placements, &weights), 0);
    }

    #[test]
    fn gap_count_after_remove_single_element_returns_zero() {
        let positions = [3u8];
        assert_eq!(gap_count_after_remove(&positions, 3), 0);
    }

    #[test]
    fn gap_count_after_remove_min_shrinks_span() {
        // positions = [1, 3, 5]; gap_count = 5 - 1 + 1 - 3 = 2
        // remove 1 -> [3, 5]; gap_count = 5 - 3 + 1 - 2 = 1
        let positions = [1u8, 3, 5];
        assert_eq!(gap_count_after_remove(&positions, 1), 1);
    }

    #[test]
    fn gap_count_after_remove_max_shrinks_span() {
        // positions = [1, 3, 5]; remove 5 -> [1, 3]; gap = 3 - 1 + 1 - 2 = 1
        let positions = [1u8, 3, 5];
        assert_eq!(gap_count_after_remove(&positions, 5), 1);
    }

    #[test]
    fn gap_count_after_remove_middle_grows_gap() {
        // positions = [1, 3, 5]; remove 3 -> [1, 5]; gap = 5 - 1 + 1 - 2 = 3
        let positions = [1u8, 3, 5];
        assert_eq!(gap_count_after_remove(&positions, 3), 3);
    }

    #[test]
    fn gap_count_after_remove_absent_returns_unchanged() {
        // pos not in slice; defensive return matches gap_count(positions).
        let positions = [1u8, 3, 5];
        assert_eq!(gap_count_after_remove(&positions, 7), gap_count(&positions));
    }

    #[test]
    fn gap_count_after_remove_two_to_one_returns_zero() {
        let positions = [1u8, 3];
        assert_eq!(gap_count_after_remove(&positions, 1), 0);
    }
}
