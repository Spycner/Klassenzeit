use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use std::collections::VecDeque;
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
    pub tabu_tenure: usize,
}

impl Default for LahcConfig {
    fn default() -> Self {
        Self {
            list_length: 500,
            max_seconds: 60,
            max_idle_ms: 30_000,
            seed: None,
            history_sample_interval: 1000,
            tabu_tenure: 7,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TabuEntry {
    Change {
        lesson_idx: usize,
        target_timeslot: usize,
        target_room: Option<usize>,
    },
    Swap {
        idx_a: usize,
        idx_b: usize,
    },
    Kempe {
        seed_lesson_idx: usize,
        target_timeslot: usize,
    },
}

pub struct TabuList {
    entries: VecDeque<TabuEntry>,
    capacity: usize,
}

impl TabuList {
    pub fn new(capacity: usize) -> Self {
        Self {
            entries: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, entry: TabuEntry) {
        if self.capacity == 0 {
            return;
        }
        if self.entries.len() == self.capacity {
            self.entries.pop_front();
        }
        self.entries.push_back(entry);
    }

    pub fn is_tabu(&self, candidate: &TabuEntry) -> bool {
        self.entries.iter().any(|e| Self::matches(e, candidate))
    }

    fn matches(stored: &TabuEntry, candidate: &TabuEntry) -> bool {
        match (stored, candidate) {
            (
                TabuEntry::Change {
                    lesson_idx: l1,
                    target_timeslot: ts1,
                    target_room: r1,
                },
                TabuEntry::Change {
                    lesson_idx: l2,
                    target_timeslot: ts2,
                    target_room: r2,
                },
            ) => l1 == l2 && ts1 == ts2 && r1 == r2,
            (
                TabuEntry::Swap {
                    idx_a: a1,
                    idx_b: b1,
                },
                TabuEntry::Swap {
                    idx_a: a2,
                    idx_b: b2,
                },
            ) => {
                let (min1, max1) = if a1 <= b1 { (a1, b1) } else { (b1, a1) };
                let (min2, max2) = if a2 <= b2 { (a2, b2) } else { (b2, a2) };
                min1 == min2 && max1 == max2
            }
            (
                TabuEntry::Kempe {
                    seed_lesson_idx: s1,
                    target_timeslot: ts1,
                },
                TabuEntry::Kempe {
                    seed_lesson_idx: s2,
                    target_timeslot: ts2,
                },
            ) => s1 == s2 && ts1 == ts2,
            _ => false,
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
    #[allow(dead_code)]
    Kempe {
        seed_lesson_idx: usize,
        original_timeslot: usize,
        moves: Vec<(usize, usize, Option<usize>)>, // (lesson_idx, old_timeslot, old_room)
    },
}

const MAX_KEMPE_CHAIN_SIZE: usize = 20;

/// Build a Kempe chain by BFS over shared resources between two timeslots.
///
/// Returns `Some((from_a, from_b))` where:
/// - `from_a`: lesson indices currently at `ts_a` that should move to `ts_b`
/// - `from_b`: lesson indices currently at `ts_b` that should move to `ts_a`
///
/// Returns `None` if the chain exceeds `MAX_KEMPE_CHAIN_SIZE`.
pub fn build_kempe_chain(
    seed_idx: usize,
    ts_b: usize,
    lessons: &[PlanningLesson],
    _facts: &ProblemFacts,
) -> Option<(Vec<usize>, Vec<usize>)> {
    let ts_a = lessons[seed_idx].timeslot.unwrap();
    debug_assert_ne!(ts_a, ts_b);

    let at_a: Vec<usize> = lessons
        .iter()
        .enumerate()
        .filter(|(_, l)| l.timeslot == Some(ts_a))
        .map(|(i, _)| i)
        .collect();
    let at_b: Vec<usize> = lessons
        .iter()
        .enumerate()
        .filter(|(_, l)| l.timeslot == Some(ts_b))
        .map(|(i, _)| i)
        .collect();

    let mut from_a: Vec<usize> = vec![seed_idx];
    let mut from_b: Vec<usize> = Vec::new();
    let mut in_chain: Vec<bool> = vec![false; lessons.len()];
    in_chain[seed_idx] = true;

    let mut changed = true;
    while changed {
        changed = false;

        for &b_idx in &at_b {
            if in_chain[b_idx] {
                continue;
            }
            let b_lesson = &lessons[b_idx];
            let conflicts = from_a.iter().any(|&a_idx| {
                let a_lesson = &lessons[a_idx];
                a_lesson.teacher_idx == b_lesson.teacher_idx
                    || a_lesson.class_idx == b_lesson.class_idx
                    || (a_lesson.room.is_some() && a_lesson.room == b_lesson.room)
            });
            if conflicts {
                in_chain[b_idx] = true;
                from_b.push(b_idx);
                changed = true;
                if from_a.len() + from_b.len() > MAX_KEMPE_CHAIN_SIZE {
                    return None;
                }
            }
        }

        for &a_idx in &at_a {
            if in_chain[a_idx] {
                continue;
            }
            let a_lesson = &lessons[a_idx];
            let conflicts = from_b.iter().any(|&b_idx| {
                let b_lesson = &lessons[b_idx];
                a_lesson.teacher_idx == b_lesson.teacher_idx
                    || a_lesson.class_idx == b_lesson.class_idx
                    || (a_lesson.room.is_some() && a_lesson.room == b_lesson.room)
            });
            if conflicts {
                in_chain[a_idx] = true;
                from_a.push(a_idx);
                changed = true;
                if from_a.len() + from_b.len() > MAX_KEMPE_CHAIN_SIZE {
                    return None;
                }
            }
        }
    }

    Some((from_a, from_b))
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

    if assigned_indices.len() < 2 || facts.timeslots.len() < 2 {
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

    let mut tabu = TabuList::new(config.tabu_tenure);

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
        let is_new_best = new_score > best_score;

        // Tabu check: does this move's target match a forbidden entry?
        let candidate_tabu = match &undo {
            UndoInfo::Change { lesson_idx, .. } => TabuEntry::Change {
                lesson_idx: *lesson_idx,
                target_timeslot: lessons[*lesson_idx].timeslot.unwrap(),
                target_room: lessons[*lesson_idx].room,
            },
            UndoInfo::Swap { idx_a, idx_b } => TabuEntry::Swap {
                idx_a: *idx_a,
                idx_b: *idx_b,
            },
            UndoInfo::Kempe { .. } => unreachable!(),
        };

        if tabu.is_tabu(&candidate_tabu) && !is_new_best {
            // Tabu rejection — undo move
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
                    let ts_a = lessons[idx_a].timeslot.unwrap();
                    let room_a = lessons[idx_a].room;
                    let ts_b = lessons[idx_b].timeslot.unwrap();
                    let room_b = lessons[idx_b].room;
                    state.unassign(&mut lessons[idx_a], facts);
                    state.unassign(&mut lessons[idx_b], facts);
                    state.assign(&mut lessons[idx_a], ts_b, room_b, facts);
                    state.assign(&mut lessons[idx_b], ts_a, room_a, facts);
                }
                UndoInfo::Kempe { .. } => unreachable!(),
            }
            stats.moves_rejected += 1;
            continue;
        }

        let list_idx = (iteration as usize) % config.list_length;
        let list_score = fitness_list[list_idx];

        // LAHC acceptance (or aspiration for new best)
        if is_new_best || new_score >= list_score || new_score >= current_score {
            // Accept — record OLD position as tabu (forbid returning)
            let tabu_record = match &undo {
                UndoInfo::Change {
                    lesson_idx,
                    old_timeslot,
                    old_room,
                } => TabuEntry::Change {
                    lesson_idx: *lesson_idx,
                    target_timeslot: *old_timeslot,
                    target_room: *old_room,
                },
                UndoInfo::Swap { idx_a, idx_b } => TabuEntry::Swap {
                    idx_a: *idx_a,
                    idx_b: *idx_b,
                },
                UndoInfo::Kempe { .. } => unreachable!(),
            };
            tabu.push(tabu_record);

            current_score = new_score;
            stats.moves_accepted += 1;

            if is_new_best {
                best_score = new_score;
                best_lessons = lessons.to_vec();
                stats.best_found_at_iteration = iteration;
                last_improvement = Instant::now();
            }
        } else {
            // LAHC rejection — undo move
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
                    let ts_a = lessons[idx_a].timeslot.unwrap();
                    let room_a = lessons[idx_a].room;
                    let ts_b = lessons[idx_b].timeslot.unwrap();
                    let room_b = lessons[idx_b].room;
                    state.unassign(&mut lessons[idx_a], facts);
                    state.unassign(&mut lessons[idx_b], facts);
                    state.assign(&mut lessons[idx_a], ts_b, room_b, facts);
                    state.assign(&mut lessons[idx_b], ts_a, room_a, facts);
                }
                UndoInfo::Kempe { .. } => unreachable!(),
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
