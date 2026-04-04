use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::{full_evaluate, IncrementalState};
use klassenzeit_scheduler::planning::*;

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
fn change_move_score_matches_full_eval() {
    let facts = make_facts(16, 2, 2, 0, 2);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 1, 1);
    let mut l2 = unassigned_lesson(2, 0, 1, 0);

    // Assign 3 lessons to different slots
    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 1, None, &facts);
    state.assign(&mut l2, 2, None, &facts);

    // Simulate a change move: unassign l0, reassign to slot 5
    state.unassign(&mut l0, &facts);
    state.assign(&mut l0, 5, None, &facts);

    let lessons = [l0.clone(), l1.clone(), l2.clone()];
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn swap_move_score_matches_full_eval() {
    let facts = make_facts(16, 2, 2, 0, 2);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 1, 1);

    // Assign 2 lessons
    state.assign(&mut l0, 3, None, &facts);
    state.assign(&mut l1, 7, None, &facts);

    // Simulate swap: unassign both, reassign swapped
    state.unassign(&mut l0, &facts);
    state.unassign(&mut l1, &facts);
    state.assign(&mut l0, 7, None, &facts);
    state.assign(&mut l1, 3, None, &facts);

    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn undo_change_restores_score() {
    let facts = make_facts(16, 2, 2, 0, 2);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 1, 1);

    // Assign 2 lessons, record original score
    state.assign(&mut l0, 2, None, &facts);
    state.assign(&mut l1, 4, None, &facts);
    let original_score = state.score();

    // Apply change move: move l0 from slot 2 to slot 6
    state.unassign(&mut l0, &facts);
    state.assign(&mut l0, 6, None, &facts);

    // Undo: move l0 back to slot 2
    state.unassign(&mut l0, &facts);
    state.assign(&mut l0, 2, None, &facts);

    assert_eq!(state.score(), original_score);
}

#[test]
fn undo_swap_restores_score() {
    let facts = make_facts(16, 2, 2, 0, 2);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 1, 1);

    // Assign 2 lessons, record original score
    state.assign(&mut l0, 3, None, &facts);
    state.assign(&mut l1, 9, None, &facts);
    let original_score = state.score();

    // Apply swap: unassign both, assign swapped
    state.unassign(&mut l0, &facts);
    state.unassign(&mut l1, &facts);
    state.assign(&mut l0, 9, None, &facts);
    state.assign(&mut l1, 3, None, &facts);

    // Undo swap: unassign both, assign back to original positions
    state.unassign(&mut l0, &facts);
    state.unassign(&mut l1, &facts);
    state.assign(&mut l0, 3, None, &facts);
    state.assign(&mut l1, 9, None, &facts);

    assert_eq!(state.score(), original_score);
}
