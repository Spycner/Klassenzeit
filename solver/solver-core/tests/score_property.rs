//! Property tests for `score_solution` and the lowest-delta greedy.

use proptest::prelude::*;
use solver_core::{
    score_solution, solve_with_config, ConstraintWeights, Lesson, LessonId, Problem, Room, RoomId,
    SchoolClass, SchoolClassId, SolveConfig, Subject, SubjectId, Teacher, TeacherId,
    TeacherQualification, TimeBlock, TimeBlockId,
};
use uuid::Uuid;

fn id_from(n: u32) -> Uuid {
    let mut bytes = [0u8; 16];
    bytes[12..16].copy_from_slice(&n.to_be_bytes());
    Uuid::from_bytes(bytes)
}

prop_compose! {
    fn small_problem()(
        n_classes in 1usize..=3,
        n_teachers in 1usize..=4,
        n_rooms in 1usize..=3,
        n_subjects in 1usize..=3,
        n_days in 1u8..=3,
        periods_per_day in 2u8..=5,
        lesson_specs in prop::collection::vec((0usize..3, 0usize..3, 1u8..=3), 1..=12),
    ) -> Problem {
        let time_blocks: Vec<TimeBlock> = (0..n_days).flat_map(|d| {
            (0..periods_per_day).map(move |p| TimeBlock {
                id: TimeBlockId(id_from(u32::from(d) * 100 + u32::from(p) + 1000)),
                day_of_week: d,
                position: p,
            })
        }).collect();

        let teachers: Vec<Teacher> = (0..n_teachers).map(|i| Teacher {
            id: TeacherId(id_from(u32::try_from(i).unwrap_or(0) + 2000)),
            max_hours_per_week: 30,
        }).collect();

        let rooms: Vec<Room> = (0..n_rooms).map(|i| Room {
            id: RoomId(id_from(u32::try_from(i).unwrap_or(0) + 3000)),
        }).collect();

        let subjects: Vec<Subject> = (0..n_subjects).map(|i| Subject {
            id: SubjectId(id_from(u32::try_from(i).unwrap_or(0) + 4000)),
        }).collect();

        let school_classes: Vec<SchoolClass> = (0..n_classes).map(|i| SchoolClass {
            id: SchoolClassId(id_from(u32::try_from(i).unwrap_or(0) + 5000)),
        }).collect();

        let teacher_qualifications: Vec<TeacherQualification> = teachers.iter()
            .flat_map(|t| subjects.iter().map(move |s| TeacherQualification {
                teacher_id: t.id,
                subject_id: s.id,
            }))
            .collect();

        let lessons: Vec<Lesson> = lesson_specs.iter().enumerate().filter_map(|(i, &(ci, si, h))| {
            if ci >= n_classes || si >= n_subjects {
                return None;
            }
            Some(Lesson {
                id: LessonId(id_from(u32::try_from(i).unwrap_or(0) + 6000)),
                school_class_id: school_classes[ci].id,
                subject_id: subjects[si].id,
                teacher_id: teachers[i % n_teachers].id,
                hours_per_week: h,
            })
        }).collect();

        Problem {
            time_blocks,
            teachers,
            rooms,
            subjects,
            school_classes,
            lessons,
            teacher_qualifications,
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        }
    }
}

prop_compose! {
    fn weights()(class_gap in 0u32..=10, teacher_gap in 0u32..=10) -> ConstraintWeights {
        ConstraintWeights { class_gap, teacher_gap }
    }
}

proptest! {
    /// The standalone scorer must equal the in-loop running total.
    #[test]
    fn solve_soft_score_equals_score_solution(problem in small_problem(), w in weights()) {
        let cfg = SolveConfig { weights: w.clone(), ..SolveConfig::default() };
        let Ok(sol) = solve_with_config(&problem, &cfg) else { return Ok(()) };
        let recomputed = score_solution(&problem, &sol.placements, &w);
        prop_assert_eq!(sol.soft_score, recomputed);
    }

    /// Two solver invocations on the same problem and weights produce the
    /// same triple. Catches HashMap-iteration leaks and other hidden
    /// non-determinism.
    #[test]
    fn solve_is_deterministic(problem in small_problem(), w in weights()) {
        let cfg = SolveConfig { weights: w, ..SolveConfig::default() };
        let Ok(s1) = solve_with_config(&problem, &cfg) else { return Ok(()) };
        let Ok(s2) = solve_with_config(&problem, &cfg) else { return Ok(()) };
        prop_assert_eq!(s1.placements, s2.placements);
        prop_assert_eq!(s1.violations, s2.violations);
        prop_assert_eq!(s1.soft_score, s2.soft_score);
    }
}
