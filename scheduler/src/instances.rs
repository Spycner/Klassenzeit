//! Deterministic Hessen Grundschule test instances for benchmarking and validation.
//!
//! Three instances of increasing size:
//! - `small_4_classes()`: 4 classes (1-Züge), 95 lessons
//! - `realistic_8_classes()`: 8 classes (2-Züge), 190 lessons
//! - `stress_16_classes()`: 16 classes (4-Züge), 380 lessons

use uuid::Uuid;

use crate::types::*;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Holds UUIDs for the 8 standard Hessen Grundschule subjects.
struct SubjectSet {
    deutsch: Uuid,
    mathe: Uuid,
    sachunterricht: Uuid,
    religion: Uuid,
    kunst: Uuid,
    musik: Uuid,
    sport: Uuid,
    englisch: Uuid,
}

/// Deterministic UUID from a human-readable seed string.
/// Uses a simple hash-based approach to avoid requiring uuid v5 feature.
fn uuid(seed: &str) -> Uuid {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    seed.hash(&mut hasher);
    let h1 = hasher.finish();
    // Hash again for the second 8 bytes
    h1.hash(&mut hasher);
    let h2 = hasher.finish();
    let mut bytes = [0u8; 16];
    bytes[..8].copy_from_slice(&h1.to_le_bytes());
    bytes[8..].copy_from_slice(&h2.to_le_bytes());
    // Set version 4 and variant bits for valid UUID format
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes)
}

fn make_timeslots(days: u8, periods_per_day: u8) -> Vec<TimeSlot> {
    let mut slots = Vec::new();
    for d in 0..days {
        for p in 0..periods_per_day {
            slots.push(TimeSlot {
                id: uuid(&format!("slot-d{d}-p{p}")),
                day: d,
                period: p,
            });
        }
    }
    slots
}

/// Filter timeslots to those matching given days and periods.
fn slots_for_periods(timeslots: &[TimeSlot], days: u8, periods: &[u8]) -> Vec<TimeSlot> {
    timeslots
        .iter()
        .filter(|s| s.day < days && periods.contains(&s.period))
        .cloned()
        .collect()
}

fn make_subjects() -> (Vec<Subject>, SubjectSet) {
    let set = SubjectSet {
        deutsch: uuid("sub-deutsch"),
        mathe: uuid("sub-mathe"),
        sachunterricht: uuid("sub-sachunterricht"),
        religion: uuid("sub-religion"),
        kunst: uuid("sub-kunst"),
        musik: uuid("sub-musik"),
        sport: uuid("sub-sport"),
        englisch: uuid("sub-englisch"),
    };
    let subjects = vec![
        Subject {
            id: set.deutsch,
            name: "Deutsch".into(),
            needs_special_room: false,
        },
        Subject {
            id: set.mathe,
            name: "Mathematik".into(),
            needs_special_room: false,
        },
        Subject {
            id: set.sachunterricht,
            name: "Sachunterricht".into(),
            needs_special_room: false,
        },
        Subject {
            id: set.religion,
            name: "Religion".into(),
            needs_special_room: false,
        },
        Subject {
            id: set.kunst,
            name: "Kunst".into(),
            needs_special_room: false,
        },
        Subject {
            id: set.musik,
            name: "Musik".into(),
            needs_special_room: false,
        },
        Subject {
            id: set.sport,
            name: "Sport".into(),
            needs_special_room: true,
        },
        Subject {
            id: set.englisch,
            name: "Englisch".into(),
            needs_special_room: false,
        },
    ];
    (subjects, set)
}

fn make_klassenlehrer(
    name: &str,
    subjects: &SubjectSet,
    available_slots: Vec<TimeSlot>,
    preferred_slots: Vec<TimeSlot>,
    max_hours: u32,
) -> Teacher {
    Teacher {
        id: uuid(&format!("teacher-{name}")),
        name: name.into(),
        max_hours_per_week: max_hours,
        is_part_time: false,
        available_slots,
        qualified_subjects: vec![
            subjects.deutsch,
            subjects.mathe,
            subjects.sachunterricht,
            subjects.kunst,
        ],
        preferred_slots,
    }
}

fn make_klassenraum(name: &str) -> Room {
    Room {
        id: uuid(&format!("room-{name}")),
        name: name.into(),
        capacity: Some(30),
        suitable_subjects: vec![], // empty = any non-special subject
    }
}

fn make_sporthalle(sport_id: Uuid) -> Room {
    Room {
        id: uuid("room-sporthalle"),
        name: "Sporthalle".into(),
        capacity: Some(30),
        suitable_subjects: vec![sport_id],
    }
}

/// Hours per week for a given grade (Hessen Grundschule Stundentafel).
/// Returns: (deutsch, mathe, sachunterricht, religion, kunst, musik, sport, englisch)
fn stundentafel(grade: u8) -> (u32, u32, u32, u32, u32, u32, u32, u32) {
    match grade {
        1 => (6, 5, 2, 2, 2, 1, 3, 0),
        2 => (7, 5, 2, 2, 2, 1, 3, 0),
        3 => (6, 5, 4, 2, 2, 2, 3, 2),
        4 => (6, 5, 4, 2, 2, 2, 3, 2),
        _ => panic!("unsupported grade {grade}"),
    }
}

/// Build explicit `LessonRequirement`s for a class.
fn make_requirements(
    class_id: Uuid,
    grade: u8,
    subjects: &SubjectSet,
    klassenlehrer_id: Uuid,
    sport_teacher_id: Uuid,
    musik_teacher_id: Uuid,
    rel_eng_teacher_id: Uuid,
) -> Vec<LessonRequirement> {
    let (de, ma, su, re, ku, mu, sp, en) = stundentafel(grade);
    let mut reqs = vec![
        // Klassenlehrer teaches: Deutsch, Mathe, Sachunterricht, Kunst
        LessonRequirement {
            class_id,
            subject_id: subjects.deutsch,
            teacher_id: Some(klassenlehrer_id),
            hours_per_week: de,
        },
        LessonRequirement {
            class_id,
            subject_id: subjects.mathe,
            teacher_id: Some(klassenlehrer_id),
            hours_per_week: ma,
        },
        LessonRequirement {
            class_id,
            subject_id: subjects.sachunterricht,
            teacher_id: Some(klassenlehrer_id),
            hours_per_week: su,
        },
        LessonRequirement {
            class_id,
            subject_id: subjects.kunst,
            teacher_id: Some(klassenlehrer_id),
            hours_per_week: ku,
        },
        // Fachlehrer
        LessonRequirement {
            class_id,
            subject_id: subjects.sport,
            teacher_id: Some(sport_teacher_id),
            hours_per_week: sp,
        },
        LessonRequirement {
            class_id,
            subject_id: subjects.musik,
            teacher_id: Some(musik_teacher_id),
            hours_per_week: mu,
        },
        LessonRequirement {
            class_id,
            subject_id: subjects.religion,
            teacher_id: Some(rel_eng_teacher_id),
            hours_per_week: re,
        },
    ];
    if en > 0 {
        reqs.push(LessonRequirement {
            class_id,
            subject_id: subjects.englisch,
            teacher_id: Some(rel_eng_teacher_id),
            hours_per_week: en,
        });
    }
    reqs
}

/// Class availability slots based on grade.
/// Grade 1/2: periods 0-4 (5 per day × 5 days = 25 slots, enough for 21-22 lessons).
/// Grade 3/4: all 6 periods (30 slots, enough for 26 lessons).
fn class_available_slots(timeslots: &[TimeSlot], grade: u8) -> Vec<TimeSlot> {
    match grade {
        1 | 2 => slots_for_periods(timeslots, 5, &[0, 1, 2, 3, 4]),
        3 | 4 => slots_for_periods(timeslots, 5, &[0, 1, 2, 3, 4, 5]),
        _ => panic!("unsupported grade {grade}"),
    }
}

/// Early slots (periods 0-1) as preferred for lower-grade Klassenlehrer.
fn early_preferred_slots(timeslots: &[TimeSlot]) -> Vec<TimeSlot> {
    slots_for_periods(timeslots, 5, &[0, 1])
}

// ---------------------------------------------------------------------------
// Instance 1: small_4_classes (1-Züge, 4 classes)
// ---------------------------------------------------------------------------

/// 4 classes (1a-4a), 6 teachers, 5 rooms, 95 total lessons.
pub fn small_4_classes() -> ScheduleInput {
    let timeslots = make_timeslots(5, 6);
    let (subjects, ss) = make_subjects();

    // Classes
    let classes: Vec<SchoolClass> = vec![("1a", 1), ("2a", 2), ("3a", 3), ("4a", 4)]
        .into_iter()
        .map(|(name, grade)| SchoolClass {
            id: uuid(&format!("class-{name}")),
            name: name.into(),
            grade_level: grade,
            student_count: Some(25),
            class_teacher_id: Some(uuid(&format!("teacher-kl-{name}"))),
            available_slots: class_available_slots(&timeslots, grade),
            grade: Some(grade),
        })
        .collect();

    // All slots for full-time availability
    let all_slots = timeslots.clone();

    // Klassenlehrer (4)
    let teachers_kl: Vec<Teacher> = vec![
        ("kl-1a", 28u32),
        ("kl-2a", 28),
        ("kl-3a", 28),
        ("kl-4a", 28),
    ]
    .into_iter()
    .map(|(name, max_h)| make_klassenlehrer(name, &ss, all_slots.clone(), vec![], max_h))
    .collect();

    // Sport+Musik combined teacher (20h)
    let sport_musik_teacher = Teacher {
        id: uuid("teacher-sport-musik"),
        name: "Sport/Musik Fachlehrer".into(),
        max_hours_per_week: 20,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![ss.sport, ss.musik],
        preferred_slots: vec![],
    };

    // Religion/Englisch teacher (14h, part-time, Mon-Thu only)
    let rel_eng_teacher = Teacher {
        id: uuid("teacher-rel-eng"),
        name: "Religion/Englisch Fachlehrer".into(),
        max_hours_per_week: 14,
        is_part_time: true,
        available_slots: slots_for_periods(&timeslots, 4, &[0, 1, 2, 3, 4, 5]), // days 0-3 only
        qualified_subjects: vec![ss.religion, ss.englisch],
        preferred_slots: vec![],
    };

    let mut teachers = teachers_kl;
    teachers.push(sport_musik_teacher);
    teachers.push(rel_eng_teacher);

    // Rooms
    let mut rooms: Vec<Room> = vec!["1a", "2a", "3a", "4a"]
        .into_iter()
        .map(|n| make_klassenraum(&format!("Klassenraum-{n}")))
        .collect();
    rooms.push(make_sporthalle(ss.sport));

    // Requirements
    let sport_tid = uuid("teacher-sport-musik");
    let musik_tid = uuid("teacher-sport-musik");
    let rel_eng_tid = uuid("teacher-rel-eng");

    let mut requirements = Vec::new();
    for cls in &classes {
        let kl_tid = cls.class_teacher_id.unwrap();
        requirements.extend(make_requirements(
            cls.id,
            cls.grade.unwrap(),
            &ss,
            kl_tid,
            sport_tid,
            musik_tid,
            rel_eng_tid,
        ));
    }

    let total: u32 = requirements.iter().map(|r| r.hours_per_week).sum();
    debug_assert_eq!(
        total, 95,
        "small_4_classes should have 95 lessons, got {total}"
    );

    ScheduleInput {
        teachers,
        classes,
        rooms,
        subjects,
        timeslots,
        requirements,
        stundentafeln: vec![],
    }
}

// ---------------------------------------------------------------------------
// Instance 2: realistic_8_classes (2-Züge, 8 classes)
// ---------------------------------------------------------------------------

/// 8 classes (1a-4b), 11 teachers, 9 rooms, 190 total lessons.
pub fn realistic_8_classes() -> ScheduleInput {
    let timeslots = make_timeslots(5, 6);
    let (subjects, ss) = make_subjects();
    let all_slots = timeslots.clone();

    // Classes
    let class_defs = vec![
        ("1a", 1u8),
        ("1b", 1),
        ("2a", 2),
        ("2b", 2),
        ("3a", 3),
        ("3b", 3),
        ("4a", 4),
        ("4b", 4),
    ];
    let classes: Vec<SchoolClass> = class_defs
        .iter()
        .map(|(name, grade)| SchoolClass {
            id: uuid(&format!("class-{name}")),
            name: (*name).into(),
            grade_level: *grade,
            student_count: Some(25),
            class_teacher_id: Some(uuid(&format!("teacher-kl-{name}"))),
            available_slots: class_available_slots(&timeslots, *grade),
            grade: Some(*grade),
        })
        .collect();

    // Klassenlehrer (8)
    // Some with reduced availability, Kl.1-2 with early preferred slots
    let mut teachers: Vec<Teacher> = Vec::new();

    for (name, grade) in &class_defs {
        let teacher_name = format!("kl-{name}");
        let mut avail = all_slots.clone();
        let mut preferred = vec![];

        // Kl.1-2 Klassenlehrer prefer early slots
        if *grade <= 2 {
            preferred = early_preferred_slots(&timeslots);
        }

        // Reduced availability for some teachers
        match *name {
            "1b" => {
                // Blocked Monday period 0
                avail.retain(|s| !(s.day == 0 && s.period == 0));
            }
            "4b" => {
                // Blocked Friday afternoon (periods 4-5)
                avail.retain(|s| !(s.day == 4 && s.period >= 4));
            }
            _ => {}
        }

        teachers.push(make_klassenlehrer(&teacher_name, &ss, avail, preferred, 28));
    }

    // Sport Fachlehrer (28h — needs 24h: 8 classes × 3h)
    teachers.push(Teacher {
        id: uuid("teacher-sport"),
        name: "Sport Fachlehrer".into(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![ss.sport],
        preferred_slots: vec![],
    });

    // Musik Fachlehrer (14h, part-time, Mon-Wed only — needs 12h)
    teachers.push(Teacher {
        id: uuid("teacher-musik"),
        name: "Musik Fachlehrer".into(),
        max_hours_per_week: 14,
        is_part_time: true,
        available_slots: slots_for_periods(&timeslots, 3, &[0, 1, 2, 3, 4, 5]),
        qualified_subjects: vec![ss.musik],
        preferred_slots: vec![],
    });

    // Religion/Englisch Fachlehrer (28h — needs 24h: 8×2 religion + 4×2 english)
    teachers.push(Teacher {
        id: uuid("teacher-rel-eng"),
        name: "Religion/Englisch Fachlehrer".into(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![ss.religion, ss.englisch],
        preferred_slots: vec![],
    });

    // Rooms
    let mut rooms: Vec<Room> = class_defs
        .iter()
        .map(|(name, _)| make_klassenraum(&format!("Klassenraum-{name}")))
        .collect();
    rooms.push(make_sporthalle(ss.sport));

    // Requirements
    let sport_tid = uuid("teacher-sport");
    let musik_tid = uuid("teacher-musik");
    let rel_eng_tid = uuid("teacher-rel-eng");

    let mut requirements = Vec::new();
    for cls in &classes {
        let kl_tid = cls.class_teacher_id.unwrap();
        requirements.extend(make_requirements(
            cls.id,
            cls.grade.unwrap(),
            &ss,
            kl_tid,
            sport_tid,
            musik_tid,
            rel_eng_tid,
        ));
    }

    let total: u32 = requirements.iter().map(|r| r.hours_per_week).sum();
    debug_assert_eq!(
        total, 190,
        "realistic_8_classes should have 190 lessons, got {total}"
    );

    ScheduleInput {
        teachers,
        classes,
        rooms,
        subjects,
        timeslots,
        requirements,
        stundentafeln: vec![],
    }
}

// ---------------------------------------------------------------------------
// Instance 3: stress_16_classes (4-Züge, 16 classes)
// ---------------------------------------------------------------------------

/// 16 classes (1a-4d), ~21 teachers, 17 rooms, 380 total lessons.
/// Sporthalle bottleneck: 48 Sport lessons for 30 gym slots.
pub fn stress_16_classes() -> ScheduleInput {
    let timeslots = make_timeslots(5, 6);
    let (subjects, ss) = make_subjects();
    let all_slots = timeslots.clone();

    // Classes
    let suffixes = ["a", "b", "c", "d"];
    let class_names: Vec<(String, u8)> = (1..=4u8)
        .flat_map(|grade| suffixes.iter().map(move |s| (format!("{grade}{s}"), grade)))
        .collect();

    let classes: Vec<SchoolClass> = class_names
        .iter()
        .map(|(name, grade)| SchoolClass {
            id: uuid(&format!("class-{name}")),
            name: name.clone(),
            grade_level: *grade,
            student_count: Some(25),
            class_teacher_id: Some(uuid(&format!("teacher-kl-{name}"))),
            available_slots: class_available_slots(&timeslots, *grade),
            grade: Some(*grade),
        })
        .collect();

    // Klassenlehrer (16)
    let mut teachers: Vec<Teacher> = Vec::new();

    for (name, grade) in &class_names {
        let teacher_name = format!("kl-{name}");
        let mut avail = all_slots.clone();
        let mut preferred = vec![];

        if *grade <= 2 {
            preferred = early_preferred_slots(&timeslots);
        }

        // Slightly reduced availability for a few teachers
        match name.as_str() {
            "1b" => {
                avail.retain(|s| !(s.day == 0 && s.period == 0));
            }
            "2c" => {
                avail.retain(|s| !(s.day == 4 && s.period >= 3));
            }
            "3a" => {
                avail.retain(|s| !(s.day == 2 && s.period == 5));
            }
            "4d" => {
                avail.retain(|s| !(s.day == 4 && s.period >= 4));
            }
            _ => {}
        }

        teachers.push(make_klassenlehrer(&teacher_name, &ss, avail, preferred, 28));
    }

    // Sport Fachlehrer 1 (28h) — teaches 1a-2d (8 classes × 3h = 24h Sport)
    teachers.push(Teacher {
        id: uuid("teacher-sport-1"),
        name: "Sport Fachlehrer 1".into(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![ss.sport],
        preferred_slots: vec![],
    });

    // Sport Fachlehrer 2 (22h) — teaches 3a-4d (8 classes × 3h = 24h Sport)
    teachers.push(Teacher {
        id: uuid("teacher-sport-2"),
        name: "Sport Fachlehrer 2".into(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![ss.sport],
        preferred_slots: vec![],
    });

    // Musik Fachlehrer (22h) — 16 classes: 8×1h + 8×2h = 24h
    teachers.push(Teacher {
        id: uuid("teacher-musik"),
        name: "Musik Fachlehrer".into(),
        max_hours_per_week: 24,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![ss.musik],
        preferred_slots: vec![],
    });

    // Religion/Englisch Fachlehrer 1 (22h) — teaches 1a-2d (Religion) + 3a-3d (Religion + Englisch)
    teachers.push(Teacher {
        id: uuid("teacher-rel-eng-1"),
        name: "Religion/Englisch Fachlehrer 1".into(),
        max_hours_per_week: 22,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![ss.religion, ss.englisch],
        preferred_slots: vec![],
    });

    // Religion/Englisch Fachlehrer 2 (14h, part-time) — teaches 4a-4d (Religion + Englisch)
    teachers.push(Teacher {
        id: uuid("teacher-rel-eng-2"),
        name: "Religion/Englisch Fachlehrer 2".into(),
        max_hours_per_week: 22,
        is_part_time: true,
        available_slots: {
            // Available Mon-Thu
            let mut s = all_slots.clone();
            s.retain(|slot| slot.day < 4);
            s
        },
        qualified_subjects: vec![ss.religion, ss.englisch],
        preferred_slots: vec![],
    });

    // Rooms: 16 Klassenräume + 1 Sporthalle
    let mut rooms: Vec<Room> = class_names
        .iter()
        .map(|(name, _)| make_klassenraum(&format!("Klassenraum-{name}")))
        .collect();
    rooms.push(make_sporthalle(ss.sport));

    // Requirements — split across the two sport teachers and two rel/eng teachers
    let sport_tid_1 = uuid("teacher-sport-1");
    let sport_tid_2 = uuid("teacher-sport-2");
    let musik_tid = uuid("teacher-musik");
    let rel_eng_tid_1 = uuid("teacher-rel-eng-1");
    let rel_eng_tid_2 = uuid("teacher-rel-eng-2");

    let mut requirements = Vec::new();
    for cls in &classes {
        let grade = cls.grade.unwrap();
        let kl_tid = cls.class_teacher_id.unwrap();

        // Sport teacher: grades 1-2 → teacher 1, grades 3-4 → teacher 2
        let sport_tid = if grade <= 2 { sport_tid_1 } else { sport_tid_2 };

        // Rel/Eng teacher: grades 1-3 → teacher 1, grade 4 → teacher 2
        let rel_eng_tid = if grade <= 3 {
            rel_eng_tid_1
        } else {
            rel_eng_tid_2
        };

        requirements.extend(make_requirements(
            cls.id,
            grade,
            &ss,
            kl_tid,
            sport_tid,
            musik_tid,
            rel_eng_tid,
        ));
    }

    let total: u32 = requirements.iter().map(|r| r.hours_per_week).sum();
    debug_assert_eq!(
        total, 380,
        "stress_16_classes should have 380 lessons, got {total}"
    );

    ScheduleInput {
        teachers,
        classes,
        rooms,
        subjects,
        timeslots,
        requirements,
        stundentafeln: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_instance_lesson_count() {
        let input = small_4_classes();
        let total: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
        assert_eq!(total, 95);
        assert_eq!(input.classes.len(), 4);
        assert_eq!(input.teachers.len(), 6);
        assert_eq!(input.rooms.len(), 5);
    }

    #[test]
    fn realistic_instance_lesson_count() {
        let input = realistic_8_classes();
        let total: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
        assert_eq!(total, 190);
        assert_eq!(input.classes.len(), 8);
        assert_eq!(input.teachers.len(), 11);
        assert_eq!(input.rooms.len(), 9);
    }

    #[test]
    fn stress_instance_lesson_count() {
        let input = stress_16_classes();
        let total: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
        assert_eq!(total, 380);
        assert_eq!(input.classes.len(), 16);
        assert_eq!(input.rooms.len(), 17);
    }

    #[test]
    fn timeslots_are_correct() {
        let input = small_4_classes();
        assert_eq!(input.timeslots.len(), 30); // 5 days × 6 periods
    }

    #[test]
    fn class_availability_matches_grade() {
        let input = small_4_classes();
        for cls in &input.classes {
            let expected = match cls.grade.unwrap() {
                1 | 2 => 25, // 5 days × 5 periods
                3 | 4 => 30, // 5 days × 6 periods
                _ => panic!(),
            };
            assert_eq!(
                cls.available_slots.len(),
                expected,
                "class {} grade {}",
                cls.name,
                cls.grade.unwrap()
            );
        }
    }

    #[test]
    fn sport_needs_special_room() {
        let input = small_4_classes();
        let sport = input.subjects.iter().find(|s| s.name == "Sport").unwrap();
        assert!(sport.needs_special_room);
        // Sporthalle should list sport as suitable
        let gym = input.rooms.iter().find(|r| r.name == "Sporthalle").unwrap();
        assert_eq!(gym.suitable_subjects, vec![sport.id]);
    }
}
