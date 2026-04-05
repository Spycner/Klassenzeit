use crate::constraints::IncrementalState;
use crate::planning::*;

/// First Fit Decreasing construction heuristic with an externally-provided state.
///
/// Sorts lessons by constraint tightness (most constrained first), then
/// greedily assigns each lesson to the (timeslot, room) pair with the best
/// (least negative) score delta.
pub fn construct_with_state(
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
) -> HardSoftScore {
    // Build sorted order: most constrained lessons first
    let mut order: Vec<usize> = (0..lessons.len()).collect();
    order.sort_by(|&a, &b| {
        let tightness_a = constraint_tightness(&lessons[a], facts);
        let tightness_b = constraint_tightness(&lessons[b], facts);
        tightness_a.cmp(&tightness_b)
    });

    // Sort timeslots by (day, period) for deterministic ordering
    let mut sorted_slot_indices: Vec<usize> = (0..facts.timeslots.len()).collect();
    sorted_slot_indices.sort_by_key(|&i| (facts.timeslots[i].day, facts.timeslots[i].period));

    // Precompute sorted rooms per subject (smallest suitable room first)
    let rooms_for_subject: Vec<Vec<usize>> = (0..facts.subjects.len())
        .map(|subj_idx| {
            let mut suitable: Vec<usize> = (0..facts.rooms.len())
                .filter(|&r| facts.rooms[r].suitable_subjects[subj_idx])
                .collect();
            suitable.sort_by_key(|&r| facts.rooms[r].capacity.unwrap_or(u32::MAX));
            suitable
        })
        .collect();

    for &lesson_idx in &order {
        let lesson = &lessons[lesson_idx];
        let needs_room = facts.subjects[lesson.subject_idx].needs_special_room;

        let candidates: Vec<(usize, Option<usize>)> = if needs_room {
            // Try all (slot, room) combinations
            sorted_slot_indices
                .iter()
                .flat_map(|&slot| {
                    rooms_for_subject[lesson.subject_idx]
                        .iter()
                        .map(move |&room| (slot, Some(room)))
                })
                .collect()
        } else {
            sorted_slot_indices
                .iter()
                .map(|&slot| (slot, None))
                .collect()
        };

        // Find the best candidate
        let mut best: Option<(usize, Option<usize>, HardSoftScore)> = None;
        for (slot, room) in candidates {
            let delta = state.evaluate_assign(lesson, slot, room, facts);
            if delta == HardSoftScore::ZERO {
                // Perfect — no violations, use it immediately
                best = Some((slot, room, delta));
                break;
            }
            match &best {
                None => best = Some((slot, room, delta)),
                Some((_, _, best_delta)) if delta > *best_delta => {
                    best = Some((slot, room, delta));
                }
                _ => {}
            }
        }

        if let Some((slot, room, _)) = best {
            state.assign(&mut lessons[lesson_idx], slot, room, facts);
        }
        // If no candidate at all (empty timeslots), lesson stays unassigned
    }

    state.score()
}

/// Original function for backwards compatibility with tests.
pub fn construct(lessons: &mut [PlanningLesson], facts: &ProblemFacts) -> HardSoftScore {
    let mut state = IncrementalState::new(facts);
    construct_with_state(lessons, facts, &mut state)
}

/// Lower = more constrained = should be placed first.
fn constraint_tightness(lesson: &PlanningLesson, facts: &ProblemFacts) -> (usize, usize, u32) {
    let teacher = &facts.teachers[lesson.teacher_idx];
    let class = &facts.classes[lesson.class_idx];

    // Primary: number of timeslots where BOTH teacher and class are available
    let eligible_slots = teacher
        .available_slots
        .iter()
        .zip(class.available_slots.iter())
        .filter(|(t, c)| **t && **c)
        .count();

    // Secondary: total capacity of suitable rooms (weighted by max_concurrent)
    let eligible_rooms = if facts.subjects[lesson.subject_idx].needs_special_room {
        (0..facts.rooms.len())
            .filter(|&r| facts.rooms[r].suitable_subjects[lesson.subject_idx])
            .map(|r| {
                facts.rooms[r]
                    .max_concurrent_at_slot
                    .iter()
                    .map(|&c| c as usize)
                    .sum::<usize>()
            })
            .sum()
    } else {
        usize::MAX // doesn't need a room, least constrained on this dimension
    };

    // Tertiary: teacher max_hours — teachers with lower capacity (shared Fachlehrer) are
    // more globally constrained and should be placed before less-loaded teachers.
    let teacher_max = teacher.max_hours;

    (eligible_slots, eligible_rooms, teacher_max)
}
