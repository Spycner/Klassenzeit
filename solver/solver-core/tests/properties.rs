//! Property tests for the greedy solver's hard-constraint invariants.

mod common;

use std::collections::{HashMap, HashSet};

use proptest::prelude::*;
use solver_core::{
    ids::{RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId},
    solve,
    types::{Problem, Solution, ViolationKind},
};

use common::feasible_problem;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn all_placements_are_feasible(
        classes in 1u8..=4,
        teachers in 2u8..=6,
        rooms in 2u8..=5,
        blocks in 15u8..=25,
        subjects in 2u8..=4,
        hours in 1u8..=3,
    ) {
        let p = feasible_problem(classes, teachers, rooms, blocks, subjects, hours);
        let s = solve(&p).unwrap();
        assert_every_placement_is_feasible_and_no_double_booking(&p, &s);
        assert_teacher_hours_respected(&p, &s);
        assert_total_hours_accounted_for(&p, &s);
    }

    #[test]
    fn output_is_byte_deterministic(
        classes in 1u8..=4,
        teachers in 2u8..=6,
        rooms in 2u8..=5,
        blocks in 15u8..=25,
        subjects in 2u8..=4,
        hours in 1u8..=3,
    ) {
        let p = feasible_problem(classes, teachers, rooms, blocks, subjects, hours);
        let a = serde_json::to_string(&solve(&p).unwrap()).unwrap();
        let b = serde_json::to_string(&solve(&p).unwrap()).unwrap();
        assert_eq!(a, b, "same input must produce byte-identical output");
    }
}

fn assert_every_placement_is_feasible_and_no_double_booking(p: &Problem, s: &Solution) {
    let qualifications: HashSet<(TeacherId, SubjectId)> = p
        .teacher_qualifications
        .iter()
        .map(|q| (q.teacher_id, q.subject_id))
        .collect();
    let teacher_blocked: HashSet<(TeacherId, TimeBlockId)> = p
        .teacher_blocked_times
        .iter()
        .map(|b| (b.teacher_id, b.time_block_id))
        .collect();
    let room_blocked: HashSet<(RoomId, TimeBlockId)> = p
        .room_blocked_times
        .iter()
        .map(|b| (b.room_id, b.time_block_id))
        .collect();
    let mut room_suit: HashMap<RoomId, HashSet<SubjectId>> = HashMap::new();
    for s in &p.room_subject_suitabilities {
        room_suit.entry(s.room_id).or_default().insert(s.subject_id);
    }

    let lesson_by_id: HashMap<_, _> = p.lessons.iter().map(|l| (l.id, l)).collect();

    let mut teacher_slot: HashSet<(TeacherId, TimeBlockId)> = HashSet::new();
    let mut class_slot: HashSet<(SchoolClassId, TimeBlockId)> = HashSet::new();
    let mut room_slot: HashSet<(RoomId, TimeBlockId)> = HashSet::new();

    for pl in &s.placements {
        let lesson = lesson_by_id.get(&pl.lesson_id).unwrap();
        assert!(qualifications.contains(&(lesson.teacher_id, lesson.subject_id)));
        assert!(!teacher_blocked.contains(&(lesson.teacher_id, pl.time_block_id)));
        assert!(!room_blocked.contains(&(pl.room_id, pl.time_block_id)));
        match room_suit.get(&pl.room_id) {
            None => {}
            Some(set) => assert!(set.contains(&lesson.subject_id)),
        }
        assert!(
            teacher_slot.insert((lesson.teacher_id, pl.time_block_id)),
            "teacher double-book"
        );
        assert!(
            class_slot.insert((lesson.school_class_id, pl.time_block_id)),
            "class double-book"
        );
        assert!(
            room_slot.insert((pl.room_id, pl.time_block_id)),
            "room double-book"
        );
    }
}

fn assert_teacher_hours_respected(p: &Problem, s: &Solution) {
    let teacher_of: HashMap<_, _> = p.lessons.iter().map(|l| (l.id, l.teacher_id)).collect();
    let teacher_max: HashMap<_, _> = p
        .teachers
        .iter()
        .map(|t| (t.id, t.max_hours_per_week))
        .collect();
    let mut hours: HashMap<TeacherId, u32> = HashMap::new();
    for pl in &s.placements {
        *hours
            .entry(*teacher_of.get(&pl.lesson_id).unwrap())
            .or_insert(0) += 1;
    }
    for (tid, h) in hours {
        assert!(h <= u32::from(*teacher_max.get(&tid).unwrap()));
    }
}

fn assert_total_hours_accounted_for(p: &Problem, s: &Solution) {
    let total_required: u32 = p.lessons.iter().map(|l| u32::from(l.hours_per_week)).sum();
    let placed: u32 = s.placements.len() as u32;
    let unplaced_hour_violations = s
        .violations
        .iter()
        .filter(|v| {
            matches!(
                v.kind,
                ViolationKind::NoQualifiedTeacher
                    | ViolationKind::TeacherOverCapacity
                    | ViolationKind::NoFreeTimeBlock
                    | ViolationKind::NoSuitableRoom
            )
        })
        .count() as u32;
    assert_eq!(placed + unplaced_hour_violations, total_required);
}
