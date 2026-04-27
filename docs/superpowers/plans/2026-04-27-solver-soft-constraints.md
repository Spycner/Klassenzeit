# Solver soft-score infrastructure + lowest-delta greedy: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation LAHC will sit on: a soft-score function, two structural soft-constraint weights (class-gap, teacher-gap), `Solution.soft_score`, and a lowest-delta greedy that uses it.

**Architecture:** Pure scoring lives in a new `solver-core/src/score.rs` module. Greedy in `solve.rs` keeps FFD ordering and per-tb hard checks but replaces first-fit room/slot pick with a lowest-new-total-score pick (incremental scoring via per-(class, day) and per-(teacher, day) sorted-position HashMaps). Backend `ScheduleResponse` gains `soft_score: int`. Bench `solver_fixtures.rs` reads the new field; `BASELINE.md` refreshes.

**Tech Stack:** Rust 2021 (`solver-core`), proptest 1.x for property tests, FastAPI + Pydantic for backend pass-through, criterion for the bench harness.

Spec: `docs/superpowers/specs/2026-04-27-solver-soft-constraints-design.md`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `solver/solver-core/src/types.rs` | modify | Add fields to `ConstraintWeights`; add `soft_score` to `Solution` |
| `solver/solver-core/src/score.rs` | create | Pure `score_solution` + `gap_count_owned` helper |
| `solver/solver-core/src/lib.rs` | modify | Add `mod score; pub use score::score_solution;` |
| `solver/solver-core/src/solve.rs` | modify | Replace `try_place_hour` with lowest-delta picker; populate `Solution.soft_score`; rename `solve` to delegate with active-default weights |
| `solver/solver-core/tests/score_property.rs` | create | proptest cases for scorer-equivalence and determinism |
| `solver/solver-core/benches/solver_fixtures.rs` | modify | Print `solution.soft_score` instead of literal 0 |
| `solver/solver-core/benches/BASELINE.md` | modify | Regenerate via `mise run bench:record` |
| `backend/src/klassenzeit_backend/scheduling/schemas/schedule.py` | modify | Add `soft_score: int = 0` to `ScheduleResponse` |
| `backend/src/klassenzeit_backend/scheduling/solver_io.py` | modify | `filter_solution_for_class` propagates `soft_score`; `run_solve` log includes `soft_score` |
| `backend/tests/scheduling/test_schedule_route.py` | modify | Assert `soft_score` field present and non-negative |
| `frontend/openapi.json` | regenerate | Via `mise run fe:types` |
| `frontend/src/...` (generated types) | regenerate | Via `mise run fe:types` |
| `docs/superpowers/OPEN_THINGS.md` | modify | Mark item 9 partial; add PR-9b and PR-9c follow-ups |

---

## Task 1: Extend `ConstraintWeights` and `Solution`

**Files:**
- Modify: `solver/solver-core/src/types.rs`

- [ ] **Step 1: Update `ConstraintWeights`**

In `solver/solver-core/src/types.rs`, replace the existing empty `ConstraintWeights {}`:

```rust
/// Soft-constraint weights consumed by `score_solution` and the lowest-delta
/// greedy in `solve_with_config`. Each field defaults to zero so explicit
/// `ConstraintWeights::default()` callers get unweighted behaviour. The
/// no-config `solve()` entry point applies active defaults of `1` per gap.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConstraintWeights {
    /// Penalty per gap-hour in any class's day. A gap-hour is a position p in
    /// a `(school_class_id, day_of_week)` partition where the class has
    /// placements at some position less than p and some position greater than
    /// p on that day, but no placement at position p.
    pub class_gap: u32,
    /// Penalty per gap-hour in any teacher's day. Same definition as
    /// `class_gap`, partitioned by `(teacher_id, day_of_week)` instead.
    pub teacher_gap: u32,
}
```

- [ ] **Step 2: Update `Solution`**

In the same file, add `soft_score` to `Solution`:

```rust
/// Result of a solver run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Solution {
    /// Successful placements, one per `(lesson, hour)`.
    pub placements: Vec<Placement>,
    /// Violations recorded during solving.
    pub violations: Vec<Violation>,
    /// Sum of weighted soft-constraint penalties across `placements`.
    /// Populated by `solve_with_config` against the caller's
    /// `ConstraintWeights`. Zero when both weights are zero or when the
    /// schedule is fully compact.
    pub soft_score: u32,
}
```

- [ ] **Step 3: Update existing `Solution` construction sites**

In `solver/solver-core/src/solve.rs`, the only existing construction is at line ~28:

```rust
let mut solution = Solution {
    placements: Vec::new(),
    violations: pre_solve_violations(problem),
    soft_score: 0,
};
```

Compile and run the existing solver-core tests to confirm no other call sites need updating.

- [ ] **Step 4: Update existing test fixtures in `types.rs` tests module**

The test `solution_round_trips_with_placements_and_violations` constructs a `Solution`. Add `soft_score: 0` to that literal.

- [ ] **Step 5: Verify**

Run: `cargo nextest run -p solver-core`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add solver/solver-core/src/types.rs solver/solver-core/src/solve.rs
git commit -m "feat(solver-core): extend ConstraintWeights and Solution with soft-score fields"
```

---

## Task 2: Implement `score_solution` (TDD)

**Files:**
- Create: `solver/solver-core/src/score.rs`
- Modify: `solver/solver-core/src/lib.rs`

- [ ] **Step 1: Stub the module**

Create `solver/solver-core/src/score.rs` with module docs and a stub function so the test file can compile:

```rust
//! Pure soft-score function for `Solution` placements. Used by the lowest-delta
//! greedy in `solve.rs` and by the future LAHC local search.

use std::collections::HashMap;

use crate::ids::{LessonId, SchoolClassId, TeacherId, TimeBlockId};
use crate::types::{ConstraintWeights, Lesson, Placement, Problem, TimeBlock};

/// Compute the total weighted soft-score for a placement set.
///
/// Partitions `placements` by `(school_class_id, day_of_week)` and
/// `(teacher_id, day_of_week)`, then sums weighted gap-hours per partition.
pub fn score_solution(
    _problem: &Problem,
    _placements: &[Placement],
    _weights: &ConstraintWeights,
) -> u32 {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;
}
```

- [ ] **Step 2: Wire the module into `lib.rs`**

Edit `solver/solver-core/src/lib.rs`:

- Add `pub mod score;` next to the existing `pub mod solve;` line (alphabetical-ish per the existing file, after `mod ordering`).
- Append `pub use score::score_solution;` near the existing `pub use solve::{solve, solve_with_config};`.

- [ ] **Step 3: Write failing unit tests**

Inside `mod tests` in `score.rs`, add:

```rust
use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
use crate::types::{
    Lesson, Placement, Problem, Room, SchoolClass, Subject, Teacher, TeacherQualification,
    TimeBlock,
};
use uuid::Uuid;

fn score_uuid(n: u8) -> Uuid {
    Uuid::from_bytes([n; 16])
}

fn three_block_one_class_problem() -> Problem {
    Problem {
        time_blocks: vec![
            TimeBlock { id: TimeBlockId(score_uuid(10)), day_of_week: 0, position: 0 },
            TimeBlock { id: TimeBlockId(score_uuid(11)), day_of_week: 0, position: 1 },
            TimeBlock { id: TimeBlockId(score_uuid(12)), day_of_week: 0, position: 2 },
        ],
        teachers: vec![Teacher { id: TeacherId(score_uuid(20)), max_hours_per_week: 10 }],
        rooms: vec![Room { id: RoomId(score_uuid(30)) }],
        subjects: vec![Subject { id: SubjectId(score_uuid(40)) }],
        school_classes: vec![SchoolClass { id: SchoolClassId(score_uuid(50)) }],
        lessons: vec![
            Lesson {
                id: LessonId(score_uuid(60)),
                school_class_id: SchoolClassId(score_uuid(50)),
                subject_id: SubjectId(score_uuid(40)),
                teacher_id: TeacherId(score_uuid(20)),
                hours_per_week: 2,
            },
        ],
        teacher_qualifications: vec![TeacherQualification {
            teacher_id: TeacherId(score_uuid(20)),
            subject_id: SubjectId(score_uuid(40)),
        }],
        teacher_blocked_times: vec![],
        room_blocked_times: vec![],
        room_subject_suitabilities: vec![],
    }
}

fn place(lesson_id: u8, tb_id: u8) -> Placement {
    Placement {
        lesson_id: LessonId(score_uuid(lesson_id)),
        time_block_id: TimeBlockId(score_uuid(tb_id)),
        room_id: RoomId(score_uuid(30)),
    }
}

#[test]
fn empty_placements_score_zero() {
    let p = three_block_one_class_problem();
    let weights = ConstraintWeights { class_gap: 5, teacher_gap: 7 };
    assert_eq!(score_solution(&p, &[], &weights), 0);
}

#[test]
fn single_placement_scores_zero() {
    let p = three_block_one_class_problem();
    let weights = ConstraintWeights { class_gap: 5, teacher_gap: 7 };
    let placements = [place(60, 10)];
    assert_eq!(score_solution(&p, &placements, &weights), 0);
}

#[test]
fn contiguous_placements_score_zero() {
    let p = three_block_one_class_problem();
    let weights = ConstraintWeights { class_gap: 5, teacher_gap: 7 };
    let placements = [place(60, 10), place(60, 11)];
    assert_eq!(score_solution(&p, &placements, &weights), 0);
}

#[test]
fn one_gap_scores_class_plus_teacher_weights() {
    // Class 50 and teacher 20 both have placements at positions 0 and 2 with
    // a gap at position 1. Each partition contributes one gap-hour.
    let p = three_block_one_class_problem();
    let weights = ConstraintWeights { class_gap: 5, teacher_gap: 7 };
    let placements = [place(60, 10), place(60, 12)];
    assert_eq!(score_solution(&p, &placements, &weights), 12);
}

#[test]
fn weights_compose_linearly() {
    // Same gap shape, double the class_gap weight.
    let p = three_block_one_class_problem();
    let placements = [place(60, 10), place(60, 12)];
    let w1 = ConstraintWeights { class_gap: 1, teacher_gap: 0 };
    let w2 = ConstraintWeights { class_gap: 2, teacher_gap: 0 };
    assert_eq!(score_solution(&p, &placements, &w1), 1);
    assert_eq!(score_solution(&p, &placements, &w2), 2);
}

#[test]
fn cross_day_placements_do_not_combine() {
    // Two placements, day 0 position 0 and day 1 position 0. Within each day
    // there is exactly one placement, so no gap.
    let mut p = three_block_one_class_problem();
    p.time_blocks.push(TimeBlock { id: TimeBlockId(score_uuid(13)), day_of_week: 1, position: 0 });
    let weights = ConstraintWeights { class_gap: 5, teacher_gap: 7 };
    let placements = [place(60, 10), place(60, 13)];
    assert_eq!(score_solution(&p, &placements, &weights), 0);
}

#[test]
fn zero_weights_short_circuit_to_zero() {
    let p = three_block_one_class_problem();
    let weights = ConstraintWeights::default();
    let placements = [place(60, 10), place(60, 12)];
    assert_eq!(score_solution(&p, &placements, &weights), 0);
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cargo nextest run -p solver-core score::tests`
Expected: FAIL on `unimplemented!()`.

- [ ] **Step 5: Implement `score_solution`**

Replace the stub body:

```rust
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

    let class_gaps: u32 = by_class_day
        .into_values()
        .map(|mut v| {
            v.sort_unstable();
            v.dedup();
            gap_count(&v)
        })
        .sum();
    let teacher_gaps: u32 = by_teacher_day
        .into_values()
        .map(|mut v| {
            v.sort_unstable();
            v.dedup();
            gap_count(&v)
        })
        .sum();

    weights.class_gap.saturating_mul(class_gaps)
        + weights.teacher_gap.saturating_mul(teacher_gaps)
}

/// Count gap-hours in a sorted, deduplicated `positions` slice. A gap-hour is
/// an ordinal strictly between `positions.first()` and `positions.last()` that
/// does not appear in `positions`.
pub(crate) fn gap_count(positions: &[u8]) -> u32 {
    if positions.len() < 2 {
        return 0;
    }
    let span = u32::from(*positions.last().unwrap() - *positions.first().unwrap());
    let count = u32::try_from(positions.len()).unwrap_or(u32::MAX);
    span + 1 - count
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo nextest run -p solver-core score::tests`
Expected: 7 tests pass.

- [ ] **Step 7: Verify clippy clean**

Run: `cargo clippy -p solver-core --all-targets -- -D warnings`
Expected: no warnings.

- [ ] **Step 8: Commit**

```bash
git add solver/solver-core/src/score.rs solver/solver-core/src/lib.rs
git commit -m "feat(solver-core): add score_solution for class/teacher gap penalties"
```

---

## Task 3: Lowest-delta greedy in `solve.rs` (TDD)

**Files:**
- Modify: `solver/solver-core/src/solve.rs`

- [ ] **Step 1: Write the two new failing tests first**

**Fixture rationale (do not include in the test file).**

For `lowest_delta_picks_gap_minimising_slot_for_class`: four time blocks on day 0, positions 0..3. Lesson A's teacher (teacher 20) is blocked at positions 0, 1, 2 so FFD places it at position 3 (only feasible slot). Lesson B uses a separate, unconstrained teacher (teacher 21) on the same class. With class 50 already at position 3, lesson B's feasible class-slot set is {0, 1, 2}. Adding 0 to `[3]` creates 2 gap-hours; adding 1 creates 1; adding 2 creates 0. First-fit picks position 0 (lowest index). Lowest-delta picks position 2. The test asserts position 2.

For `lowest_delta_picks_gap_minimising_slot_for_teacher`: two classes (50, 51) share teacher 20. Four time blocks on day 0. Block teacher 20 at positions 0, 1 so FFD places lesson A (class 50) at the lower-position feasible slot among {2, 3}. Lesson B (class 51, same teacher 20) is unconstrained except for the teacher's now-occupied slot. Class 51's partition is empty so class-gap delta is 0 for any position; teacher 20's partition has whichever position A took, and lowest-delta picks the position adjacent to A's. The test asserts the two placements are at adjacent teacher positions (`abs_diff == 1`).

Append the two tests inside the existing `#[cfg(test)] mod tests` block in `solve.rs` (alongside the existing 9 tests):

```rust
#[test]
fn lowest_delta_picks_gap_minimising_slot_for_class() {
    // Lesson A is forced to position 3; lesson B (unconstrained second teacher)
    // should pick position 2 under lowest-delta to minimise class-gap, not
    // position 0 (which first-fit would pick).
    let mut p = base_problem();
    p.time_blocks = vec![
        TimeBlock { id: TimeBlockId(solve_uuid(10)), day_of_week: 0, position: 0 },
        TimeBlock { id: TimeBlockId(solve_uuid(11)), day_of_week: 0, position: 1 },
        TimeBlock { id: TimeBlockId(solve_uuid(12)), day_of_week: 0, position: 2 },
        TimeBlock { id: TimeBlockId(solve_uuid(13)), day_of_week: 0, position: 3 },
    ];
    for tb_id in [10u8, 11, 12] {
        p.teacher_blocked_times.push(TeacherBlockedTime {
            teacher_id: TeacherId(solve_uuid(20)),
            time_block_id: TimeBlockId(solve_uuid(tb_id)),
        });
    }
    p.subjects.push(Subject { id: SubjectId(solve_uuid(41)) });
    p.teachers.push(Teacher { id: TeacherId(solve_uuid(21)), max_hours_per_week: 10 });
    p.teacher_qualifications.push(TeacherQualification {
        teacher_id: TeacherId(solve_uuid(21)),
        subject_id: SubjectId(solve_uuid(41)),
    });
    p.lessons.push(Lesson {
        id: LessonId(solve_uuid(61)),
        school_class_id: SchoolClassId(solve_uuid(50)),
        subject_id: SubjectId(solve_uuid(41)),
        teacher_id: TeacherId(solve_uuid(21)),
        hours_per_week: 1,
    });

    let s = solve(&p).unwrap();
    assert_eq!(s.placements.len(), 2);
    let lesson_a = s.placements.iter().find(|x| x.lesson_id == LessonId(solve_uuid(60))).unwrap();
    assert_eq!(lesson_a.time_block_id, TimeBlockId(solve_uuid(13)));
    let lesson_b = s.placements.iter().find(|x| x.lesson_id == LessonId(solve_uuid(61))).unwrap();
    assert_eq!(lesson_b.time_block_id, TimeBlockId(solve_uuid(12)));
    assert_eq!(s.soft_score, 0);
}

#[test]
fn lowest_delta_picks_gap_minimising_slot_for_teacher() {
    // Two classes share teacher 20. Lesson A places at the lowest free slot;
    // lesson B (different class, same teacher) should pick the slot adjacent
    // to A under lowest-delta, not the lowest-index free slot.
    let mut p = base_problem();
    p.time_blocks = vec![
        TimeBlock { id: TimeBlockId(solve_uuid(10)), day_of_week: 0, position: 0 },
        TimeBlock { id: TimeBlockId(solve_uuid(11)), day_of_week: 0, position: 1 },
        TimeBlock { id: TimeBlockId(solve_uuid(12)), day_of_week: 0, position: 2 },
        TimeBlock { id: TimeBlockId(solve_uuid(13)), day_of_week: 0, position: 3 },
    ];
    for tb_id in [10u8, 11] {
        p.teacher_blocked_times.push(TeacherBlockedTime {
            teacher_id: TeacherId(solve_uuid(20)),
            time_block_id: TimeBlockId(solve_uuid(tb_id)),
        });
    }
    p.school_classes.push(SchoolClass { id: SchoolClassId(solve_uuid(51)) });
    p.lessons.push(Lesson {
        id: LessonId(solve_uuid(61)),
        school_class_id: SchoolClassId(solve_uuid(51)),
        subject_id: SubjectId(solve_uuid(40)),
        teacher_id: TeacherId(solve_uuid(20)),
        hours_per_week: 1,
    });
    p.teachers[0].max_hours_per_week = 10;

    let s = solve(&p).unwrap();
    assert_eq!(s.placements.len(), 2);
    let lesson_a = s.placements.iter().find(|x| x.lesson_id == LessonId(solve_uuid(60))).unwrap();
    let lesson_b = s.placements.iter().find(|x| x.lesson_id == LessonId(solve_uuid(61))).unwrap();
    let pos_a = p.time_blocks.iter().find(|tb| tb.id == lesson_a.time_block_id).unwrap().position;
    let pos_b = p.time_blocks.iter().find(|tb| tb.id == lesson_b.time_block_id).unwrap().position;
    assert_eq!(pos_a.abs_diff(pos_b), 1, "lessons should be adjacent under lowest-delta teacher-gap");
    assert_eq!(s.soft_score, 0);
}
```

- [ ] **Step 2: Run new tests to verify they fail (or pass under first-fit by accident)**

Run: `cargo nextest run -p solver-core solve::tests::lowest_delta`
Expected: FAIL. The first-fit greedy will pick position 0 in the first test (creating gaps).

If they accidentally pass (first-fit happens to land on the same answer for this fixture shape), tighten the fixture until they fail.

- [ ] **Step 3: Add running-state structures and helper functions in `solve.rs`**

Add at module scope (above `solve_with_config`):

```rust
struct GreedyState {
    used_teacher: HashSet<(TeacherId, TimeBlockId)>,
    used_class: HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: HashSet<(RoomId, TimeBlockId)>,
    hours_by_teacher: HashMap<TeacherId, u8>,
    class_positions: HashMap<(SchoolClassId, u8), Vec<u8>>,
    teacher_positions: HashMap<(TeacherId, u8), Vec<u8>>,
    soft_score: u32,
}

impl GreedyState {
    fn new() -> Self {
        Self {
            used_teacher: HashSet::new(),
            used_class: HashSet::new(),
            used_room: HashSet::new(),
            hours_by_teacher: HashMap::new(),
            class_positions: HashMap::new(),
            teacher_positions: HashMap::new(),
            soft_score: 0,
        }
    }
}

/// Compute the soft-score the running solution would have if `pos` were
/// inserted into `(class, day)` and `(teacher, day)`. Reads partition state
/// in `state`; does not mutate.
fn candidate_score(
    state: &GreedyState,
    class: SchoolClassId,
    teacher: TeacherId,
    day: u8,
    pos: u8,
    weights: &ConstraintWeights,
) -> u32 {
    let class_partition = state.class_positions.get(&(class, day));
    let teacher_partition = state.teacher_positions.get(&(teacher, day));
    let class_old = gap_count_partition(class_partition).saturating_mul(weights.class_gap);
    let teacher_old = gap_count_partition(teacher_partition).saturating_mul(weights.teacher_gap);
    let class_new = gap_count_after_insert(class_partition, pos).saturating_mul(weights.class_gap);
    let teacher_new = gap_count_after_insert(teacher_partition, pos).saturating_mul(weights.teacher_gap);
    state.soft_score - class_old - teacher_old + class_new + teacher_new
}

fn gap_count_partition(positions: Option<&Vec<u8>>) -> u32 {
    match positions {
        Some(p) => crate::score::gap_count(p),
        None => 0,
    }
}

fn gap_count_after_insert(positions: Option<&Vec<u8>>, pos: u8) -> u32 {
    let mut buf: Vec<u8> = positions.map(Vec::clone).unwrap_or_default();
    if let Err(ins) = buf.binary_search(&pos) {
        buf.insert(ins, pos);
    }
    crate::score::gap_count(&buf)
}
```

(`crate::score::gap_count` is the `pub(crate)` helper introduced in Task 2 step 5.)

The `class_positions` and `teacher_positions` HashMaps store **sorted, deduplicated** positions; `commit_placement` (next step) maintains that invariant.

- [ ] **Step 4: Replace `try_place_hour`**

In `solve.rs`, replace the existing `try_place_hour` and its call site in the placement loop with:

```rust
#[allow(clippy::too_many_arguments)] // Reason: internal helper; refactoring to a struct hurts clarity more than it helps
fn try_place_hour(
    problem: &Problem,
    lesson: &Lesson,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    weights: &ConstraintWeights,
    state: &mut GreedyState,
    placements: &mut Vec<Placement>,
) -> bool {
    let class = lesson.school_class_id;
    let teacher = lesson.teacher_id;

    let mut best: Option<Candidate> = None;
    for tb in &problem.time_blocks {
        if state.used_teacher.contains(&(teacher, tb.id)) {
            continue;
        }
        if state.used_class.contains(&(class, tb.id)) {
            continue;
        }
        if idx.teacher_blocked(teacher, tb.id) {
            continue;
        }
        let current = state.hours_by_teacher.get(&teacher).copied().unwrap_or(0);
        let max = teacher_max.get(&teacher).copied().unwrap_or(0);
        if current.saturating_add(1) > max {
            continue;
        }
        // tb-level invariant: candidate_score depends only on (day, position),
        // not on room. Compute once per tb.
        let score = candidate_score(state, class, teacher, tb.day_of_week, tb.position, weights);

        for room in &problem.rooms {
            if state.used_room.contains(&(room.id, tb.id)) {
                continue;
            }
            if !idx.room_suits_subject(room.id, lesson.subject_id) {
                continue;
            }
            if idx.room_blocked(room.id, tb.id) {
                continue;
            }
            let candidate = Candidate {
                tb_id: tb.id,
                room_id: room.id,
                day: tb.day_of_week,
                position: tb.position,
                score,
            };
            if better(&candidate, &best) {
                best = Some(candidate);
            }
        }
    }

    let Some(c) = best else {
        return false;
    };

    placements.push(Placement {
        lesson_id: lesson.id,
        time_block_id: c.tb_id,
        room_id: c.room_id,
    });
    state.used_teacher.insert((teacher, c.tb_id));
    state.used_class.insert((class, c.tb_id));
    state.used_room.insert((c.room_id, c.tb_id));
    *state.hours_by_teacher.entry(teacher).or_insert(0) += 1;

    let class_positions = state
        .class_positions
        .entry((class, c.day))
        .or_default();
    let ins = class_positions.binary_search(&c.position).unwrap_or_else(|i| i);
    class_positions.insert(ins, c.position);
    let teacher_positions = state
        .teacher_positions
        .entry((teacher, c.day))
        .or_default();
    let ins = teacher_positions.binary_search(&c.position).unwrap_or_else(|i| i);
    teacher_positions.insert(ins, c.position);
    state.soft_score = c.score;
    true
}

#[derive(Debug, Clone, Copy)]
struct Candidate {
    tb_id: TimeBlockId,
    room_id: RoomId,
    day: u8,
    position: u8,
    score: u32,
}

fn better(c: &Candidate, best: &Option<Candidate>) -> bool {
    let Some(b) = best else { return true };
    // Lower score wins; tiebreak on (day, position, room.id).
    (c.score, c.day, c.position, c.room_id.0)
        < (b.score, b.day, b.position, b.room_id.0)
}
```

The new `Candidate.room_id.0` accesses `RoomId(Uuid)`; `Uuid` implements `Ord` so the tuple comparison works.

- [ ] **Step 5: Wire `state` and `weights` through `solve_with_config`**

Replace the body of `solve_with_config`:

```rust
pub fn solve_with_config(problem: &Problem, config: &SolveConfig) -> Result<Solution, Error> {
    validate_structural(problem)?;

    let idx = Indexed::new(problem);
    let mut solution = Solution {
        placements: Vec::new(),
        violations: pre_solve_violations(problem),
        soft_score: 0,
    };

    let mut state = GreedyState::new();
    let teacher_max: HashMap<TeacherId, u8> = problem
        .teachers
        .iter()
        .map(|t| (t.id, t.max_hours_per_week))
        .collect();

    let order = crate::ordering::ffd_order(problem, &idx);
    for &lesson_idx in &order {
        let lesson = &problem.lessons[lesson_idx];
        if !idx.teacher_qualified(lesson.teacher_id, lesson.subject_id) {
            continue;
        }

        for hour_index in 0..lesson.hours_per_week {
            let placed = try_place_hour(
                problem,
                lesson,
                &idx,
                &teacher_max,
                &config.weights,
                &mut state,
                &mut solution.placements,
            );
            if !placed {
                solution.violations.push(Violation {
                    kind: unplaced_kind(
                        problem,
                        lesson,
                        &idx,
                        &teacher_max,
                        &state.used_teacher,
                        &state.used_class,
                        &state.hours_by_teacher,
                    ),
                    lesson_id: lesson.id,
                    hour_index,
                });
            }
        }
    }

    solution.soft_score = state.soft_score;
    Ok(solution)
}
```

Update the `unplaced_kind` signature to read from `&HashSet<(...)>` (already takes references; existing signature should match).

- [ ] **Step 6: Update `solve` to apply active-default weights**

Replace the existing `pub fn solve(problem: &Problem)`:

```rust
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    let active_default = SolveConfig {
        weights: ConstraintWeights {
            class_gap: 1,
            teacher_gap: 1,
        },
        ..SolveConfig::default()
    };
    solve_with_config(problem, &active_default)
}
```

- [ ] **Step 7: Run all solver-core tests**

Run: `cargo nextest run -p solver-core`
Expected: 11 unit tests pass (9 existing + 2 new lowest-delta).

If an existing test fails (e.g., the active-default `(1, 1)` weights make a tiebreak land differently than first-fit on its specific fixture), inspect the failure. The expected outcome is that all 9 existing tests still pass because their fixtures have only one feasible slot per lesson or all candidates tie at zero gap; if a test fails, pick whichever fix is right:

- The fixture has multiple feasible slots and the new tiebreak `(score, day, position, room.id)` lands on a different one. Update the assertion to match the new tiebreak rule.
- The new logic has a bug. Fix the bug.

- [ ] **Step 8: Run clippy**

Run: `cargo clippy -p solver-core --all-targets -- -D warnings`
Expected: clean. If you hit `clippy::too_many_arguments` on `try_place_hour`, the existing `#[allow]` covers it.

- [ ] **Step 9: Commit**

```bash
git add solver/solver-core/src/solve.rs
git commit -m "feat(solver-core): lowest-delta greedy with running soft-score"
```

---

## Task 4: Property tests

**Files:**
- Create: `solver/solver-core/tests/score_property.rs`

- [ ] **Step 1: Create the property-test file**

```rust
//! Property tests for `score_solution` and the lowest-delta greedy.

use std::collections::HashMap;

use proptest::prelude::*;
use solver_core::{
    score_solution, solve_with_config, ConstraintWeights, Lesson, LessonId, Problem, Room, RoomId,
    SchoolClass, SchoolClassId, SolveConfig, Subject, SubjectId, Teacher, TeacherId,
    TeacherQualification, TimeBlock, TimeBlockId,
};
use uuid::Uuid;

fn id_from(n: u32) -> Uuid {
    let mut bytes = [0u8; 16];
    bytes[12..16].copy_from_slice(&n.to_be_bytes());
    Uuid::from_bytes(bytes)
}

prop_compose! {
    fn small_problem()(
        n_classes in 1usize..=3,
        n_teachers in 1usize..=4,
        n_rooms in 1usize..=3,
        n_subjects in 1usize..=3,
        n_days in 1u8..=3,
        periods_per_day in 2u8..=5,
        // Lessons: each (class, subject) gets 1 to 3 hours; cap total at 12.
        lesson_specs in prop::collection::vec((0usize..3, 0usize..3, 1u8..=3), 1..=12),
    ) -> Problem {
        let time_blocks: Vec<TimeBlock> = (0..n_days).flat_map(|d| {
            (0..periods_per_day).map(move |p| TimeBlock {
                id: TimeBlockId(id_from(u32::from(d) * 100 + u32::from(p) + 1000)),
                day_of_week: d,
                position: p,
            })
        }).collect();

        let teachers: Vec<Teacher> = (0..n_teachers).map(|i| Teacher {
            id: TeacherId(id_from(u32::try_from(i).unwrap_or(0) + 2000)),
            max_hours_per_week: 30,
        }).collect();

        let rooms: Vec<Room> = (0..n_rooms).map(|i| Room {
            id: RoomId(id_from(u32::try_from(i).unwrap_or(0) + 3000)),
        }).collect();

        let subjects: Vec<Subject> = (0..n_subjects).map(|i| Subject {
            id: SubjectId(id_from(u32::try_from(i).unwrap_or(0) + 4000)),
        }).collect();

        let school_classes: Vec<SchoolClass> = (0..n_classes).map(|i| SchoolClass {
            id: SchoolClassId(id_from(u32::try_from(i).unwrap_or(0) + 5000)),
        }).collect();

        // Every teacher is qualified for every subject (keeps the generator
        // simple; the property holds for any qualification matrix).
        let teacher_qualifications: Vec<TeacherQualification> = teachers.iter()
            .flat_map(|t| subjects.iter().map(move |s| TeacherQualification {
                teacher_id: t.id,
                subject_id: s.id,
            }))
            .collect();

        let lessons: Vec<Lesson> = lesson_specs.iter().enumerate().filter_map(|(i, &(ci, si, h))| {
            if ci >= n_classes || si >= n_subjects {
                return None;
            }
            Some(Lesson {
                id: LessonId(id_from(u32::try_from(i).unwrap_or(0) + 6000)),
                school_class_id: school_classes[ci].id,
                subject_id: subjects[si].id,
                teacher_id: teachers[i % n_teachers].id,
                hours_per_week: h,
            })
        }).collect();

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
            room_subject_suitabilities: vec![],
        }
    }
}

prop_compose! {
    fn weights()(class_gap in 0u32..=10, teacher_gap in 0u32..=10) -> ConstraintWeights {
        ConstraintWeights { class_gap, teacher_gap }
    }
}

proptest! {
    /// The standalone scorer must equal the in-loop running total.
    #[test]
    fn solve_soft_score_equals_score_solution(problem in small_problem(), w in weights()) {
        let cfg = SolveConfig { weights: w.clone(), ..SolveConfig::default() };
        let Ok(sol) = solve_with_config(&problem, &cfg) else { return Ok(()) };
        let recomputed = score_solution(&problem, &sol.placements, &w);
        prop_assert_eq!(sol.soft_score, recomputed);
    }

    /// Two solver invocations on the same problem and weights produce the
    /// same triple. Catches HashMap-iteration leaks and other hidden
    /// non-determinism.
    #[test]
    fn solve_is_deterministic(problem in small_problem(), w in weights()) {
        let cfg = SolveConfig { weights: w, ..SolveConfig::default() };
        let Ok(s1) = solve_with_config(&problem, &cfg) else { return Ok(()) };
        let Ok(s2) = solve_with_config(&problem, &cfg) else { return Ok(()) };
        prop_assert_eq!(s1.placements, s2.placements);
        prop_assert_eq!(s1.violations, s2.violations);
        prop_assert_eq!(s1.soft_score, s2.soft_score);
    }
}
```

- [ ] **Step 2: Run the property tests**

Run: `cargo nextest run -p solver-core --test score_property`
Expected: both tests pass with proptest's default 256 cases each.

If they fail, the failure mode is one of:
- `solve_soft_score_equals_score_solution`: incremental scoring drifts from the standalone scorer. Inspect the shrunk failing case; the bug is in `candidate_score` or in how `state.soft_score` is updated on commit.
- `solve_is_deterministic`: a HashMap iteration leak. Inspect; likely needs sorting `problem.time_blocks.iter()` in a consistent order or replacing a HashMap iteration with a sorted vec walk.

- [ ] **Step 3: Commit**

```bash
git add solver/solver-core/tests/score_property.rs
git commit -m "test(solver-core): proptest scorer-equivalence and solve determinism"
```

---

## Task 5: Backend pass-through

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/schemas/schedule.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/solver_io.py`
- Modify: `backend/tests/scheduling/test_schedule_route.py`

- [ ] **Step 1: Rebuild solver-py**

Run: `mise run solver:rebuild`
Expected: maturin builds in seconds; the Python `klassenzeit_solver` package now produces JSON with the new `soft_score` field.

- [ ] **Step 2: Add `soft_score` to `ScheduleResponse`**

Edit `backend/src/klassenzeit_backend/scheduling/schemas/schedule.py`:

```python
class ScheduleResponse(BaseModel):
    """Per-class filtered solver output for `POST /api/classes/{id}/schedule`."""

    placements: list[PlacementResponse]
    violations: list[ViolationResponse]
    soft_score: int = Field(default=0, ge=0)
```

Add `Field` to the existing import: `from pydantic import BaseModel, Field` (already present).

- [ ] **Step 3: Propagate `soft_score` in `filter_solution_for_class`**

Edit `backend/src/klassenzeit_backend/scheduling/solver_io.py`:

```python
def filter_solution_for_class(solution: dict, class_lesson_ids: set[UUID]) -> dict:
    """Keep only placements and violations whose lesson belongs to this class.

    The school-wide ``soft_score`` is passed through unchanged so the route
    response carries the solver's overall quality signal even though the
    placement list is class-scoped. PR-9c will decide whether to re-score on
    the filtered subset.
    """
    placements = [p for p in solution["placements"] if UUID(p["lesson_id"]) in class_lesson_ids]
    violations = [v for v in solution["violations"] if UUID(v["lesson_id"]) in class_lesson_ids]
    return {
        "placements": placements,
        "violations": violations,
        "soft_score": solution.get("soft_score", 0),
    }
```

- [ ] **Step 4: Add `soft_score` to the `solver.solve.done` log line**

In the same file, in `run_solve`'s `logger.info("solver.solve.done", ...)` block, add `"soft_score": solution.get("soft_score", 0),` to the `extra` dict.

- [ ] **Step 5: Add a backend test asserting the field round-trips**

Edit `backend/tests/scheduling/test_schedule_route.py`. Locate the existing test for `POST /api/classes/{id}/schedule` (likely named `test_schedule_post_*`) and add an assertion. If a focused happy-path test already exists, add `assert "soft_score" in body` and `assert body["soft_score"] >= 0` to it. Otherwise, add a new test:

```python
async def test_schedule_post_response_carries_soft_score(client, ...):
    """The schedule POST response carries the solver's soft_score.

    Field is non-negative; exact value depends on the test fixture.
    """
    # ... existing test setup that creates a class, lessons, etc. ...
    response = await client.post(f"/api/classes/{class_id}/schedule")
    assert response.status_code == 200
    body = response.json()
    assert "soft_score" in body
    assert body["soft_score"] >= 0
```

Use the existing test's fixture pattern; do not invent new fixtures here.

- [ ] **Step 6: Run backend tests**

Run: `mise run test:py -- backend/tests/scheduling/`
Expected: all scheduling tests pass.

- [ ] **Step 7: Regenerate frontend OpenAPI types**

Run: `mise run fe:types`
Expected: `frontend/openapi.json` updates with the new `soft_score` field; generated TS types update accordingly.

- [ ] **Step 8: Run frontend type-check**

Run: `mise run fe:test` (or just the lint step)
Expected: passes; nothing in the frontend reads `soft_score` yet, so the regen is purely additive.

- [ ] **Step 9: Commit (split into two if it reduces noise)**

```bash
git add backend/src/klassenzeit_backend/scheduling/schemas/schedule.py \
        backend/src/klassenzeit_backend/scheduling/solver_io.py \
        backend/tests/scheduling/test_schedule_route.py
git commit -m "feat(backend): expose soft_score in ScheduleResponse"

git add frontend/openapi.json frontend/src
git commit -m "chore(frontend): regenerate OpenAPI types for soft_score"
```

---

## Task 6: Bench update + BASELINE refresh

**Files:**
- Modify: `solver/solver-core/benches/solver_fixtures.rs`
- Modify: `solver/solver-core/benches/BASELINE.md`

- [ ] **Step 1: Locate the bench's row-formatting code**

Read `solver/solver-core/benches/solver_fixtures.rs` and find where the `Soft score` column is currently written as a literal `0`.

- [ ] **Step 2: Replace the literal with `solution.soft_score`**

Change the row formatter to read `solution.soft_score` (the same `Solution` value that already exposes `placements.len()` and `violations.len()`).

- [ ] **Step 3: Run the bench locally to verify correctness**

Run: `mise run bench`
Expected: completes in 30-60 seconds. Both fixtures show non-zero `Soft score` (likely small integers), and p50 stays within the 20% budget:

- grundschule: p50 ≤ 50 µs (today 42 µs).
- zweizuegig: p50 ≤ 224 µs (today 187 µs).

If the budget breaks, **stop and optimise**. Most likely culprit: per-tb hoisting got missed (verify `candidate_score` is called once per tb, not once per (tb, room) pair). Use `cargo flamegraph` if the source isn't obvious.

- [ ] **Step 4: Refresh `BASELINE.md`**

Run: `mise run bench:record`
Expected: `solver/solver-core/benches/BASELINE.md` regenerates with the new numbers, including the actual `Soft score` per fixture.

- [ ] **Step 5: Read the diff and sanity-check**

Run: `git diff solver/solver-core/benches/BASELINE.md`
Expected: same fixture rows, perf p50 within budget, soft-score columns now populated.

- [ ] **Step 6: Commit**

```bash
git add solver/solver-core/benches/solver_fixtures.rs solver/solver-core/benches/BASELINE.md
git commit -m "perf(solver-core): wire Soft score column to bench baseline"
```

---

## Task 7: Update OPEN_THINGS.md

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Mark sprint item 9 as partial**

In `docs/superpowers/OPEN_THINGS.md`, find the "Algorithm phase" section, item 9. Replace the existing entry with:

```markdown
9. **Soft constraints + objective function + LAHC.** `[P0]` Partially shipped 2026-04-27. PR `feat/solver-objective-soft-constraints`: `solver-core/src/score.rs` adds `score_solution(problem, placements, weights) -> u32`; `ConstraintWeights` gains `class_gap` and `teacher_gap` (each penalising gap-hours within `(class, day_of_week)` and `(teacher, day_of_week)` partitions). The greedy in `solve.rs` becomes lowest-delta with deterministic `(score, day, position, room.id)` tiebreak; `Solution` gains `soft_score: u32`. `BASELINE.md` refreshed with the new column populated; both fixtures stay within 20% of the prior p50. Backend `ScheduleResponse` exposes `soft_score: int` so the LAHC follow-up can drive a UI surface; frontend OpenAPI types regenerated, no rendering yet. Spec: [`2026-04-27-solver-soft-constraints-design.md`](specs/2026-04-27-solver-soft-constraints-design.md). Plan: [`2026-04-27-solver-soft-constraints.md`](plans/2026-04-27-solver-soft-constraints.md).

   Remaining (next P0): the LAHC local-search loop on top of the new scoring API. Adds an ADR for the stochastic search + RNG decisions, single-move (Change) only, honors `SolveConfig.deadline` and `SolveConfig.seed`. Reuses `score_solution` and `Solution.soft_score` unchanged.

   Subject-level pedagogy preferences (Hauptfächer früh, Sport not first period, Musik/Kunst preferred-room) are split off as a separate follow-up because they require Subject schema/API/i18n changes; tracked under "Acknowledged deferrals" below.
```

- [ ] **Step 2: Add the subject-level pedagogy deferral**

In the "Acknowledged deferrals" section, add a new bullet (placement: alphabetical within the section, or at end if alphabetisation is not strict in that section):

```markdown
- **Subject-level pedagogy preferences (sprint item 9, post-LAHC follow-up).** Encoding "Hauptfächer früh", "Sport not first period", "Musik/Kunst dedicated rooms" as soft preferences requires Subject metadata (probably `Subject.preference_early_periods: bool`, `Subject.preference_avoid_first_period: bool`, or a `preference_kind` enum). The schema + API + Pydantic + frontend form + en/de i18n surface is large enough that PR-9a (soft-score infra) and PR-9b (LAHC) deliberately ship without it. Revisit once both PRs are merged and we have a real complaint about pedagogy (Sport scheduled in period 1, etc.) instead of a hypothetical one. Spec: deferred from [`2026-04-27-solver-soft-constraints-design.md`](specs/2026-04-27-solver-soft-constraints-design.md).
```

- [ ] **Step 3: Update the dashboard / sprint summary if present**

Search OPEN_THINGS.md for any "Active sprint" status header. The existing structure groups items 1-9 under tidy + algorithm phases. No top-level dashboard change needed beyond item 9's status update.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: mark sprint item 9 partially shipped (PR-9a soft-score infra)"
```

---

## Self-review checklist (before pushing)

- [ ] All 11 unit tests in `solve.rs` pass under default-active weights `(1, 1)`.
- [ ] Both proptest cases pass with proptest's 256-case default.
- [ ] `mise run lint` clean.
- [ ] `mise run test` clean (Rust + Python + frontend).
- [ ] `mise run bench` shows both fixtures within 20% of prior p50; `BASELINE.md` reflects.
- [ ] No em-dashes / en-dashes in any new prose.
- [ ] Commit messages follow Conventional Commits; `cog verify` passes (the commit-msg hook runs it).
- [ ] No AI attribution in commit bodies or PR description.
- [ ] OPEN_THINGS.md item 9 marked as partial; new follow-up entries added.
