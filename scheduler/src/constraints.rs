use std::collections::HashMap;

use crate::planning::{HardSoftScore, PlanningLesson, ProblemFacts};

/// Evaluate all hard constraints from scratch. O(n²) for conflict constraints.
/// This is the reference implementation for correctness testing.
pub fn full_evaluate(lessons: &[PlanningLesson], facts: &ProblemFacts) -> HardSoftScore {
    let mut score = HardSoftScore::ZERO;

    // Only consider assigned lessons (timeslot is Some)
    let assigned: Vec<&PlanningLesson> = lessons.iter().filter(|l| l.timeslot.is_some()).collect();

    // Pairwise conflict constraints
    for i in 0..assigned.len() {
        for j in (i + 1)..assigned.len() {
            let a = assigned[i];
            let b = assigned[j];
            let same_ts = a.timeslot == b.timeslot;

            if same_ts {
                // 1. Teacher conflict
                if a.teacher_idx == b.teacher_idx {
                    score += HardSoftScore::hard(-1);
                }

                // 2. Class conflict
                if a.class_idx == b.class_idx {
                    score += HardSoftScore::hard(-1);
                }

                // 3. Room conflict (skip if either room is None)
                if let (Some(ra), Some(rb)) = (a.room, b.room) {
                    if ra == rb {
                        score += HardSoftScore::hard(-1);
                    }
                }
            }
        }
    }

    // Per-lesson constraints
    let mut teacher_hours: HashMap<usize, u32> = HashMap::new();

    for lesson in &assigned {
        let ts = lesson.timeslot.unwrap();
        let teacher = &facts.teachers[lesson.teacher_idx];

        // 4. Teacher availability
        if !teacher.available_slots[ts] {
            score += HardSoftScore::hard(-1);
        }

        // 6. Teacher qualification
        if !teacher.qualified_subjects[lesson.subject_idx] {
            score += HardSoftScore::hard(-1);
        }

        // Count hours for over-capacity check
        *teacher_hours.entry(lesson.teacher_idx).or_insert(0) += 1;

        // Room constraints (only if room assigned)
        if let Some(room_idx) = lesson.room {
            let room = &facts.rooms[room_idx];

            // 7. Room suitability
            if !room.suitable_subjects[lesson.subject_idx] {
                score += HardSoftScore::hard(-1);
            }

            // 8. Room capacity
            if let (Some(cap), Some(count)) =
                (room.capacity, facts.classes[lesson.class_idx].student_count)
            {
                if cap < count {
                    score += HardSoftScore::hard(-1);
                }
            }
        }
    }

    // 5. Teacher over-capacity
    for (&teacher_idx, &hours) in &teacher_hours {
        let max = facts.teachers[teacher_idx].max_hours;
        if hours > max {
            score += HardSoftScore::hard(-((hours - max) as i64));
        }
    }

    score
}
