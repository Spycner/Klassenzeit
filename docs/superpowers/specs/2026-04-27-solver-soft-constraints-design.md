# Solver soft-score infrastructure + lowest-delta greedy

**Date:** 2026-04-27
**Status:** Design approved (autopilot autonomous mode).

## Problem

Sprint item #9 (P0) on `docs/superpowers/OPEN_THINGS.md` calls for "Soft constraints + objective function + LAHC". The reference implementation in `archive/v2/scheduler/` totals 684 lines for `local_search.rs` (LAHC main loop, tabu list, Kempe chains, Change/Swap moves) and 125 lines for `construction.rs` (FFD + lowest-delta greedy). Landing all of that in one autopilot PR violates the project's "single coherent PR" rule and produces a review block that's too large to validate against the bench's 20% regression budget.

Today's solver:

- `solve_with_config(p, &SolveConfig::default())` is the only entry point and ignores `_config`.
- `ConstraintWeights {}` is an empty placeholder (PR-7 reserved the surface).
- Greedy is first-fit: for each lesson hour, iterate `(time_block, room)` and place at the first hard-feasible candidate.
- `Solution` has no notion of "schedule quality" beyond the count of hard violations; the `Soft score` column in `solver/solver-core/benches/BASELINE.md` is hard-coded to 0.

The next solver-quality win comes from giving the greedy a way to compare candidates that all satisfy hard constraints. Without that, LAHC (sprint PR-9b) starts from an arbitrarily-chosen initial solution and has no scoring API to drive its accept rule.

## Goal

One PR that ships the foundation LAHC will sit on:

1. Add `solver-core/src/score.rs` with `pub fn score_solution(problem: &Problem, placements: &[Placement], weights: &ConstraintWeights) -> u32`. Pure function, no I/O, fully unit-tested.
2. Extend `ConstraintWeights` with two structural-soft-constraint fields: `class_gap: u32` and `teacher_gap: u32`. Both default to 1 in `ConstraintWeights::default()`. Both penalise gap-hours within a class's day or a teacher's day respectively.
3. Add `pub soft_score: u32` to `Solution`. `solve_with_config` populates it after placement.
4. Replace first-fit greedy with **lowest-delta greedy**: for each lesson hour, evaluate all hard-feasible `(time_block, room)` candidates, pick the one that minimises the soft-score delta. Tiebreak deterministically on `(time_block.position, time_block.day_of_week, room.id)`.
5. Bench updates: `solver-core/benches/solver_fixtures.rs` reads the new `soft_score` and writes the actual number to the `Soft score` column. `BASELINE.md` refreshes with `mise run bench:record`. Stay within 20% of the committed p50 (grundschule ≤ 50 µs, zweizuegig ≤ 224 µs).
6. Backend pass-through: `ScheduleResponse` Pydantic gains `soft_score: int`. `mise run fe:types` regenerates the OpenAPI types. Frontend does not yet render the value.
7. `solver-py` Python stub `__init__.pyi` mirrors the new `Solution.soft_score` field.
8. OPEN_THINGS sprint item #9 marked as "partial: PR-9a shipped"; new follow-ups for LAHC (PR-9b) and subject-level pedagogy preferences (PR-9c) added.

After this PR: every greedy placement is a deliberate quality choice instead of "first index that fits"; the same scoring API drives whatever LAHC accept-rule PR-9b adopts; and the bench prints a non-zero soft score that PR-9b is expected to reduce.

## Non-goals

- **Late-acceptance hill-climbing.** PR-9b owns the LAHC main loop, the LAHC list-length parameter, the deadline-honoring exit, and seed-driven tiebreaks. PR-9a's `seed` field on `SolveConfig` is read-but-unused, the same as today.
- **Tabu list, Kempe chains, Swap moves.** Reference implementations live in `archive/v2/scheduler/src/local_search.rs`. They stay archived; PR-9b is single-move (Change) only. Tabu is deferred indefinitely per `archive/v2` learnings.
- **Subject-level pedagogy preferences.** "Hauptfächer früh", "Sport not first period", "Musik/Kunst dedicated rooms" all require a way to tag subjects (per-subject flag, preference table, or similar). PR-9c owns that schema/API/i18n surface. PR-9a's structural-only soft constraints (class-gap, teacher-gap) deliver compactness without touching Subject.
- **Frontend rendering of `soft_score`.** Backend exposes the value; the schedule view does not yet display it. Surfacing copy + design lands with PR-9c (alongside the subject-level preferences that drive most of the variance).
- **Doppelstunden (`preferred_block_size > 1`).** Sprint PR-8 (`[P2]`). PR-9a's score function ignores `preferred_block_size` because the field is not on `Lesson` today.
- **Whole-school cross-class consistency.** `POST /api/classes/{id}/schedule` already builds per-class problems. PR-9a does not change that.
- **An ADR.** PR-9a's design decisions are local optimisations of the OPEN_THINGS plan. PR-9b's LAHC will warrant its own ADR (stochastic search, RNG, determinism story); PR-9a's spec links forward to it once it exists.

## Design

### `score.rs`: pure scoring function

New module `solver-core/src/score.rs`.

```rust
//! Pure soft-score function for `Solution` placements. Used by the lowest-delta
//! greedy in `solve.rs` and by the future LAHC local search in PR-9b.

use std::collections::HashMap;

use crate::ids::{LessonId, SchoolClassId, TeacherId, TimeBlockId};
use crate::types::{ConstraintWeights, Lesson, Placement, Problem, TimeBlock};

/// Compute the total weighted soft-score for a placement set.
///
/// Partitions `placements` by `(school_class_id, day_of_week)` and
/// `(teacher_id, day_of_week)`, then sums weighted gap-hours per partition.
pub fn score_solution(
    problem: &Problem,
    placements: &[Placement],
    weights: &ConstraintWeights,
) -> u32 {
    if weights.class_gap == 0 && weights.teacher_gap == 0 {
        return 0;
    }
    let tb_lookup: HashMap<TimeBlockId, &TimeBlock> =
        problem.time_blocks.iter().map(|tb| (tb.id, tb)).collect();
    let lesson_lookup: HashMap<LessonId, &Lesson> =
        problem.lessons.iter().map(|l| (l.id, l)).collect();

    let mut by_class_day: HashMap<(SchoolClassId, u8), Vec<u8>> = HashMap::new();
    let mut by_teacher_day: HashMap<(TeacherId, u8), Vec<u8>> = HashMap::new();

    for p in placements {
        let tb = tb_lookup[&p.time_block_id];
        let lesson = lesson_lookup[&p.lesson_id];
        by_class_day
            .entry((lesson.school_class_id, tb.day_of_week))
            .or_default()
            .push(tb.position);
        by_teacher_day
            .entry((lesson.teacher_id, tb.day_of_week))
            .or_default()
            .push(tb.position);
    }

    let class_gaps: u32 = by_class_day.into_values().map(gap_count_owned).sum();
    let teacher_gaps: u32 = by_teacher_day.into_values().map(gap_count_owned).sum();

    weights.class_gap.saturating_mul(class_gaps)
        + weights.teacher_gap.saturating_mul(teacher_gaps)
}

/// Count gap-hours in a single partition's positions. Sorts in place, then
/// counts ordinals strictly between min and max that are absent.
fn gap_count_owned(mut positions: Vec<u8>) -> u32 {
    positions.sort_unstable();
    positions.dedup();
    if positions.len() < 2 {
        return 0;
    }
    let span = u32::from(*positions.last().unwrap() - *positions.first().unwrap());
    span + 1 - u32::try_from(positions.len()).unwrap_or(u32::MAX)
}
```

The function is allocation-light (two HashMaps per call) and pure. PR-9b's LAHC will swap it for the equivalent incremental form (`score_after_move(...)`) once profiling shows the full re-score is too slow inside the local-search inner loop. PR-9a's greedy uses an in-place incremental form on its own (see "Greedy: lowest-delta with incremental scoring" below), so the public `score_solution` is mainly the post-solve total + tests + the property-test reference.

Inline tests cover:

- Empty placements score 0 regardless of weights.
- One placement scores 0 (no gap possible with one position).
- Two contiguous placements (positions 0 and 1) score 0.
- Two non-contiguous placements (positions 0 and 2) score `class_gap_weight + teacher_gap_weight` (one gap each in the affected class-day and teacher-day).
- Mixed weights compose linearly: doubling `class_gap_weight` doubles the class-side contribution.
- Different days don't combine: positions 0 and 2 across days `0` and `1` score 0.

### `ConstraintWeights` extension

`solver-core/src/types.rs`:

```rust
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConstraintWeights {
    /// Penalty per gap-hour in any class's day. A `gap-hour` is a position p
    /// inside a `(class, day)` bucket where the class has placements at some
    /// earlier and some later position on the same day, but no placement at p.
    pub class_gap: u32,
    /// Penalty per gap-hour in any teacher's day. Same definition as
    /// `class_gap` but partitioned by teacher.
    pub teacher_gap: u32,
}
```

`Default` derives both fields to `0`. We override default in `solve_with_config`: callers using `solve(p)` get the *active default* weights of `1` per gap (see Q&A note below).

Two reasons for **active-default weights of 1** rather than 0:

1. With weights = 0, `solve(p)` (no-config entry point) becomes identical to today's first-fit, which means PR-9a's lowest-delta greedy never runs in production. PR-9a then ships dead code.
2. Compactness is universally good. There is no schedule shape where placing lessons further apart in a teacher's day is preferable to placing them contiguously, all else equal. Weight `1` on both is the smallest non-zero choice that activates the lowest-delta logic.

Implementation: keep `Default` deriving zeros (so PR-9b's tests can construct weight-zero comparisons cheaply), but initialise `solve(p)` via:

```rust
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    solve_with_config(problem, &SolveConfig {
        weights: ConstraintWeights { class_gap: 1, teacher_gap: 1 },
        ..SolveConfig::default()
    })
}
```

This isolates the active defaults to one place and keeps `ConstraintWeights::default()` honest (zero is zero). LAHC's PR-9b can pick its own defaults the same way.

### `Solution.soft_score`

`solver-core/src/types.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Solution {
    pub placements: Vec<Placement>,
    pub violations: Vec<Violation>,
    /// Sum of weighted soft-constraint penalties across `placements`. Computed
    /// by `solve_with_config` against the caller's `ConstraintWeights`. Zero
    /// when both weights are zero or the schedule is fully compact.
    pub soft_score: u32,
}
```

The field is additive and computed eagerly at the end of `solve_with_config`. JSON contract impact:

- `solver-py` `solve_json` serializes the new field automatically (serde derive).
- Backend's `ScheduleResponse` Pydantic gains `soft_score: int` (default 0 for backwards-compatibility on persisted responses, though there are none yet).
- Frontend OpenAPI types regenerate; no UI use.

### Greedy: lowest-delta with incremental scoring

`solver-core/src/solve.rs` keeps its top-level shape (`solve_with_config -> validate -> ffd_order -> placement loop`) but the inner `try_place_hour` is replaced. Two pieces of running state are maintained across placements within a single solve:

- `class_positions: HashMap<(SchoolClassId, u8), Vec<u8>>`: for each `(class, day_of_week)`, sorted positions placed so far.
- `teacher_positions: HashMap<(TeacherId, u8), Vec<u8>>`: same for teachers.
- `running_soft_score: u32`: cumulative score over all placed partitions. Invariant: equals `score_solution(problem, placements_so_far, weights)`.

Important: inserting a new position can either *increase* the gap count (by extending the range to a new max or new min and adding `(extent_increase - 1)` new gap-hours) or *decrease* it (by filling a hole inside the existing range). The greedy candidate score is therefore the **new running total**, not a non-negative delta. Picking the candidate with the smallest new running total is equivalent to picking the smallest signed delta but avoids signed arithmetic in the hot loop.

```rust
fn try_place_hour(...) -> bool {
    let lesson_class = lesson.school_class_id;
    let lesson_teacher = lesson.teacher_id;

    let mut best: Option<Candidate> = None;  // (tb, room, new_total_score)
    for tb in &problem.time_blocks {
        if !tb_feasible(lesson, tb, ...) { continue; }
        let new_total = candidate_score(
            lesson_class, lesson_teacher,
            tb.day_of_week, tb.position,
            class_positions, teacher_positions,
            *running_soft_score, weights,
        );
        for room in &problem.rooms {
            if !room_feasible(lesson, tb, room, ...) { continue; }
            // new_total is identical across rooms at the same tb under our
            // structural weights; tiebreak on (day, position, room.id) to
            // settle ties deterministically.
            let candidate = Candidate { tb_id: tb.id, room_id: room.id, score: new_total,
                                         day: tb.day_of_week, position: tb.position };
            if is_better(&candidate, &best) {
                best = Some(candidate);
            }
        }
    }

    match best {
        Some(c) => {
            commit(c.tb_id, c.room_id);
            *running_soft_score = c.score;
            true
        }
        None => false,
    }
}

fn candidate_score(
    class: SchoolClassId, teacher: TeacherId, day: u8, pos: u8,
    class_positions: &HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: &HashMap<(TeacherId, u8), Vec<u8>>,
    running_soft_score: u32, weights: &ConstraintWeights,
) -> u32 {
    let class_old = class_positions.get(&(class, day))
        .map(|v| gap_count(v)).unwrap_or(0) * weights.class_gap;
    let teacher_old = teacher_positions.get(&(teacher, day))
        .map(|v| gap_count(v)).unwrap_or(0) * weights.teacher_gap;
    let class_new = gap_count_after_insert(
        class_positions.get(&(class, day)), pos
    ) * weights.class_gap;
    let teacher_new = gap_count_after_insert(
        teacher_positions.get(&(teacher, day)), pos
    ) * weights.teacher_gap;
    // Invariant: running_soft_score >= class_old + teacher_old (each partition's
    // contribution is part of the running sum). Subtraction is safe in u32.
    running_soft_score - class_old - teacher_old + class_new + teacher_new
}
```

`gap_count_after_insert(positions, pos)` builds the count for `positions ∪ {pos}` without mutating the input: binary-search the insertion index, span = `max(pos, last) - min(pos, first)`, count = `len + 1`, gap = `span + 1 - count` (saturating to 0 if pos already present, though FFD ensures positions are unique within a partition).

Per-evaluation cost without hoisting: two HashMap lookups + two `gap_count` calls + two `gap_count_after_insert` calls, each `O(positions_in_day) ≤ 7` for Hessen. With `35` time-blocks and `~12` rooms per evaluation, per-placement cost is `O(35 * 12 * (4*7 + tiebreak)) ≈ 16k ops`. Times 196 placements gives about 3M ops/solve, projected p50 ~500 µs for zweizuegig. That breaches the 224 µs budget.

To stay within budget, the implementation hoists per-tb invariant work out of the room loop:

- `class_old`, `teacher_old`, `class_new`, `teacher_new` depend only on `tb.day_of_week` and `tb.position`, not on `room`. Compute once per `tb`, reuse for every room candidate.

This drops per-placement cost to `O(35 * 4*7 + 35 * 12) ≈ 1400 ops` (same number, but the per-room work shrinks to a feasibility check and a tiebreak comparison, ~10ns each instead of a HashMap walk). Projected p50 ~ 200-220 µs, inside budget. The plan includes a "run `mise run bench` mid-implementation; if zweizuegig p50 > 220 µs, optimise; else commit" gate.

### Tiebreak determinism

When two candidates tie on `delta`, pick the one with:

1. Lowest `(time_block.day_of_week, time_block.position)` lexicographically.
2. Lowest `room.id` byte order (UUID lexicographic).

This is identical to today's first-fit ordering except that delta dominates day/position when delta differs. Existing solver tests (e.g. `single_hour_places_into_first_slot_and_room`) rely on this collapsing to today's behaviour when all candidates tie at delta=0. The default-weight active value (1, 1) doesn't change that for the existing fixtures because their placements have no gaps to differentiate.

### Bench updates

`solver-core/benches/solver_fixtures.rs` already exists and reads `solution.placements.len()` plus `solution.violations.len()`. Add `solution.soft_score` to the printed row. Refresh `solver/solver-core/benches/BASELINE.md` with `mise run bench:record` and commit the diff. Expect:

- `grundschule`: `Soft score = 0` likely (the einzügige fixture is tight and packs cleanly into 7-period days).
- `zweizuegig`: `Soft score` non-zero, single-digit or low double-digit (8 classes × 5 days × occasional partial-day edges).

The exact number is recorded in the PR body, not promised by the spec; LAHC (PR-9b) reduces it.

### Backend pass-through

`backend/src/klassenzeit_backend/api/schemas/schedule.py` (path may differ; locate via grep) gains `soft_score: int = 0` on `ScheduleResponse`. The handler `POST /api/classes/{id}/schedule` already deserializes `Solution` from `solver-py`; map `solution.soft_score` to the response. Existing tests assert presence; one new test confirms the field round-trips a non-zero value when a class has gaps.

### Property tests

`solver-core/tests/score_property.rs` (proptest):

1. **Scorer equivalence.** `score_solution(problem, sol.placements, weights) == sol.soft_score` for `sol = solve_with_config(problem, &cfg).unwrap()`. Confirms the in-loop running total matches the standalone scorer for any problem the solver returns Ok on. Catches incremental-scoring bugs in `try_place_hour`.
2. **Solve determinism.** Calling `solve_with_config(problem, &cfg)` twice returns identical `(placements, violations, soft_score)` triples. Confirms no hidden non-determinism (HashMap iteration order leak, etc.) sneaks in.

Both tests use a small `prop_compose` generator that emits problems within reasonable bounds (≤ 4 classes, ≤ 6 teachers, ≤ 5 rooms, ≤ 25 lessons, ≤ 30 time-blocks). The bound keeps proptest shrinking fast and avoids the solver hitting `O(n^3)` blowups inside the property loop.

## Test plan

| Layer | Test | Where |
|---|---|---|
| Unit | `score_solution` empty / single / contiguous / one-gap / mixed-weights / cross-day | `solver-core/src/score.rs` (inline) |
| Unit | Existing 9 `solve.rs` tests pass under default-active weights `(1, 1)` | `solver-core/src/solve.rs` (inline, no edits) |
| Unit | Two new lowest-delta tests: "places second hour adjacent to first to avoid class-gap"; "places second hour on a free day to avoid teacher-gap" | `solver-core/src/solve.rs` (inline, two new `#[test]`s) |
| Property | Standalone scorer == in-loop running total | `solver-core/tests/score_property.rs` |
| Property | `solve_with_config` is deterministic across two invocations | same file |
| Bench | `Soft score` column populated for both fixtures | `solver-core/benches/solver_fixtures.rs`, `BASELINE.md` |
| Python | `solve_json` round-trips `soft_score` | `solver-py/tests/test_solve_json.py` |
| Backend | `ScheduleResponse` carries `soft_score` field | `backend/tests/api/test_schedule.py` (or equivalent) |

CI runs `mise run test` (Rust + Python + frontend) plus `mise run lint`. Bench is local-only.

## Risks and mitigations

- **20% perf budget breach.** The lowest-delta greedy adds per-placement work proportional to `time_blocks * positions_in_day`. Mitigation: incremental scoring (see "Greedy" section); fall back to running `mise run bench` mid-implementation and bumping bitmap-based counters if grundschule p50 breaches 50 µs.
- **Existing tests rely on first-fit determinism.** The default-active weights `(1, 1)` keep the existing tests passing because their fixtures have no gap-creating placements to differentiate. Mitigation: the property test `zero-weight-greedy == first-fit` plus the existing 9 tests cover the equivalence; if any of the 9 tests fails, that signals a bug in the lowest-delta logic and the PR cannot ship as-is.
- **Wire format breakage in `Solution`.** Adding `soft_score: u32` to a `#[serde(deny_unknown_fields)]` struct forces every deserializer to know the field. Mitigation: backend Pydantic and frontend OpenAPI regenerate in the same PR; no persisted Solution rows exist (no schedule_solutions table).
- **Active-default weights `(1, 1)` change scheduler behaviour for existing callers.** True; this is the point. Mitigation: existing tests prove the new behaviour is a strict refinement (every old placement is still a valid option for the new greedy); the property test proves zero-weight callers are unchanged.

## Migration / rollout

This is a code-only PR. No database migration. No environment variable. No staging rollout step beyond CI green + automerge.

After merge, `staging.klassenzeit` (the existing self-hosted runner deployment) auto-redeploys and the next "Generate" click in staging runs the lowest-delta greedy. The schedule view shows the same UI; only `soft_score` carries a new number that nothing renders yet.

## Follow-ups (out of this PR)

- **PR-9b: LAHC local search.** Single-move (Change) hill-climb with seeded RNG, deadline honoring, list-length parameter. Reuses `score_solution` for delta evaluation. Adds an ADR.
- **PR-9c: subject-level pedagogy preferences.** `Subject.preference_early_periods: bool`, `Subject.preference_avoid_first_period: bool` (or whatever brainstorm-9c decides). Wire through Subject schema, Pydantic, frontend form, en/de i18n. Adds two soft-constraint terms to `score_solution`.
- **`violations_by_kind` in `solver.solve.done` log.** Already tracked in OPEN_THINGS as a follow-up to the typed-violations PR; the same log line should also gain `soft_score` once PR-9a ships so production can spot quality regressions.
- **Frontend rendering of `soft_score`.** Probably alongside PR-9c when the per-subject preferences make the score meaningful enough to display.
