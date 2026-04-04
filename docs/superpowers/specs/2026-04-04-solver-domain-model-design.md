# Solver Domain Model + Construction Heuristic

**Step:** 1b from backlog
**Date:** 2026-04-04
**Depends on:** Scheduler integration (Step 6, PR #25)
**Prepares for:** 1c (local search + soft constraints)

## Goal

Replace the greedy solver with a proper constraint-based architecture: formal domain model, incremental scoring with bitset conflict matrices, and a First Fit Decreasing construction heuristic. The architecture must support adding local search (LAHC) and soft constraints in step 1c without refactoring.

## Decision: Hand-Rolled Solver

The research spike recommended SolverForge (Rust crate, v0.7.1). We're hand-rolling instead for full control and zero dependency risk. The conceptual model is the same — planning entities, planning variables, constraint evaluation, lexicographic scoring — just implemented directly.

Key insights from the research report to carry forward:

- **Incremental scoring matters more than algorithm choice** — orders of magnitude throughput difference
- **Bitset conflict matrices** — `Vec<BitVec>` per teacher/class/room indexed by timeslot for O(n/64) checks
- **Three-component architecture** — MoveSelector, Acceptor, Forager (built in 1c, but domain model supports it now)
- **Property-based testing** — critical for incremental scoring correctness ("rich source of subtle bugs")
- **Full evaluation as oracle** — run full constraint evaluation periodically to validate incremental state

## Domain Model

### Internal Representation

All entities use `usize` indices internally for direct array indexing and bitset operations. UUIDs stay at the public API boundary only.

```rust
/// Planning entity — a lesson to be scheduled.
/// Teacher is fixed by curriculum (not a planning variable).
struct PlanningLesson {
    id: usize,
    subject_idx: usize,
    teacher_idx: usize,
    class_idx: usize,
    timeslot: Option<usize>,  // planning variable
    room: Option<usize>,      // planning variable
}

/// Immutable during solving.
struct ProblemFacts {
    timeslots: Vec<Timeslot>,
    rooms: Vec<RoomFact>,
    teachers: Vec<TeacherFact>,
    classes: Vec<ClassFact>,
    subjects: Vec<SubjectFact>,
}

struct Timeslot { day: u8, period: u8 }
struct RoomFact { capacity: Option<u32>, suitable_subjects: BitVec }
struct TeacherFact { max_hours: u32, available_slots: BitVec, qualified_subjects: BitVec }
struct ClassFact { student_count: Option<u32>, class_teacher_idx: Option<usize> }
struct SubjectFact { needs_special_room: bool }
```

### Public API (Unchanged)

The existing `ScheduleInput` / `ScheduleOutput` types in `types.rs` remain the public interface. A mapper module converts between public types and internal planning types.

```rust
pub fn solve(input: ScheduleInput) -> ScheduleOutput
```

## Score

```rust
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct HardSoftScore {
    hard: i64,  // ≤ 0, target = 0
    soft: i64,  // ≤ 0, target = 0 (unused in 1b, prepared for 1c)
}
```

Lexicographic comparison: hard takes absolute priority. `(0, -999)` beats `(-1, 0)`.

## Constraints (8 Hard)

All constraints penalize -1 per violation (except over-capacity which penalizes per excess unit).

| # | Constraint | Penalty | Trigger |
|---|-----------|---------|---------|
| 1 | Teacher conflict | -1 per conflicting pair | Two lessons: same teacher, same timeslot |
| 2 | Class conflict | -1 per conflicting pair | Two lessons: same class, same timeslot |
| 3 | Room conflict | -1 per conflicting pair | Two lessons: same room, same timeslot (skip unassigned rooms) |
| 4 | Teacher availability | -1 per lesson | Lesson assigned to timeslot where teacher is blocked |
| 5 | Teacher over-capacity | -1 per excess hour | Teacher's assigned lesson count exceeds max_hours |
| 6 | Teacher qualification | -1 per lesson | Teacher not qualified for lesson's subject |
| 7 | Room suitability | -1 per lesson | Room not suitable for lesson's subject |
| 8 | Room capacity | -1 per lesson | Room capacity < class student_count |

**Static vs dynamic constraints:**
- Constraints 1-5 change on any timeslot reassignment
- Constraints 3, 7, 8 change on room reassignment
- Constraint 6 is fully static (teacher-subject pairing is fixed by curriculum) — evaluate once during construction, never changes during search

## Incremental Scoring

### State

```rust
struct IncrementalState {
    // Conflict matrices — bit set means "occupied"
    teacher_at_slot: Vec<BitVec>,   // [teacher_idx][timeslot_idx]
    class_at_slot: Vec<BitVec>,     // [class_idx][timeslot_idx]
    room_at_slot: Vec<BitVec>,      // [room_idx][timeslot_idx]

    // Counters
    teacher_hours: Vec<u32>,        // [teacher_idx] → assigned lesson count

    // Current score
    score: HardSoftScore,
}
```

### Move Evaluation

For a **Change move** (reassign one lesson's timeslot and/or room):

1. **Undo old assignment**: clear bits in conflict matrices, decrement teacher_hours, calculate violations being removed
2. **Apply new assignment**: set bits, increment teacher_hours, calculate new violations
3. **Delta** = new_violations - removed_violations → update score

Conflict detection example for teacher at a timeslot:
- Check `teacher_at_slot[teacher_idx][new_timeslot_idx]` — if already set, it's a conflict
- This is O(1) per check

### Validation

After every N moves (configurable, default: 1000), run full constraint evaluation from scratch and assert it matches the incremental score. This catches delta bugs during development and testing. Can be disabled in release builds.

## Construction Heuristic

**Algorithm: First Fit Decreasing**

1. **Sort lessons** by constraint tightness (most constrained first):
   - Primary: number of eligible timeslots (teacher availability intersected with total slots)
   - Secondary: number of eligible rooms (rooms suitable for subject)
   - Tertiary: if teacher has fewer remaining hours vs. lessons to place

2. **For each lesson**, iterate candidate (timeslot, room) pairs:
   - Timeslots ordered by (day, period)
   - Rooms ordered by best fit (smallest suitable room first)
   - Pick the first assignment that adds 0 new hard violations
   - If no zero-violation assignment exists, pick the assignment with the best (least negative) delta score (greedy best-effort)

3. **Update incremental state** after each placement

4. **Lessons not needing a special room**: room variable is `None` (no room assignment needed)

This replaces the current greedy solver. Key improvement: formal constraint evaluation instead of ad-hoc if-checks, and proportional penalty scoring that distinguishes between 1 violation and 50.

## Module Structure

```
scheduler/src/
├── lib.rs              # pub fn solve() — public API, unchanged signature
├── types.rs            # ScheduleInput/Output — existing public types
├── planning.rs         # PlanningLesson, ProblemFacts, HardSoftScore
├── constraints.rs      # full_evaluate() + IncrementalState
├── construction.rs     # First Fit Decreasing
└── mapper.rs           # ScheduleInput ↔ planning model conversion

scheduler/tests/
├── basic.rs            # existing tests (ported)
├── constraints.rs      # unit test per constraint
└── construction.rs     # solvable/unsolvable instance tests
```

## Dependencies

```toml
[dependencies]
uuid = { version = "1", features = ["v4"] }
bitvec = "1"

[dev-dependencies]
proptest = "1"
```

Only `bitvec` added as a production dependency. `proptest` for property-based testing of incremental scoring correctness.

## Testing Strategy

### Unit Tests — One Per Constraint

For each of the 8 constraints, create a minimal instance that triggers exactly that violation and verify the score. Example: teacher conflict test creates two lessons with the same teacher and same timeslot, expects `hard: -1`.

### Incremental Scoring Correctness

Property-based test using `proptest`:
1. Create a random valid problem instance
2. Run construction heuristic
3. Make N random Change moves
4. After each move: assert `incremental_state.score == full_evaluate(lessons, facts)`

This is the most critical test — the research report flags incremental scoring as "a rich source of subtle bugs."

### Construction Heuristic

- **Solvable instance**: 3 classes, 5 teachers, 5 rooms, 25 timeslots → expect 0 hard violations
- **Tight instance**: barely enough resources → expect 0 hard violations but only one valid arrangement
- **Unsolvable instance**: more lessons than timeslots for a class → expect violations, verify they're reported correctly

### Regression

Port all 9 existing `tests/basic.rs` test cases. Same behavior expected — the construction heuristic should handle everything the greedy solver did.

## What This Does NOT Include (Deferred to 1c)

- Local search (LAHC algorithm)
- Soft constraints (teacher gaps, subject distribution, preferred slots, class teacher first period)
- Swap moves, Kempe chains
- Termination criteria (time-based)
- Async/background solving

The architecture explicitly supports all of these — `IncrementalState` tracks everything needed for move evaluation, and `HardSoftScore` has the soft field ready.

## Migration Path

The `solve()` function signature doesn't change. The backend doesn't need any modifications. Existing integration tests and frontend continue to work. The only visible difference: better placement quality (formal constraint evaluation vs. ad-hoc checks) and structured violation reporting with scores.
