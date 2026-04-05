use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::{full_evaluate, IncrementalState};
use klassenzeit_scheduler::local_search::{build_kempe_chain, execute_kempe_chain};
use klassenzeit_scheduler::planning::*;
use rand::rngs::SmallRng;
use rand::SeedableRng;

/// Helper: create minimal problem facts with given counts.
fn make_facts(
    num_timeslots: usize,
    num_teachers: usize,
    num_classes: usize,
    num_rooms: usize,
    num_subjects: usize,
) -> ProblemFacts {
    ProblemFacts {
        timeslots: (0..num_timeslots)
            .map(|i| Timeslot {
                day: (i / 8) as u8,
                period: (i % 8) as u8,
            })
            .collect(),
        teachers: (0..num_teachers)
            .map(|_| TeacherFact {
                max_hours: 28,
                available_slots: bitvec![1; num_timeslots],
                qualified_subjects: bitvec![1; num_subjects],
                preferred_slots: bitvec![1; num_timeslots],
            })
            .collect(),
        classes: (0..num_classes)
            .map(|_| ClassFact {
                student_count: Some(25),
                class_teacher_idx: None,
                available_slots: bitvec![1; num_timeslots],
            })
            .collect(),
        rooms: (0..num_rooms)
            .map(|_| RoomFact {
                capacity: Some(30),
                suitable_subjects: bitvec![1; num_subjects],
                max_concurrent_at_slot: vec![1; num_timeslots],
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact {
                needs_special_room: false,
            })
            .collect(),
    }
}

fn assigned_lesson(
    id: usize,
    teacher: usize,
    class: usize,
    subject: usize,
    timeslot: usize,
) -> PlanningLesson {
    PlanningLesson {
        id,
        subject_idx: subject,
        teacher_idx: teacher,
        class_idx: class,
        timeslot: Some(timeslot),
        room: None,
    }
}

#[test]
fn kempe_chain_links_shared_teacher() {
    // 2 timeslots, 2 teachers, 2 classes
    // ts0: L0 (teacher0, class0), L1 (teacher1, class1)
    // ts1: L2 (teacher0, class1)
    //
    // Seed: L0 at ts0, target ts1.
    // L0 shares teacher0 with L2 at ts1, so L2 must also move.
    // L2 shares class1 with L1 at ts0, so L1 must also move.
    // Chain: {L0, L1} move ts0→ts1, {L2} moves ts1→ts0.
    let facts = make_facts(2, 2, 2, 0, 1);
    let lessons = vec![
        assigned_lesson(0, 0, 0, 0, 0), // L0: teacher0, class0 @ ts0
        assigned_lesson(1, 1, 1, 0, 0), // L1: teacher1, class1 @ ts0
        assigned_lesson(2, 0, 1, 0, 1), // L2: teacher0, class1 @ ts1
    ];

    let result = build_kempe_chain(0, 1, &lessons, &facts);
    let (from_a, from_b): (Vec<usize>, Vec<usize>) = result.unwrap();

    // from_a = lessons moving ts0→ts1: should include L0 and L1
    assert!(from_a.contains(&0));
    assert!(from_a.contains(&1));
    assert_eq!(from_a.len(), 2);

    // from_b = lessons moving ts1→ts0: should include L2
    assert!(from_b.contains(&2));
    assert_eq!(from_b.len(), 1);
}

#[test]
fn kempe_chain_single_lesson_no_conflicts() {
    let facts = make_facts(2, 2, 2, 0, 1);
    let lessons = vec![
        assigned_lesson(0, 0, 0, 0, 0),
        assigned_lesson(1, 1, 1, 0, 1),
    ];

    let result = build_kempe_chain(0, 1, &lessons, &facts);
    let (from_a, from_b): (Vec<usize>, Vec<usize>) = result.unwrap();

    assert_eq!(from_a, vec![0usize]);
    assert!(from_b.is_empty());
}

#[test]
fn kempe_chain_respects_max_size() {
    let facts = make_facts(2, 25, 25, 0, 1);
    let mut lessons = Vec::new();
    for i in 0..25 {
        lessons.push(assigned_lesson(i, i, i, 0, 0));
    }
    for i in 0..25 {
        lessons.push(assigned_lesson(25 + i, i, (i + 1) % 25, 0, 1));
    }

    let result = build_kempe_chain(0, 1, &lessons, &facts);
    assert!(result.is_none());
}

fn unassigned_lesson(id: usize, teacher: usize, class: usize, subject: usize) -> PlanningLesson {
    PlanningLesson {
        id,
        subject_idx: subject,
        teacher_idx: teacher,
        class_idx: class,
        timeslot: None,
        room: None,
    }
}

#[test]
fn kempe_execute_score_matches_full_eval() {
    let facts = make_facts(4, 2, 2, 0, 1);
    let mut state = IncrementalState::new(&facts);

    let mut lessons = vec![
        unassigned_lesson(0, 0, 0, 0),
        unassigned_lesson(1, 1, 1, 0),
        unassigned_lesson(2, 0, 1, 0),
    ];

    state.assign(&mut lessons[0], 0, None, &facts);
    state.assign(&mut lessons[1], 0, None, &facts);
    state.assign(&mut lessons[2], 1, None, &facts);

    let from_a = vec![0, 1];
    let from_b = vec![2];

    let mut rng = SmallRng::seed_from_u64(42);
    let rooms_for_subject: Vec<Vec<usize>> = vec![vec![]];

    let result = execute_kempe_chain(
        &from_a,
        &from_b,
        1,
        0,
        &mut lessons,
        &facts,
        &mut state,
        &rooms_for_subject,
        &mut rng,
    );

    assert!(result.is_some());
    assert_eq!(lessons[0].timeslot, Some(1));
    assert_eq!(lessons[1].timeslot, Some(1));
    assert_eq!(lessons[2].timeslot, Some(0));
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn kempe_execute_aborts_when_no_room_available() {
    let mut facts = make_facts(2, 2, 2, 1, 1);
    facts.subjects[0].needs_special_room = true;
    let mut state = IncrementalState::new(&facts);

    let mut lessons = vec![unassigned_lesson(0, 0, 0, 0), unassigned_lesson(1, 1, 1, 0)];

    state.assign(&mut lessons[0], 0, Some(0), &facts);
    state.assign(&mut lessons[1], 1, Some(0), &facts);

    let original_score = state.score();

    let from_a = vec![0];
    let from_b: Vec<usize> = vec![];

    let mut rng = SmallRng::seed_from_u64(42);
    let rooms_for_subject: Vec<Vec<usize>> = vec![vec![0]];

    let result = execute_kempe_chain(
        &from_a,
        &from_b,
        1,
        0,
        &mut lessons,
        &facts,
        &mut state,
        &rooms_for_subject,
        &mut rng,
    );

    assert!(result.is_none());
    assert_eq!(lessons[0].timeslot, Some(0));
    assert_eq!(lessons[0].room, Some(0));
    assert_eq!(lessons[1].timeslot, Some(1));
    assert_eq!(lessons[1].room, Some(0));
    assert_eq!(state.score(), original_score);
}
