# Solver Validation + Benchmarking — Design Spec

## Goal

Build realistic test instances modeled on Hessen Grundschule structure, benchmark the LAHC solver for feasibility/quality/performance, and produce diagnostic data to inform future tuning decisions (Tabu, ruin-and-recreate). This step does not implement algorithm changes — it produces evidence.

## Solver Model Extensions

### 1. Class Timeslot Availability

Add `available_slots: Vec<TimeSlot>` to `SchoolClass` in `types.rs`.

New hard constraint (#9): a lesson assigned to a timeslot where its class is unavailable incurs -1 hard penalty. Incremental tracking via `class_available[class]` BitVec, same pattern as teacher availability.

Empty `available_slots` means all slots available (same convention as teacher `preferred_slots`).

### 2. Grade Field on SchoolClass

Add `grade: Option<u8>` to `SchoolClass`. Classes without a grade ignore Stundentafeln.

### 3. Stundentafel (Grade Curriculum Table)

New types in `types.rs`:

```rust
pub struct Stundentafel {
    pub grade: u8,
    pub entries: Vec<StundentafelEntry>,
}

pub struct StundentafelEntry {
    pub subject_id: Uuid,
    pub hours_per_week: u8,
    pub teacher_id: Option<Uuid>,
}
```

Add `stundentafeln: Vec<Stundentafel>` to `ScheduleInput`.

### 4. Stundentafel Expansion

The mapper expands Stundentafeln before solving. For each class with a `grade` that matches a Stundentafel, each entry generates a `LessonRequirement`:

- `subject_id` from the entry
- `class_id` from the class
- `teacher_id` from the entry (or `None` for auto-assign)
- `hours_per_week` from the entry

Both `stundentafeln` and explicit `requirements` can coexist. If a class has an explicit requirement for the same subject that a Stundentafel would generate, the explicit requirement wins (Stundentafel entry skipped for that subject/class combo). This prevents double-counting.

## Test Instances

Three instances modeled on Hessen Grundschule (Verordnung über die Stundentafeln). All use 5 days × 6 periods = 30 timeslots.

### Stundentafel (shared across all instances)

| Subject        | Kl.1 | Kl.2 | Kl.3 | Kl.4 |
|----------------|------|------|------|------|
| Deutsch        | 6    | 7    | 6    | 6    |
| Mathematik     | 5    | 5    | 5    | 5    |
| Sachunterricht | 2    | 2    | 4    | 4    |
| Religion       | 2    | 2    | 2    | 2    |
| Kunst          | 2    | 2    | 2    | 2    |
| Musik          | 1    | 1    | 2    | 2    |
| Sport          | 3    | 3    | 3    | 3    |
| Englisch       | —    | —    | 2    | 2    |
| **Total**      | **21** | **22** | **26** | **26** |

Class availability by grade:
- Kl.1-2: periods 1-4 only (20 slots/week)
- Kl.3-4: periods 1-5 (25 slots/week), period 6 available but not preferred

### Small (1-Züge, 4 classes)

- 4 classes: 1a, 2a, 3a, 4a
- ~95 lessons/week
- 4 Klassenlehrer (one per class, ~24h each, qualified for Deutsch, Mathe, Sachunterricht, Kunst)
- 2 Fachlehrer: 1 Sport/Musik teacher (~20h), 1 Religion/Englisch teacher (~14h part-time)
- 6 teachers total
- Rooms: 4 Klassenräume, 1 Sporthalle (capacity 1)
- Purpose: fast iteration, must always be feasible

### Realistic (2-Züge, 8 classes)

- 8 classes: 1a-1b, 2a-2b, 3a-3b, 4a-4b
- ~190 lessons/week
- 8 Klassenlehrer (one per class, ~24-28h, qualified for Deutsch, Mathe, Sachunterricht, Kunst)
- 3 Fachlehrer:
  - Sport teacher (~22h, qualified for Sport only)
  - Musik teacher (~14h part-time, qualified for Musik)
  - Religion/Englisch teacher (~18h, qualified for Religion + Englisch)
- 11 teachers total
- Rooms: 8 Klassenräume, 1 Sporthalle (capacity 1)
- Teacher availability: ~85% of slots (part-timers blocked on 1-2 full days, some teachers blocked period 1 on certain days)
- Preferred slots: Klassenlehrer prefer periods 1-4 with their class
- Class teachers assigned (for class-teacher-first-period soft constraint)
- Purpose: validate correctness on realistic data

### Stress (4-Züge, 16 classes)

- 16 classes: 1a-1d, 2a-2d, 3a-3d, 4a-4d
- ~380 lessons/week
- 16 Klassenlehrer + 4-5 Fachlehrer = ~20 teachers
- Rooms: 16 Klassenräume, 1 Sporthalle
- Sporthalle is over-subscribed: 48 Sport lessons, 30 slots — infeasibility expected with single gym
- Purpose: find performance limits, test behavior under infeasibility

## Benchmark Infrastructure

### Instance Builders (`scheduler/src/instances.rs`)

Public module with deterministic builder functions:

```rust
pub fn small_4_classes() -> ScheduleInput { ... }
pub fn realistic_8_classes() -> ScheduleInput { ... }
pub fn stress_16_classes() -> ScheduleInput { ... }
```

No randomness in instance construction. Instances use Stundentafel for curriculum definition.

### Criterion Benchmarks (extend `benches/solver_bench.rs`)

- `construct_{small,realistic,stress}` — construction phase only
- `solve_{small,realistic,stress}_10s` — full solve with 10s timeout, fixed seed

Purpose: regression tracking, iterations/sec measurement.

### Diagnostic Benchmark Binary (`scheduler/src/bin/benchmark.rs`)

CLI tool that runs each instance with multiple seeds and outputs a summary.

Usage: `cargo run --bin benchmark -- --seeds 10 --max-seconds 30`

Output (table to stderr):

```
Instance         Seeds  Feasible  Hard(avg)  Soft(avg)  Soft(best)  Soft(worst)  Time-to-best(avg)
small-4cls       10     10/10     0.0        -8.3       -5          -12          0.4s
realistic-8cls   10     10/10     0.0        -31.2      -24         -41          3.1s
stress-16cls     10     7/10      -1.2       -82.5      -61         -108         8.7s
```

With `--json` flag: structured JSON to stdout with per-seed detail and convergence data (score at iteration milestones from `score_history`).

No file I/O — pipe to file if needed.

### Integration Tests (`scheduler/tests/instances.rs`)

One test per instance with a fixed seed:
- Small: assert feasible (hard = 0)
- Realistic: assert feasible (hard = 0)
- Stress: no feasibility assertion (expected to struggle with 1 gym)

## Files Changed

**New files:**
- `scheduler/src/instances.rs` — test instance builders
- `scheduler/src/bin/benchmark.rs` — diagnostic CLI
- `scheduler/tests/instances.rs` — feasibility integration tests

**Modified files:**
- `scheduler/src/types.rs` — `SchoolClass.available_slots`, `SchoolClass.grade`, `Stundentafel`, `StundentafelEntry`, `ScheduleInput.stundentafeln`
- `scheduler/src/planning.rs` — `ClassFact.available_slots` BitVec
- `scheduler/src/constraints.rs` — hard constraint #9 (class availability) in both `full_evaluate` and incremental
- `scheduler/src/mapper.rs` — Stundentafel expansion, class availability mapping
- `scheduler/src/construction.rs` — class availability in candidate filtering
- `scheduler/tests/constraints.rs` — tests for class availability constraint
- `scheduler/tests/incremental.rs` — incremental tracking tests for class availability
- `scheduler/tests/proptest_scoring.rs` — include class availability in random problem generation
- `benches/solver_bench.rs` — criterion benchmarks for all three instances

## Not In Scope

- Tabu search, ruin-and-recreate, parameter sweeps — follow-up based on benchmark findings
- Backend API changes for Stundentafel — the types are in the scheduler crate, backend integration is a separate step
- Frontend UI for Stundentafel configuration
