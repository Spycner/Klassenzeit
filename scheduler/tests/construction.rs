use bitvec::prelude::*;
use klassenzeit_scheduler::construction::construct;
use klassenzeit_scheduler::planning::*;

fn make_facts_with_availability(
    num_timeslots: usize,
    teacher_configs: Vec<(u32, Vec<bool>)>, // (max_hours, available per slot)
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
        teachers: teacher_configs
            .into_iter()
            .map(|(max_hours, avail)| {
                let mut available_slots = bitvec![0; num_timeslots];
                for (i, &a) in avail.iter().enumerate() {
                    if i < num_timeslots {
                        available_slots.set(i, a);
                    }
                }
                TeacherFact {
                    max_hours,
                    available_slots,
                    qualified_subjects: bitvec![1; num_subjects],
                    preferred_slots: bitvec![1; num_timeslots],
                }
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

#[test]
fn construct_single_lesson() {
    let facts = make_facts_with_availability(2, vec![(28, vec![true, true])], 1, 0, 1);
    let mut lessons = vec![PlanningLesson {
        id: 0,
        subject_idx: 0,
        teacher_idx: 0,
        class_idx: 0,
        timeslot: None,
        room: None,
    }];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    assert!(lessons[0].timeslot.is_some());
}

#[test]
fn construct_avoids_teacher_conflict() {
    // 1 teacher, 2 classes, 2 timeslots, 1 subject
    let facts = make_facts_with_availability(2, vec![(28, vec![true, true])], 2, 0, 1);
    let mut lessons = vec![
        PlanningLesson {
            id: 0,
            subject_idx: 0,
            teacher_idx: 0,
            class_idx: 0,
            timeslot: None,
            room: None,
        },
        PlanningLesson {
            id: 1,
            subject_idx: 0,
            teacher_idx: 0,
            class_idx: 1,
            timeslot: None,
            room: None,
        },
    ];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    assert_ne!(lessons[0].timeslot, lessons[1].timeslot);
}

#[test]
fn construct_respects_teacher_availability() {
    // Teacher available only in slot 1 (not slot 0)
    let facts = make_facts_with_availability(2, vec![(28, vec![false, true])], 1, 0, 1);
    let mut lessons = vec![PlanningLesson {
        id: 0,
        subject_idx: 0,
        teacher_idx: 0,
        class_idx: 0,
        timeslot: None,
        room: None,
    }];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    assert_eq!(lessons[0].timeslot, Some(1));
}

#[test]
fn construct_assigns_room_for_special_subject() {
    let mut facts = make_facts_with_availability(2, vec![(28, vec![true, true])], 1, 1, 1);
    facts.subjects[0].needs_special_room = true;

    let mut lessons = vec![PlanningLesson {
        id: 0,
        subject_idx: 0,
        teacher_idx: 0,
        class_idx: 0,
        timeslot: None,
        room: None,
    }];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    assert_eq!(lessons[0].room, Some(0));
}

#[test]
fn construct_unsolvable_reports_violations() {
    // 1 teacher, 1 class, 1 timeslot, but 2 lessons needed — impossible
    let facts = make_facts_with_availability(1, vec![(28, vec![true])], 1, 0, 1);
    let mut lessons = vec![
        PlanningLesson {
            id: 0,
            subject_idx: 0,
            teacher_idx: 0,
            class_idx: 0,
            timeslot: None,
            room: None,
        },
        PlanningLesson {
            id: 1,
            subject_idx: 0,
            teacher_idx: 0,
            class_idx: 0,
            timeslot: None,
            room: None,
        },
    ];

    let score = construct(&mut lessons, &facts);
    // One lesson placed, one can't be (class conflict at same slot)
    // The second lesson gets placed anyway with best-effort → hard violation
    assert!(!score.is_feasible());
}

#[test]
fn respects_class_availability() {
    let num_slots = 4;
    let mut class_available = bitvec![0; num_slots];
    class_available.set(2, true);
    class_available.set(3, true);

    let facts = ProblemFacts {
        timeslots: (0..num_slots)
            .map(|i| Timeslot {
                day: 0,
                period: i as u8,
            })
            .collect(),
        teachers: vec![TeacherFact {
            max_hours: 10,
            available_slots: bitvec![1; num_slots],
            qualified_subjects: bitvec![1; 1],
            preferred_slots: bitvec![1; num_slots],
        }],
        classes: vec![ClassFact {
            student_count: Some(25),
            class_teacher_idx: None,
            available_slots: class_available,
        }],
        rooms: vec![],
        subjects: vec![SubjectFact {
            needs_special_room: false,
        }],
    };

    let mut lessons = vec![PlanningLesson {
        id: 0,
        subject_idx: 0,
        teacher_idx: 0,
        class_idx: 0,
        timeslot: None,
        room: None,
    }];

    let score = construct(&mut lessons, &facts);
    assert!(
        score.is_feasible(),
        "construction should find a feasible slot"
    );
    let assigned_slot = lessons[0].timeslot.unwrap();
    assert!(
        assigned_slot == 2 || assigned_slot == 3,
        "lesson should be in available slot (2 or 3), got {}",
        assigned_slot
    );
}

#[test]
fn construct_most_constrained_first() {
    // Teacher 0: available only in slot 0
    // Teacher 1: available in slots 0 and 1
    // Both teach same class → teacher 0 must go in slot 0, teacher 1 in slot 1
    let facts = make_facts_with_availability(
        2,
        vec![
            (28, vec![true, false]), // teacher 0: only slot 0
            (28, vec![true, true]),  // teacher 1: both slots
        ],
        1,
        0,
        1,
    );
    let mut lessons = vec![
        // Lesson order doesn't matter — heuristic should sort by constraint tightness
        PlanningLesson {
            id: 0,
            subject_idx: 0,
            teacher_idx: 1,
            class_idx: 0,
            timeslot: None,
            room: None,
        },
        PlanningLesson {
            id: 1,
            subject_idx: 0,
            teacher_idx: 0,
            class_idx: 0,
            timeslot: None,
            room: None,
        },
    ];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    // Teacher 0 (more constrained) should get slot 0
    let teacher0_lesson = lessons.iter().find(|l| l.teacher_idx == 0).unwrap();
    assert_eq!(teacher0_lesson.timeslot, Some(0));
}
