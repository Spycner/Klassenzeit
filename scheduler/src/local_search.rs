use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use std::time::Instant;

use crate::constraints::IncrementalState;
use crate::planning::*;
use crate::types::SolveStats;

pub struct LahcConfig {
    pub list_length: usize,
    pub max_seconds: u64,
    pub max_idle_ms: u64,
    pub seed: Option<u64>,
    pub history_sample_interval: u64,
}

impl Default for LahcConfig {
    fn default() -> Self {
        Self {
            list_length: 500,
            max_seconds: 60,
            max_idle_ms: 2_000,
            seed: None,
            history_sample_interval: 1000,
        }
    }
}

enum UndoInfo {
    Change {
        lesson_idx: usize,
        old_timeslot: usize,
        old_room: Option<usize>,
    },
    Swap {
        idx_a: usize,
        idx_b: usize,
    },
}

pub fn optimize(
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
    config: &LahcConfig,
) -> SolveStats {
    let start = Instant::now();

    // Collect indices of assigned lessons
    let assigned_indices: Vec<usize> = lessons
        .iter()
        .enumerate()
        .filter(|(_, l)| l.timeslot.is_some())
        .map(|(i, _)| i)
        .collect();

    if assigned_indices.len() < 2 {
        return SolveStats::default();
    }

    // Initialize RNG
    let mut rng: SmallRng = match config.seed {
        Some(s) => SmallRng::seed_from_u64(s),
        None => SmallRng::from_entropy(),
    };

    // Precompute rooms per subject
    let rooms_for_subject: Vec<Vec<usize>> = (0..facts.subjects.len())
        .map(|subj_idx| {
            (0..facts.rooms.len())
                .filter(|&r| facts.rooms[r].suitable_subjects[subj_idx])
                .collect()
        })
        .collect();

    let num_timeslots = facts.timeslots.len();

    // Initialize LAHC fitness list
    let initial_score = state.score();
    let mut fitness_list = vec![initial_score; config.list_length];

    let mut current_score = initial_score;
    let mut best_score = initial_score;
    let mut best_lessons: Vec<PlanningLesson> = lessons.to_vec();

    let mut stats = SolveStats {
        score_history: vec![(0, initial_score.hard, initial_score.soft)],
        ..Default::default()
    };

    let mut last_improvement = Instant::now();
    let mut iteration: u64 = 0;

    // Early exit if score is already perfect
    if best_score.hard == 0 && best_score.soft == 0 {
        return stats;
    }

    loop {
        // Check termination
        let elapsed = start.elapsed();
        if elapsed.as_secs() >= config.max_seconds {
            break;
        }
        if last_improvement.elapsed().as_millis() as u64 >= config.max_idle_ms {
            break;
        }

        iteration += 1;

        // Pick a move: 50% Change, 50% Swap
        let undo = if rng.gen_bool(0.5) {
            // Change move
            let idx = assigned_indices[rng.gen_range(0..assigned_indices.len())];
            let old_timeslot = lessons[idx].timeslot.unwrap();
            let old_room = lessons[idx].room;

            let needs_room = facts.subjects[lessons[idx].subject_idx].needs_special_room;
            let new_timeslot = rng.gen_range(0..num_timeslots);
            let new_room = if needs_room {
                let rooms = &rooms_for_subject[lessons[idx].subject_idx];
                if rooms.is_empty() {
                    None
                } else {
                    Some(rooms[rng.gen_range(0..rooms.len())])
                }
            } else {
                None
            };

            // Skip no-op
            if new_timeslot == old_timeslot && new_room == old_room {
                continue;
            }

            state.unassign(&mut lessons[idx], facts);
            state.assign(&mut lessons[idx], new_timeslot, new_room, facts);

            UndoInfo::Change {
                lesson_idx: idx,
                old_timeslot,
                old_room,
            }
        } else {
            // Swap move
            let a_pos = rng.gen_range(0..assigned_indices.len());
            let mut b_pos = rng.gen_range(0..assigned_indices.len() - 1);
            if b_pos >= a_pos {
                b_pos += 1;
            }
            let idx_a = assigned_indices[a_pos];
            let idx_b = assigned_indices[b_pos];

            let ts_a = lessons[idx_a].timeslot.unwrap();
            let room_a = lessons[idx_a].room;
            let ts_b = lessons[idx_b].timeslot.unwrap();
            let room_b = lessons[idx_b].room;

            // Skip no-op
            if ts_a == ts_b && room_a == room_b {
                continue;
            }

            // Unassign both, then assign swapped
            state.unassign(&mut lessons[idx_a], facts);
            state.unassign(&mut lessons[idx_b], facts);
            state.assign(&mut lessons[idx_a], ts_b, room_b, facts);
            state.assign(&mut lessons[idx_b], ts_a, room_a, facts);

            UndoInfo::Swap { idx_a, idx_b }
        };

        let new_score = state.score();
        let list_idx = (iteration as usize) % config.list_length;
        let list_score = fitness_list[list_idx];

        // Accept if new_score >= list entry OR new_score >= current
        if new_score >= list_score || new_score >= current_score {
            // Accept
            current_score = new_score;
            stats.moves_accepted += 1;

            if new_score > best_score {
                best_score = new_score;
                best_lessons = lessons.to_vec();
                stats.best_found_at_iteration = iteration;
                last_improvement = Instant::now();
            }
        } else {
            // Reject — undo
            match undo {
                UndoInfo::Change {
                    lesson_idx,
                    old_timeslot,
                    old_room,
                } => {
                    state.unassign(&mut lessons[lesson_idx], facts);
                    state.assign(&mut lessons[lesson_idx], old_timeslot, old_room, facts);
                }
                UndoInfo::Swap { idx_a, idx_b } => {
                    // Swap back
                    let ts_a = lessons[idx_a].timeslot.unwrap();
                    let room_a = lessons[idx_a].room;
                    let ts_b = lessons[idx_b].timeslot.unwrap();
                    let room_b = lessons[idx_b].room;

                    state.unassign(&mut lessons[idx_a], facts);
                    state.unassign(&mut lessons[idx_b], facts);
                    state.assign(&mut lessons[idx_a], ts_b, room_b, facts);
                    state.assign(&mut lessons[idx_b], ts_a, room_a, facts);
                }
            }
            stats.moves_rejected += 1;
        }

        // Update fitness list
        fitness_list[list_idx] = current_score;

        // Sample score history
        if iteration.is_multiple_of(config.history_sample_interval) {
            stats
                .score_history
                .push((iteration, current_score.hard, current_score.soft));
        }
    }

    // Restore best solution if current isn't best
    if current_score != best_score {
        restore_solution(lessons, &best_lessons, state, facts);
    }

    let total_elapsed = start.elapsed();
    stats.iterations = iteration;
    stats.local_search_ms = total_elapsed.as_millis() as u64;
    if total_elapsed.as_secs_f64() > 0.0 {
        stats.iterations_per_sec = iteration as f64 / total_elapsed.as_secs_f64();
    }

    stats
}

fn restore_solution(
    lessons: &mut [PlanningLesson],
    best_lessons: &[PlanningLesson],
    state: &mut IncrementalState,
    facts: &ProblemFacts,
) {
    // Unassign all
    for lesson in lessons.iter_mut() {
        if lesson.timeslot.is_some() {
            state.unassign(lesson, facts);
        }
    }
    // Reassign from best
    for (lesson, best) in lessons.iter_mut().zip(best_lessons.iter()) {
        if let Some(ts) = best.timeslot {
            state.assign(lesson, ts, best.room, facts);
        }
    }
}
