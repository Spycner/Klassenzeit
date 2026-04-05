use bitvec::prelude::*;
use std::collections::HashMap;
use uuid::Uuid;

use crate::planning::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// Index maps for UUID ↔ usize translation
// ---------------------------------------------------------------------------

pub struct IndexMaps {
    pub teacher_uuid_to_idx: HashMap<Uuid, usize>,
    pub class_uuid_to_idx: HashMap<Uuid, usize>,
    pub room_uuid_to_idx: HashMap<Uuid, usize>,
    pub subject_uuid_to_idx: HashMap<Uuid, usize>,
    pub timeslot_uuid_to_idx: HashMap<Uuid, usize>,
    // Reverse maps for output conversion
    pub teacher_uuids: Vec<Uuid>,
    pub class_uuids: Vec<Uuid>,
    pub room_uuids: Vec<Uuid>,
    pub subject_uuids: Vec<Uuid>,
    pub timeslot_uuids: Vec<Uuid>,
}

pub fn expand_stundentafeln(input: &ScheduleInput) -> Vec<LessonRequirement> {
    use std::collections::HashSet;

    let explicit: HashSet<(Uuid, Uuid)> = input
        .requirements
        .iter()
        .map(|r| (r.class_id, r.subject_id))
        .collect();

    let mut expanded = Vec::new();

    for class in &input.classes {
        let grade = match class.grade {
            Some(g) => g,
            None => continue,
        };

        for st in &input.stundentafeln {
            if st.grade != grade {
                continue;
            }
            for entry in &st.entries {
                if explicit.contains(&(class.id, entry.subject_id)) {
                    continue;
                }
                expanded.push(LessonRequirement {
                    class_id: class.id,
                    subject_id: entry.subject_id,
                    teacher_id: entry.teacher_id,
                    hours_per_week: entry.hours_per_week,
                });
            }
        }
    }

    expanded
}

pub fn to_planning(input: &ScheduleInput) -> (PlanningSolution, IndexMaps) {
    let num_subjects = input.subjects.len();
    let num_timeslots = input.timeslots.len();

    // Build UUID → index maps
    let mut subject_uuid_to_idx = HashMap::new();
    let mut subject_uuids = Vec::new();
    for (i, s) in input.subjects.iter().enumerate() {
        subject_uuid_to_idx.insert(s.id, i);
        subject_uuids.push(s.id);
    }

    let mut timeslot_uuid_to_idx = HashMap::new();
    let mut timeslot_uuids = Vec::new();
    for (i, ts) in input.timeslots.iter().enumerate() {
        timeslot_uuid_to_idx.insert(ts.id, i);
        timeslot_uuids.push(ts.id);
    }

    let mut teacher_uuid_to_idx = HashMap::new();
    let mut teacher_uuids = Vec::new();
    let mut teachers = Vec::new();
    for (i, t) in input.teachers.iter().enumerate() {
        teacher_uuid_to_idx.insert(t.id, i);
        teacher_uuids.push(t.id);

        let mut available_slots = bitvec![0; num_timeslots];
        for slot in &t.available_slots {
            if let Some(&idx) = timeslot_uuid_to_idx.get(&slot.id) {
                available_slots.set(idx, true);
            }
        }

        let mut qualified_subjects = bitvec![0; num_subjects];
        for &subj_id in &t.qualified_subjects {
            if let Some(&idx) = subject_uuid_to_idx.get(&subj_id) {
                qualified_subjects.set(idx, true);
            }
        }

        // Empty preferred_slots means "no preference" → treat all slots as preferred
        let mut preferred_slots = if t.preferred_slots.is_empty() {
            bitvec![1; num_timeslots]
        } else {
            bitvec![0; num_timeslots]
        };
        for slot in &t.preferred_slots {
            if let Some(&idx) = timeslot_uuid_to_idx.get(&slot.id) {
                preferred_slots.set(idx, true);
            }
        }

        teachers.push(TeacherFact {
            max_hours: t.max_hours_per_week,
            available_slots,
            qualified_subjects,
            preferred_slots,
        });
    }

    let mut class_uuid_to_idx = HashMap::new();
    let mut class_uuids = Vec::new();
    let mut classes = Vec::new();
    for (i, c) in input.classes.iter().enumerate() {
        class_uuid_to_idx.insert(c.id, i);
        class_uuids.push(c.id);

        let available_slots = if c.available_slots.is_empty() {
            bitvec![1; num_timeslots]
        } else {
            let mut bits = bitvec![0; num_timeslots];
            for slot in &c.available_slots {
                if let Some(&idx) = timeslot_uuid_to_idx.get(&slot.id) {
                    bits.set(idx, true);
                }
            }
            bits
        };

        classes.push(ClassFact {
            student_count: c.student_count,
            class_teacher_idx: c
                .class_teacher_id
                .and_then(|tid| teacher_uuid_to_idx.get(&tid).copied()),
            available_slots,
        });
    }

    let mut room_uuid_to_idx = HashMap::new();
    let mut room_uuids = Vec::new();
    let mut rooms = Vec::new();
    for (i, r) in input.rooms.iter().enumerate() {
        room_uuid_to_idx.insert(r.id, i);
        room_uuids.push(r.id);

        let mut suitable_subjects = bitvec![0; num_subjects];
        for &subj_id in &r.suitable_subjects {
            if let Some(&idx) = subject_uuid_to_idx.get(&subj_id) {
                suitable_subjects.set(idx, true);
            }
        }

        rooms.push(RoomFact {
            capacity: r.capacity,
            suitable_subjects,
            max_concurrent_at_slot: {
                let mut caps = vec![r.max_concurrent; num_timeslots];
                for (ts, &cap) in &r.timeslot_capacity_overrides {
                    if let Some(&idx) = timeslot_uuid_to_idx.get(&ts.id) {
                        caps[idx] = cap;
                    }
                }
                caps
            },
        });
    }

    let timeslots: Vec<Timeslot> = input
        .timeslots
        .iter()
        .map(|ts| Timeslot {
            day: ts.day,
            period: ts.period,
        })
        .collect();

    let subjects: Vec<SubjectFact> = input
        .subjects
        .iter()
        .map(|s| SubjectFact {
            needs_special_room: s.needs_special_room,
        })
        .collect();

    // Merge explicit requirements with Stundentafel-expanded ones
    let stundentafel_reqs = expand_stundentafeln(input);
    let all_requirements: Vec<&LessonRequirement> = input
        .requirements
        .iter()
        .chain(stundentafel_reqs.iter())
        .collect();

    // Expand requirements into individual lessons
    let mut lessons = Vec::new();
    let mut lesson_id = 0;
    for req in &all_requirements {
        let class_idx = class_uuid_to_idx[&req.class_id];
        let subject_idx = subject_uuid_to_idx[&req.subject_id];

        let teacher_idx = if let Some(tid) = req.teacher_id {
            teacher_uuid_to_idx[&tid]
        } else {
            // Find first qualified teacher — construction heuristic will optimize
            teachers
                .iter()
                .position(|t| t.qualified_subjects[subject_idx])
                .unwrap_or(0) // will produce a qualification violation if none qualified
        };

        for _ in 0..req.hours_per_week {
            lessons.push(PlanningLesson {
                id: lesson_id,
                subject_idx,
                teacher_idx,
                class_idx,
                timeslot: None,
                room: None,
            });
            lesson_id += 1;
        }
    }

    let facts = ProblemFacts {
        timeslots,
        rooms,
        teachers,
        classes,
        subjects,
    };

    let solution = PlanningSolution {
        lessons,
        facts,
        score: HardSoftScore::ZERO,
    };

    let maps = IndexMaps {
        teacher_uuid_to_idx,
        class_uuid_to_idx,
        room_uuid_to_idx,
        subject_uuid_to_idx,
        timeslot_uuid_to_idx,
        teacher_uuids,
        class_uuids,
        room_uuids,
        subject_uuids,
        timeslot_uuids,
    };

    (solution, maps)
}

pub fn to_output(
    solution: &PlanningSolution,
    maps: &IndexMaps,
    input: &ScheduleInput,
) -> ScheduleOutput {
    let mut timetable = Vec::new();
    let mut violations = Vec::new();

    for lesson in &solution.lessons {
        if let Some(ts_idx) = lesson.timeslot {
            timetable.push(Lesson {
                teacher_id: maps.teacher_uuids[lesson.teacher_idx],
                class_id: maps.class_uuids[lesson.class_idx],
                subject_id: maps.subject_uuids[lesson.subject_idx],
                room_id: lesson.room.map(|r| maps.room_uuids[r]),
                timeslot: input.timeslots[ts_idx].clone(),
            });
        } else {
            violations.push(Violation {
                description: format!(
                    "Could not place lesson: subject {} for class {}",
                    maps.subject_uuids[lesson.subject_idx], maps.class_uuids[lesson.class_idx],
                ),
            });
        }
    }

    // Also report constraint violations from the score
    let hard_violations = (-solution.score.hard) as u32;
    let unplaced = violations.len() as u32;

    ScheduleOutput {
        timetable,
        score: Score {
            hard_violations: hard_violations + unplaced,
            soft_score: solution.score.soft as f64,
        },
        violations,
        stats: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(day: u8, period: u8) -> TimeSlot {
        TimeSlot {
            id: Uuid::new_v4(),
            day,
            period,
        }
    }

    #[test]
    fn round_trip_single_lesson() {
        let slots = vec![ts(0, 1), ts(0, 2)];
        let math_id = Uuid::new_v4();
        let input = ScheduleInput {
            teachers: vec![Teacher {
                id: Uuid::new_v4(),
                name: "Alice".into(),
                max_hours_per_week: 28,
                is_part_time: false,
                available_slots: slots.clone(),
                qualified_subjects: vec![math_id],
                preferred_slots: vec![],
            }],
            classes: vec![SchoolClass {
                id: Uuid::new_v4(),
                name: "1A".into(),
                grade_level: 1,
                student_count: Some(25),
                class_teacher_id: None,
                available_slots: vec![],
                grade: None,
            }],
            rooms: vec![],
            subjects: vec![Subject {
                id: math_id,
                name: "Math".into(),
                needs_special_room: false,
            }],
            timeslots: slots,
            requirements: vec![LessonRequirement {
                class_id: Uuid::nil(), // placeholder — set below
                subject_id: math_id,
                teacher_id: None,
                hours_per_week: 2,
            }],
            stundentafeln: vec![],
        };
        // Fix up class_id
        let mut input = input;
        input.requirements[0].class_id = input.classes[0].id;

        let (solution, maps) = to_planning(&input);

        // Should have 2 lessons (hours_per_week = 2)
        assert_eq!(solution.lessons.len(), 2);
        // Should have 2 timeslots
        assert_eq!(solution.facts.timeslots.len(), 2);
        // Should have 1 teacher, 1 class, 0 rooms, 1 subject
        assert_eq!(solution.facts.teachers.len(), 1);
        assert_eq!(solution.facts.classes.len(), 1);
        assert_eq!(solution.facts.rooms.len(), 0);
        assert_eq!(solution.facts.subjects.len(), 1);
        // Teacher should be available in both timeslots
        assert_eq!(solution.facts.teachers[0].available_slots.count_ones(), 2);
        // Teacher should be qualified for math (subject idx 0)
        assert!(solution.facts.teachers[0].qualified_subjects[0]);
        // Index maps should be consistent
        assert_eq!(maps.teacher_uuids.len(), 1);
        assert_eq!(maps.timeslot_uuids.len(), 2);
    }

    #[test]
    fn to_output_maps_back_to_uuids() {
        let slot = ts(0, 1);
        let math_id = Uuid::new_v4();
        let teacher_id = Uuid::new_v4();
        let class_id = Uuid::new_v4();

        let input = ScheduleInput {
            teachers: vec![Teacher {
                id: teacher_id,
                name: "Alice".into(),
                max_hours_per_week: 28,
                is_part_time: false,
                available_slots: vec![slot.clone()],
                qualified_subjects: vec![math_id],
                preferred_slots: vec![],
            }],
            classes: vec![SchoolClass {
                id: class_id,
                name: "1A".into(),
                grade_level: 1,
                student_count: None,
                class_teacher_id: None,
                available_slots: vec![],
                grade: None,
            }],
            rooms: vec![],
            subjects: vec![Subject {
                id: math_id,
                name: "Math".into(),
                needs_special_room: false,
            }],
            timeslots: vec![slot.clone()],
            requirements: vec![LessonRequirement {
                class_id,
                subject_id: math_id,
                teacher_id: Some(teacher_id),
                hours_per_week: 1,
            }],
            stundentafeln: vec![],
        };

        let (mut solution, maps) = to_planning(&input);
        // Simulate assignment: lesson 0 → timeslot 0, no room
        solution.lessons[0].timeslot = Some(0);
        solution.score = HardSoftScore::ZERO;

        let output = to_output(&solution, &maps, &input);
        assert_eq!(output.timetable.len(), 1);
        assert_eq!(output.timetable[0].teacher_id, teacher_id);
        assert_eq!(output.timetable[0].class_id, class_id);
        assert_eq!(output.timetable[0].subject_id, math_id);
        assert_eq!(output.timetable[0].timeslot.id, slot.id);
        assert_eq!(output.timetable[0].room_id, None);
        assert_eq!(output.score.hard_violations, 0);
    }

    #[test]
    fn stundentafel_expands_to_requirements() {
        let slots = vec![ts(0, 1), ts(0, 2), ts(0, 3)];
        let math_id = Uuid::new_v4();
        let deutsch_id = Uuid::new_v4();
        let teacher_id = Uuid::new_v4();
        let class_id = Uuid::new_v4();

        let input = ScheduleInput {
            teachers: vec![Teacher {
                id: teacher_id,
                name: "Alice".into(),
                max_hours_per_week: 28,
                is_part_time: false,
                available_slots: slots.clone(),
                qualified_subjects: vec![math_id, deutsch_id],
                preferred_slots: vec![],
            }],
            classes: vec![SchoolClass {
                id: class_id,
                name: "1A".into(),
                grade_level: 1,
                student_count: Some(25),
                class_teacher_id: None,
                available_slots: vec![],
                grade: Some(1),
            }],
            rooms: vec![],
            subjects: vec![
                Subject {
                    id: math_id,
                    name: "Math".into(),
                    needs_special_room: false,
                },
                Subject {
                    id: deutsch_id,
                    name: "Deutsch".into(),
                    needs_special_room: false,
                },
            ],
            timeslots: slots,
            requirements: vec![],
            stundentafeln: vec![Stundentafel {
                grade: 1,
                entries: vec![
                    StundentafelEntry {
                        subject_id: math_id,
                        hours_per_week: 2,
                        teacher_id: None,
                    },
                    StundentafelEntry {
                        subject_id: deutsch_id,
                        hours_per_week: 1,
                        teacher_id: Some(teacher_id),
                    },
                ],
            }],
        };

        let (solution, _maps) = to_planning(&input);
        assert_eq!(solution.lessons.len(), 3);
    }

    #[test]
    fn stundentafel_explicit_requirement_wins() {
        let slots = vec![ts(0, 1), ts(0, 2)];
        let math_id = Uuid::new_v4();
        let teacher_a = Uuid::new_v4();
        let teacher_b = Uuid::new_v4();
        let class_id = Uuid::new_v4();

        let input = ScheduleInput {
            teachers: vec![
                Teacher {
                    id: teacher_a,
                    name: "Alice".into(),
                    max_hours_per_week: 28,
                    is_part_time: false,
                    available_slots: slots.clone(),
                    qualified_subjects: vec![math_id],
                    preferred_slots: vec![],
                },
                Teacher {
                    id: teacher_b,
                    name: "Bob".into(),
                    max_hours_per_week: 28,
                    is_part_time: false,
                    available_slots: slots.clone(),
                    qualified_subjects: vec![math_id],
                    preferred_slots: vec![],
                },
            ],
            classes: vec![SchoolClass {
                id: class_id,
                name: "1A".into(),
                grade_level: 1,
                student_count: Some(25),
                class_teacher_id: None,
                available_slots: vec![],
                grade: Some(1),
            }],
            rooms: vec![],
            subjects: vec![Subject {
                id: math_id,
                name: "Math".into(),
                needs_special_room: false,
            }],
            timeslots: slots,
            requirements: vec![LessonRequirement {
                class_id,
                subject_id: math_id,
                teacher_id: Some(teacher_b),
                hours_per_week: 1,
            }],
            stundentafeln: vec![Stundentafel {
                grade: 1,
                entries: vec![StundentafelEntry {
                    subject_id: math_id,
                    hours_per_week: 2,
                    teacher_id: None,
                }],
            }],
        };

        let (solution, _maps) = to_planning(&input);
        // Explicit requirement wins, stundentafel skipped for math
        assert_eq!(solution.lessons.len(), 1);
    }
}
