# Kempe Chain Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kempe chain moves to the LAHC+Tabu solver so it can escape solution basins that Change+Swap can't reach.

**Architecture:** New `build_kempe_chain()` function in `local_search.rs` performs BFS over shared resources (teacher, class, room) between two timeslots. The chain is executed as an atomic batch of unassign/assign calls, integrated into the existing LAHC acceptance + Tabu rejection loop. A small public accessor on `IncrementalState` enables room capacity checks during chain execution.

**Tech Stack:** Rust, existing `scheduler` crate infrastructure (IncrementalState, PlanningLesson, ProblemFacts)

---

### Task 1: Add `kempe_attempted` / `kempe_accepted` to `SolveStats`

**Files:**
- Modify: `scheduler/src/types.rs:24-33`

- [ ] **Step 1: Add fields to `SolveStats`**

In `scheduler/src/types.rs`, add two new fields to the `SolveStats` struct:

```rust
#[derive(Debug, Clone, Default)]
pub struct SolveStats {
    pub construction_ms: u64,
    pub local_search_ms: u64,
    pub iterations: u64,
    pub iterations_per_sec: f64,
    pub moves_accepted: u64,
    pub moves_rejected: u64,
    pub kempe_attempted: u64,
    pub kempe_accepted: u64,
    pub score_history: Vec<(u64, i64, i64)>, // (iteration, hard, soft)
    pub best_found_at_iteration: u64,
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p klassenzeit-scheduler`
Expected: compiles cleanly (Default derive handles the new `u64` fields)

- [ ] **Step 3: Commit**

```bash
git add scheduler/src/types.rs
git commit -m "feat(scheduler): add kempe stats fields to SolveStats"
```

---

### Task 2: Add `room_count_at_slot` accessor to `IncrementalState`

**Files:**
- Modify: `scheduler/src/constraints.rs`
- Test: `scheduler/tests/incremental.rs`

- [ ] **Step 1: Write the failing test**

Add to the bottom of `scheduler/tests/incremental.rs`:

```rust
#[test]
fn room_count_at_slot_tracks_assignments() {
    let facts = make_facts(4, 1, 2, 1, 1);
    let mut state = IncrementalState::new(&facts);

    assert_eq!(state.room_count_at_slot(0, 0), 0);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, Some(0), &facts);
    assert_eq!(state.room_count_at_slot(0, 0), 1);

    let mut l1 = unassigned_lesson(1, 0, 1, 0);
    state.assign(&mut l1, 0, Some(0), &facts);
    assert_eq!(state.room_count_at_slot(0, 0), 2);

    state.unassign(&mut l1, &facts);
    assert_eq!(state.room_count_at_slot(0, 0), 1);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p klassenzeit-scheduler --test incremental room_count_at_slot_tracks_assignments`
Expected: FAIL — `room_count_at_slot` method doesn't exist

- [ ] **Step 3: Add the accessor method**

In `scheduler/src/constraints.rs`, add this method to the `impl IncrementalState` block, right after the `score()` method (around line 294):

```rust
    /// How many lessons occupy this (room, timeslot) pair right now.
    pub fn room_count_at_slot(&self, room: usize, timeslot: usize) -> u16 {
        self.room_at_slot[room][timeslot]
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p klassenzeit-scheduler --test incremental room_count_at_slot_tracks_assignments`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/constraints.rs scheduler/tests/incremental.rs
git commit -m "feat(scheduler): add room_count_at_slot accessor on IncrementalState"
```

---

### Task 3: Add `TabuEntry::Kempe` and `UndoInfo::Kempe` variants

**Files:**
- Modify: `scheduler/src/local_search.rs:32-115`
- Test: `scheduler/tests/local_search.rs`

- [ ] **Step 1: Write failing test for Kempe tabu matching**

Add to the bottom of `scheduler/tests/local_search.rs`:

```rust
#[test]
fn tabu_list_rejects_forbidden_kempe_move() {
    let mut tabu = TabuList::new(3);
    tabu.push(TabuEntry::Kempe {
        seed_lesson_idx: 4,
        target_timeslot: 2,
    });
    assert!(tabu.is_tabu(&TabuEntry::Kempe {
        seed_lesson_idx: 4,
        target_timeslot: 2,
    }));
    // Different seed or timeslot should not match
    assert!(!tabu.is_tabu(&TabuEntry::Kempe {
        seed_lesson_idx: 4,
        target_timeslot: 3,
    }));
    assert!(!tabu.is_tabu(&TabuEntry::Kempe {
        seed_lesson_idx: 5,
        target_timeslot: 2,
    }));
    // Kempe should not match Change or Swap
    assert!(!tabu.is_tabu(&TabuEntry::Change {
        lesson_idx: 4,
        target_timeslot: 2,
        target_room: None,
    }));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p klassenzeit-scheduler --test local_search tabu_list_rejects_forbidden_kempe_move`
Expected: FAIL — `TabuEntry::Kempe` doesn't exist

- [ ] **Step 3: Add `TabuEntry::Kempe` variant and update matching**

In `scheduler/src/local_search.rs`, add the Kempe variant to `TabuEntry` (after the Swap variant, around line 39):

```rust
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
```

Update `TabuList::matches()` to handle the new variant. Add a Kempe arm to the match:

```rust
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
```

Also add the `UndoInfo::Kempe` variant:

```rust
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
    Kempe {
        seed_lesson_idx: usize,
        original_timeslot: usize,
        moves: Vec<(usize, usize, Option<usize>)>, // (lesson_idx, old_timeslot, old_room)
    },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p klassenzeit-scheduler --test local_search tabu_list_rejects_forbidden_kempe_move`
Expected: PASS

- [ ] **Step 5: Run full test suite to check nothing broke**

Run: `cargo test -p klassenzeit-scheduler`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add scheduler/src/local_search.rs scheduler/tests/local_search.rs
git commit -m "feat(scheduler): add TabuEntry::Kempe and UndoInfo::Kempe variants"
```

---

### Task 4: Implement `build_kempe_chain()` function

**Files:**
- Modify: `scheduler/src/local_search.rs`
- Create: `scheduler/tests/kempe.rs`

This is the core algorithm. The function takes a seed lesson index, a target timeslot, the lessons slice, and problem facts, and returns the two sets of lesson indices to swap (or `None` if the chain exceeds the max size).

- [ ] **Step 1: Write failing unit test for chain construction**

Create `scheduler/tests/kempe.rs`:

```rust
use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::{full_evaluate, IncrementalState};
use klassenzeit_scheduler::local_search::build_kempe_chain;
use klassenzeit_scheduler::planning::*;

/// Helper: create minimal problem facts with given counts.
/// All teachers available everywhere, qualified for everything, rooms suitable for all subjects.
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
                available_slots: bitvec![1; num_timeslots],
            })
            .collect(),
        rooms: (0..num_rooms)
            .map(|_| RoomFact {
                capacity: Some(30),
                suitable_subjects: bitvec![1; num_subjects],
                max_concurrent_at_slot: vec![1; num_timeslots],
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact {
                needs_special_room: false,
            })
            .collect(),
    }
}

fn assigned_lesson(
    id: usize,
    teacher: usize,
    class: usize,
    subject: usize,
    timeslot: usize,
) -> PlanningLesson {
    PlanningLesson {
        id,
        subject_idx: subject,
        teacher_idx: teacher,
        class_idx: class,
        timeslot: Some(timeslot),
        room: None,
    }
}

#[test]
fn kempe_chain_links_shared_teacher() {
    // 2 timeslots, 2 teachers, 2 classes
    // ts0: L0 (teacher0, class0), L1 (teacher1, class1)
    // ts1: L2 (teacher0, class1)
    //
    // Seed: L0 at ts0, target ts1.
    // L0 shares teacher0 with L2 at ts1, so L2 must also move.
    // L2 shares class1 with L1 at ts0, so L1 must also move.
    // Chain: {L0, L1} move ts0→ts1, {L2} moves ts1→ts0.
    let facts = make_facts(2, 2, 2, 0, 1);
    let lessons = vec![
        assigned_lesson(0, 0, 0, 0, 0), // L0: teacher0, class0 @ ts0
        assigned_lesson(1, 1, 1, 0, 0), // L1: teacher1, class1 @ ts0
        assigned_lesson(2, 0, 1, 0, 1), // L2: teacher0, class1 @ ts1
    ];

    let result = build_kempe_chain(0, 1, &lessons, &facts);
    let (from_a, from_b) = result.unwrap();

    // from_a = lessons moving ts0→ts1: should include L0 and L1
    assert!(from_a.contains(&0));
    assert!(from_a.contains(&1));
    assert_eq!(from_a.len(), 2);

    // from_b = lessons moving ts1→ts0: should include L2
    assert!(from_b.contains(&2));
    assert_eq!(from_b.len(), 1);
}

#[test]
fn kempe_chain_single_lesson_no_conflicts() {
    // Seed lesson has no resource conflicts at target timeslot.
    // Chain should be just the seed.
    let facts = make_facts(2, 2, 2, 0, 1);
    let lessons = vec![
        assigned_lesson(0, 0, 0, 0, 0), // L0: teacher0, class0 @ ts0
        assigned_lesson(1, 1, 1, 0, 1), // L1: teacher1, class1 @ ts1 (no shared resources with L0)
    ];

    let result = build_kempe_chain(0, 1, &lessons, &facts);
    let (from_a, from_b) = result.unwrap();

    assert_eq!(from_a, vec![0]);
    assert!(from_b.is_empty());
}

#[test]
fn kempe_chain_respects_max_size() {
    // Create a scenario where chain would exceed MAX_KEMPE_CHAIN_SIZE (20).
    // 25 teachers, 25 classes, 2 timeslots. All lessons at ts0 share a
    // single teacher with a lesson at ts1, creating a chain of 50.
    let facts = make_facts(2, 25, 25, 0, 1);
    let mut lessons = Vec::new();
    // 25 lessons at ts0: each has a unique teacher and class
    for i in 0..25 {
        lessons.push(assigned_lesson(i, i, i, 0, 0));
    }
    // 25 lessons at ts1: lesson i shares teacher i with lesson i at ts0
    for i in 0..25 {
        // Use class (i+1)%25 so they also link across via class sharing
        lessons.push(assigned_lesson(25 + i, i, (i + 1) % 25, 0, 1));
    }

    let result = build_kempe_chain(0, 1, &lessons, &facts);
    // Chain should be None because it exceeds the cap
    assert!(result.is_none());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p klassenzeit-scheduler --test kempe kempe_chain`
Expected: FAIL — `build_kempe_chain` doesn't exist

- [ ] **Step 3: Implement `build_kempe_chain()`**

In `scheduler/src/local_search.rs`, add the function (before the `optimize` function):

```rust
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
    facts: &ProblemFacts,
) -> Option<(Vec<usize>, Vec<usize>)> {
    let ts_a = lessons[seed_idx].timeslot.unwrap();
    debug_assert_ne!(ts_a, ts_b);

    // Collect lessons at each timeslot for quick lookup
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

        // Find lessons at ts_b that share a resource with any lesson in from_a
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

        // Find lessons at ts_a that share a resource with any lesson in from_b
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p klassenzeit-scheduler --test kempe`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/local_search.rs scheduler/tests/kempe.rs
git commit -m "feat(scheduler): implement build_kempe_chain BFS algorithm"
```

---

### Task 5: Implement Kempe chain execution with room handling

**Files:**
- Modify: `scheduler/src/local_search.rs`
- Test: `scheduler/tests/kempe.rs`

- [ ] **Step 1: Write failing test for Kempe chain score consistency**

Add to `scheduler/tests/kempe.rs`:

```rust
fn unassigned_lesson(id: usize, teacher: usize, class: usize, subject: usize) -> PlanningLesson {
    PlanningLesson {
        id,
        subject_idx: subject,
        teacher_idx: teacher,
        class_idx: class,
        timeslot: None,
        room: None,
    }
}

#[test]
fn kempe_execute_score_matches_full_eval() {
    // Set up: 2 teachers, 2 classes, 4 timeslots, no rooms needed
    let facts = make_facts(4, 2, 2, 0, 1);
    let mut state = IncrementalState::new(&facts);

    // L0: teacher0, class0 @ ts0
    // L1: teacher1, class1 @ ts0
    // L2: teacher0, class1 @ ts1
    let mut lessons = vec![
        unassigned_lesson(0, 0, 0, 0),
        unassigned_lesson(1, 1, 1, 0),
        unassigned_lesson(2, 0, 1, 0),
    ];

    state.assign(&mut lessons[0], 0, None, &facts);
    state.assign(&mut lessons[1], 0, None, &facts);
    state.assign(&mut lessons[2], 1, None, &facts);

    // Execute Kempe chain: swap {L0, L1} and {L2} between ts0 and ts1
    let from_a = vec![0, 1]; // move ts0 → ts1
    let from_b = vec![2];    // move ts1 → ts0

    let mut rng = SmallRng::seed_from_u64(42);
    let rooms_for_subject: Vec<Vec<usize>> = vec![vec![]]; // no special rooms

    let result = execute_kempe_chain(
        &from_a,
        &from_b,
        1, // ts_b
        0, // ts_a
        &mut lessons,
        &facts,
        &mut state,
        &rooms_for_subject,
        &mut rng,
    );

    assert!(result.is_some(), "chain should not abort");
    // Verify lessons moved
    assert_eq!(lessons[0].timeslot, Some(1));
    assert_eq!(lessons[1].timeslot, Some(1));
    assert_eq!(lessons[2].timeslot, Some(0));

    // Verify incremental score matches full eval
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn kempe_execute_aborts_when_no_room_available() {
    // 2 timeslots, 1 room with max_concurrent=1 per slot
    // L0 needs special room, assigned to room0 @ ts0
    // L1 assigned to room0 @ ts1
    // Kempe tries to move L0 to ts1, but room0 is occupied by L1 (which isn't in chain)
    let mut facts = make_facts(2, 2, 2, 1, 1);
    facts.subjects[0].needs_special_room = true;
    let mut state = IncrementalState::new(&facts);

    let mut lessons = vec![
        unassigned_lesson(0, 0, 0, 0),
        unassigned_lesson(1, 1, 1, 0),
    ];

    state.assign(&mut lessons[0], 0, Some(0), &facts);
    state.assign(&mut lessons[1], 1, Some(0), &facts);

    let original_score = state.score();

    // Chain: only L0 moves ts0→ts1. L1 is NOT in the chain.
    let from_a = vec![0];
    let from_b: Vec<usize> = vec![];

    let mut rng = SmallRng::seed_from_u64(42);
    let rooms_for_subject: Vec<Vec<usize>> = vec![vec![0]];

    let result = execute_kempe_chain(
        &from_a,
        &from_b,
        1, // ts_b
        0, // ts_a
        &mut lessons,
        &facts,
        &mut state,
        &rooms_for_subject,
        &mut rng,
    );

    assert!(result.is_none(), "chain should abort — no room at target");
    // State should be fully restored
    assert_eq!(lessons[0].timeslot, Some(0));
    assert_eq!(lessons[0].room, Some(0));
    assert_eq!(lessons[1].timeslot, Some(1));
    assert_eq!(lessons[1].room, Some(0));
    assert_eq!(state.score(), original_score);
}
```

Add these imports to the top of `scheduler/tests/kempe.rs`:

```rust
use klassenzeit_scheduler::local_search::execute_kempe_chain;
use rand::rngs::SmallRng;
use rand::SeedableRng;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-scheduler --test kempe kempe_execute`
Expected: FAIL — `execute_kempe_chain` doesn't exist

- [ ] **Step 3: Implement `execute_kempe_chain()`**

In `scheduler/src/local_search.rs`, add this function after `build_kempe_chain()`:

```rust
/// Execute a Kempe chain: unassign all chain members, then reassign swapped.
///
/// Returns `Some(undo_moves)` on success — a vec of `(lesson_idx, old_timeslot, old_room)`
/// for every lesson that moved.
///
/// Returns `None` if a room can't be found for a special-room lesson (aborts and restores state).
pub fn execute_kempe_chain(
    from_a: &[usize],
    from_b: &[usize],
    ts_b: usize,
    ts_a: usize,
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
    rooms_for_subject: &[Vec<usize>],
    rng: &mut SmallRng,
) -> Option<Vec<(usize, usize, Option<usize>)>> {
    // Record old positions for undo
    let mut undo_moves: Vec<(usize, usize, Option<usize>)> = Vec::with_capacity(from_a.len() + from_b.len());
    for &idx in from_a.iter().chain(from_b.iter()) {
        undo_moves.push((idx, lessons[idx].timeslot.unwrap(), lessons[idx].room));
    }

    // Phase 1: Unassign all chain members
    for &idx in from_a.iter().chain(from_b.iter()) {
        state.unassign(&mut lessons[idx], facts);
    }

    // Phase 2: Assign from_a to ts_b, from_b to ts_a
    let assignments: Vec<(usize, usize)> = from_a
        .iter()
        .map(|&idx| (idx, ts_b))
        .chain(from_b.iter().map(|&idx| (idx, ts_a)))
        .collect();

    for (idx, target_ts) in &assignments {
        let idx = *idx;
        let target_ts = *target_ts;
        let needs_room = facts.subjects[lessons[idx].subject_idx].needs_special_room;

        let new_room = if needs_room {
            let old_room = undo_moves.iter().find(|(i, _, _)| *i == idx).unwrap().2;
            // Try to keep the same room if it has capacity
            if let Some(r) = old_room {
                let cap = facts.rooms[r].max_concurrent_at_slot[target_ts] as u16;
                if state.room_count_at_slot(r, target_ts) < cap {
                    Some(r)
                } else {
                    // Find another compatible room with capacity
                    find_room_with_capacity(
                        &rooms_for_subject[lessons[idx].subject_idx],
                        target_ts,
                        state,
                        facts,
                        rng,
                    )
                }
            } else {
                find_room_with_capacity(
                    &rooms_for_subject[lessons[idx].subject_idx],
                    target_ts,
                    state,
                    facts,
                    rng,
                )
            }
        } else {
            None
        };

        // If we need a room but couldn't find one, abort
        if needs_room && new_room.is_none() {
            // Unassign anything we already assigned in this phase
            for (prev_idx, prev_ts) in assignments.iter().take_while(|(i, _)| *i != idx) {
                if lessons[*prev_idx].timeslot.is_some() {
                    state.unassign(&mut lessons[*prev_idx], facts);
                }
            }
            // Restore all to original positions
            for &(orig_idx, orig_ts, orig_room) in &undo_moves {
                state.assign(&mut lessons[orig_idx], orig_ts, orig_room, facts);
            }
            return None;
        }

        state.assign(&mut lessons[idx], target_ts, new_room, facts);
    }

    Some(undo_moves)
}

/// Find a random compatible room with available capacity at the given timeslot.
fn find_room_with_capacity(
    compatible_rooms: &[usize],
    timeslot: usize,
    state: &IncrementalState,
    facts: &ProblemFacts,
    rng: &mut SmallRng,
) -> Option<usize> {
    let available: Vec<usize> = compatible_rooms
        .iter()
        .copied()
        .filter(|&r| {
            let cap = facts.rooms[r].max_concurrent_at_slot[timeslot] as u16;
            state.room_count_at_slot(r, timeslot) < cap
        })
        .collect();

    if available.is_empty() {
        None
    } else {
        Some(available[rng.gen_range(0..available.len())])
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p klassenzeit-scheduler --test kempe`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/local_search.rs scheduler/tests/kempe.rs
git commit -m "feat(scheduler): implement execute_kempe_chain with room handling"
```

---

### Task 6: Integrate Kempe moves into the LAHC solver loop

**Files:**
- Modify: `scheduler/src/local_search.rs` (the `optimize` function)

- [ ] **Step 1: Change move selection from 50/50 to 40/40/20**

In the `optimize` function in `scheduler/src/local_search.rs`, replace the move selection block (around line 189-249). The current code is:

```rust
        // Pick a move: 50% Change, 50% Swap
        let undo = if rng.gen_bool(0.5) {
```

Replace the entire move selection block with three-way selection using `gen_range`:

```rust
        // Pick a move: 40% Change, 40% Swap, 20% Kempe
        let roll: f64 = rng.gen();
        let undo = if roll < 0.4 {
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
        } else if roll < 0.8 {
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
        } else {
            // Kempe chain move
            stats.kempe_attempted += 1;
            let seed_pos = rng.gen_range(0..assigned_indices.len());
            let seed_idx = assigned_indices[seed_pos];
            let ts_a = lessons[seed_idx].timeslot.unwrap();
            let ts_b_candidate = rng.gen_range(0..num_timeslots - 1);
            let ts_b = if ts_b_candidate >= ts_a {
                ts_b_candidate + 1
            } else {
                ts_b_candidate
            };

            // Build the chain
            let chain = build_kempe_chain(seed_idx, ts_b, lessons, facts);
            let (from_a, from_b) = match chain {
                Some(c) => c,
                None => continue, // chain too large, skip
            };

            // Execute the chain
            let undo_moves = execute_kempe_chain(
                &from_a,
                &from_b,
                ts_b,
                ts_a,
                lessons,
                facts,
                state,
                &rooms_for_subject,
                &mut rng,
            );
            match undo_moves {
                Some(moves) => UndoInfo::Kempe {
                    seed_lesson_idx: seed_idx,
                    original_timeslot: ts_a,
                    moves,
                },
                None => continue, // room abort, skip
            }
        };
```

- [ ] **Step 2: Update tabu candidate creation for Kempe**

In the tabu check block (around line 255), update the `candidate_tabu` match to handle Kempe:

```rust
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
            UndoInfo::Kempe {
                seed_lesson_idx,
                original_timeslot: _,
                moves: _,
            } => TabuEntry::Kempe {
                seed_lesson_idx: *seed_lesson_idx,
                target_timeslot: lessons[*seed_lesson_idx].timeslot.unwrap(),
            },
        };
```

- [ ] **Step 3: Update tabu rejection undo for Kempe**

In the tabu rejection block, add the Kempe undo arm:

```rust
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
                UndoInfo::Kempe { moves, .. } => {
                    undo_kempe_chain(&moves, lessons, facts, state);
                }
            }
            stats.moves_rejected += 1;
            continue;
        }
```

- [ ] **Step 4: Update LAHC acceptance tabu recording for Kempe**

In the acceptance block, update the tabu record match:

```rust
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
                UndoInfo::Kempe {
                    seed_lesson_idx,
                    original_timeslot,
                    ..
                } => TabuEntry::Kempe {
                    seed_lesson_idx: *seed_lesson_idx,
                    target_timeslot: *original_timeslot,
                },
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

            // Track Kempe acceptance
            if matches!(undo, UndoInfo::Kempe { .. }) {
                stats.kempe_accepted += 1;
            }
```

- [ ] **Step 5: Update LAHC rejection undo for Kempe**

In the LAHC rejection (else) block, add the Kempe undo arm:

```rust
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
                UndoInfo::Kempe { moves, .. } => {
                    undo_kempe_chain(&moves, lessons, facts, state);
                }
            }
            stats.moves_rejected += 1;
        }
```

- [ ] **Step 6: Add `undo_kempe_chain` helper**

Add this helper function near `execute_kempe_chain`:

```rust
/// Undo a Kempe chain move: unassign all moved lessons, restore originals.
fn undo_kempe_chain(
    moves: &[(usize, usize, Option<usize>)],
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
) {
    // Unassign all chain members from their current positions
    for &(idx, _, _) in moves {
        state.unassign(&mut lessons[idx], facts);
    }
    // Reassign to original positions
    for &(idx, old_ts, old_room) in moves {
        state.assign(&mut lessons[idx], old_ts, old_room, facts);
    }
}
```

- [ ] **Step 7: Verify it compiles**

Run: `cargo check -p klassenzeit-scheduler`
Expected: compiles cleanly

- [ ] **Step 8: Run full test suite**

Run: `cargo test -p klassenzeit-scheduler`
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add scheduler/src/local_search.rs
git commit -m "feat(scheduler): integrate Kempe chain moves into LAHC solver loop"
```

---

### Task 7: Property-based tests for Kempe chains

**Files:**
- Modify: `scheduler/tests/proptest_scoring.rs`

- [ ] **Step 1: Add Kempe chain property tests**

Add the following tests to the bottom of `scheduler/tests/proptest_scoring.rs`:

```rust
use klassenzeit_scheduler::local_search::{build_kempe_chain, execute_kempe_chain};
use rand::rngs::SmallRng;
use rand::SeedableRng;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    #[test]
    fn kempe_chain_score_matches_full_eval(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..16),
        room_choices in proptest::collection::vec(0..5usize, 1..16),
        seed_pos in 0..8usize,
        target_slot in 0..5usize,
        rng_seed in 0..1000u64,
    ) {
        let num_slots = facts.timeslots.len();
        let num_rooms = facts.rooms.len();
        if num_slots < 2 { return Ok(()); }

        let mut state = IncrementalState::new(&facts);

        // Assign all lessons
        let n = lessons.len();
        for i in 0..n {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            let room = if num_rooms > 0 {
                let r = room_choices.get(i).copied().unwrap_or(0);
                if r % 5 == 0 { None } else { Some(r % num_rooms) }
            } else {
                None
            };
            state.assign(&mut lessons[i], slot, room, &facts);
        }

        // Pick a seed and target
        let assigned: Vec<usize> = lessons.iter().enumerate()
            .filter(|(_, l)| l.timeslot.is_some())
            .map(|(i, _)| i)
            .collect();
        if assigned.is_empty() { return Ok(()); }
        let seed_idx = assigned[seed_pos % assigned.len()];
        let ts_a = lessons[seed_idx].timeslot.unwrap();
        let ts_b = target_slot % num_slots;
        if ts_a == ts_b { return Ok(()); }

        // Build chain
        let chain = build_kempe_chain(seed_idx, ts_b, &lessons, &facts);
        if let Some((from_a, from_b)) = chain {
            let rooms_for_subject: Vec<Vec<usize>> = (0..facts.subjects.len())
                .map(|subj_idx| {
                    (0..facts.rooms.len())
                        .filter(|&r| facts.rooms[r].suitable_subjects[subj_idx])
                        .collect()
                })
                .collect();
            let mut rng = SmallRng::seed_from_u64(rng_seed);

            let result = execute_kempe_chain(
                &from_a, &from_b, ts_b, ts_a,
                &mut lessons, &facts, &mut state,
                &rooms_for_subject, &mut rng,
            );

            if result.is_some() {
                let full = full_evaluate(&lessons, &facts);
                prop_assert_eq!(
                    state.score(), full,
                    "Kempe chain incremental score mismatch"
                );
            }
        }
    }

    #[test]
    fn kempe_chain_undo_restores_score(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..16),
        room_choices in proptest::collection::vec(0..5usize, 1..16),
        seed_pos in 0..8usize,
        target_slot in 0..5usize,
        rng_seed in 0..1000u64,
    ) {
        let num_slots = facts.timeslots.len();
        let num_rooms = facts.rooms.len();
        if num_slots < 2 { return Ok(()); }

        let mut state = IncrementalState::new(&facts);

        let n = lessons.len();
        for i in 0..n {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            let room = if num_rooms > 0 {
                let r = room_choices.get(i).copied().unwrap_or(0);
                if r % 5 == 0 { None } else { Some(r % num_rooms) }
            } else {
                None
            };
            state.assign(&mut lessons[i], slot, room, &facts);
        }

        let original_score = state.score();
        let original_positions: Vec<(Option<usize>, Option<usize>)> = lessons
            .iter()
            .map(|l| (l.timeslot, l.room))
            .collect();

        let assigned: Vec<usize> = lessons.iter().enumerate()
            .filter(|(_, l)| l.timeslot.is_some())
            .map(|(i, _)| i)
            .collect();
        if assigned.is_empty() { return Ok(()); }
        let seed_idx = assigned[seed_pos % assigned.len()];
        let ts_a = lessons[seed_idx].timeslot.unwrap();
        let ts_b = target_slot % num_slots;
        if ts_a == ts_b { return Ok(()); }

        let chain = build_kempe_chain(seed_idx, ts_b, &lessons, &facts);
        if let Some((from_a, from_b)) = chain {
            let rooms_for_subject: Vec<Vec<usize>> = (0..facts.subjects.len())
                .map(|subj_idx| {
                    (0..facts.rooms.len())
                        .filter(|&r| facts.rooms[r].suitable_subjects[subj_idx])
                        .collect()
                })
                .collect();
            let mut rng = SmallRng::seed_from_u64(rng_seed);

            let result = execute_kempe_chain(
                &from_a, &from_b, ts_b, ts_a,
                &mut lessons, &facts, &mut state,
                &rooms_for_subject, &mut rng,
            );

            if let Some(undo_moves) = result {
                // Undo the chain
                for &(idx, _, _) in &undo_moves {
                    state.unassign(&mut lessons[idx], &facts);
                }
                for &(idx, old_ts, old_room) in &undo_moves {
                    state.assign(&mut lessons[idx], old_ts, old_room, &facts);
                }

                prop_assert_eq!(
                    state.score(), original_score,
                    "Score not restored after Kempe undo"
                );
                for (i, l) in lessons.iter().enumerate() {
                    prop_assert_eq!(
                        (l.timeslot, l.room), original_positions[i],
                        "Lesson {} position not restored after undo", i
                    );
                }
            }
        }
    }
}
```

- [ ] **Step 2: Run the property tests**

Run: `cargo test -p klassenzeit-scheduler --test proptest_scoring -- --nocapture`
Expected: all tests pass (200 cases each)

- [ ] **Step 3: Commit**

```bash
git add scheduler/tests/proptest_scoring.rs
git commit -m "test(scheduler): add Kempe chain property-based tests"
```

---

### Task 8: Add Kempe chain closure unit test

**Files:**
- Modify: `scheduler/tests/kempe.rs`

- [ ] **Step 1: Write chain closure test**

Add to `scheduler/tests/kempe.rs`:

```rust
#[test]
fn kempe_chain_is_closed_under_resources() {
    // Verify: no lesson OUTSIDE the chain at the target timeslot shares a
    // resource with any lesson INSIDE the chain.
    let facts = make_facts(3, 3, 3, 0, 1);
    let lessons = vec![
        assigned_lesson(0, 0, 0, 0, 0), // L0: t0, c0 @ ts0
        assigned_lesson(1, 1, 1, 0, 0), // L1: t1, c1 @ ts0
        assigned_lesson(2, 0, 1, 0, 1), // L2: t0, c1 @ ts1 (links L0 via teacher, L1 via class)
        assigned_lesson(3, 2, 2, 0, 1), // L3: t2, c2 @ ts1 (no shared resources with chain)
        assigned_lesson(4, 2, 2, 0, 2), // L4: t2, c2 @ ts2 (different timeslot entirely)
    ];

    let result = build_kempe_chain(0, 1, &lessons, &facts);
    let (from_a, from_b) = result.unwrap();

    // L3 is at ts1 but should NOT be in the chain (no shared resources)
    assert!(!from_b.contains(&3));
    // L4 is at ts2, irrelevant
    assert!(!from_a.contains(&4));
    assert!(!from_b.contains(&4));

    // Verify closure: for every lesson at ts1 NOT in from_b, it must not
    // share teacher/class/room with any lesson in from_a
    let lessons_at_ts1_outside_chain: Vec<usize> = lessons
        .iter()
        .enumerate()
        .filter(|(i, l)| l.timeslot == Some(1) && !from_b.contains(i))
        .map(|(i, _)| i)
        .collect();

    for &outside_idx in &lessons_at_ts1_outside_chain {
        let outside = &lessons[outside_idx];
        for &inside_idx in &from_a {
            let inside = &lessons[inside_idx];
            assert_ne!(
                outside.teacher_idx, inside.teacher_idx,
                "Closure violation: L{} (outside) shares teacher with L{} (inside)",
                outside_idx, inside_idx
            );
            assert_ne!(
                outside.class_idx, inside.class_idx,
                "Closure violation: L{} (outside) shares class with L{} (inside)",
                outside_idx, inside_idx
            );
            assert!(
                outside.room.is_none() || outside.room != inside.room,
                "Closure violation: L{} (outside) shares room with L{} (inside)",
                outside_idx, inside_idx
            );
        }
    }
}
```

- [ ] **Step 2: Run test**

Run: `cargo test -p klassenzeit-scheduler --test kempe kempe_chain_is_closed`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add scheduler/tests/kempe.rs
git commit -m "test(scheduler): add Kempe chain closure verification test"
```

---

### Task 9: Integration test — Kempe solver does not regress

**Files:**
- Modify: `scheduler/tests/local_search.rs`

- [ ] **Step 1: Write integration test**

Add to the bottom of `scheduler/tests/local_search.rs`:

```rust
#[test]
fn kempe_enabled_solver_finds_feasible_solution() {
    // Run the solver on the small instance and verify it still finds feasible solutions.
    // The LAHC loop now includes Kempe moves (20% probability).
    let config = klassenzeit_scheduler::local_search::LahcConfig {
        max_seconds: 5,
        max_idle_ms: 5000,
        seed: Some(42),
        ..klassenzeit_scheduler::local_search::LahcConfig::default()
    };

    let input = klassenzeit_scheduler::instances::small_4_classes();
    let output = klassenzeit_scheduler::solve_with_config(input, config);

    assert_eq!(
        output.score.hard_violations, 0,
        "Solver with Kempe moves should find feasible solution"
    );

    // Verify Kempe moves were actually attempted
    let stats = output.stats.unwrap();
    assert!(
        stats.kempe_attempted > 0,
        "Expected some Kempe attempts, got 0"
    );
}
```

- [ ] **Step 2: Run test**

Run: `cargo test -p klassenzeit-scheduler --test local_search kempe_enabled_solver`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add scheduler/tests/local_search.rs
git commit -m "test(scheduler): add integration test for Kempe-enabled solver"
```

---

### Task 10: Benchmark — Kempe vs Change+Swap only

**Files:**
- Modify: `scheduler/benches/solver_bench.rs`

- [ ] **Step 1: Add comparison benchmark**

Add a new benchmark function to `scheduler/benches/solver_bench.rs`:

```rust
fn bench_solve_realistic_kempe_comparison(c: &mut Criterion) {
    let input = instances::realistic_8_classes();
    let (base_solution, _) = mapper::to_planning(&input);

    let mut group = c.benchmark_group("kempe_comparison_8cls_10s");
    group.sample_size(10);
    group.measurement_time(std::time::Duration::from_secs(15));

    group.bench_function("with_kempe", |b| {
        let config = LahcConfig {
            max_seconds: 10,
            max_idle_ms: 10_000,
            seed: Some(42),
            ..Default::default()
        };
        b.iter(|| {
            let mut lessons = base_solution.lessons.clone();
            let mut state = IncrementalState::new(&base_solution.facts);
            construct_with_state(&mut lessons, &base_solution.facts, &mut state);
            local_search::optimize(&mut lessons, &base_solution.facts, &mut state, &config);
            state.score()
        })
    });

    group.finish();
}
```

Update the `criterion_group!` macro to include the new benchmark:

```rust
criterion_group!(
    benches,
    bench_construct_small,
    bench_construct_realistic,
    bench_construct_stress,
    bench_solve_small,
    bench_solve_realistic,
    bench_evaluate_assign,
    bench_solve_realistic_kempe_comparison,
);
```

Also add the missing import at the top if not already present:

```rust
use klassenzeit_scheduler::construction::construct_with_state;
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p klassenzeit-scheduler --benches`
Expected: compiles cleanly

- [ ] **Step 3: Commit**

```bash
git add scheduler/benches/solver_bench.rs
git commit -m "bench(scheduler): add Kempe comparison benchmark"
```

---

### Task 11: Final verification — full test suite and clippy

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cargo test -p klassenzeit-scheduler`
Expected: all tests pass

- [ ] **Step 2: Run clippy**

Run: `cargo clippy -p klassenzeit-scheduler -- -D warnings`
Expected: no warnings

- [ ] **Step 3: Run benchmarks to verify Kempe effect**

Run: `cargo bench -p klassenzeit-scheduler -- kempe_comparison`
Expected: benchmark completes successfully, prints score. Note the score for PR description.

- [ ] **Step 4: Check Kempe stats in benchmark output**

Run a quick solve with stats printing:

```bash
cd scheduler && cargo test --test local_search kempe_enabled_solver -- --nocapture
```

Expected: test passes, output shows `kempe_attempted > 0` and `kempe_accepted > 0`.
