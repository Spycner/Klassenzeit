# Solver LAHC local search (PR-9b)

**Date:** 2026-04-28
**Status:** Design approved (autopilot autonomous mode).

## Problem

Sprint item #9b on `docs/superpowers/OPEN_THINGS.md` calls for "Soft constraints + objective function + LAHC". PR-9a (`feat/solver-objective-soft-constraints`) shipped the foundation: `score_solution`, `Solution.soft_score`, `ConstraintWeights { class_gap, teacher_gap }`, and the lowest-delta greedy. The greedy already computes per-placement deltas and writes a non-zero `soft_score` to `Solution` (zweizuegig p50 reports `soft_score = 2`).

PR-9b is the next P0: a stochastic local-search loop on top of the greedy that further reduces `soft_score`. archive/v2 has 684 lines of reference (`scheduler/src/local_search.rs`) covering LAHC plus tabu list, Kempe chains, Swap moves, and a max-idle exit. The spec rejects all four: PR-9b is single-move (Change) only, deadline-bound only, no tabu, no swap, no Kempe. The reduced surface keeps the PR reviewable inside the autopilot's "single coherent PR" rule and makes the determinism story tractable for the property test.

Today's solver (after PR-9a):

- `solve_with_config(p, &SolveConfig::default())` runs greedy and returns. `SolveConfig.deadline` is read but unused. `SolveConfig.seed` is read but unused.
- `solve()` builds `SolveConfig { weights: ConstraintWeights { class_gap: 1, teacher_gap: 1 }, ..default() }` so `deadline = None` and `seed = 0`.
- `Solution.soft_score` carries the greedy result; nothing optimises it further.

The next solver-quality win comes from spending the 200 ms wall-clock budget that already fits inside the FastAPI request lifecycle on a hill-climbing loop. Without this, the soft-constraint plumbing is dead code in production.

## Goal

One PR that ships LAHC on top of greedy:

1. Add `solver-core/src/lahc.rs` with a private `Lahc` struct holding loop state (placements, partition maps, used-sets, current_score, lahc_list[L]) and a `pub(crate) fn run(...)` entry point. No public API surface.
2. Add `score::gap_count_after_remove(positions, pos) -> u32` symmetric to PR-9a's `gap_count_after_insert`. Pure helper, three inline tests.
3. Wire LAHC into `solve_with_config`: greedy first; if `config.deadline.is_some()`, hand off to `lahc::run`. Loop terminates on deadline expiry or on `max_iterations` cap.
4. Add `SolveConfig.max_iterations: Option<u64>` (public field, defaulting to `None`). Exists primarily for property-test determinism.
5. Update `solve()` (no-config entry) to set `deadline = Some(Duration::from_millis(200))` so the production endpoint actually runs LAHC.
6. Add `solver-core/tests/lahc_property.rs` with four properties: never increases score, deterministic under fixed seed + iteration cap, never adds hard violations, in-loop running score matches `score_solution` at exit.
7. Pin two existing solve.rs tests (`lowest_delta_picks_gap_minimising_slot_for_class` / `_teacher`) to `deadline: None` so they stay greedy-only.
8. Bench harness: add a second config per fixture, `deadline: Some(200ms)`. `BASELINE.md` renders four rows total (greedy vs lahc, two fixtures). LAHC rows assert `lahc soft_score <= greedy soft_score` and (when greedy soft_score > 0) `lahc soft_score < greedy soft_score`.
9. Add `rand = "0.9"` to the workspace `Cargo.toml` and `solver-core/Cargo.toml` (already in `Cargo.lock` via `proptest`).
10. ADR `docs/adr/0015-solver-lahc-stochastic-search.md` records the LAHC + RNG decisions and the deferred Tabu/Kempe/Swap rationale.
11. OPEN_THINGS sprint item #9b flips to shipped; #9c (subject preferences) becomes the next P0 follow-up.

After this PR: `POST /api/classes/{id}/schedule` runs LAHC on every solve, soft scores trend down on real data, and PR-9c can add Subject preferences against the existing scoring API without touching the LAHC loop.

## Non-goals

- **Tabu list, Kempe chains, Swap moves.** Reference implementations live in `archive/v2/scheduler/src/local_search.rs`. They stay archived. Tabu is deferred indefinitely per archive/v2 learnings (684 LOC for marginal gain on this domain). Swap and Kempe land if and only if a problem regression demands them.
- **Subject-level pedagogy preferences.** "Hauptfächer früh", "Sport not first period", "Musik/Kunst dedicated rooms" all require a way to tag subjects (per-Subject flag, preference table, or similar). PR-9c owns that schema/API/i18n surface.
- **Frontend rendering of `soft_score`.** Backend exposes the value (added in PR-9a); the schedule view does not yet display it. Display lands with PR-9c alongside the per-Subject preferences that drive most of the variance.
- **Doppelstunden (`preferred_block_size > 1`).** Sprint PR-8 (`[P2]`). PR-9b's Change move ignores `preferred_block_size` because the field is not on `Lesson` today.
- **Backend or frontend code change.** `solver-core::json::solve_json` (the binding entry) already calls the no-config `solve()`. Once `solve()` carries the active default deadline, LAHC runs in production for free. Frontend OpenAPI types regenerate is unnecessary because no `Solution` field shape changes.
- **A configurable deadline as a query parameter.** `?deadline_ms=500` is filed as a follow-up if and only if a demo user asks. Today's 200 ms hard-coded default is the smallest knob.
- **A max-idle exit condition.** archive/v2 needed it because it ran for 60 s; PR-9b's deadline is 200 ms. Filed as follow-up if production traffic ever needs sub-200 ms latency.
- **Promoting `max_iterations` to a production knob.** The field exists for property-test determinism only. Production callers leave it `None`.
- **Returning LAHC telemetry on `Solution`.** Adding `iterations: u64`, `accepted: u64`, `rejected: u64` to `Solution` is a wire-format change. The bench harness reads telemetry via direct internal call and prints it in stderr; production observability follows in a separate PR if needed.

## Design

### `score::gap_count_after_remove`

`solver-core/src/score.rs` gains:

```rust
/// Count gap-hours in `positions` after removing `pos`. Symmetric to
/// `gap_count_after_insert`. Returns 0 if `pos` is not in `positions` or if
/// removal leaves fewer than two elements.
pub(crate) fn gap_count_after_remove(positions: &[u8], pos: u8) -> u32 {
    let Ok(removed_at) = positions.binary_search(&pos) else {
        // pos not present; should not happen in LAHC since we only remove
        // positions we just placed. Defensive return matches insert's
        // "already-present" branch.
        return gap_count(positions);
    };
    let len_after = positions.len() - 1;
    if len_after < 2 {
        return 0;
    }
    // After removal, first/last shift only if we removed an endpoint.
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

Inline tests:

- Remove from a one-element partition leaves zero (no gap possible with zero or one element).
- Remove the min: span shrinks by `(new_first - old_first)`, gap shrinks correspondingly.
- Remove the max: span shrinks by `(old_last - new_last)`, gap shrinks correspondingly.
- Remove a middle: first and last unchanged, span unchanged, count drops by 1, gap grows by 1.
- Remove `pos` that is not present: returns the same as `gap_count(positions)` (defensive).

### `solver-core/src/lahc.rs`: state + main loop

New module. Crate-private; not re-exported from `lib.rs`.

```rust
//! Late-acceptance hill-climbing loop that polishes the greedy's output.
//! Single Change move, deadline-bound, deterministic under (seed,
//! max_iterations). Reuses `score::gap_count_after_insert` and the new
//! `score::gap_count_after_remove` for incremental delta scoring.

use std::collections::{HashMap, HashSet};
use std::time::Instant;

use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};

use crate::ids::{LessonId, RoomId, SchoolClassId, TeacherId, TimeBlockId};
use crate::index::Indexed;
use crate::score::{gap_count_after_insert, gap_count_after_remove};
use crate::types::{ConstraintWeights, Lesson, Placement, Problem, SolveConfig, TimeBlock};

const LAHC_LIST_LEN: usize = 500;

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
        // 1. Pick a placed lesson-hour uniformly at random.
        if placements.is_empty() {
            return;
        }
        let placement_idx = rng.random_range(0..placements.len());
        let p = placements[placement_idx].clone();
        let lesson = lesson_lookup[&p.lesson_id];
        let old_tb = tb_lookup[&p.time_block_id];

        // 2. Pick a target time-block uniformly at random.
        let new_tb_idx = rng.random_range(0..problem.time_blocks.len());
        let new_tb = &problem.time_blocks[new_tb_idx];
        if new_tb.id == old_tb.id {
            iter += 1;
            advance_lahc_list(&mut lahc_list, iter, *current_score);
            continue;
        }

        // 3. Hard-feasibility: teacher, class, teacher_blocked. The placement's
        //    own (teacher, old_tb) and (class, old_tb) are still in used_teacher/
        //    used_class; the move temporarily removes them before checking the
        //    new tb so a same-day move into a now-vacated slot can succeed.
        let class = lesson.school_class_id;
        let teacher = lesson.teacher_id;
        if !move_feasible(
            teacher, class, new_tb.id, old_tb.id,
            used_teacher, used_class, idx,
        ) {
            iter += 1;
            advance_lahc_list(&mut lahc_list, iter, *current_score);
            continue;
        }

        // 4. Pick a room: reuse the old room if feasible at new_tb; else
        //    lowest-id hard-feasible room.
        let new_room_id = pick_room(
            problem, idx, lesson.subject_id, p.room_id, new_tb.id, old_tb.id, used_room,
        );
        let Some(new_room_id) = new_room_id else {
            iter += 1;
            advance_lahc_list(&mut lahc_list, iter, *current_score);
            continue;
        };

        // 5. Compute delta.
        let delta = score_after_change_move(
            class, teacher,
            old_tb.day_of_week, old_tb.position,
            new_tb.day_of_week, new_tb.position,
            class_positions, teacher_positions, &config.weights,
        );
        let new_score = (*current_score as i64 + delta) as u32;

        // 6. LAHC accept rule.
        let prior = lahc_list[(iter as usize) % LAHC_LIST_LEN];
        if new_score <= *current_score || new_score <= prior {
            apply_change_move(
                placement_idx, &p, new_tb, new_room_id,
                placements, class_positions, teacher_positions,
                used_teacher, used_class, used_room,
            );
            *current_score = new_score;
        }

        iter += 1;
        advance_lahc_list(&mut lahc_list, iter, *current_score);
    }
}

fn advance_lahc_list(list: &mut [u32], iter: u64, current: u32) {
    list[(iter as usize) % LAHC_LIST_LEN] = current;
}
```

`move_feasible`, `pick_room`, `score_after_change_move`, `apply_change_move` are all small private helpers in the same module. Each gets inline tests where the shape is non-trivial:

- `score_after_change_move` has six tests covering: same-day move (within one (class, day)), cross-day move, move that creates a gap, move that fills a gap, move that creates and fills a gap simultaneously (different partitions), move on a class with only the affected lesson present.
- `pick_room` has three tests: old room feasible, old room blocked at new tb, no feasible room.
- `apply_change_move` has one test: state mutations are consistent (placement's tb_id and room_id updated; class_positions and teacher_positions reflect the move; used_teacher / used_class / used_room old entries removed and new ones inserted).

Determinism note. `random_range` calls into `SmallRng` are the only RNG consumers. Two runs with the same seed and the same `max_iterations` produce identical RNG sequences and therefore identical (lesson_idx, target_tb_idx) pairs. Combined with the same `current_score`, `class_positions`, `teacher_positions`, `used_*` going in (which hold because the greedy is already deterministic by PR-9a's property test), the LAHC loop is deterministic.

### `score_after_change_move`: incremental delta

```rust
fn score_after_change_move(
    class: SchoolClassId,
    teacher: TeacherId,
    old_day: u8, old_pos: u8,
    new_day: u8, new_pos: u8,
    class_positions: &HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: &HashMap<(TeacherId, u8), Vec<u8>>,
    weights: &ConstraintWeights,
) -> i64 {
    // Class side.
    let class_delta = if old_day == new_day {
        // Same partition: simulate remove-then-insert in one bucket.
        let part = class_positions.get(&(class, old_day)).unwrap();
        let before = crate::score::gap_count(part);
        let after = gap_count_same_day_swap(part, old_pos, new_pos);
        after as i64 - before as i64
    } else {
        let old_part = class_positions.get(&(class, old_day)).unwrap();
        let new_part = class_positions.get(&(class, new_day));
        let old_before = crate::score::gap_count(old_part);
        let old_after = gap_count_after_remove(old_part, old_pos);
        let new_before = new_part.map(|v| crate::score::gap_count(v)).unwrap_or(0);
        let new_after = gap_count_after_insert(new_part, new_pos);
        (old_after as i64 - old_before as i64) + (new_after as i64 - new_before as i64)
    };
    // Teacher side: identical shape.
    let teacher_delta = /* mirrors class_delta with teacher_positions */;

    weights.class_gap as i64 * class_delta + weights.teacher_gap as i64 * teacher_delta
}
```

`gap_count_same_day_swap(part, old_pos, new_pos)` is the small helper that handles the same-day case in one allocation-free pass: remove `old_pos` and insert `new_pos` against the same sorted slice. Implementation walks the slice once, tracks `(new_min, new_max, len_after)` from the proposed change. Three inline tests cover swap-no-effect (move within unchanged span), swap-extends (move past the current max), swap-fills-gap (move into a hole).

The `i64` arithmetic is necessary because the move can reduce the running score (negative delta). The conversion back to `u32` at the call site relies on the invariant `current_score + delta >= 0`, which holds because removing a position cannot reduce a gap-count below zero and the running sum stays non-negative.

### `SolveConfig` extension

`solver-core/src/types.rs`:

```rust
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SolveConfig {
    pub deadline: Option<Duration>,
    pub seed: u64,
    pub weights: ConstraintWeights,
    /// Maximum number of LAHC iterations. `None` means "deadline only".
    /// Primarily for tests that need iteration-bounded determinism without
    /// depending on wall-clock; production callers should leave this `None`.
    pub max_iterations: Option<u64>,
}
```

`Default` derives `None`. The field is public so `solver-core/tests/lahc_property.rs` can construct configs with explicit caps.

### `solve()` active defaults

```rust
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    let active_default = SolveConfig {
        weights: ConstraintWeights { class_gap: 1, teacher_gap: 1 },
        deadline: Some(Duration::from_millis(200)),
        ..SolveConfig::default()
    };
    solve_with_config(problem, &active_default)
}
```

Unchanged: `seed = 0` (the `Default` value), `max_iterations = None`.

### `solve_with_config` flow

After greedy, if `config.deadline.is_some()`, call `lahc::run(problem, &idx, config, &mut solution.placements, &mut state.class_positions, ...)` passing the existing `GreedyState` mutables. The loop borrows them, mutates them, and returns. Then `solution.soft_score = state.soft_score` writes the post-LAHC score.

`GreedyState` already exposes the right fields (`class_positions`, `teacher_positions`, `used_teacher`, `used_class`, `used_room`, `soft_score`). Two changes:

1. `soft_score` field stays a `u32` and is updated by LAHC's mutation loop directly.
2. Move the `GreedyState` struct definition above `solve_with_config` if needed for module visibility; keep it crate-private.

### Existing test pinning

Two solve.rs tests assert on greedy-specific outcomes:

- `lowest_delta_picks_gap_minimising_slot_for_class`
- `lowest_delta_picks_gap_minimising_slot_for_teacher`

Both call `solve(&p)`. With LAHC always-on for `solve()`, the assertions still hold (LAHC cannot improve a `soft_score=0` schedule), but to keep them "greedy behaviour" assertions for clarity, both flip to `solve_with_config(&p, &SolveConfig { weights: ConstraintWeights { class_gap: 1, teacher_gap: 1 }, ..SolveConfig::default() })` (no deadline, so LAHC does not run).

The remaining nine solve.rs tests are structural (count, no double-booking, violation kind) and do not change behaviour under LAHC. They keep calling `solve(&p)` so the active-default code path is exercised by unit tests.

### Property tests

`solver-core/tests/lahc_property.rs`:

```rust
proptest! {
    #[test]
    fn lahc_never_increases_score(p in problem_strategy()) {
        let greedy = solve_with_config(&p, &SolveConfig {
            weights: active_weights(), ..Default::default()
        }).unwrap();
        let lahc = solve_with_config(&p, &SolveConfig {
            weights: active_weights(),
            deadline: Some(Duration::from_millis(50)),
            seed: 42,
            ..Default::default()
        }).unwrap();
        prop_assert!(lahc.soft_score <= greedy.soft_score);
    }

    #[test]
    fn lahc_deterministic_under_seed_and_iter_cap(p in problem_strategy()) {
        let cfg = SolveConfig {
            weights: active_weights(),
            seed: 42,
            deadline: Some(Duration::from_secs(60)),
            max_iterations: Some(200),
            ..Default::default()
        };
        let a = solve_with_config(&p, &cfg).unwrap();
        let b = solve_with_config(&p, &cfg).unwrap();
        prop_assert_eq!(a, b);
    }

    #[test]
    fn lahc_does_not_add_violations(p in problem_strategy()) {
        let greedy = solve_with_config(&p, &SolveConfig {
            weights: active_weights(), ..Default::default()
        }).unwrap();
        let lahc = solve_with_config(&p, &SolveConfig {
            weights: active_weights(),
            deadline: Some(Duration::from_millis(50)),
            seed: 7,
            ..Default::default()
        }).unwrap();
        prop_assert_eq!(greedy.violations.len(), lahc.violations.len());
    }

    #[test]
    fn lahc_running_score_matches_recompute(p in problem_strategy()) {
        let lahc = solve_with_config(&p, &SolveConfig {
            weights: active_weights(),
            deadline: Some(Duration::from_millis(50)),
            seed: 11,
            ..Default::default()
        }).unwrap();
        let recomputed = score_solution(&p, &lahc.placements, &active_weights());
        prop_assert_eq!(lahc.soft_score, recomputed);
    }
}
```

`problem_strategy()` is a `prop_compose` generator with the same bounds as the existing PR-9a property test (≤ 4 classes, ≤ 6 teachers, ≤ 5 rooms, ≤ 25 lessons, ≤ 30 time-blocks). `active_weights()` returns `ConstraintWeights { class_gap: 1, teacher_gap: 1 }`. The shared bound keeps proptest shrinking fast.

Caveat on the determinism test. Two runs of `lahc_run` consume RNG identically only if every iteration consumes the same amount of randomness. The current move design always calls `random_range` exactly twice per iteration (for `placement_idx` and `new_tb_idx`), regardless of feasibility. Property guarantee holds.

### Bench updates

`solver-core/benches/solver_fixtures.rs`. Currently iterates `[grundschule, zweizuegig]` with one `SolveConfig::default()` per fixture. Change to iterate `[grundschule_greedy, grundschule_lahc, zweizuegig_greedy, zweizuegig_lahc]` where each entry pairs a fixture with one of two configs:

```rust
let greedy_cfg = SolveConfig {
    weights: ConstraintWeights { class_gap: 1, teacher_gap: 1 },
    deadline: None,
    ..SolveConfig::default()
};
let lahc_cfg = SolveConfig {
    weights: ConstraintWeights { class_gap: 1, teacher_gap: 1 },
    deadline: Some(Duration::from_millis(200)),
    seed: 42,
    ..SolveConfig::default()
};
```

The TSV stderr block adds two columns: `Mode` (`greedy` or `lahc`) and the existing `Soft score`. `scripts/record_solver_bench.sh` extends to render four rows in `BASELINE.md`.

Acceptance for the LAHC rows:

- `lahc soft_score <= greedy soft_score` (must not regress).
- If `greedy soft_score > 0`, then `lahc soft_score < greedy soft_score` (must improve).

Greedy rows stay anchored to PR-9a's BASELINE.md (grundschule p50 ≤ 50 µs, zweizuegig p50 ≤ 224 µs). The 20% regression budget applies to greedy only; LAHC rows are new measurements without a budget.

Bench wall-clock for the LAHC row will be dominated by the 200 ms deadline. To keep `mise run bench` runtime sane, the criterion sample size for LAHC rows drops to a small fixed N (e.g. 10) so the total stays under a minute. If criterion's adaptive sampling fights this, fall back to `iter_custom` with an explicit loop.

### `Cargo.toml` updates

Workspace `Cargo.toml`:

```toml
[workspace.dependencies]
rand = { version = "0.9", default-features = false, features = ["std", "std_rng", "small_rng"] }
```

`solver-core/Cargo.toml`:

```toml
[dependencies]
rand = { workspace = true }
```

`Cargo.lock` already contains `rand 0.9.2` via `proptest`'s transitive dep; the explicit add only changes the root crate set. `cargo update -p rand` after the edit lets cargo resolve cleanly without a version bump elsewhere.

### ADR 0015

`docs/adr/0015-solver-lahc-stochastic-search.md`. Title: `0015: Solver LAHC local-search loop with seeded RNG`. Sections:

- **Status:** Accepted.
- **Context.** Greedy lowest-delta scheduler shipped in PR-9a; per-class soft-score is non-zero on non-trivial fixtures (zweizuegig p50 reports `soft_score = 2`). Sprint #9 calls for soft constraints + local search; PR-9b is the local-search half.
- **Decision.** Plain Burke-Bykov LAHC, list length 500, single Change move. `SolveConfig.deadline` triggers the loop; `solve()` (no-config) hard-codes 200 ms. `SolveConfig.seed` seeds a `rand::rngs::SmallRng` owned by the loop. Generate-and-test feasibility (no precomputed feasible set). Incremental delta scoring via `gap_count_after_remove` + `gap_count_after_insert`.
- **Consequences.** `solve_with_config` is no longer a pure greedy entry point; callers wanting greedy-only set `deadline: None`. Determinism story: same problem + same seed + same `max_iterations` cap yields identical Solutions. `Solution.soft_score` carries the post-LAHC value. Bench prints separate greedy and LAHC rows. Property test runtime grows with each generator case (50 ms x 4 props x ~256 cases ≈ 50 s); proptest's `cases = 32` cap on the generator keeps the suite under 10 s.
- **Alternatives considered.**
    - Tabu search (deferred indefinitely per archive/v2 — 684 LOC for marginal gain on this problem class).
    - Simulated annealing (more knobs: schedule, temperature, cooling. No published advantage on educational timetabling vs LAHC).
    - Step Counting Hill Climbing (close cousin; LAHC chosen for archive/v2 readability continuity).
- **Follow-ups.** PR-9c (subject preferences) extends scoring axes. Promote `max_iterations` to a public production knob if iteration-bounded solves become a use case. Add `iterations` / `accepted` / `rejected` telemetry to `Solution` if production observability needs it. Graduate move to (tb, room) tuple change once room-aware soft constraints exist.

## Test plan

| Layer | Test | Where |
|---|---|---|
| Unit | `gap_count_after_remove` empty / single / remove-min / remove-max / remove-middle / remove-absent | `solver-core/src/score.rs` (inline) |
| Unit | `score_after_change_move` same-day / cross-day / creates-gap / fills-gap / mixed-partition / single-position-class | `solver-core/src/lahc.rs` (inline) |
| Unit | `pick_room` reuse / fallback / none | `solver-core/src/lahc.rs` (inline) |
| Unit | `apply_change_move` state mutation consistency | `solver-core/src/lahc.rs` (inline) |
| Unit | Existing 9 solve.rs structural tests pass with active-default deadline | `solver-core/src/solve.rs` (no edit) |
| Unit | Two existing delta tests (`_for_class`, `_for_teacher`) pinned to `deadline: None` | `solver-core/src/solve.rs` (signature update) |
| Property | LAHC never increases score / deterministic / no new violations / running score matches recompute | `solver-core/tests/lahc_property.rs` |
| Bench | LAHC row prints `Soft score (LAHC)` ≤ greedy soft_score | `solver-core/benches/solver_fixtures.rs`, `BASELINE.md` |
| Existing | PR-9a's `solver-core/tests/score_property.rs` (scorer eq + greedy determinism) keeps passing | unchanged |

CI runs `mise run test` (Rust + Python + frontend) plus `mise run lint`. Bench is local-only. Backend tests do not change because `Solution` shape is unchanged.

## Risks and mitigations

- **LAHC consumes the FastAPI request budget.** 200 ms inside a request handler is meaningful. Mitigation: existing FastAPI middleware logs request duration; if staging shows a regression, drop the default to 100 ms or wire it through a query parameter (filed as follow-up).
- **Determinism test flakes under seed sensitivity.** A single change to the RNG consumption pattern (e.g., adding a third `random_range` call inside an `if`) breaks determinism. Mitigation: the determinism property test sets `max_iterations: Some(200)` with `deadline: Some(60s)`, so the iteration cap fires first and the loop's RNG draws are bounded. Code review specifically flags any conditional `random_range` inside the LAHC loop.
- **Property test wall-clock blows up.** Proptest defaults to 256 cases x 4 properties x 50 ms = 51 s. Mitigation: `proptest! { #![proptest_config(ProptestConfig { cases: 32, .. })] }` at the top of the file caps the suite at ~6 s.
- **Greedy 20% budget breached by adding `rand` import to solver-core.** Unlikely; `rand` adds no runtime cost when not constructed. Mitigation: bench refresh measures both greedy and lahc rows; greedy row must stay within budget.
- **`SmallRng` seed `0` is conventional but not a magic value.** `SmallRng::seed_from_u64(0)` produces a defined sequence; no "all-zeros" pathology. Mitigation: documented in the ADR.

## Migration / rollout

This is a code-only PR. No database migration, no environment variable, no staging rollout step beyond CI green + automerge.

After merge, `staging.klassenzeit` (the existing self-hosted runner deployment) auto-redeploys and the next "Generate" click in staging runs greedy + LAHC. The schedule view shows the same UI; only `soft_score` carries a smaller number than before, and nothing renders it yet.

The 200 ms deadline is hard-coded inside `solve()`. If staging surfaces a regression, the hotfix path is a one-line edit to the `Duration::from_millis` literal and a fresh deploy.

## Follow-ups (out of this PR)

- **PR-9c: subject-level pedagogy preferences.** `Subject.preference_early_periods: bool`, `Subject.preference_avoid_first_period: bool`, etc. Wire through Subject schema, Pydantic, frontend form, en/de i18n. Adds two soft-constraint terms to `score_solution`.
- **Configurable LAHC deadline.** `?deadline_ms=500` query parameter on `POST /api/classes/{id}/schedule`. File when a demo user asks.
- **Promote `max_iterations` to production.** Today test-only; promote if iteration-bounded solves become a use case (e.g., a "preview the next move" UX).
- **LAHC telemetry on `Solution`.** `iterations: u64`, `accepted: u64`, `rejected: u64`. Lands when production observability needs it.
- **Graduate move to (tb, room) tuple.** Necessary once PR-9c adds room-aware soft constraints (Musik/Kunst dedicated rooms).
- **Add `violations_by_kind` and `soft_score` to `solver.solve.done` log.** Already filed in OPEN_THINGS for the typed-violations PR; PR-9b is the moment to also include `soft_score_before` and `soft_score_after`.
