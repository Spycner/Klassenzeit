# Solver LAHC Local Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Burke-Bykov LAHC local-search loop on top of `solver-core`'s lowest-delta greedy so `POST /api/classes/{id}/schedule` polishes its output for ~200 ms before responding.

**Architecture:** New crate-private `lahc.rs` module owns loop state and a single Change move. `solve_with_config` runs greedy first, then hands the mutable `GreedyState` plus the current placement vector to `lahc::run` if `config.deadline.is_some()`. RNG is a single `SmallRng` seeded from `config.seed`. Determinism for tests via a new `SolveConfig.max_iterations: Option<u64>`. Backend and frontend are unchanged.

**Tech Stack:** Rust 2021, `rand 0.9` (already in `Cargo.lock` via proptest), `proptest` for property tests, criterion for benches. Companion specs: `docs/superpowers/specs/2026-04-28-solver-lahc-design.md` (this PR) and `docs/superpowers/specs/2026-04-27-solver-soft-constraints-design.md` (PR-9a, the foundation).

---

## File Structure

**Created:**
- `solver/solver-core/src/lahc.rs` — crate-private LAHC module: `Lahc` state struct, `pub(crate) fn run`, private helpers `move_feasible`, `pick_room`, `score_after_change_move`, `apply_change_move`. Single responsibility: stochastic local-search loop polishing an already-greedy-solved schedule.
- `solver/solver-core/tests/lahc_property.rs` — proptest-driven properties: never increases score, deterministic under fixed seed + iteration cap, no new violations, in-loop running score matches `score_solution` at exit.
- `docs/adr/0015-solver-lahc-stochastic-search.md` — records LAHC + RNG decisions and the deferred Tabu/Kempe/Swap rationale.

**Modified:**
- `solver/solver-core/src/score.rs` — add `pub(crate) fn gap_count_after_remove`. Mirror of existing `gap_count_after_insert`.
- `solver/solver-core/src/types.rs` — add `pub max_iterations: Option<u64>` field to `SolveConfig`. Update one round-trip test.
- `solver/solver-core/src/solve.rs` — wire LAHC into `solve_with_config`; update `solve()` no-config defaults to `deadline: Some(Duration::from_millis(200))`; pin two existing delta tests to `deadline: None`.
- `solver/solver-core/src/lib.rs` — declare `mod lahc;` (private).
- `solver/solver-core/Cargo.toml` — `rand = { workspace = true }` dep.
- `Cargo.toml` (workspace root) — `rand = { version = "0.9", default-features = false, features = ["std", "std_rng", "small_rng"] }` workspace dep.
- `solver/solver-core/benches/solver_fixtures.rs` — emit one row per (fixture, mode) combo where mode is `greedy` or `lahc`. Update TSV header in `---SOLVER-BENCH-BASELINE---` block to include a `Mode` column.
- `scripts/record_solver_bench.sh` — parse the new `Mode` column and render four rows in `BASELINE.md`.
- `solver/solver-core/benches/BASELINE.md` — regenerated artifact.
- `docs/superpowers/OPEN_THINGS.md` — flip sprint item #9b to shipped; queue PR-9c (subject preferences) as next P0; add follow-ups (configurable deadline, LAHC telemetry, max_iterations promotion).
- `solver/CLAUDE.md` — add LAHC-specific rules: "RNG draw count must be invariant across loop branches" and "max_iterations is a test field, production callers leave it None".

---

## Task 1: Add `rand` workspace dependency

**Files:**
- Modify: `Cargo.toml` (workspace root)
- Modify: `solver/solver-core/Cargo.toml`

- [ ] **Step 1: Add the workspace dep**

Open `Cargo.toml` at the repo root. Inside `[workspace.dependencies]`, add the line below (alphabetical position next to `proptest`):

```toml
rand = { version = "0.9", default-features = false, features = ["std", "std_rng", "small_rng"] }
```

- [ ] **Step 2: Add the crate dep**

Open `solver/solver-core/Cargo.toml`. Under `[dependencies]`, append after `uuid`:

```toml
rand = { workspace = true }
```

- [ ] **Step 3: Verify cargo resolves**

Run: `cargo check -p solver-core`
Expected: PASS, no version conflicts. `Cargo.lock` updates with `rand` now in solver-core's direct deps.

- [ ] **Step 4: Commit**

```bash
git add Cargo.toml solver/solver-core/Cargo.toml Cargo.lock
git commit -m "build(deps): add rand 0.9 dep on solver-core"
```

---

## Task 2: Add `gap_count_after_remove` helper to `score.rs`

**Files:**
- Modify: `solver/solver-core/src/score.rs`

- [ ] **Step 1: Write the failing tests (inline `#[cfg(test)] mod tests`)**

Append these `#[test]` functions inside the existing `mod tests` block in `score.rs`, after `zero_weights_short_circuit_to_zero`:

```rust
#[test]
fn gap_count_after_remove_single_element_returns_zero() {
    let positions = [3u8];
    assert_eq!(gap_count_after_remove(&positions, 3), 0);
}

#[test]
fn gap_count_after_remove_min_shrinks_span() {
    // positions = [1, 3, 5]; gap_count = 5 - 1 + 1 - 3 = 2
    // remove 1 -> [3, 5]; gap_count = 5 - 3 + 1 - 2 = 1
    let positions = [1u8, 3, 5];
    assert_eq!(gap_count_after_remove(&positions, 1), 1);
}

#[test]
fn gap_count_after_remove_max_shrinks_span() {
    // positions = [1, 3, 5]; remove 5 -> [1, 3]; gap = 3 - 1 + 1 - 2 = 1
    let positions = [1u8, 3, 5];
    assert_eq!(gap_count_after_remove(&positions, 5), 1);
}

#[test]
fn gap_count_after_remove_middle_grows_gap() {
    // positions = [1, 3, 5]; remove 3 -> [1, 5]; gap = 5 - 1 + 1 - 2 = 3
    let positions = [1u8, 3, 5];
    assert_eq!(gap_count_after_remove(&positions, 3), 3);
}

#[test]
fn gap_count_after_remove_absent_returns_unchanged() {
    // pos not in slice; defensive return matches gap_count(positions).
    let positions = [1u8, 3, 5];
    assert_eq!(
        gap_count_after_remove(&positions, 7),
        gap_count(&positions)
    );
}

#[test]
fn gap_count_after_remove_two_to_one_returns_zero() {
    let positions = [1u8, 3];
    assert_eq!(gap_count_after_remove(&positions, 1), 0);
}
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cargo nextest run -p solver-core score::tests::gap_count_after_remove`
Expected: FAIL with `cannot find function 'gap_count_after_remove'`.

- [ ] **Step 3: Implement `gap_count_after_remove`**

Append this function below the existing `gap_count` in `score.rs`:

```rust
/// Count gap-hours in `positions` after removing `pos`. Symmetric to
/// `gap_count_after_insert`. Returns 0 if removal leaves fewer than two
/// elements; returns `gap_count(positions)` if `pos` is not present
/// (defensive: LAHC only removes positions it has just placed, so the absent
/// branch should never fire in production).
pub(crate) fn gap_count_after_remove(positions: &[u8], pos: u8) -> u32 {
    let Ok(removed_at) = positions.binary_search(&pos) else {
        return gap_count(positions);
    };
    let len_after = positions.len() - 1;
    if len_after < 2 {
        return 0;
    }
    let new_first = if removed_at == 0 {
        positions[1]
    } else {
        positions[0]
    };
    let new_last = if removed_at == positions.len() - 1 {
        positions[positions.len() - 2]
    } else {
        positions[positions.len() - 1]
    };
    let span = u32::from(new_last - new_first);
    let count = u32::try_from(len_after).unwrap_or(u32::MAX);
    span + 1 - count
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cargo nextest run -p solver-core score::tests::gap_count_after_remove`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run full solver-core suite to confirm nothing else broke**

Run: `cargo nextest run -p solver-core`
Expected: PASS, all existing tests + 6 new ones.

- [ ] **Step 6: Commit**

```bash
git add solver/solver-core/src/score.rs
git commit -m "feat(solver-core): add gap_count_after_remove helper for LAHC delta scoring"
```

---

## Task 3: Add `SolveConfig.max_iterations` field

**Files:**
- Modify: `solver/solver-core/src/types.rs`

- [ ] **Step 1: Update `SolveConfig` struct**

In `solver/solver-core/src/types.rs`, replace the existing `SolveConfig` definition with:

```rust
/// Tunables for one solver invocation. Pass via [`crate::solve_with_config`];
/// the no-config [`crate::solve`] entry point uses [`SolveConfig::default`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SolveConfig {
    /// Optional wall-clock budget. `None` means "no LAHC pass; greedy only".
    /// `Some(d)` triggers the LAHC local-search loop after greedy and bounds
    /// it to `d` of wall-clock time.
    pub deadline: Option<Duration>,
    /// Seed for the RNG used by the LAHC local-search loop. The greedy pass
    /// is deterministic without it.
    pub seed: u64,
    /// Weights that govern the soft-constraint scoring function.
    pub weights: ConstraintWeights,
    /// Maximum number of LAHC iterations. `None` means "deadline only".
    /// Primarily exists so property tests can cap iteration count for
    /// determinism without depending on wall-clock; production callers
    /// should leave this `None`.
    pub max_iterations: Option<u64>,
}
```

The only change: add the `max_iterations` field. `Default` derives `None` automatically.

- [ ] **Step 2: Run existing types tests**

Run: `cargo nextest run -p solver-core types::tests`
Expected: PASS. The four existing round-trip tests don't touch `SolveConfig` so they're unaffected.

- [ ] **Step 3: Commit**

```bash
git add solver/solver-core/src/types.rs
git commit -m "feat(solver-core): add SolveConfig.max_iterations for LAHC iter cap"
```

---

## Task 4: Scaffold `lahc.rs` with the `Lahc` module shell

**Files:**
- Create: `solver/solver-core/src/lahc.rs`
- Modify: `solver/solver-core/src/lib.rs`

- [ ] **Step 1: Create the empty module**

Create `solver/solver-core/src/lahc.rs` with this skeleton:

```rust
//! Late-acceptance hill-climbing loop that polishes the greedy's output.
//! Single Change move (move one lesson-hour to a different time-block,
//! reuse old room or fall back to lowest-id hard-feasible room),
//! deadline-bound, deterministic under (seed, max_iterations).

use std::collections::{HashMap, HashSet};
use std::time::Instant;

use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};

use crate::ids::{LessonId, RoomId, SchoolClassId, TeacherId, TimeBlockId};
use crate::index::Indexed;
use crate::score::{gap_count, gap_count_after_insert, gap_count_after_remove};
use crate::types::{ConstraintWeights, Lesson, Placement, Problem, SolveConfig, TimeBlock};

/// Length of the LAHC cost-history list. Burke & Bykov 2008 reports the
/// algorithm is robust to this value within a wide band; 500 matches the
/// archive/v2 setting and is enough fill for ~20k iterations on Hessen
/// Grundschule under a 200ms deadline.
const LAHC_LIST_LEN: usize = 500;

/// Run the LAHC loop over the placement set produced by greedy. Mutates
/// `placements` and the partition / used-* state in place. Caller-owned
/// `current_score` is updated to reflect the post-LAHC running total.
#[allow(clippy::too_many_arguments)] // Reason: internal helper; bundling args into a struct hurts clarity more than it helps
pub(crate) fn run(
    problem: &Problem,
    idx: &Indexed,
    config: &SolveConfig,
    placements: &mut Vec<Placement>,
    class_positions: &mut HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: &mut HashMap<(TeacherId, u8), Vec<u8>>,
    used_teacher: &mut HashSet<(TeacherId, TimeBlockId)>,
    used_class: &mut HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &mut HashSet<(RoomId, TimeBlockId)>,
    current_score: &mut u32,
) {
    let Some(deadline) = config.deadline else { return; };
    if placements.is_empty() {
        return;
    }
    let start = Instant::now();
    let mut rng = SmallRng::seed_from_u64(config.seed);
    let mut lahc_list = vec![*current_score; LAHC_LIST_LEN];
    let lesson_lookup: HashMap<LessonId, &Lesson> =
        problem.lessons.iter().map(|l| (l.id, l)).collect();
    let tb_lookup: HashMap<TimeBlockId, &TimeBlock> =
        problem.time_blocks.iter().map(|tb| (tb.id, tb)).collect();
    let max_iter = config.max_iterations.unwrap_or(u64::MAX);

    let mut iter: u64 = 0;
    while iter < max_iter && start.elapsed() < deadline {
        // Always consume two random draws per iteration so the RNG sequence
        // is invariant across feasibility branches; this is what the
        // determinism property test relies on.
        let placement_idx = rng.random_range(0..placements.len());
        let new_tb_idx = rng.random_range(0..problem.time_blocks.len());

        if try_change_move(
            problem,
            idx,
            placement_idx,
            new_tb_idx,
            &lesson_lookup,
            &tb_lookup,
            &config.weights,
            placements,
            class_positions,
            teacher_positions,
            used_teacher,
            used_class,
            used_room,
            current_score,
            &lahc_list,
            iter,
        ) {
            // accepted; current_score already updated by try_change_move
        }

        iter += 1;
        lahc_list[(iter as usize - 1) % LAHC_LIST_LEN] = *current_score;
    }
}
```

The body still references `try_change_move` which we'll add in Task 5; for now the file won't compile by itself, which is fine — Task 4's only goal is to register the module and lock down the run signature.

- [ ] **Step 2: Register the module in `lib.rs`**

Open `solver/solver-core/src/lib.rs`. Add this line in alphabetical order with the other `mod` declarations (after `mod json;`, before `mod ordering;`):

```rust
mod lahc;
```

If the existing module list is sorted differently, follow the existing order; the goal is for the module to be discoverable, not for the file to be alphabetised.

- [ ] **Step 3: Verify build still fails on the missing helper**

Run: `cargo check -p solver-core`
Expected: FAIL with `cannot find function 'try_change_move'`. This is intentional — Task 5 implements it.

(If the failure is a different error, e.g. unused import warning escalated to error, fix the imports before moving on.)

- [ ] **Step 4: No commit yet** — Tasks 4-6 land in a single commit at the end of Task 6 because the module needs to be both registered and complete to compile.

---

## Task 5: Implement `try_change_move` plus its private helpers

**Files:**
- Modify: `solver/solver-core/src/lahc.rs`

- [ ] **Step 1: Append helpers and `try_change_move`**

Add these definitions to `lahc.rs` below the `run` function:

```rust
/// Attempt one Change move: move `placements[placement_idx]` to time-block
/// `problem.time_blocks[new_tb_idx]`, reusing the old room when feasible or
/// falling back to the lowest-id hard-feasible room. Returns true if the
/// move was accepted (LAHC criterion) and applied. Mutates state on accept.
#[allow(clippy::too_many_arguments)] // Reason: internal helper
fn try_change_move(
    problem: &Problem,
    idx: &Indexed,
    placement_idx: usize,
    new_tb_idx: usize,
    lesson_lookup: &HashMap<LessonId, &Lesson>,
    tb_lookup: &HashMap<TimeBlockId, &TimeBlock>,
    weights: &ConstraintWeights,
    placements: &mut Vec<Placement>,
    class_positions: &mut HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: &mut HashMap<(TeacherId, u8), Vec<u8>>,
    used_teacher: &mut HashSet<(TeacherId, TimeBlockId)>,
    used_class: &mut HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &mut HashSet<(RoomId, TimeBlockId)>,
    current_score: &mut u32,
    lahc_list: &[u32],
    iter: u64,
) -> bool {
    let p = placements[placement_idx].clone();
    let lesson = lesson_lookup[&p.lesson_id];
    let old_tb = *tb_lookup[&p.time_block_id];
    let new_tb = problem.time_blocks[new_tb_idx];

    if new_tb.id == old_tb.id {
        return false;
    }

    let class = lesson.school_class_id;
    let teacher = lesson.teacher_id;

    // Hard-feasibility on the new tb. Note: the placement's own (teacher,
    // old_tb) and (class, old_tb) are still in used_teacher/used_class. They
    // do not block a move to a different tb because we never check them
    // against new_tb. They do correctly block a same-tb move (handled above).
    if used_teacher.contains(&(teacher, new_tb.id)) {
        return false;
    }
    if used_class.contains(&(class, new_tb.id)) {
        return false;
    }
    if idx.teacher_blocked(teacher, new_tb.id) {
        return false;
    }

    let Some(new_room_id) = pick_room(
        problem,
        idx,
        lesson.subject_id,
        p.room_id,
        new_tb.id,
        used_room,
    ) else {
        return false;
    };

    // Compute delta. i64 arithmetic because removal can reduce the score.
    let delta = score_after_change_move(
        class,
        teacher,
        old_tb.day_of_week,
        old_tb.position,
        new_tb.day_of_week,
        new_tb.position,
        class_positions,
        teacher_positions,
        weights,
    );

    let new_score_signed = i64::from(*current_score) + delta;
    debug_assert!(
        new_score_signed >= 0,
        "running score must remain non-negative; current_score={} delta={}",
        *current_score,
        delta
    );
    let new_score = u32::try_from(new_score_signed.max(0)).unwrap_or(u32::MAX);

    let prior = lahc_list[(iter as usize) % LAHC_LIST_LEN];
    let accept = new_score <= *current_score || new_score <= prior;
    if !accept {
        return false;
    }

    apply_change_move(
        placement_idx,
        &p,
        old_tb,
        new_tb,
        new_room_id,
        placements,
        class_positions,
        teacher_positions,
        used_teacher,
        used_class,
        used_room,
    );
    *current_score = new_score;
    true
}

/// Pick a room for the Change move's destination tb. Prefers reusing
/// `old_room_id`; falls back to the lowest-id hard-feasible room. Returns
/// `None` if no room is feasible.
fn pick_room(
    problem: &Problem,
    idx: &Indexed,
    subject_id: crate::ids::SubjectId,
    old_room_id: RoomId,
    new_tb_id: TimeBlockId,
    used_room: &HashSet<(RoomId, TimeBlockId)>,
) -> Option<RoomId> {
    let old_room_feasible = idx.room_suits_subject(old_room_id, subject_id)
        && !idx.room_blocked(old_room_id, new_tb_id)
        && !used_room.contains(&(old_room_id, new_tb_id));
    if old_room_feasible {
        return Some(old_room_id);
    }
    // Fallback: lowest-id hard-feasible room. We do NOT pre-sort; rooms are
    // sorted in solve.rs but lahc::run does not receive that order. Iterate
    // and track the minimum.
    let mut best: Option<RoomId> = None;
    for room in &problem.rooms {
        if !idx.room_suits_subject(room.id, subject_id) {
            continue;
        }
        if idx.room_blocked(room.id, new_tb_id) {
            continue;
        }
        if used_room.contains(&(room.id, new_tb_id)) {
            continue;
        }
        match best {
            None => best = Some(room.id),
            Some(current) if room.id.0 < current.0 => best = Some(room.id),
            _ => {}
        }
    }
    best
}

/// Compute the soft-score delta produced by moving a placement from
/// `(old_day, old_pos)` to `(new_day, new_pos)` for `(class, teacher)`.
/// Pure function over the partition maps; does not mutate.
#[allow(clippy::too_many_arguments)] // Reason: internal helper
fn score_after_change_move(
    class: SchoolClassId,
    teacher: TeacherId,
    old_day: u8,
    old_pos: u8,
    new_day: u8,
    new_pos: u8,
    class_positions: &HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: &HashMap<(TeacherId, u8), Vec<u8>>,
    weights: &ConstraintWeights,
) -> i64 {
    let class_delta = partition_delta(
        class_positions.get(&(class, old_day)),
        class_positions.get(&(class, new_day)),
        old_day,
        new_day,
        old_pos,
        new_pos,
    );
    let teacher_delta = partition_delta(
        teacher_positions.get(&(teacher, old_day)),
        teacher_positions.get(&(teacher, new_day)),
        old_day,
        new_day,
        old_pos,
        new_pos,
    );
    i64::from(weights.class_gap) * class_delta + i64::from(weights.teacher_gap) * teacher_delta
}

/// Compute the gap-count delta for a single (entity, day) partition pair
/// when a position moves from `(old_day, old_pos)` to `(new_day, new_pos)`.
/// Handles same-day and cross-day moves with one shared shape.
fn partition_delta(
    old_part: Option<&Vec<u8>>,
    new_part: Option<&Vec<u8>>,
    old_day: u8,
    new_day: u8,
    old_pos: u8,
    new_pos: u8,
) -> i64 {
    if old_day == new_day {
        // Same partition: simulate remove-then-insert against the same slice.
        let part = old_part.expect("placement's old (entity, day) must exist");
        let before = gap_count(part);
        let after = gap_count_after_swap(part, old_pos, new_pos);
        i64::from(after) - i64::from(before)
    } else {
        let old_before = old_part.map(|v| gap_count(v)).unwrap_or(0);
        let old_after = old_part.map(|v| gap_count_after_remove(v, old_pos)).unwrap_or(0);
        let new_before = new_part.map(|v| gap_count(v)).unwrap_or(0);
        let new_after = gap_count_after_insert(new_part, new_pos);
        (i64::from(old_after) - i64::from(old_before))
            + (i64::from(new_after) - i64::from(new_before))
    }
}

/// Count gap-hours after removing `old_pos` and inserting `new_pos` against
/// the same sorted slice. Single allocation-free pass: track new min, max,
/// and length; everything else follows from the standard gap formula
/// `span + 1 - count`. Returns 0 when the resulting slice has fewer than
/// two distinct positions.
fn gap_count_after_swap(positions: &[u8], old_pos: u8, new_pos: u8) -> u32 {
    if old_pos == new_pos {
        return gap_count(positions);
    }
    let removed_at = match positions.binary_search(&old_pos) {
        Ok(i) => i,
        Err(_) => {
            // Should not happen in LAHC; defensive.
            return gap_count(positions);
        }
    };
    let already_present = positions.binary_search(&new_pos).is_ok();
    let len_after = if already_present {
        positions.len() - 1
    } else {
        positions.len()
    };
    if len_after < 2 {
        return 0;
    }
    // Determine new min and max after the swap.
    let post_remove_first = if removed_at == 0 {
        positions[1]
    } else {
        positions[0]
    };
    let post_remove_last = if removed_at == positions.len() - 1 {
        positions[positions.len() - 2]
    } else {
        positions[positions.len() - 1]
    };
    let new_first = post_remove_first.min(new_pos);
    let new_last = post_remove_last.max(new_pos);
    let span = u32::from(new_last - new_first);
    let count = u32::try_from(len_after).unwrap_or(u32::MAX);
    span + 1 - count
}

/// Apply the accepted move's mutations: rewrite the placement entry,
/// update the partition maps, swap the used-* set entries.
#[allow(clippy::too_many_arguments)] // Reason: internal helper
fn apply_change_move(
    placement_idx: usize,
    old_p: &Placement,
    old_tb: TimeBlock,
    new_tb: TimeBlock,
    new_room_id: RoomId,
    placements: &mut Vec<Placement>,
    class_positions: &mut HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: &mut HashMap<(TeacherId, u8), Vec<u8>>,
    used_teacher: &mut HashSet<(TeacherId, TimeBlockId)>,
    used_class: &mut HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &mut HashSet<(RoomId, TimeBlockId)>,
) {
    // Rewrite placement entry.
    let new_placement = Placement {
        lesson_id: old_p.lesson_id,
        time_block_id: new_tb.id,
        room_id: new_room_id,
    };
    placements[placement_idx] = new_placement;

    // Class partition: remove old_pos at old_day, insert new_pos at new_day.
    // We need the lesson's class and teacher; recover them via lookup. We
    // don't have them here, but the class_positions/teacher_positions keys
    // are the same as the lesson's identity — caller must pass them, OR we
    // recover via a lookup. Simplest: change the signature to accept class
    // and teacher. (TODO before commit: thread these through.)
}
```

Notice the closing TODO block on `apply_change_move` — that's a deliberate "WIP" marker so reviewers see the threading is incomplete. Step 2 fixes it.

- [ ] **Step 2: Thread `class` and `teacher` through `apply_change_move`**

`apply_change_move` does not have access to `lesson_lookup`. Change its signature to accept `class: SchoolClassId, teacher: TeacherId` parameters, and update the call site in `try_change_move` accordingly. Replace the body of `apply_change_move`'s "Class partition" section with the actual mutations:

```rust
#[allow(clippy::too_many_arguments)] // Reason: internal helper
fn apply_change_move(
    placement_idx: usize,
    old_p: &Placement,
    old_tb: TimeBlock,
    new_tb: TimeBlock,
    new_room_id: RoomId,
    class: SchoolClassId,
    teacher: TeacherId,
    placements: &mut Vec<Placement>,
    class_positions: &mut HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: &mut HashMap<(TeacherId, u8), Vec<u8>>,
    used_teacher: &mut HashSet<(TeacherId, TimeBlockId)>,
    used_class: &mut HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &mut HashSet<(RoomId, TimeBlockId)>,
) {
    placements[placement_idx] = Placement {
        lesson_id: old_p.lesson_id,
        time_block_id: new_tb.id,
        room_id: new_room_id,
    };

    // Class partition.
    if let Some(part) = class_positions.get_mut(&(class, old_tb.day_of_week)) {
        if let Ok(i) = part.binary_search(&old_tb.position) {
            part.remove(i);
        }
        if part.is_empty() {
            class_positions.remove(&(class, old_tb.day_of_week));
        }
    }
    let part = class_positions
        .entry((class, new_tb.day_of_week))
        .or_default();
    let ins = part.binary_search(&new_tb.position).unwrap_or_else(|i| i);
    if part.get(ins).copied() != Some(new_tb.position) {
        part.insert(ins, new_tb.position);
    }

    // Teacher partition.
    if let Some(part) = teacher_positions.get_mut(&(teacher, old_tb.day_of_week)) {
        if let Ok(i) = part.binary_search(&old_tb.position) {
            part.remove(i);
        }
        if part.is_empty() {
            teacher_positions.remove(&(teacher, old_tb.day_of_week));
        }
    }
    let part = teacher_positions
        .entry((teacher, new_tb.day_of_week))
        .or_default();
    let ins = part.binary_search(&new_tb.position).unwrap_or_else(|i| i);
    if part.get(ins).copied() != Some(new_tb.position) {
        part.insert(ins, new_tb.position);
    }

    // Used sets: drop old, add new.
    used_teacher.remove(&(teacher, old_tb.id));
    used_teacher.insert((teacher, new_tb.id));
    used_class.remove(&(class, old_tb.id));
    used_class.insert((class, new_tb.id));
    used_room.remove(&(old_p.room_id, old_tb.id));
    used_room.insert((new_room_id, new_tb.id));
}
```

Update the call site in `try_change_move` (the spot where Step 1 wrote `apply_change_move(... placements, ...)`) to pass `class` and `teacher`:

```rust
apply_change_move(
    placement_idx,
    &p,
    old_tb,
    new_tb,
    new_room_id,
    class,
    teacher,
    placements,
    class_positions,
    teacher_positions,
    used_teacher,
    used_class,
    used_room,
);
```

- [ ] **Step 3: Verify the module compiles**

Run: `cargo check -p solver-core`
Expected: PASS, no errors. (Some `unused` warnings on the helpers may surface; those clear up in Task 6 when tests reference them.)

- [ ] **Step 4: No commit yet** — wait for Task 6.

---

## Task 6: Inline unit tests for `lahc.rs` helpers

**Files:**
- Modify: `solver/solver-core/src/lahc.rs`

- [ ] **Step 1: Append `#[cfg(test)] mod tests`**

At the bottom of `lahc.rs`, append:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::SubjectId;
    use uuid::Uuid;

    fn lahc_uuid(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    fn vec_part(xs: &[u8]) -> Vec<u8> {
        xs.to_vec()
    }

    #[test]
    fn gap_count_after_swap_no_op_when_old_equals_new() {
        let positions = [0u8, 2, 4];
        // before: span 4, count 3, gap 2
        assert_eq!(gap_count_after_swap(&positions, 2, 2), 2);
    }

    #[test]
    fn gap_count_after_swap_fills_gap() {
        // [0, 2, 4] swap 2 -> 1: result is logically [0, 1, 4], span 4, count 3, gap 2.
        // (no improvement; gap shape unchanged because we just shifted one inside hole)
        let positions = [0u8, 2, 4];
        assert_eq!(gap_count_after_swap(&positions, 2, 1), 2);
    }

    #[test]
    fn gap_count_after_swap_perfectly_compacts() {
        // [0, 2, 4] swap 4 -> 1: result is logically [0, 1, 2], span 2, count 3, gap 0.
        let positions = [0u8, 2, 4];
        assert_eq!(gap_count_after_swap(&positions, 4, 1), 0);
    }

    #[test]
    fn gap_count_after_swap_extends_span() {
        // [0, 1] swap 1 -> 5: result is logically [0, 5], span 5, count 2, gap 4.
        let positions = [0u8, 1];
        assert_eq!(gap_count_after_swap(&positions, 1, 5), 4);
    }

    #[test]
    fn gap_count_after_swap_target_already_present_dedupes() {
        // [0, 1, 2] swap 0 -> 1: target 1 already present, len_after = 2.
        // Resulting unique positions: {1, 2}, span 1, count 2, gap 0.
        let positions = [0u8, 1, 2];
        assert_eq!(gap_count_after_swap(&positions, 0, 1), 0);
    }

    #[test]
    fn partition_delta_same_day_compacts_drops_score() {
        // class has [0, 2, 4] on day 0; move pos 4 -> 1 leaves [0, 1, 2], gap 2 -> 0.
        let mut class_positions: HashMap<(SchoolClassId, u8), Vec<u8>> = HashMap::new();
        let class = SchoolClassId(lahc_uuid(50));
        class_positions.insert((class, 0), vec_part(&[0, 2, 4]));
        let teacher_positions: HashMap<(TeacherId, u8), Vec<u8>> = HashMap::new();
        let teacher = TeacherId(lahc_uuid(20));
        // teacher partition is empty -> teacher delta is 0.
        let delta = score_after_change_move(
            class,
            teacher,
            0,
            4,
            0,
            1,
            &class_positions,
            &teacher_positions,
            &ConstraintWeights {
                class_gap: 1,
                teacher_gap: 1,
            },
        );
        assert_eq!(delta, -2);
    }

    #[test]
    fn partition_delta_cross_day_zero_when_both_partitions_unaffected() {
        // class has [0, 1] on day 0 only; moving pos 1 (day 0) to (day 1, pos 0)
        // leaves day-0 partition with [0] (gap 0) and creates day-1 partition with
        // [0] (gap 0). Net delta on the class side is 0; teacher side is 0 too.
        let class = SchoolClassId(lahc_uuid(50));
        let teacher = TeacherId(lahc_uuid(20));
        let mut class_positions: HashMap<(SchoolClassId, u8), Vec<u8>> = HashMap::new();
        class_positions.insert((class, 0), vec_part(&[0, 1]));
        let teacher_positions: HashMap<(TeacherId, u8), Vec<u8>> = HashMap::new();
        let delta = score_after_change_move(
            class,
            teacher,
            0,
            1,
            1,
            0,
            &class_positions,
            &teacher_positions,
            &ConstraintWeights {
                class_gap: 1,
                teacher_gap: 1,
            },
        );
        assert_eq!(delta, 0);
    }

    #[test]
    fn apply_change_move_updates_placement_partitions_and_used_sets() {
        let class = SchoolClassId(lahc_uuid(50));
        let teacher = TeacherId(lahc_uuid(20));
        let old_tb = TimeBlock {
            id: TimeBlockId(lahc_uuid(10)),
            day_of_week: 0,
            position: 0,
        };
        let new_tb = TimeBlock {
            id: TimeBlockId(lahc_uuid(11)),
            day_of_week: 0,
            position: 1,
        };
        let old_room = RoomId(lahc_uuid(30));
        let new_room = RoomId(lahc_uuid(31));
        let lesson_id = LessonId(lahc_uuid(60));

        let mut placements = vec![Placement {
            lesson_id,
            time_block_id: old_tb.id,
            room_id: old_room,
        }];
        let mut class_positions: HashMap<(SchoolClassId, u8), Vec<u8>> = HashMap::new();
        class_positions.insert((class, 0), vec_part(&[0]));
        let mut teacher_positions: HashMap<(TeacherId, u8), Vec<u8>> = HashMap::new();
        teacher_positions.insert((teacher, 0), vec_part(&[0]));
        let mut used_teacher: HashSet<(TeacherId, TimeBlockId)> = HashSet::new();
        used_teacher.insert((teacher, old_tb.id));
        let mut used_class: HashSet<(SchoolClassId, TimeBlockId)> = HashSet::new();
        used_class.insert((class, old_tb.id));
        let mut used_room: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
        used_room.insert((old_room, old_tb.id));

        apply_change_move(
            0,
            &placements[0].clone(),
            old_tb,
            new_tb,
            new_room,
            class,
            teacher,
            &mut placements,
            &mut class_positions,
            &mut teacher_positions,
            &mut used_teacher,
            &mut used_class,
            &mut used_room,
        );

        assert_eq!(placements[0].time_block_id, new_tb.id);
        assert_eq!(placements[0].room_id, new_room);
        assert_eq!(class_positions.get(&(class, 0)), Some(&vec_part(&[1])));
        assert_eq!(teacher_positions.get(&(teacher, 0)), Some(&vec_part(&[1])));
        assert!(used_teacher.contains(&(teacher, new_tb.id)));
        assert!(!used_teacher.contains(&(teacher, old_tb.id)));
        assert!(used_class.contains(&(class, new_tb.id)));
        assert!(used_room.contains(&(new_room, new_tb.id)));
        assert!(!used_room.contains(&(old_room, old_tb.id)));
    }

    #[test]
    fn pick_room_reuses_old_room_when_feasible() {
        // Build a minimal Problem + Indexed where old_room suits the subject and
        // is unblocked at new_tb; pick_room returns Some(old_room).
        let subject = SubjectId(lahc_uuid(40));
        let old_room = RoomId(lahc_uuid(30));
        let new_tb = TimeBlockId(lahc_uuid(11));

        let problem = crate::types::Problem {
            time_blocks: vec![TimeBlock {
                id: new_tb,
                day_of_week: 0,
                position: 1,
            }],
            teachers: vec![],
            rooms: vec![crate::types::Room { id: old_room }],
            subjects: vec![crate::types::Subject { id: subject }],
            school_classes: vec![],
            lessons: vec![],
            teacher_qualifications: vec![],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        let idx = crate::index::Indexed::new(&problem);
        let used: HashSet<(RoomId, TimeBlockId)> = HashSet::new();

        assert_eq!(
            pick_room(&problem, &idx, subject, old_room, new_tb, &used),
            Some(old_room)
        );
    }

    #[test]
    fn pick_room_falls_back_to_lowest_id_when_old_blocked() {
        let subject = SubjectId(lahc_uuid(40));
        let old_room = RoomId(lahc_uuid(30));
        let alt_room = RoomId(lahc_uuid(20)); // lower id
        let new_tb = TimeBlockId(lahc_uuid(11));

        let problem = crate::types::Problem {
            time_blocks: vec![TimeBlock {
                id: new_tb,
                day_of_week: 0,
                position: 1,
            }],
            teachers: vec![],
            rooms: vec![
                crate::types::Room { id: old_room },
                crate::types::Room { id: alt_room },
            ],
            subjects: vec![crate::types::Subject { id: subject }],
            school_classes: vec![],
            lessons: vec![],
            teacher_qualifications: vec![],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        let idx = crate::index::Indexed::new(&problem);
        let mut used: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
        used.insert((old_room, new_tb));

        assert_eq!(
            pick_room(&problem, &idx, subject, old_room, new_tb, &used),
            Some(alt_room)
        );
    }

    #[test]
    fn pick_room_returns_none_when_all_rooms_infeasible() {
        let subject = SubjectId(lahc_uuid(40));
        let old_room = RoomId(lahc_uuid(30));
        let new_tb = TimeBlockId(lahc_uuid(11));

        let problem = crate::types::Problem {
            time_blocks: vec![TimeBlock {
                id: new_tb,
                day_of_week: 0,
                position: 1,
            }],
            teachers: vec![],
            rooms: vec![crate::types::Room { id: old_room }],
            subjects: vec![crate::types::Subject { id: subject }],
            school_classes: vec![],
            lessons: vec![],
            teacher_qualifications: vec![],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        let idx = crate::index::Indexed::new(&problem);
        let mut used: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
        used.insert((old_room, new_tb));

        assert_eq!(
            pick_room(&problem, &idx, subject, old_room, new_tb, &used),
            None
        );
    }
}
```

- [ ] **Step 2: Run lahc tests**

Run: `cargo nextest run -p solver-core lahc::tests`
Expected: PASS, 10 tests.

If any fail, iterate on the helper bodies until all 10 pass before moving on. Common pitfalls:

- Off-by-one in `gap_count_after_swap` when removed_at lands on the slice's last index.
- Forgetting to handle the `target already in slice` case (hence the `if part.get(ins).copied() != Some(new_pos)` guard in `apply_change_move`).

- [ ] **Step 3: Run full crate suite**

Run: `cargo nextest run -p solver-core`
Expected: PASS. All previous tests + new lahc::tests.

- [ ] **Step 4: Lint**

Run: `cargo clippy -p solver-core --all-targets -- -D warnings`
Expected: PASS.

- [ ] **Step 5: Commit Tasks 4 + 5 + 6 together**

```bash
git add solver/solver-core/src/lahc.rs solver/solver-core/src/lib.rs
git commit -m "feat(solver-core): add lahc module with change-move and helpers"
```

---

## Task 7: Wire LAHC into `solve_with_config`

**Files:**
- Modify: `solver/solver-core/src/solve.rs`

- [ ] **Step 1: Update `solve()` defaults**

Find the `pub fn solve` body in `solve.rs`. Replace its body with:

```rust
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    let active_default = SolveConfig {
        weights: ConstraintWeights {
            class_gap: 1,
            teacher_gap: 1,
        },
        deadline: Some(std::time::Duration::from_millis(200)),
        ..SolveConfig::default()
    };
    solve_with_config(problem, &active_default)
}
```

(Add `use std::time::Duration;` at the top of the file if not already present, and use `Duration::from_millis(200)` if the import lands; otherwise inline `std::time::Duration::from_millis(200)` is fine.)

- [ ] **Step 2: Add the LAHC dispatch in `solve_with_config`**

Find the line in `solve_with_config` that reads `solution.soft_score = state.soft_score;`. Replace that line with:

```rust
    if config.deadline.is_some() {
        crate::lahc::run(
            problem,
            &idx,
            config,
            &mut solution.placements,
            &mut state.class_positions,
            &mut state.teacher_positions,
            &mut state.used_teacher,
            &mut state.used_class,
            &mut state.used_room,
            &mut state.soft_score,
        );
    }
    solution.soft_score = state.soft_score;
```

The greedy loop above this line populates all the state fields LAHC needs; no other changes required.

- [ ] **Step 3: Pin existing delta tests to greedy-only**

Find `lowest_delta_picks_gap_minimising_slot_for_class` and `lowest_delta_picks_gap_minimising_slot_for_teacher` in `solve.rs`'s `mod tests`. In each, replace the `let s = solve(&p).unwrap();` line with:

```rust
        let cfg = SolveConfig {
            weights: ConstraintWeights {
                class_gap: 1,
                teacher_gap: 1,
            },
            ..SolveConfig::default()
        };
        let s = solve_with_config(&p, &cfg).unwrap();
```

Add the necessary `use crate::types::SolveConfig;` import to the test module if not present. (The test module already imports `ConstraintWeights` indirectly via `super::*`; SolveConfig may need an explicit `use`.)

- [ ] **Step 4: Run all solve tests**

Run: `cargo nextest run -p solver-core solve::tests`
Expected: PASS. The 11 tests should all stay green: the 9 structural ones run with active-default deadline (LAHC runs but cannot regress placements that are already optimal), and the 2 delta tests run greedy-only.

If a structural test flakes (LAHC moves a placement somewhere unexpected), check whether the test is over-specified. The expected fix is usually to relax the assertion to "placement count = N" instead of "placement at exact tb_id"; if LAHC really is making a wrong decision, that's a bug in `try_change_move` and Task 6's helper tests should have caught it.

- [ ] **Step 5: Run full suite + lint**

Run: `cargo nextest run -p solver-core`
Expected: PASS.

Run: `cargo clippy -p solver-core --all-targets -- -D warnings`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add solver/solver-core/src/solve.rs
git commit -m "feat(solver-core): run lahc after greedy when deadline is set"
```

---

## Task 8: Property tests in `tests/lahc_property.rs`

**Files:**
- Create: `solver/solver-core/tests/lahc_property.rs`

- [ ] **Step 1: Skim the existing property test for shape**

Run: `cat solver/solver-core/tests/score_property.rs`
Note the `prop_compose!` generator and `proptest!` block layout. Mirror them.

- [ ] **Step 2: Create the new file**

Create `solver/solver-core/tests/lahc_property.rs` with:

```rust
//! Property tests for the LAHC local-search loop. Reuses the same problem
//! generator as `score_property.rs` so the bounds stay consistent.

use std::time::Duration;

use proptest::prelude::*;
use solver_core::ids::{
    LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId,
};
use solver_core::types::{
    ConstraintWeights, Lesson, Problem, Room, RoomSubjectSuitability, SchoolClass, SolveConfig,
    Subject, Teacher, TeacherQualification, TimeBlock,
};
use solver_core::{score_solution, solve_with_config};
use uuid::Uuid;

fn weights() -> ConstraintWeights {
    ConstraintWeights {
        class_gap: 1,
        teacher_gap: 1,
    }
}

fn id<T, F: Fn(Uuid) -> T>(wrap: F, n: u32) -> T {
    let mut bytes = [0u8; 16];
    bytes[..4].copy_from_slice(&n.to_be_bytes());
    wrap(Uuid::from_bytes(bytes))
}

prop_compose! {
    fn problem_strategy()(
        n_classes in 1usize..=3,
        n_teachers in 1usize..=4,
        n_rooms in 1usize..=3,
        n_days in 1u8..=3,
        slots_per_day in 2u8..=5,
    )(
        n_classes in Just(n_classes),
        n_teachers in Just(n_teachers),
        n_rooms in Just(n_rooms),
        n_days in Just(n_days),
        slots_per_day in Just(slots_per_day),
    ) -> Problem {
        let subject_a = id(SubjectId, 1);
        let subjects = vec![Subject { id: subject_a }];

        let teachers: Vec<Teacher> = (0..n_teachers)
            .map(|i| Teacher {
                id: id(TeacherId, 1000 + i as u32),
                max_hours_per_week: 40,
            })
            .collect();
        let teacher_qualifications: Vec<TeacherQualification> = teachers
            .iter()
            .map(|t| TeacherQualification {
                teacher_id: t.id,
                subject_id: subject_a,
            })
            .collect();

        let school_classes: Vec<SchoolClass> = (0..n_classes)
            .map(|i| SchoolClass {
                id: id(SchoolClassId, 2000 + i as u32),
            })
            .collect();

        let rooms: Vec<Room> = (0..n_rooms)
            .map(|i| Room {
                id: id(RoomId, 3000 + i as u32),
            })
            .collect();

        let mut time_blocks: Vec<TimeBlock> = Vec::new();
        let mut tb_idx = 0u32;
        for d in 0..n_days {
            for p in 0..slots_per_day {
                time_blocks.push(TimeBlock {
                    id: id(TimeBlockId, 4000 + tb_idx),
                    day_of_week: d,
                    position: p,
                });
                tb_idx += 1;
            }
        }

        let lessons: Vec<Lesson> = school_classes
            .iter()
            .enumerate()
            .map(|(i, sc)| Lesson {
                id: id(LessonId, 5000 + i as u32),
                school_class_id: sc.id,
                subject_id: subject_a,
                teacher_id: teachers[i % teachers.len()].id,
                hours_per_week: 2,
            })
            .collect();

        Problem {
            time_blocks,
            teachers,
            rooms,
            subjects,
            school_classes,
            lessons,
            teacher_qualifications,
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![] as Vec<RoomSubjectSuitability>,
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 32,
        .. ProptestConfig::default()
    })]

    #[test]
    fn lahc_never_increases_score(p in problem_strategy()) {
        let greedy = solve_with_config(&p, &SolveConfig {
            weights: weights(),
            ..SolveConfig::default()
        }).unwrap();
        let lahc = solve_with_config(&p, &SolveConfig {
            weights: weights(),
            deadline: Some(Duration::from_millis(20)),
            seed: 42,
            ..SolveConfig::default()
        }).unwrap();
        prop_assert!(lahc.soft_score <= greedy.soft_score);
    }

    #[test]
    fn lahc_deterministic_under_seed_and_iter_cap(p in problem_strategy()) {
        let cfg = SolveConfig {
            weights: weights(),
            seed: 42,
            deadline: Some(Duration::from_secs(60)),
            max_iterations: Some(200),
            ..SolveConfig::default()
        };
        let a = solve_with_config(&p, &cfg).unwrap();
        let b = solve_with_config(&p, &cfg).unwrap();
        prop_assert_eq!(a, b);
    }

    #[test]
    fn lahc_does_not_add_violations(p in problem_strategy()) {
        let greedy = solve_with_config(&p, &SolveConfig {
            weights: weights(),
            ..SolveConfig::default()
        }).unwrap();
        let lahc = solve_with_config(&p, &SolveConfig {
            weights: weights(),
            deadline: Some(Duration::from_millis(20)),
            seed: 7,
            ..SolveConfig::default()
        }).unwrap();
        prop_assert_eq!(greedy.violations.len(), lahc.violations.len());
    }

    #[test]
    fn lahc_running_score_matches_recompute(p in problem_strategy()) {
        let lahc = solve_with_config(&p, &SolveConfig {
            weights: weights(),
            deadline: Some(Duration::from_millis(20)),
            seed: 11,
            ..SolveConfig::default()
        }).unwrap();
        let recomputed = score_solution(&p, &lahc.placements, &weights());
        prop_assert_eq!(lahc.soft_score, recomputed);
    }
}
```

- [ ] **Step 3: Verify `score_solution` and `solve_with_config` are publicly exported**

Run: `grep -nE 'pub use|pub fn (solve_with_config|score_solution)' solver/solver-core/src/lib.rs`

If `score_solution` is not in `lib.rs`'s public re-exports, add `pub use crate::score::score_solution;` (mirroring how `solve_with_config` is exported). If it's already public, skip.

- [ ] **Step 4: Run the property tests**

Run: `cargo nextest run -p solver-core --test lahc_property`
Expected: PASS. With 32 cases x 4 properties at ~20 ms LAHC budget each, total runtime should be ~10 s.

- [ ] **Step 5: Run full lint + test once more**

Run: `cargo clippy -p solver-core --all-targets -- -D warnings && cargo nextest run -p solver-core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add solver/solver-core/tests/lahc_property.rs solver/solver-core/src/lib.rs
git commit -m "test(solver-core): add lahc property tests for non-regression and determinism"
```

---

## Task 9: Update bench harness

**Files:**
- Modify: `solver/solver-core/benches/solver_fixtures.rs`
- Modify: `scripts/record_solver_bench.sh`

- [ ] **Step 1: Read current bench harness shape**

Run: `cat solver/solver-core/benches/solver_fixtures.rs`
Note where the `for` loop iterates over fixtures and where the TSV header is printed.

- [ ] **Step 2: Add a `Mode` column and double the iteration count**

Update the TSV header in `solver_fixtures.rs` to add a `Mode` column between `Fixture` and `p1`. Change the fixture-iteration shape to iterate over `(fixture, mode)` pairs:

```rust
let modes = [
    ("greedy", SolveConfig {
        weights: ConstraintWeights {
            class_gap: 1,
            teacher_gap: 1,
        },
        deadline: None,
        ..SolveConfig::default()
    }),
    ("lahc", SolveConfig {
        weights: ConstraintWeights {
            class_gap: 1,
            teacher_gap: 1,
        },
        deadline: Some(Duration::from_millis(200)),
        seed: 42,
        ..SolveConfig::default()
    }),
];

for (fixture_name, problem) in fixtures.iter() {
    for (mode_name, cfg) in modes.iter() {
        // run criterion sample loop with solve_with_config(problem, cfg)
        // emit one TSV row: fixture_name, mode_name, p1, p50, p99, soft_score, ...
    }
}
```

(The exact criterion plumbing depends on what's already in `solver_fixtures.rs`; preserve `iter_custom`, `percentile.rs`, and the `---SOLVER-BENCH-BASELINE---` fence, only adding the per-mode dimension.)

For the `lahc` mode, drop criterion's sample size to a fixed small value via `criterion::Criterion::default().sample_size(10)` so the 200 ms-per-sample doesn't extend `mise run bench` past a minute. If criterion's adaptive sampling resists, fall back to `b.iter_custom(|iters| { let mut total = Duration::ZERO; for _ in 0..iters { let t0 = Instant::now(); let _ = solve_with_config(problem, cfg).unwrap(); total += t0.elapsed(); } total })` and explicitly cap iter count.

- [ ] **Step 3: Run the bench locally to confirm it produces the expected TSV shape**

Run: `mise run bench 2>&1 | grep -A 20 SOLVER-BENCH-BASELINE`
Expected: TSV block with header `Fixture\tMode\tp1\tp50\tp99\tSoft score` and four rows (`grundschule\tgreedy`, `grundschule\tlahc`, `zweizuegig\tgreedy`, `zweizuegig\tlahc`).

If the header is wrong or rows are missing, fix Step 2.

- [ ] **Step 4: Update `scripts/record_solver_bench.sh`**

Open `scripts/record_solver_bench.sh`. Find the awk/sed pipeline that turns the TSV block into `BASELINE.md`. Add `Mode` to the column list and ensure four rows render. Test by running:

Run: `mise run bench:record`
Expected: `solver/solver-core/benches/BASELINE.md` updates with four rows. Diff is reviewable.

- [ ] **Step 5: Verify the LAHC rows satisfy the spec's acceptance criteria**

Open `solver/solver-core/benches/BASELINE.md`. Inspect:

- `grundschule lahc` row: `Soft score` <= `grundschule greedy` row's `Soft score` (probably both 0).
- `zweizuegig lahc` row: `Soft score` <= `zweizuegig greedy` row's `Soft score = 2`. If greedy is 2, LAHC must be 0 or 1.
- `grundschule greedy` p50 within 20% of PR-9a's BASELINE.md (≤ 50 µs).
- `zweizuegig greedy` p50 within 20% of PR-9a's BASELINE.md (≤ 224 µs).

If any of these fail, dig into LAHC behaviour rather than relaxing the budget.

- [ ] **Step 6: Commit**

```bash
git add solver/solver-core/benches/solver_fixtures.rs solver/solver-core/benches/BASELINE.md scripts/record_solver_bench.sh
git commit -m "feat(solver-core): bench greedy and lahc rows side-by-side"
```

---

## Task 10: ADR 0015 + OPEN_THINGS update + CLAUDE.md notes

**Files:**
- Create: `docs/adr/0015-solver-lahc-stochastic-search.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/superpowers/OPEN_THINGS.md`
- Modify: `solver/CLAUDE.md`

- [ ] **Step 1: Confirm ADR 0015 is the next free number**

Run: `ls docs/adr/*.md | sort | tail -1`
Expected: `docs/adr/0014-solve-config-and-ffd-ordering.md`. If it's higher, bump the number you use.

- [ ] **Step 2: Read the ADR template**

Run: `cat docs/adr/template.md`
Note the heading style. **Override:** the user's global preference forbids em- and en-dashes in new prose; for ADR 0015 use `# 0015: Solver LAHC local-search loop with seeded RNG` (colon, not em-dash).

- [ ] **Step 3: Create the ADR**

Create `docs/adr/0015-solver-lahc-stochastic-search.md`:

```markdown
# 0015: Solver LAHC local-search loop with seeded RNG

Date: 2026-04-28
Status: Accepted

## Context

PR-9a (`feat/solver-objective-soft-constraints`) shipped the soft-constraint scoring foundation: `score_solution`, `Solution.soft_score`, `ConstraintWeights { class_gap, teacher_gap }`, and a lowest-delta greedy. Per-class soft-score is non-zero on non-trivial fixtures (zweizuegig p50 reports `soft_score = 2`).

Sprint #9 calls for "Soft constraints + objective function + LAHC". PR-9b is the local-search half: a stochastic loop that polishes the greedy's output before the schedule endpoint returns to the user.

## Decision

Plain Burke-Bykov LAHC, list length 500, single Change move (move one lesson-hour to a different time-block, reuse old room or fall back to lowest-id hard-feasible room).

API. `SolveConfig.deadline: Option<Duration>` triggers the loop; `solve()` (no-config entry) hard-codes 200 ms. `SolveConfig.seed: u64` seeds a `rand::rngs::SmallRng` owned by the loop. New `SolveConfig.max_iterations: Option<u64>` exists for property-test determinism; production callers leave it `None`.

Algorithm. Generate-and-test feasibility (no precomputed feasible set). Incremental delta scoring via `gap_count_after_remove` + `gap_count_after_insert`. State maintained across iterations: placements, class_positions, teacher_positions, used_teacher/class/room, current_score, lahc_list[500] of recent costs. RNG draws are invariant across feasibility branches: every iteration consumes exactly two `random_range` calls (placement_idx, target_tb_idx).

## Consequences

`solve_with_config` is no longer a pure greedy entry point; callers wanting greedy-only set `deadline: None`. Determinism story: same problem + same seed + same `max_iterations` cap yields identical Solutions.

`Solution.soft_score` carries the post-LAHC value. The bench prints separate greedy and lahc rows; the LAHC row asserts `soft_score <= greedy soft_score` and (when greedy soft_score > 0) `lahc soft_score < greedy soft_score`. The 20% greedy regression budget continues to apply to the greedy row only.

The 200 ms default lives inside `solve()` and consumes the FastAPI request budget. If staging shows a regression, the hotfix is a one-line edit to the literal.

## Alternatives considered

- **Tabu search.** Deferred indefinitely. archive/v2's 684 LOC for tabu + Kempe + Swap delivered marginal gain for the educational-timetabling problem class against the implementation cost.
- **Simulated annealing.** Adds knobs (cooling schedule, temperature) without a published advantage on this domain.
- **Step Counting Hill Climbing.** Close cousin of LAHC; LAHC chosen for archive/v2 readability continuity.
- **Always-on LAHC inside `solve_with_config` with a fixed default.** Rejected in favour of `deadline.is_some()` as the trigger so existing greedy-only callers (tests, future use cases) are not forced into LAHC.

## Follow-ups

- PR-9c: subject-level pedagogy preferences (Hauptfächer früh, Sport not first period, Musik/Kunst dedicated rooms). Adds soft-constraint axes to `score_solution`; LAHC inherits them automatically.
- Configurable LAHC deadline via query parameter on `POST /api/classes/{id}/schedule`.
- Promote `max_iterations` to a public production knob if iteration-bounded solves become a use case.
- Add `iterations` / `accepted` / `rejected` telemetry to `Solution` if production observability needs it.
- Graduate the move to `(tb, room)` tuple change once room-aware soft constraints exist.
- Add `soft_score_before` and `soft_score_after` to the structured `solver.solve.done` log line.
```

- [ ] **Step 4: Update `docs/adr/README.md` index**

Open `docs/adr/README.md`. Find the table or list of ADRs. Add a row for 0015 in the same shape as the existing entries. Use the same casing convention as ADR 0014's row.

- [ ] **Step 5: Update `docs/superpowers/OPEN_THINGS.md`**

Open `docs/superpowers/OPEN_THINGS.md`. Find item #9 in the "Algorithm phase" section.

- Edit "Remaining (next P0)" sub-bullet to "Shipped 2026-04-28 in PR `feat/solver-lahc`. Plain Burke-Bykov LAHC, list length 500, single Change move, deadline 200 ms by default, seeded `SmallRng`. ADR 0015 records the decision."
- Add new follow-ups under "Acknowledged deferrals" or the appropriate section:
  - "Configurable LAHC deadline via `?deadline_ms=<n>` query param. File when a demo user asks."
  - "Promote `SolveConfig.max_iterations` to a production knob if iteration-bounded solves become a use case."
  - "LAHC telemetry on `Solution` (`iterations`, `accepted`, `rejected`). Add when production observability needs it."

- [ ] **Step 6: Update `solver/CLAUDE.md`**

Open `solver/CLAUDE.md`. Add two new bullets to the relevant rule section:

- **LAHC RNG draw count must be invariant across loop branches.** The determinism property test in `solver-core/tests/lahc_property.rs` relies on every iteration consuming exactly two `random_range` calls regardless of feasibility outcome. Conditional `random_range` calls inside the LAHC loop (e.g. extra draws on a feasibility-failure path) break determinism silently, surfacing only as a flaking property test.
- **`SolveConfig.max_iterations` is a test-only field.** Property tests use it for determinism without depending on wall-clock. Production callers leave it `None` and rely on the deadline alone.

- [ ] **Step 7: Lint to confirm no formatting drift**

Run: `mise run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add docs/adr/0015-solver-lahc-stochastic-search.md docs/adr/README.md docs/superpowers/OPEN_THINGS.md solver/CLAUDE.md
git commit -m "docs: add ADR 0015 and OPEN_THINGS update for solver lahc"
```

---

## Self-Review Notes

**Spec coverage check.** The spec lists 11 work items; mapping:

1. `lahc.rs` module → Tasks 4-6.
2. `gap_count_after_remove` → Task 2.
3. Wire LAHC into `solve_with_config` → Task 7.
4. `SolveConfig.max_iterations` → Task 3.
5. `solve()` 200 ms default → Task 7 step 1.
6. Property tests → Task 8.
7. Pin two existing solve.rs delta tests → Task 7 step 3.
8. Bench harness updates → Task 9.
9. `rand 0.9` workspace dep → Task 1.
10. ADR 0015 → Task 10.
11. OPEN_THINGS flip → Task 10.

All 11 covered.

**Subagent-driven dispatch.** Each task above is a single subagent dispatch (sequential because they share state). Per-task subagent prompt template:

> Plan task: paste the relevant `### Task N` block in full.
> Predecessor: list the commit hash + one-line summary of the prior task.
> Files to touch: list "Files:" from the task header.
> Acceptance criteria: tests run, lint pass; for Task 7 onward, also: greedy bench p50 stays within 20% of PR-9a's `BASELINE.md`.
> Constraints: do not commit; main session reviews and commits.
