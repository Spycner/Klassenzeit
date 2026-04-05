use klassenzeit_scheduler::local_search::LahcConfig;
use klassenzeit_scheduler::types::*;
use klassenzeit_scheduler::{solve, solve_with_config};
use uuid::Uuid;

fn ts(day: u8, period: u8) -> TimeSlot {
    TimeSlot {
        id: Uuid::new_v4(),
        day,
        period,
    }
}

fn teacher(name: &str, slots: Vec<TimeSlot>, subjects: Vec<Uuid>) -> Teacher {
    Teacher {
        id: Uuid::new_v4(),
        name: name.to_string(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: slots,
        qualified_subjects: subjects,
        preferred_slots: vec![],
    }
}

fn class(name: &str, grade: u8) -> SchoolClass {
    SchoolClass {
        id: Uuid::new_v4(),
        name: name.to_string(),
        grade_level: grade,
        student_count: None,
        class_teacher_id: None,
        available_slots: vec![],
        grade: None,
    }
}

fn subject(name: &str, special_room: bool) -> Subject {
    Subject {
        id: Uuid::new_v4(),
        name: name.to_string(),
        needs_special_room: special_room,
    }
}

fn room(name: &str, capacity: Option<u32>, suitable: Vec<Uuid>) -> Room {
    Room {
        id: Uuid::new_v4(),
        name: name.to_string(),
        capacity,
        suitable_subjects: suitable,
    }
}

#[test]
fn empty_input_returns_empty_timetable() {
    let input = ScheduleInput::default();
    let output = solve(input);
    assert!(output.timetable.is_empty());
    assert!(output.violations.is_empty());
}

#[test]
fn single_requirement_single_slot_assigns_one_lesson() {
    let slots = vec![ts(0, 1)];
    let math = subject("Math", false);
    let t = teacher("Alice", slots.clone(), vec![math.id]);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: slots,
        requirements: vec![LessonRequirement {
            class_id: c.id,
            subject_id: math.id,
            teacher_id: Some(t.id),
            hours_per_week: 1,
        }],
        stundentafeln: vec![],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.score.hard_violations, 0);
    assert_eq!(output.timetable[0].teacher_id, t.id);
    assert_eq!(output.timetable[0].class_id, c.id);
    assert_eq!(output.timetable[0].subject_id, math.id);
}

#[test]
fn teacher_conflict_produces_violation() {
    let slot = ts(0, 1);
    let math = subject("Math", false);
    let t = teacher("Alice", vec![slot.clone()], vec![math.id]);
    let c1 = class("1A", 1);
    let c2 = class("1B", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c1.clone(), c2.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: vec![slot],
        requirements: vec![
            LessonRequirement {
                class_id: c1.id,
                subject_id: math.id,
                teacher_id: Some(t.id),
                hours_per_week: 1,
            },
            LessonRequirement {
                class_id: c2.id,
                subject_id: math.id,
                teacher_id: Some(t.id),
                hours_per_week: 1,
            },
        ],
        stundentafeln: vec![],
    };

    let output = solve(input);
    // New constraint-based solver places both lessons (best-effort) with a hard violation
    assert_eq!(output.timetable.len(), 2);
    assert!(output.score.hard_violations > 0);
}

#[test]
fn class_conflict_avoids_double_booking() {
    let slot1 = ts(0, 1);
    let slot2 = ts(0, 2);
    let math = subject("Math", false);
    let english = subject("English", false);
    let t1 = teacher("Alice", vec![slot1.clone(), slot2.clone()], vec![math.id]);
    let t2 = teacher("Bob", vec![slot1.clone(), slot2.clone()], vec![english.id]);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t1.clone(), t2.clone()],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone(), english.clone()],
        timeslots: vec![slot1, slot2],
        requirements: vec![
            LessonRequirement {
                class_id: c.id,
                subject_id: math.id,
                teacher_id: Some(t1.id),
                hours_per_week: 1,
            },
            LessonRequirement {
                class_id: c.id,
                subject_id: english.id,
                teacher_id: Some(t2.id),
                hours_per_week: 1,
            },
        ],
        stundentafeln: vec![],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 2);
    assert_eq!(output.score.hard_violations, 0);
    assert_ne!(output.timetable[0].timeslot, output.timetable[1].timeslot);
}

#[test]
fn teacher_availability_respected() {
    let slot1 = ts(0, 1);
    let slot2 = ts(0, 2);
    let math = subject("Math", false);
    let t = teacher("Alice", vec![slot2.clone()], vec![math.id]); // only slot2
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: vec![slot1, slot2.clone()],
        requirements: vec![LessonRequirement {
            class_id: c.id,
            subject_id: math.id,
            teacher_id: Some(t.id),
            hours_per_week: 1,
        }],
        stundentafeln: vec![],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.timetable[0].timeslot, slot2);
}

#[test]
fn room_assigned_for_special_subject() {
    let slot = ts(0, 1);
    let science = subject("Science", true);
    let lab = room("Lab", Some(30), vec![science.id]);
    let t = teacher("Alice", vec![slot.clone()], vec![science.id]);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c.clone()],
        rooms: vec![lab.clone()],
        subjects: vec![science.clone()],
        timeslots: vec![slot],
        requirements: vec![LessonRequirement {
            class_id: c.id,
            subject_id: science.id,
            teacher_id: Some(t.id),
            hours_per_week: 1,
        }],
        stundentafeln: vec![],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.timetable[0].room_id, Some(lab.id));
}

#[test]
fn room_conflict_assigns_different_rooms() {
    let slot = ts(0, 1);
    let science = subject("Science", true);
    let lab1 = room("Lab1", Some(30), vec![science.id]);
    let lab2 = room("Lab2", Some(30), vec![science.id]);
    let t1 = teacher("Alice", vec![slot.clone()], vec![science.id]);
    let t2 = teacher("Bob", vec![slot.clone()], vec![science.id]);
    let c1 = class("1A", 1);
    let c2 = class("1B", 1);

    let input = ScheduleInput {
        teachers: vec![t1.clone(), t2.clone()],
        classes: vec![c1.clone(), c2.clone()],
        rooms: vec![lab1.clone(), lab2.clone()],
        subjects: vec![science.clone()],
        timeslots: vec![slot],
        requirements: vec![
            LessonRequirement {
                class_id: c1.id,
                subject_id: science.id,
                teacher_id: Some(t1.id),
                hours_per_week: 1,
            },
            LessonRequirement {
                class_id: c2.id,
                subject_id: science.id,
                teacher_id: Some(t2.id),
                hours_per_week: 1,
            },
        ],
        stundentafeln: vec![],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 2);
    let r1 = output.timetable[0].room_id.unwrap();
    let r2 = output.timetable[1].room_id.unwrap();
    assert_ne!(r1, r2);
}

#[test]
fn auto_assigns_teacher_from_qualified() {
    let slot = ts(0, 1);
    let math = subject("Math", false);
    let t = teacher("Alice", vec![slot.clone()], vec![math.id]);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: vec![slot],
        requirements: vec![LessonRequirement {
            class_id: c.id,
            subject_id: math.id,
            teacher_id: None,
            hours_per_week: 1,
        }],
        stundentafeln: vec![],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.timetable[0].teacher_id, t.id);
}

#[test]
fn unplaceable_requirement_produces_violation() {
    let math = subject("Math", false);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: vec![ts(0, 1)],
        requirements: vec![LessonRequirement {
            class_id: c.id,
            subject_id: math.id,
            teacher_id: None,
            hours_per_week: 1,
        }],
        stundentafeln: vec![],
    };

    let output = solve(input);
    assert!(output.timetable.is_empty());
    assert_eq!(output.score.hard_violations, 1);
}

#[test]
fn local_search_produces_stats() {
    let slots: Vec<TimeSlot> = (0..5)
        .flat_map(|day| (0..6).map(move |period| ts(day, period)))
        .collect();
    let math = subject("Math", false);
    let english = subject("English", false);

    // Preferred slots are a subset — teachers prefer only day 0-2, creating soft penalties
    let preferred: Vec<TimeSlot> = (0..3)
        .flat_map(|day| (0..6).map(move |period| ts(day, period)))
        .collect();

    let t1 = Teacher {
        id: Uuid::new_v4(),
        name: "Alice".into(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: slots.clone(),
        qualified_subjects: vec![math.id, english.id],
        preferred_slots: preferred.clone(),
    };
    let t2 = Teacher {
        id: Uuid::new_v4(),
        name: "Bob".into(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: slots.clone(),
        qualified_subjects: vec![math.id, english.id],
        preferred_slots: preferred.clone(),
    };

    let c1 = SchoolClass {
        id: Uuid::new_v4(),
        name: "1A".into(),
        grade_level: 1,
        student_count: Some(25),
        class_teacher_id: None,
        available_slots: vec![],
        grade: None,
    };

    let input = ScheduleInput {
        teachers: vec![t1.clone(), t2.clone()],
        classes: vec![c1.clone()],
        rooms: vec![],
        subjects: vec![math.clone(), english.clone()],
        timeslots: slots,
        requirements: vec![
            LessonRequirement {
                class_id: c1.id,
                subject_id: math.id,
                teacher_id: Some(t1.id),
                hours_per_week: 4,
            },
            LessonRequirement {
                class_id: c1.id,
                subject_id: english.id,
                teacher_id: Some(t2.id),
                hours_per_week: 4,
            },
        ],
        stundentafeln: vec![],
    };

    let config = LahcConfig {
        max_idle_ms: 2_000, // short timeout for tests
        ..Default::default()
    };
    let output = solve_with_config(input, config);

    assert_eq!(output.score.hard_violations, 0);
    assert_eq!(output.timetable.len(), 8);
    assert!(output.stats.is_some());
    let stats = output.stats.unwrap();
    assert!(stats.iterations > 0);
    assert!(stats.local_search_ms > 0 || stats.iterations > 0);
    assert!(stats.construction_ms < 1000);
}
