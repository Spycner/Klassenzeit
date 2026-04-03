pub mod types;

use std::collections::{HashMap, HashSet};
use types::*;
use uuid::Uuid;

pub fn solve(input: ScheduleInput) -> ScheduleOutput {
    let mut timetable = Vec::new();
    let mut violations = Vec::new();

    let mut teacher_booked: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();
    let mut class_booked: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();
    let mut room_booked: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();
    let mut teacher_hours: HashMap<Uuid, u32> = HashMap::new();

    let mut teachers_by_subject: HashMap<Uuid, Vec<&Teacher>> = HashMap::new();
    for teacher in &input.teachers {
        for &subj_id in &teacher.qualified_subjects {
            teachers_by_subject
                .entry(subj_id)
                .or_default()
                .push(teacher);
        }
    }

    let mut teacher_available_slots: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();
    for teacher in &input.teachers {
        let slots: HashSet<Uuid> = teacher.available_slots.iter().map(|s| s.id).collect();
        teacher_available_slots.insert(teacher.id, slots);
    }

    let mut sorted_slots = input.timeslots.clone();
    sorted_slots.sort_by_key(|s| (s.day, s.period));

    // Expand requirements into individual lesson requests
    struct LessonRequest {
        class_id: Uuid,
        subject_id: Uuid,
        teacher_id: Option<Uuid>,
        eligible_teacher_count: usize,
    }

    let mut lesson_requests: Vec<LessonRequest> = Vec::new();
    for req in &input.requirements {
        for _ in 0..req.hours_per_week {
            let eligible_teacher_count = if req.teacher_id.is_some() {
                1
            } else {
                teachers_by_subject
                    .get(&req.subject_id)
                    .map_or(0, |v| v.len())
            };
            lesson_requests.push(LessonRequest {
                class_id: req.class_id,
                subject_id: req.subject_id,
                teacher_id: req.teacher_id,
                eligible_teacher_count,
            });
        }
    }
    lesson_requests.sort_by_key(|r| r.eligible_teacher_count);

    let mut rooms_by_subject: HashMap<Uuid, Vec<&Room>> = HashMap::new();
    for room in &input.rooms {
        for &subj_id in &room.suitable_subjects {
            rooms_by_subject.entry(subj_id).or_default().push(room);
        }
    }

    let subjects: HashMap<Uuid, &Subject> = input.subjects.iter().map(|s| (s.id, s)).collect();

    for request in &lesson_requests {
        let needs_room = subjects
            .get(&request.subject_id)
            .is_some_and(|s| s.needs_special_room);

        let candidate_teachers: Vec<&Teacher> = if let Some(tid) = request.teacher_id {
            input.teachers.iter().filter(|t| t.id == tid).collect()
        } else {
            teachers_by_subject
                .get(&request.subject_id)
                .cloned()
                .unwrap_or_default()
        };

        if candidate_teachers.is_empty() {
            violations.push(Violation {
                description: format!(
                    "No qualified teacher for subject {} in class {}",
                    request.subject_id, request.class_id
                ),
            });
            continue;
        }

        let mut placed = false;

        for slot in &sorted_slots {
            if class_booked
                .get(&slot.id)
                .is_some_and(|s| s.contains(&request.class_id))
            {
                continue;
            }

            let mut sorted_teachers: Vec<&&Teacher> = candidate_teachers.iter().collect();
            sorted_teachers.sort_by_key(|t| {
                let used = teacher_hours.get(&t.id).copied().unwrap_or(0);
                std::cmp::Reverse(t.max_hours_per_week.saturating_sub(used))
            });

            for teacher in sorted_teachers {
                if teacher_booked
                    .get(&slot.id)
                    .is_some_and(|s| s.contains(&teacher.id))
                {
                    continue;
                }
                if !teacher_available_slots
                    .get(&teacher.id)
                    .is_some_and(|s| s.contains(&slot.id))
                {
                    continue;
                }
                let used = teacher_hours.get(&teacher.id).copied().unwrap_or(0);
                if used >= teacher.max_hours_per_week {
                    continue;
                }

                let room_id = if needs_room {
                    let suitable = rooms_by_subject
                        .get(&request.subject_id)
                        .cloned()
                        .unwrap_or_default();
                    let mut found = None;
                    for room in &suitable {
                        if room_booked
                            .get(&slot.id)
                            .is_some_and(|s| s.contains(&room.id))
                        {
                            continue;
                        }
                        if let Some(cap) = room.capacity {
                            let student_count = input
                                .classes
                                .iter()
                                .find(|c| c.id == request.class_id)
                                .and_then(|c| c.student_count);
                            if let Some(count) = student_count {
                                if cap < count {
                                    continue;
                                }
                            }
                        }
                        found = Some(room.id);
                        break;
                    }
                    if found.is_none() {
                        continue;
                    }
                    found
                } else {
                    None
                };

                timetable.push(Lesson {
                    teacher_id: teacher.id,
                    class_id: request.class_id,
                    subject_id: request.subject_id,
                    room_id,
                    timeslot: slot.clone(),
                });

                teacher_booked
                    .entry(slot.id)
                    .or_default()
                    .insert(teacher.id);
                class_booked
                    .entry(slot.id)
                    .or_default()
                    .insert(request.class_id);
                if let Some(rid) = room_id {
                    room_booked.entry(slot.id).or_default().insert(rid);
                }
                *teacher_hours.entry(teacher.id).or_insert(0) += 1;

                placed = true;
                break;
            }

            if placed {
                break;
            }
        }

        if !placed {
            violations.push(Violation {
                description: format!(
                    "Could not place lesson: subject {} for class {}",
                    request.subject_id, request.class_id
                ),
            });
        }
    }

    ScheduleOutput {
        timetable,
        score: Score {
            hard_violations: violations.len() as u32,
            soft_score: 0.0,
        },
        violations,
    }
}
