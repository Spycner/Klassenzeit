# FFD lesson ordering + `SolveConfig` API surface

**Date:** 2026-04-26
**Status:** Design approved (autopilot autonomous mode).

## Problem

The active "solver quality + tidy" sprint on `docs/superpowers/OPEN_THINGS.md` has shipped its tidy phase (items 1 to 5) and item 6's first leg (zweizügige bench fixture). Item 7 ("FFD ordering + `SolveConfig` struct") is the gate to the algorithm phase: PR 8 (Doppelstunden) and PR 9 (LAHC + soft constraints) both need a configuration carrier and a deterministic, eligibility-aware lesson order before they can layer on their own behaviour. Today the solver iterates `problem.lessons` in input-Vec order and emits placements via greedy first-fit. The order matters: the `zweizuegig` bench fixture only solves cleanly when the Python and Rust authoring code hand-encodes a scarcity-first subject order (`subject_order: [3, 6, 5, 7, 8, 4, 0, 1, 2]` in `solver/solver-core/benches/solver_fixtures.rs`), and `solver/CLAUDE.md` documents this as a workaround that "future solvers that sort internally (PR 7 FFD, PR 9 LAHC) will be invariant to". Until First Fit Decreasing lands, that workaround stays load-bearing and any new fixture risks repeating it.

There is also no API-level configuration carrier. `solve(&Problem) -> Result<Solution, Error>` is the only public entry point in `solver-core`. PR 9 will need to pass `weights: ConstraintWeights`, a `seed` for reproducible LAHC swaps, and an optional `deadline` for time-bounded local search. Adding these as a positional explosion on `solve` would break every caller; introducing them now as a `SolveConfig` struct lets PRs 8 and 9 add fields without touching call sites.

## Goal

One PR that:

1. Introduces `SolveConfig { deadline: Option<Duration>, seed: u64, weights: ConstraintWeights }` plus an empty `ConstraintWeights {}` placeholder, both with `Default` derived. Adds `solve_with_config(&Problem, &SolveConfig) -> Result<Solution, Error>` as the new public entry point. Reduces `solve(&Problem)` to a delegate that calls `solve_with_config(p, &SolveConfig::default())`.
2. Adds `solver-core/src/ordering.rs` with `pub(crate) fn ffd_order(problem: &Problem, idx: &Indexed) -> Vec<usize>` returning lesson indices in placement order. The metric is the per-lesson product of (count of time blocks where the lesson's teacher is not blocked) and (count of rooms suitable for the lesson's subject). Tiebreak: `LessonId` byte order (UUID lexicographic).
3. Calls `ffd_order` from `solve_with_config` so every solver run uses FFD. The downstream placement loop is unchanged: per lesson, per hour, per time block, per room, first-fit with the existing hard-constraint checks and `unplaced_kind` violation classification.
4. Removes the scarcity-first `subject_order` workaround in `solver/solver-core/benches/solver_fixtures.rs` and its explanatory comment block. Removes the matching paragraph in `solver/CLAUDE.md` ("Bench global-solve is sensitive to lesson input order; Python solvability is not.").
5. Files ADR 0014 documenting the `SolveConfig` surface choice and the FFD eligibility metric.
6. Closes OPEN_THINGS active-sprint algorithm-phase item 7 and points the roadmap memory at item 9 (LAHC + soft constraints) as the next P0; item 8 (Doppelstunden) is P2 and may slip.

After this PR: a single solver code path; `BASELINE.md` updated if perf moves more than ~3%; both bench fixtures still solve to zero violations with no manual subject ordering; PR 8 and PR 9 can extend `SolveConfig` and `ConstraintWeights` without breaking callers.

## Non-goals

- **Soft constraints, weights tuning, LAHC.** Sprint PR 9 owns these. `ConstraintWeights` ships empty so PR 9 controls every field name and its default.
- **Doppelstunden / `preferred_block_size > 1`.** Sprint PR 8. The `Lesson` struct keeps its current shape; this PR neither adds the field nor the contiguity constraint.
- **MRV (minimum-remaining-values) re-sort each step.** Live recomputation is closer to MRV than FFD; it would land as a separate optimisation if PR 9 LAHC needs it. Today's eligibility metric is computed once before placement begins.
- **Backend / Python wrapper changes.** The wire format does not change. `solver-py` still exposes `solve_json(json: str)`; nothing about `SolveConfig` reaches the FastAPI surface in this PR. PR 9 will own the "how does the route layer pick weights" decision.
- **Persisting violations or surfacing them via GET.** Tracked separately under OPEN_THINGS "Acknowledged deferrals".
- **Replacing the `Indexed` private struct or the placement loop.** Both stay. FFD only changes the order in which the placement loop iterates lessons.
- **Per-class FFD vs global FFD.** The route handler `POST /api/classes/{id}/schedule` already builds a per-class problem; FFD operates on whatever `problem.lessons` it receives. Cross-class consistency is a separate OPEN_THINGS deferral.

## Design

### `SolveConfig` and `ConstraintWeights`

`solver/solver-core/src/types.rs` (or a new `config.rs` if `types.rs` becomes too large; current size is 270 lines, so `types.rs` is fine):

```rust
use std::time::Duration;

/// Tunables for one solver invocation. Pass via `solve_with_config`; the
/// no-config `solve` entry point uses `SolveConfig::default()`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SolveConfig {
    /// Optional wall-clock budget. `None` means "no budget enforced". The
    /// greedy first-fit pass ignores this; a future local-search pass
    /// (sprint PR 9) will honour it.
    pub deadline: Option<Duration>,
    /// Seed for any randomised tiebreak inside the solver. The greedy
    /// pass is deterministic without it; a future local-search pass
    /// (sprint PR 9) will use it for reproducible swaps.
    pub seed: u64,
    /// Weights that govern the soft-constraint scoring function.
    pub weights: ConstraintWeights,
}

/// Soft-constraint weights. Currently empty; populated by the soft-constraint
/// + LAHC PR. Empty curly-brace form (not unit struct) so adding fields later
/// is non-breaking.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConstraintWeights {}
```

Both derive `Default`. `Eq` is fine because every field type implements it (`Option<Duration>`, `u64`, struct of `Eq` fields). Re-export from `lib.rs`:

```rust
pub use types::{
    ConstraintWeights, Lesson, Placement, Problem, Room, RoomBlockedTime,
    RoomSubjectSuitability, SchoolClass, Solution, SolveConfig, Subject,
    Teacher, TeacherBlockedTime, TeacherQualification, TimeBlock, Violation,
    ViolationKind,
};
```

### `solve_with_config` and `solve`

`solver/solver-core/src/solve.rs`:

```rust
/// Solve the timetable problem using First Fit Decreasing lesson ordering
/// followed by greedy first-fit placement.
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    solve_with_config(problem, &SolveConfig::default())
}

/// Solve the timetable problem with explicit configuration. Today's pass
/// reads the config's struct presence but not its fields; later passes
/// (sprint PRs 8, 9) consume `weights`, `seed`, and `deadline`.
pub fn solve_with_config(
    problem: &Problem,
    _config: &SolveConfig,
) -> Result<Solution, Error> {
    validate_structural(problem)?;

    let idx = Indexed::new(problem);
    let order = ffd_order(problem, &idx);

    let mut solution = Solution {
        placements: Vec::new(),
        violations: pre_solve_violations(problem),
    };

    let mut used_teacher: HashSet<(TeacherId, TimeBlockId)> = HashSet::new();
    let mut used_class: HashSet<(SchoolClassId, TimeBlockId)> = HashSet::new();
    let mut used_room: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
    let mut hours_by_teacher: HashMap<TeacherId, u8> = HashMap::new();

    let teacher_max: HashMap<TeacherId, u8> = problem
        .teachers
        .iter()
        .map(|t| (t.id, t.max_hours_per_week))
        .collect();

    for &lesson_idx in &order {
        let lesson = &problem.lessons[lesson_idx];
        if !idx.teacher_qualified(lesson.teacher_id, lesson.subject_id) {
            continue;
        }
        for hour_index in 0..lesson.hours_per_week {
            // existing try_place_hour + violation push, unchanged
        }
    }
    Ok(solution)
}
```

`_config` is intentionally unused this PR. The leading underscore satisfies clippy without an `#[allow]`. The rustdoc explains why.

### `ordering.rs`

`solver/solver-core/src/ordering.rs`:

```rust
//! First Fit Decreasing lesson ordering. Returns a permutation of
//! `problem.lessons` indices in placement order: most-constrained lesson
//! first, deterministic tiebreak on `LessonId` byte order.

use crate::index::Indexed;
use crate::types::Problem;

/// Compute placement order under First Fit Decreasing. Eligibility for a
/// lesson is the product of the count of time blocks where the lesson's
/// teacher is not blocked and the count of rooms suitable for the lesson's
/// subject. Lessons whose teacher lacks the qualification fall to
/// eligibility 0 and sort first; the placement loop skips them and
/// `pre_solve_violations` records the kind.
pub(crate) fn ffd_order(problem: &Problem, idx: &Indexed) -> Vec<usize> {
    let mut order: Vec<usize> = (0..problem.lessons.len()).collect();
    order.sort_by(|&a, &b| {
        let ea = eligibility(&problem.lessons[a], problem, idx);
        let eb = eligibility(&problem.lessons[b], problem, idx);
        ea.cmp(&eb)
            .then_with(|| problem.lessons[a].id.0.cmp(&problem.lessons[b].id.0))
    });
    order
}

fn eligibility(lesson: &crate::types::Lesson, problem: &Problem, idx: &Indexed) -> u32 {
    let free_blocks = problem
        .time_blocks
        .iter()
        .filter(|tb| !idx.teacher_blocked(lesson.teacher_id, tb.id))
        .count();
    let suitable_rooms = problem
        .rooms
        .iter()
        .filter(|r| idx.room_suits_subject(r.id, lesson.subject_id))
        .count();
    u32::try_from(free_blocks * suitable_rooms).unwrap_or(u32::MAX)
}
```

`pub(crate)` because `solve_with_config` is the only caller; the public surface is the higher-level `solve` / `solve_with_config` pair, not the heuristic.

`Indexed` already exposes `teacher_blocked` and `room_suits_subject`; nothing in `index.rs` needs to change. (`#[cfg_attr(not(test), allow(dead_code))]` on the `impl Indexed` block can come off if `ffd_order` calls those methods from non-test code.)

`Lesson.id` is a `LessonId(Uuid)` newtype; `.0.cmp(&other.0)` gives the lex byte order. `Uuid: Ord` is provided by the `uuid` crate.

`u32::try_from(usize * usize)` saturates at `u32::MAX` if a fixture has > 2^32 candidate pairs; the bench fixtures are nowhere near, but the saturate is documented behaviour rather than a panic. (Fits the "no untyped catchalls" rule because saturation is an explicit decision, not a swallowed error.)

### `lib.rs`

Add `pub mod ordering;` if the helper needs to be reachable from integration tests; otherwise `mod ordering;` (private). The unit + property tests live inline (`#[cfg(test)] mod tests`) and at `solver-core/tests/`, so private module is enough.

```rust
mod ordering;
```

### Bench fixtures

`solver/solver-core/benches/solver_fixtures.rs::zweizuegig_fixture()`: replace the explanatory comment block + manual `subject_order` constant with the natural iteration:

```rust
for c_idx in 0..classes.len() {
    for s_idx in 0..subjects.len() {
        let hours = hours_per_class[c_idx][s_idx];
        if hours == 0 {
            continue;
        }
        // ...
    }
}
```

The assertion `assert_eq!(lessons.len(), 68)` and `assert_eq!(total_hours, 196)` stay. The bench still asserts `solution.violations.is_empty()`; FFD must produce zero violations for the fixture to pass.

Update the docstring at the top of the file: drop the line about scarcity-first encoding (no longer required). The Grundschule fixture's loop is unchanged (it already iterates 0..8 naturally; no workaround there).

### `solver/CLAUDE.md`

Remove the bullet "Bench global-solve is sensitive to lesson input order; Python solvability is not." (the entire paragraph). Add a one-line replacement: "Both bench fixtures iterate subjects in the natural authoring order; FFD is invariant to the input permutation." Position: same place in the "Bench workflow" section.

### `BASELINE.md`

Run `mise run bench:record` after the behavioural commit; commit the regenerated file. The committed FFD baseline is the new reference for PR 9's regression budget. Expected delta: low single-digit microseconds added per solve from the precompute + sort. p50 for `zweizuegig` should land at 175 to 180 µs (was 172); p50 for `grundschule` should be unchanged (45 placements; sort cost is negligible). If the actual delta is larger, the spec is wrong and the PR documents the surprise in its body.

### Tests

**Rust unit (`solver/solver-core/src/ordering.rs`):**

- `ffd_order_places_low_eligibility_lesson_first`: build a problem with two lessons; lesson A's teacher is blocked in 4 of 5 time blocks (eligibility = 1 × R), lesson B's teacher is blocked in none (eligibility = 5 × R). Assert `ffd_order` returns `[a_idx, b_idx]` regardless of input order.
- `ffd_order_tiebreaks_on_lesson_id_when_eligibility_ties`: two lessons with identical eligibility; assert the lex-smaller `LessonId` comes first.
- `ffd_order_returns_every_index_exactly_once`: simple property check; the returned `Vec<usize>` has `problem.lessons.len()` entries with no duplicates.

The "permutation" property check lives inline alongside the unit tests above so it can call `pub(crate) fn ffd_order` directly; integration tests in `solver-core/tests/` cannot reach `pub(crate)` items. Use `proptest` (already declared in the workspace dev-dependencies) over `Problem` shapes (1 to 20 lessons, 1 to 10 time-blocks, 1 to 5 rooms); assert the returned `Vec<usize>` is a permutation of `0..lessons.len()`.

**Rust integration (`solver/solver-core/tests/ffd_solver_outcome.rs`):**

- `ffd_places_more_when_input_is_pessimal`: small Problem (3 classes, 2 specialist teachers, 2 rooms) crafted so input-Vec order leaves one lesson unplaced but FFD order succeeds. The test calls `solve` directly (which now uses FFD); a sibling assertion confirms `solve_with_config(p, &SolveConfig::default())` returns the same result. This test fails on master (input-Vec order) and passes after the behavioural commit; it is the integration-level proof that FFD changed an outcome, not just a sort.

**Rust unit (`solver/solver-core/src/solve.rs`):**

Existing tests:
- `single_hour_places_into_first_slot_and_room`: one lesson, two slots; FFD-stable, passes unchanged.
- `unqualified_teacher_emits_violation_and_skips_placement`: one lesson; passes unchanged.
- `teacher_blocked_time_prevents_placement_there`: one lesson; passes unchanged.
- `room_unsuitable_for_subject_is_skipped`: one lesson; passes unchanged.
- `room_blocked_time_pushes_placement_to_next_slot`: one lesson; passes unchanged.
- `teacher_max_hours_cap_emits_teacher_over_capacity`: one lesson; passes unchanged.
- `no_free_time_block_when_class_slots_are_filled_blocks_second_lesson`: two lessons same class. Under input-Vec order: lesson A places into slot 0, lesson B emits violation. Under FFD: lesson A's eligibility = (1 free block: slot 0) × 1 room = 1; lesson B's eligibility = (1 free block: slot 0) × 1 room = 1 (teacher blocked in slot 1 either way). Tiebreak on `LessonId.0`: A's id is `[60; 16]`, B's id is `[61; 16]`; A wins. Same outcome: A places, B emits. Passes unchanged.
- `two_lessons_in_same_class_do_not_double_book_slot`: two lessons, two slots. Both have full eligibility. Tiebreak on id: A first. Passes unchanged.
- `two_rooms_used_in_parallel_for_different_classes_in_same_slot`: two lessons, two classes, two rooms. Both have full eligibility. Tiebreak on id: first lesson first. Passes unchanged.
- `structural_error_returns_err_input`: input validation, FFD never runs. Passes unchanged.

No edit to existing tests. New solver-level test files cover the FFD-specific behaviour.

**Bench (`solver-core/benches/solver_fixtures.rs`):** the existing `solve` call inside `iter_custom` continues to assert zero violations; the workaround removal is the test of FFD's strength. If `mise run bench` hits the panic, FFD did not solve the fixture and the eligibility metric needs revision before the PR ships.

**Backend / frontend / e2e: no changes.** Wire format unchanged; the FastAPI route still calls `solve_json` and persists placements; the Playwright smoke test still asserts on the rendered grid; nothing in those layers exercises lesson ordering directly.

### ADR

`docs/adr/0014-solve-config-and-ffd-ordering.md`:

- Title: `0014: SolveConfig API and FFD ordering`. (Per global rule: colon, no em-dash.)
- Context: PRs 8 and 9 need a configuration carrier and a sane lesson order; this PR introduces both.
- Decision: `SolveConfig { deadline, seed, weights }` plus `ConstraintWeights {}`; both derive `Default`. `solve_with_config` is the new entry point; `solve` becomes a delegate. FFD eligibility = free-teacher-blocks × suitable-rooms; tiebreak `LessonId.0`. FFD is unconditional (no flag).
- Alternatives: keep `solve` input-Vec ordered and add a parallel `solve_with_config` (rejected: two code paths); use v2's `(slots, rooms, teacher_max)` tuple metric (rejected: tertiary key buys nothing without per-class availability data); recompute eligibility per step (MRV, rejected as out-of-scope for FFD; appropriate for PR 9 LAHC).
- Consequences: the bench fixture's scarcity-first workaround retires; the API surface gains forward-compat for PRs 8 and 9; tests asserting on input-Vec ordering would need updates if any existed (none do today).

Index in `docs/adr/README.md` as the next row after the `0013` entry.

### Logging

`solver_io.run_solve` already emits `solver.solve.done` with `placements_total` and `violations_total`. No change in this PR. (The `violations_by_kind: dict[str, int]` follow-up tracked under typed-violations stays as a separate item.)

## Migration and rollout

Forward-only behaviour change at the solver layer; no wire-format change; no schema migration. The feature branch ships behind no flag because:

- The FastAPI route's only behaviour difference is "the same problem may produce a different valid placement". The schedule view shows the result either way; no downstream code branches on which lesson lands in which slot.
- The bench harness asserts zero violations on both fixtures; if the new FFD code regresses a fixture, the bench fails locally before the PR can be opened.
- Staging redeploys on master push (`.github/workflows/deploy-images.yml`); the next deploy after merge serves FFD-ordered placements end-to-end.

There are no external API consumers and no persisted "expected schedule" rows; the only state that survives a deploy is `scheduled_lessons` placements, which `POST /api/classes/{id}/schedule` overwrites per call.

## Risks

- **Test churn.** Existing `solve.rs` unit tests assert specific time-block placements. Each one has been walked through above; FFD ordering is stable for every fixture (single lesson or unique-id tiebreak), so no test edits are required. If a test breaks anyway, the failure points at the eligibility metric being wrong, not at the test being brittle.
- **Bench regression beyond 20%.** The precompute is O(L · (T + R)) and the sort is O(L log L). For zweizuegig (68 lessons, 35 time-blocks, 12 rooms): ~3200 + ~415 ≈ 3600 extra ops, a few microseconds against a 172 µs baseline. Well inside the budget. If the measured delta exceeds 20%, the PR refreshes BASELINE.md and the body explains the unexpected cost.
- **Scarcity-first removal breaks the `zweizuegig` bench.** If FFD's metric is too coarse to find a placement that the manual subject-order achieved, the bench panics on `solution.violations.is_empty()`. Mitigation: the eligibility metric uses both axes (time blocks and rooms); the manual order's signal (specialists first) is an emergent property of low room-eligibility for `Sport` (1 of 12 rooms), `Musik` (1 of 12), `Kunst` (1 of 12). Specialist subjects ship as the lowest-eligibility lessons under FFD, so the order should be at least as strong as the manual one.
- **`#![deny(missing_docs)]` enforcement.** Every new `pub` symbol (`SolveConfig`, `ConstraintWeights`, their fields, `solve_with_config`) carries a `///` doc comment. The structural commit includes the docs in the same edit.
- **Public API forward-compat.** `SolveConfig` and `ConstraintWeights` are non-exhaustive only in spirit, not via `#[non_exhaustive]`. PR 9 adds fields without breaking the public constructor because callers use `SolveConfig::default()`. Document this expectation in the ADR.
- **Unused `_config` parameter.** The leading underscore satisfies clippy's `unused_variables` lint without an `#[allow]`. PR 8 / PR 9 will read the field and the underscore comes off.
- **`pre_solve_violations` ordering.** Today this runs before the placement loop and emits one violation per affected lesson-hour. FFD does not change which lessons are affected, only the order of placements. The integration test `pre_solve_emits_violations_per_hour_for_unqualified_teacher` (in `validate.rs`) keeps passing.
- **Removed `subject_order` workaround surface.** The Python seed `demo_grundschule_zweizuegig.py` does not use the workaround (per-class flow, not global solve), so no Python edit is required. Only the Rust bench fixture changes.
- **`Indexed` `#[cfg_attr(not(test), allow(dead_code))]`.** Once `ordering::ffd_order` calls `idx.teacher_blocked` and `idx.room_suits_subject` from non-test code, the `cfg_attr` becomes unnecessary. The behavioural commit removes it. (Forgetting this lets the allow-attribute outlive its reason; vulture / clippy will not catch it because the methods are still genuinely used.)

## Commit split

Three commits on `feat/ffd-solve-config`:

1. `feat(solver-core): introduce SolveConfig and solve_with_config` (structural, no behaviour change).
   - Adds `pub struct SolveConfig`, `pub struct ConstraintWeights`, `Default` derives, doc comments.
   - Adds `pub fn solve_with_config` whose body is character-identical to the current `solve` body (input-Vec order, no FFD).
   - Reduces `pub fn solve` to one line: `solve_with_config(problem, &SolveConfig::default())`.
   - Updates `lib.rs` re-exports.
   - Tests pass without modification.
2. `feat(solver-core): FFD lesson ordering inside solve_with_config` (behavioural).
   - Adds `solver-core/src/ordering.rs` with `ffd_order` plus inline unit tests.
   - Adds `solver-core/tests/ordering_property.rs` and `solver-core/tests/ffd_solver_outcome.rs`.
   - Modifies `solve_with_config` to iterate `ffd_order(problem, &idx)` instead of `0..problem.lessons.len()`.
   - Removes the scarcity-first `subject_order` and its explanatory block in `solver-core/benches/solver_fixtures.rs`.
   - Removes the matching paragraph in `solver/CLAUDE.md`; replaces with a one-line "FFD is invariant" note.
   - Removes `#[cfg_attr(not(test), allow(dead_code))]` on `impl Indexed` (now used by non-test code).
   - Refreshes `solver/solver-core/benches/BASELINE.md` via `mise run bench:record`.
3. `docs: ADR 0014 SolveConfig API and FFD ordering`.
   - Adds `docs/adr/0014-solve-config-and-ffd-ordering.md`.
   - Indexes it in `docs/adr/README.md`.
   - Updates `docs/superpowers/OPEN_THINGS.md`: marks active-sprint algorithm-phase item 7 as Shipped 2026-04-26 with the PR / commit signature pattern from items 1 to 5; nudges item 9 (LAHC) as the next P0; item 8 (Doppelstunden) stays P2.
   - The auto-memory roadmap entry refresh lives in step 6 of `/autopilot` (claude-md-management revisions), not in this commit.

Subagent dispatch (per `superpowers:subagent-driven-development`): commits 1 to 3 share state across `solver-core` source, bench fixture, CLAUDE.md, and docs; agents run sequentially. Each agent reads the prior commit's diff to anchor on the new module surface. The main session reviews each agent's diff and commits.
