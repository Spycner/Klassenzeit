# Local Search + Soft Constraints — Design Spec

**Date:** 2026-04-04
**Step:** 1c (Solver tier)
**Depends on:** 1b (Domain model + construction heuristic) — completed

## Overview

Add LAHC (Late Acceptance Hill-Climbing) local search to the scheduler with Change and Swap moves, plus 4 soft constraints with incremental scoring. This transforms the solver from "place lessons without conflicts" to "place lessons well" — the core value proposition.

## 1. Soft Constraints

Four soft constraints evaluated incrementally in `IncrementalState`:

| Constraint | Penalty | Logic |
|---|---|---|
| Teacher gaps | -1 per gap period | For each teacher on each day, count gaps between first and last lesson minus actual lessons. Teacher with lessons in periods 1, 3, 5 → 2 gap periods → -2 soft. |
| Subject distribution | -2 per duplicate | For each (class, subject, day) with N lessons, penalize (N-1) * -2. Discourages doubling up the same subject in one day. |
| Preferred slots | -1 per miss | Each teacher has a `preferred_slots` bitvec. Each assigned lesson not in a preferred slot costs -1 soft. |
| Class teacher first period | -1 per day | For each day where a class has a class teacher and the first period of the day (lowest period number) isn't taught by the class teacher, penalize -1 soft. Only applies if the class has any lesson in that period. |

### Incremental Tracking Additions to `IncrementalState`

- `teacher_day_periods: Vec<Vec<SmallVec<[u8; 4]>>>` — `[teacher][day]` → sorted list of periods with lessons (for gap calculation)
- `class_subject_day: Vec<Vec<Vec<u16>>>` — `[class][subject][day]` → count of lessons (for subject distribution)
- `class_day_first_period: Vec<Vec<HashMap<usize, u16>>>` — `[class][day]` → map of teacher_idx → count at the first period of that day (for class teacher first period)

### Soft Constraint Evaluation

`full_evaluate()` in `constraints.rs` is extended with matching soft constraint logic to serve as the correctness oracle for property-based tests.

`evaluate_assign()`, `assign()`, and `unassign()` compute soft deltas incrementally using the counter structures above.

## 2. LAHC Algorithm

Late Acceptance Hill-Climbing with these parameters:

- **List length:** 500
- **Termination:** 60 seconds wall clock OR 30 seconds without improvement, whichever first
- **Acceptance criterion:** Accept move if `new_score >= list[iteration % 500]` (lexicographic comparison via existing `HardSoftScore::Ord`)

### Flow

1. Construction heuristic (existing) → initial solution
2. Initialize LAHC list: all 500 entries = initial score
3. Loop until termination:
   a. Generate random move (Change or Swap, 50/50)
   b. Apply move via `IncrementalState` (unassign + reassign)
   c. If `current_score >= list[iteration % 500]`: accept, update best if improved
   d. Else: undo move (unassign + reassign back)
   e. `list[iteration % 500] = current_score`
4. Restore best solution found
5. Return

### Move Types

| Move | Description | Selection |
|---|---|---|
| Change | Pick a random assigned lesson, unassign it, reassign to a random (timeslot, room) pair | 50% probability |
| Swap | Pick two random assigned lessons, swap their timeslot+room assignments | 50% probability |

**Move filtering:** Skip no-op moves (same timeslot, swapping identical assignments). No hard-constraint pre-filtering — LAHC traverses infeasible space to escape local optima.

**RNG:** `SmallRng` from `rand` crate, seeded from system entropy by default. Accept optional deterministic seed for reproducible tests.

## 3. Data Model Changes

### Public API (`types.rs`)

- Add `class_teacher_id: Option<Uuid>` to `SchoolClass`
- Add `preferred_slots: Vec<TimeSlot>` to `Teacher`

### Internal Planning Model (`planning.rs`)

- Add `preferred_slots: BitVec` to `TeacherFact` (parallel to `available_slots`)
- `ClassFact::class_teacher_idx: Option<usize>` already exists — populate it from `class_teacher_id`

### Mapper (`mapper.rs`)

- Map `Teacher::preferred_slots` → `TeacherFact::preferred_slots` bitvec
- Map `SchoolClass::class_teacher_id` → `ClassFact::class_teacher_idx` via teacher UUID lookup

### Output

- `Score::soft_score` already exists — populate from `HardSoftScore::soft`
- Add `stats: Option<SolveStats>` to `ScheduleOutput`
- No individual soft violation reporting for now

## 4. Module Structure

| File | Changes |
|---|---|
| `constraints.rs` | Extend `IncrementalState` with soft counters. Add soft evaluation to `full_evaluate()`. Update `assign`/`unassign`/`evaluate_assign` with soft deltas. |
| `local_search.rs` (new) | LAHC loop, `ChangeMove`, `SwapMove`, move generation, termination, stats collection. |
| `lib.rs` | Update `solve()` to call `local_search::optimize()` after construction. Wire `SolveStats` into output. |
| `construction.rs` | No changes. |
| `types.rs` | Add `class_teacher_id`, `preferred_slots`, `SolveStats`. |
| `planning.rs` | Add `preferred_slots` to `TeacherFact`. |
| `mapper.rs` | Map new fields. |

## 5. Testing Strategy

### Property-Based Tests

For each soft constraint, verify `IncrementalState::score()` matches `full_evaluate()` after random sequences of assign/unassign/reassign. Extend existing property tests that validate hard constraint scoring.

### Unit Tests Per Constraint

- **Teacher gaps:** Teacher with lessons in periods 1, 3, 5 on Monday → -2 soft. Add lesson in period 2 → -1 soft. Remove period 5 lesson → 0 soft.
- **Subject distribution:** Two math lessons same day for class 1A → -2 soft. Third → -4 soft. Move one to another day → -2 soft.
- **Preferred slots:** Teacher prefers Mon 1-3. Lesson in Mon 1 → 0 soft. Lesson in Mon 4 → -1 soft.
- **Class teacher first period:** Class 1A has class teacher Alice. Monday period 0 taught by Bob → -1 soft. Change to Alice → 0 soft.

### Move Correctness Tests

Apply a Change/Swap move, verify score delta matches full re-evaluation. Undo move, verify score returns to original.

### LAHC Integration Test

Run `solve()` on a small instance (6 classes, 10 teachers, 5 days × 6 periods). Verify:
- Score improves over construction-only baseline
- All lessons remain assigned
- Hard score does not regress (or improves)

## 6. Dependencies

- `rand` crate (with `small_rng` feature) — for `SmallRng`
- `std::time::Instant` — for wall-clock termination
- `criterion` (dev-dependency) — for benchmarks
- `smallvec` — for `teacher_day_periods` tracking

## 7. Profiling

### Solver Statistics

`SolveStats` struct returned in `ScheduleOutput`:

```rust
pub struct SolveStats {
    pub construction_ms: u64,
    pub local_search_ms: u64,
    pub iterations: u64,
    pub iterations_per_sec: f64,
    pub moves_accepted: u64,
    pub moves_rejected: u64,
    pub score_history: Vec<(u64, i64, i64)>,  // (iteration, hard, soft)
    pub best_found_at_iteration: u64,
}
```

`score_history` sampled every ~1000 iterations for plotting score progression. Useful for tuning LAHC parameters in step 1d.

### Criterion Benchmarks

`scheduler/benches/solver_bench.rs`:

- `bench_construct_small` — construction on 6-class instance
- `bench_construct_medium` — construction on 15-class instance
- `bench_evaluate_assign` — single move delta evaluation
- `bench_solve_small` — full solve with fixed seed and 5-second termination

## Non-Goals

- No SolverForge integration — hand-rolled approach is working and lower risk
- No Kempe chain moves — defer to step 1f if Change+Swap plateau
- No Tabu hybridization — defer to step 1d based on tuning results
- No soft constraint UI — defer to step 1e
- No individual soft violation reporting in output — can be added later
