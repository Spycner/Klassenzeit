use bitvec::prelude::*;
use klassenzeit_scheduler::planning::*;

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

fn lesson(
    id: usize,
    teacher: usize,
    class: usize,
    subject: usize,
    ts: usize,
    room: Option<usize>,
) -> PlanningLesson {
    PlanningLesson {
        id,
        subject_idx: subject,
        teacher_idx: teacher,
        class_idx: class,
        timeslot: Some(ts),
        room,
    }
}

#[test]
fn no_violations_for_valid_assignment() {
    let facts = make_facts(2, 2, 2, 0, 1);
    let lessons = vec![lesson(0, 0, 0, 0, 0, None), lesson(1, 1, 1, 0, 1, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score, HardSoftScore::ZERO);
}

#[test]
fn teacher_conflict_detected() {
    let facts = make_facts(2, 1, 2, 0, 1);
    // Same teacher (0), same timeslot (0), different classes
    let lessons = vec![lesson(0, 0, 0, 0, 0, None), lesson(1, 0, 1, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn class_conflict_detected() {
    let facts = make_facts(2, 2, 1, 0, 1);
    // Different teachers, same class (0), same timeslot (0)
    let lessons = vec![lesson(0, 0, 0, 0, 0, None), lesson(1, 1, 0, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_conflict_detected() {
    let facts = make_facts(2, 2, 2, 1, 1);
    // Different teachers/classes, same room (0), same timeslot (0)
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, Some(0)),
        lesson(1, 1, 1, 0, 0, Some(0)),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_conflict_skipped_when_no_room() {
    let facts = make_facts(2, 2, 2, 1, 1);
    // Same timeslot but no room assigned — no room conflict
    let lessons = vec![lesson(0, 0, 0, 0, 0, None), lesson(1, 1, 1, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, 0);
}

#[test]
fn teacher_availability_violation() {
    let mut facts = make_facts(2, 1, 1, 0, 1);
    // Teacher 0 is NOT available in timeslot 0
    facts.teachers[0].available_slots.set(0, false);
    let lessons = vec![lesson(0, 0, 0, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn teacher_over_capacity_violation() {
    let mut facts = make_facts(3, 1, 1, 0, 1);
    facts.teachers[0].max_hours = 1; // only 1 hour allowed
    let lessons = vec![lesson(0, 0, 0, 0, 0, None), lesson(1, 0, 0, 0, 1, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    // 2 lessons assigned, max 1 → 1 excess hour → -1
    assert_eq!(score.hard, -1);
}

#[test]
fn teacher_over_capacity_proportional() {
    let mut facts = make_facts(4, 1, 1, 0, 1);
    facts.teachers[0].max_hours = 1;
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 0, 0, 0, 1, None),
        lesson(2, 0, 0, 0, 2, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    // 3 lessons, max 1 → 2 excess → -2
    assert_eq!(score.hard, -2);
}

#[test]
fn teacher_qualification_violation() {
    let mut facts = make_facts(2, 1, 1, 0, 2);
    // Teacher 0 is qualified for subject 0 but NOT subject 1
    facts.teachers[0].qualified_subjects.set(1, false);
    let lessons = vec![lesson(0, 0, 0, 1, 0, None)]; // subject 1
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_suitability_violation() {
    let mut facts = make_facts(2, 1, 1, 1, 2);
    facts.subjects[1].needs_special_room = true;
    // Room 0 is suitable for subject 0 but NOT subject 1
    facts.rooms[0].suitable_subjects.set(1, false);
    let lessons = vec![lesson(0, 0, 0, 1, 0, Some(0))]; // subject 1, room 0
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_capacity_violation() {
    let mut facts = make_facts(2, 1, 1, 1, 1);
    facts.classes[0].student_count = Some(35);
    facts.rooms[0].capacity = Some(30); // too small
    let lessons = vec![lesson(0, 0, 0, 0, 0, Some(0))];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_capacity_ok_when_none() {
    let mut facts = make_facts(2, 1, 1, 1, 1);
    facts.classes[0].student_count = None; // unknown count
    facts.rooms[0].capacity = Some(30);
    let lessons = vec![lesson(0, 0, 0, 0, 0, Some(0))];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, 0);
}

#[test]
fn multiple_violations_stack() {
    let mut facts = make_facts(2, 1, 2, 0, 1);
    // Teacher conflict (same teacher, same timeslot) + teacher over-capacity (max 1)
    facts.teachers[0].max_hours = 1;
    let lessons = vec![lesson(0, 0, 0, 0, 0, None), lesson(1, 0, 1, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    // -1 teacher conflict + -1 over-capacity = -2
    assert_eq!(score.hard, -2);
}
