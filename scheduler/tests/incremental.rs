use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::{full_evaluate, IncrementalState};
use klassenzeit_scheduler::planning::*;

// Soft constraint tests need HardSoftScore for direct comparisons
#[allow(unused_imports)]
use klassenzeit_scheduler::planning::HardSoftScore;

/// Helper: create minimal problem facts with given counts.
/// All teachers available everywhere, qualified for everything, rooms suitable for all subjects.
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
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact {
                needs_special_room: false,
            })
            .collect(),
    }
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
fn incremental_matches_full_after_assign() {
    let facts = make_facts(4, 2, 2, 0, 1);
    let mut state = IncrementalState::new(&facts);

    // Lesson 0: teacher 0, class 0, subject 0 -> timeslot 0
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, None, &facts);
    let lessons = [l0.clone()];
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));

    // Lesson 1: teacher 1, class 1, subject 0 -> timeslot 1 (no conflict)
    let mut l1 = unassigned_lesson(1, 1, 1, 0);
    state.assign(&mut l1, 1, None, &facts);
    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
    assert_eq!(state.score(), HardSoftScore::ZERO);
}

#[test]
fn incremental_detects_teacher_conflict() {
    let facts = make_facts(4, 1, 2, 0, 1);
    let mut state = IncrementalState::new(&facts);

    // Two lessons with same teacher at same timeslot
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 0, 1, 0);

    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 0, None, &facts);

    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score().hard, -1);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_unassign_removes_violations() {
    let facts = make_facts(4, 1, 2, 0, 1);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 0, 1, 0);

    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 0, None, &facts);
    assert_eq!(state.score().hard, -1);

    // Unassign l1 -> conflict removed
    state.unassign(&mut l1, &facts);

    let lessons = [l0.clone()];
    assert_eq!(state.score(), HardSoftScore::ZERO);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_reassign_updates_correctly() {
    let facts = make_facts(4, 1, 2, 0, 1);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 0, 1, 0);

    // Assign both to same slot -> conflict
    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 0, None, &facts);
    assert_eq!(state.score().hard, -1);

    // Move l1 to a different slot -> no conflict
    state.unassign(&mut l1, &facts);
    state.assign(&mut l1, 1, None, &facts);

    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score(), HardSoftScore::ZERO);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

// ── Soft constraint tests ──

#[test]
fn incremental_soft_teacher_gap() {
    let facts = make_facts(16, 1, 2, 0, 1);
    let mut state = IncrementalState::new(&facts);
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, None, &facts); // day 0, period 0
    let mut l1 = unassigned_lesson(1, 0, 1, 0);
    state.assign(&mut l1, 2, None, &facts); // day 0, period 2 → gap of 1
    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score().soft, -1);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_soft_subject_distribution() {
    let facts = make_facts(16, 2, 1, 0, 1);
    let mut state = IncrementalState::new(&facts);
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 0, 0);
    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 1, None, &facts);
    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score().soft, -2);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_soft_preferred_slots() {
    let mut facts = make_facts(16, 1, 1, 0, 1);
    facts.teachers[0].preferred_slots.set(0, false);
    let mut state = IncrementalState::new(&facts);
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, None, &facts);
    let lessons = [l0.clone()];
    assert_eq!(state.score().soft, -1);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_soft_class_teacher_first_period() {
    let mut facts = make_facts(16, 2, 1, 0, 1);
    facts.classes[0].class_teacher_idx = Some(0);
    let mut state = IncrementalState::new(&facts);
    let mut l0 = unassigned_lesson(0, 1, 0, 0); // teacher 1 teaches period 0
    state.assign(&mut l0, 0, None, &facts);
    let lessons = [l0.clone()];
    assert_eq!(state.score().soft, -1);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_soft_unassign_reverses() {
    let mut facts = make_facts(16, 1, 2, 0, 1);
    facts.teachers[0].preferred_slots.set(0, false);
    let mut state = IncrementalState::new(&facts);
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, None, &facts);
    assert_eq!(state.score().soft, -1);
    state.unassign(&mut l0, &facts);
    assert_eq!(state.score(), HardSoftScore::ZERO);
}

#[test]
fn incremental_soft_reassign_different_slot() {
    // Assign to non-preferred, then move to preferred
    let mut facts = make_facts(16, 1, 1, 0, 1);
    facts.teachers[0].preferred_slots.set(0, false);
    let mut state = IncrementalState::new(&facts);
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, None, &facts);
    assert_eq!(state.score().soft, -1);
    state.unassign(&mut l0, &facts);
    state.assign(&mut l0, 1, None, &facts); // slot 1 is preferred
    let lessons = [l0.clone()];
    assert_eq!(state.score().soft, 0);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_triple_conflict_counts_pairs() {
    let facts = make_facts(4, 1, 3, 0, 1);
    let mut state = IncrementalState::new(&facts);

    // 3 lessons, same teacher, same timeslot -> C(3,2) = 3 conflict pairs
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 0, 1, 0);
    let mut l2 = unassigned_lesson(2, 0, 2, 0);

    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 0, None, &facts);
    state.assign(&mut l2, 0, None, &facts);

    let lessons = [l0.clone(), l1.clone(), l2.clone()];
    assert_eq!(state.score().hard, -3);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}
