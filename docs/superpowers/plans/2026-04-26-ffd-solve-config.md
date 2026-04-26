# FFD ordering + `SolveConfig` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `SolveConfig` + `ConstraintWeights` API surface and First Fit Decreasing lesson ordering to `solver-core`, retire the bench fixture's scarcity-first workaround.

**Architecture:** One feature branch (`feat/ffd-solve-config`), three commits on top of master. Commit 1 introduces the new API surface and reduces `solve` to a delegate over `solve_with_config`; behaviour is byte-identical to today. Commit 2 adds `ordering.rs` with `ffd_order` and wires it into `solve_with_config`, removes the manual subject ordering in `solver-core/benches/solver_fixtures.rs`, refreshes `BASELINE.md`. Commit 3 ships ADR 0014 plus the OPEN_THINGS / index updates. Spec at `docs/superpowers/specs/2026-04-26-ffd-solve-config-design.md`.

**Tech Stack:** Rust 2021 (`solver-core` Cargo crate), `cargo nextest`, criterion via `mise run bench`, `lefthook` pre-commit hook running `mise run lint`. No PyO3 / no Python / no frontend changes.

---

## File map

| File | Verb | Responsibility |
| --- | --- | --- |
| `solver/solver-core/src/types.rs` | modify | Add `SolveConfig`, `ConstraintWeights` (Task 1). |
| `solver/solver-core/src/lib.rs` | modify | Re-export new types; add `mod ordering;` (Task 2). |
| `solver/solver-core/src/solve.rs` | modify | Add `solve_with_config`; reduce `solve` to delegate (Task 1); use FFD order (Task 2). |
| `solver/solver-core/src/index.rs` | modify | Drop the now-redundant `#[cfg_attr(not(test), allow(dead_code))]` (Task 2). |
| `solver/solver-core/src/ordering.rs` | create | Module with `pub(crate) fn ffd_order` + inline tests (Task 2). |
| `solver/solver-core/tests/ffd_solver_outcome.rs` | create | Integration test asserting FFD changes the placement outcome on a small fixture (Task 2). |
| `solver/solver-core/benches/solver_fixtures.rs` | modify | Drop the `subject_order` workaround in `zweizuegig_fixture` and the docstring line about scarcity-first encoding (Task 2). |
| `solver/CLAUDE.md` | modify | Replace the "Bench global-solve is sensitive…" paragraph with a one-line "FFD is invariant" note (Task 2). |
| `solver/solver-core/benches/BASELINE.md` | regenerate | `mise run bench:record` (Task 2). |
| `docs/adr/0014-solve-config-and-ffd-ordering.md` | create | ADR 0014 (Task 3). |
| `docs/adr/README.md` | modify | Index ADR 0014 (Task 3). |
| `docs/superpowers/OPEN_THINGS.md` | modify | Mark active-sprint algorithm-phase item 7 shipped (Task 3). |

---

## Task 1: Structural — `SolveConfig`, `ConstraintWeights`, `solve_with_config` delegate

**Goal:** Introduce the new API surface without changing any solver behaviour. Existing tests must pass without modification.

**Files:**
- Modify: `solver/solver-core/src/types.rs` (append new structs near the top of the existing types, after `use ...` and before `pub struct Problem`)
- Modify: `solver/solver-core/src/lib.rs` (extend `pub use types::{...}` and `pub use solve::{...}`)
- Modify: `solver/solver-core/src/solve.rs` (move existing body into a new `solve_with_config`; reduce `solve` to a one-line delegate)

- [ ] **Step 1.1: Add `SolveConfig` and `ConstraintWeights` to `types.rs`**

Open `solver/solver-core/src/types.rs`. After the existing `use ...` lines and before `pub struct Problem`, add:

```rust
use std::time::Duration;

/// Tunables for one solver invocation. Pass via [`crate::solve_with_config`];
/// the no-config [`crate::solve`] entry point uses [`SolveConfig::default`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SolveConfig {
    /// Optional wall-clock budget. `None` means "no budget enforced". The
    /// greedy first-fit pass ignores this; a future local-search pass will
    /// honour it.
    pub deadline: Option<Duration>,
    /// Seed for any randomised tiebreak inside the solver. The greedy pass
    /// is deterministic without it; a future local-search pass will use it
    /// for reproducible swaps.
    pub seed: u64,
    /// Weights that govern the soft-constraint scoring function.
    pub weights: ConstraintWeights,
}

/// Soft-constraint weights. Currently empty; populated by the soft-constraint
/// + local-search PR. Empty curly-brace form (not a unit struct) so adding
/// fields later is non-breaking.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConstraintWeights {}
```

Note the existing `use serde::{Deserialize, Serialize};` line and the existing `use crate::ids::{...};` line stay above `use std::time::Duration;` (alphabetical std-after-extern is the project style; if `cargo fmt` reorders, accept whatever it produces). `SolveConfig` does **not** derive `Serialize` / `Deserialize` because it never goes on the wire.

- [ ] **Step 1.2: Re-export from `lib.rs`**

Open `solver/solver-core/src/lib.rs`. The current re-export block is:

```rust
pub use types::{
    Lesson, Placement, Problem, Room, RoomBlockedTime, RoomSubjectSuitability, SchoolClass,
    Solution, Subject, Teacher, TeacherBlockedTime, TeacherQualification, TimeBlock, Violation,
    ViolationKind,
};
```

Add `ConstraintWeights` and `SolveConfig`, keeping the alphabetical order:

```rust
pub use types::{
    ConstraintWeights, Lesson, Placement, Problem, Room, RoomBlockedTime, RoomSubjectSuitability,
    SchoolClass, Solution, SolveConfig, Subject, Teacher, TeacherBlockedTime,
    TeacherQualification, TimeBlock, Violation, ViolationKind,
};
```

The existing `pub use solve::solve;` line stays for now; Step 1.3 extends it.

- [ ] **Step 1.3: Add `solve_with_config` and reduce `solve` to a delegate**

Open `solver/solver-core/src/solve.rs`. The current public function:

```rust
/// Solve the timetable problem using greedy first-fit placement.
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    validate_structural(problem)?;
    // ... existing body ...
    Ok(solution)
}
```

Refactor to:

```rust
use crate::types::{Lesson, Placement, Problem, SolveConfig, Solution, Violation, ViolationKind};

/// Solve the timetable problem using greedy first-fit placement.
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    solve_with_config(problem, &SolveConfig::default())
}

/// Solve the timetable problem with explicit configuration. Today's pass
/// reads the config's struct presence but not its fields; later passes
/// consume `weights`, `seed`, and `deadline`.
pub fn solve_with_config(
    problem: &Problem,
    _config: &SolveConfig,
) -> Result<Solution, Error> {
    validate_structural(problem)?;
    // ... move the entire existing body of `solve` here verbatim ...
    Ok(solution)
}
```

The `_config` parameter is intentionally unused this commit. The leading underscore suppresses clippy's `unused_variables` warning without requiring `#[allow]`.

Update `solve.rs`'s top `use` line if `SolveConfig` is not already imported. The existing module-level imports look like:

```rust
use crate::error::Error;
use crate::ids::{RoomId, SchoolClassId, TeacherId, TimeBlockId};
use crate::index::Indexed;
use crate::types::{Lesson, Placement, Problem, Solution, Violation, ViolationKind};
use crate::validate::{pre_solve_violations, validate_structural};
```

Add `SolveConfig` to the existing `use crate::types::{...}` line:

```rust
use crate::types::{Lesson, Placement, Problem, SolveConfig, Solution, Violation, ViolationKind};
```

Update the `pub use` line in `lib.rs` to also expose `solve_with_config`:

```rust
pub use solve::{solve, solve_with_config};
```

- [ ] **Step 1.4: Update the module-level docstring in `solve.rs`**

The current `solve.rs` docstring opens with:

```rust
//! Greedy first-fit timetable solver. Iterates lessons, hours, time blocks, rooms
//! in caller-provided order; commits the first candidate that satisfies every hard
//! constraint. ...
```

This is still accurate after Task 1 (no behaviour change). Leave the docstring as-is in this commit; Task 2 updates it to mention FFD.

- [ ] **Step 1.5: Run `cargo fmt`**

```bash
cargo fmt -p solver-core
```

Expected: no diff (or minimal diff if `use` ordering shifts).

- [ ] **Step 1.6: Run unit + integration tests**

```bash
cargo nextest run -p solver-core
```

Expected: every existing test passes without modification. The new `solve_with_config` is exercised transitively through `solve`, so `pub fn solve_with_config` does not need its own test in this commit (Task 2 adds one).

- [ ] **Step 1.7: Run clippy**

```bash
cargo clippy --workspace --all-targets -- -D warnings
```

Expected: no warnings. The leading underscore on `_config` should keep clippy quiet.

- [ ] **Step 1.8: Stage and commit**

```bash
git add solver/solver-core/src/types.rs solver/solver-core/src/lib.rs solver/solver-core/src/solve.rs
git commit -m "$(cat <<'EOF'
feat(solver-core): introduce SolveConfig and solve_with_config

Adds a `SolveConfig { deadline, seed, weights }` struct and an empty
`ConstraintWeights {}` placeholder, both with `Default` derived. The new
`solve_with_config` is the explicit entry point for callers that need to
pass tunables; `solve` becomes a one-line delegate that calls
`solve_with_config(problem, &SolveConfig::default())`.

No behaviour change: `solve_with_config`'s body is the prior `solve` body
verbatim. Existing tests pass without modification.

Sets up the active-sprint PRs 8 (Doppelstunden) and 9 (LAHC + soft
constraints), which extend the new struct rather than reshaping the
public API.
EOF
)"
```

The pre-commit hook runs `mise run lint`; the commit-msg hook runs `cog verify`. Both must pass.

---

## Task 2: Behavioural — FFD ordering, bench fixture cleanup, BASELINE refresh

**Goal:** Switch `solve_with_config` to use First Fit Decreasing lesson ordering. Drop the bench fixture workaround. Refresh `BASELINE.md`.

**Files:**
- Create: `solver/solver-core/src/ordering.rs`
- Create: `solver/solver-core/tests/ffd_solver_outcome.rs`
- Modify: `solver/solver-core/src/lib.rs` (add `mod ordering;`)
- Modify: `solver/solver-core/src/solve.rs` (call `ffd_order` from `solve_with_config`; update module docstring)
- Modify: `solver/solver-core/src/index.rs` (remove `#[cfg_attr(not(test), allow(dead_code))]` on `impl Indexed`)
- Modify: `solver/solver-core/benches/solver_fixtures.rs` (drop the `subject_order` workaround in `zweizuegig_fixture`; update the file-level docstring)
- Modify: `solver/CLAUDE.md` (replace the "Bench global-solve is sensitive…" paragraph with a one-line FFD-invariance note)
- Regenerate: `solver/solver-core/benches/BASELINE.md`

- [ ] **Step 2.1: Write the failing integration test (TDD red)**

Create `solver/solver-core/tests/ffd_solver_outcome.rs` with the contents below. The fixture is a 1-time-block, 2-room, 2-class, 2-lesson scenario where input-Vec order leaves one lesson unplaced; FFD ordering reverses the placement order so both lessons fit.

```rust
//! Integration test: FFD ordering changes the placement outcome on a fixture
//! that input-Vec order cannot solve. Lives in `tests/` (not inline) because
//! the assertion is at the public `solve` boundary, not at `ffd_order`.

use solver_core::{
    ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId},
    solve, solve_with_config,
    types::{
        Lesson, Problem, Room, RoomSubjectSuitability, SchoolClass, SolveConfig, Subject,
        Teacher, TeacherQualification, TimeBlock,
    },
};
use uuid::Uuid;

fn ffd_uuid(n: u8) -> Uuid {
    Uuid::from_bytes([n; 16])
}

/// 1 time block, 2 rooms (R_general suits all, R_special suits only SP), 2
/// classes, 2 lessons. Input Vec lists the more permissive SP lesson first;
/// greedy first-fit takes R_general for SP, leaving DE with no suitable
/// room. FFD orders DE (1 suitable room) before SP (2 suitable rooms), so DE
/// takes R_general and SP falls back to R_special.
fn pessimal_input_problem() -> Problem {
    Problem {
        time_blocks: vec![TimeBlock {
            id: TimeBlockId(ffd_uuid(10)),
            day_of_week: 0,
            position: 0,
        }],
        teachers: vec![
            Teacher {
                id: TeacherId(ffd_uuid(20)),
                max_hours_per_week: 5,
            },
            Teacher {
                id: TeacherId(ffd_uuid(21)),
                max_hours_per_week: 5,
            },
        ],
        rooms: vec![
            Room {
                id: RoomId(ffd_uuid(30)),
            },
            Room {
                id: RoomId(ffd_uuid(31)),
            },
        ],
        subjects: vec![
            Subject {
                id: SubjectId(ffd_uuid(40)),
            },
            Subject {
                id: SubjectId(ffd_uuid(41)),
            },
        ],
        school_classes: vec![
            SchoolClass {
                id: SchoolClassId(ffd_uuid(50)),
            },
            SchoolClass {
                id: SchoolClassId(ffd_uuid(51)),
            },
        ],
        lessons: vec![
            Lesson {
                id: LessonId(ffd_uuid(61)),
                school_class_id: SchoolClassId(ffd_uuid(51)),
                subject_id: SubjectId(ffd_uuid(41)),
                teacher_id: TeacherId(ffd_uuid(21)),
                hours_per_week: 1,
            },
            Lesson {
                id: LessonId(ffd_uuid(60)),
                school_class_id: SchoolClassId(ffd_uuid(50)),
                subject_id: SubjectId(ffd_uuid(40)),
                teacher_id: TeacherId(ffd_uuid(20)),
                hours_per_week: 1,
            },
        ],
        teacher_qualifications: vec![
            TeacherQualification {
                teacher_id: TeacherId(ffd_uuid(20)),
                subject_id: SubjectId(ffd_uuid(40)),
            },
            TeacherQualification {
                teacher_id: TeacherId(ffd_uuid(21)),
                subject_id: SubjectId(ffd_uuid(41)),
            },
        ],
        teacher_blocked_times: vec![],
        room_blocked_times: vec![],
        room_subject_suitabilities: vec![RoomSubjectSuitability {
            room_id: RoomId(ffd_uuid(31)),
            subject_id: SubjectId(ffd_uuid(41)),
        }],
    }
}

#[test]
fn ffd_solve_places_a_lesson_that_input_order_leaves_unplaced() {
    let problem = pessimal_input_problem();
    let solution = solve(&problem).expect("solve must not return Err");
    assert_eq!(solution.placements.len(), 2, "both lessons should place");
    assert!(
        solution.violations.is_empty(),
        "FFD should produce zero violations on this fixture"
    );
}

#[test]
fn ffd_solve_with_config_default_matches_solve() {
    let problem = pessimal_input_problem();
    let s_default = solve(&problem).expect("solve");
    let s_explicit = solve_with_config(&problem, &SolveConfig::default()).expect("solve_with_config");
    assert_eq!(s_default, s_explicit);
}
```

- [ ] **Step 2.2: Verify the test fails on the current code (TDD red gate)**

```bash
cargo nextest run -p solver-core --test ffd_solver_outcome
```

Expected output: `ffd_solve_places_a_lesson_that_input_order_leaves_unplaced` **fails** with a `placements.len()` of 1 (not 2) and a `violations.len()` of 1. The second test passes (both call paths agree even when both fail). If both tests pass on master, the fixture is wrong; revisit before writing the implementation.

- [ ] **Step 2.3: Create `ordering.rs` with `ffd_order` and inline unit tests**

Create `solver/solver-core/src/ordering.rs`:

```rust
//! First Fit Decreasing lesson ordering.
//!
//! Returns a permutation of `problem.lessons` indices in placement order.
//! Lessons are sorted by an eligibility metric (lower = more constrained =
//! placed first) computed once before placement begins; the metric is the
//! product of two counts:
//!
//! 1. Time blocks where the lesson's teacher is not blocked.
//! 2. Rooms suitable for the lesson's subject.
//!
//! Tiebreak is the lesson's `LessonId` byte order so two lessons with equal
//! eligibility keep a deterministic ordering across runs.
//!
//! Lessons whose teacher lacks the qualification for the subject fall to
//! eligibility `0` and sort first; the placement loop in `solve_with_config`
//! skips them and `pre_solve_violations` records each affected hour as a
//! `NoQualifiedTeacher` violation.

use crate::index::Indexed;
use crate::types::{Lesson, Problem};

/// Compute placement order under First Fit Decreasing. See module docs.
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

fn eligibility(lesson: &Lesson, problem: &Problem, idx: &Indexed) -> u32 {
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
    u32::try_from(free_blocks.saturating_mul(suitable_rooms)).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
    use crate::types::{
        Lesson, Problem, Room, RoomSubjectSuitability, SchoolClass, Subject, Teacher,
        TeacherBlockedTime, TeacherQualification, TimeBlock,
    };
    use uuid::Uuid;

    fn ord_uuid(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    fn two_blocks_two_rooms() -> Problem {
        Problem {
            time_blocks: vec![
                TimeBlock {
                    id: TimeBlockId(ord_uuid(10)),
                    day_of_week: 0,
                    position: 0,
                },
                TimeBlock {
                    id: TimeBlockId(ord_uuid(11)),
                    day_of_week: 0,
                    position: 1,
                },
            ],
            teachers: vec![
                Teacher {
                    id: TeacherId(ord_uuid(20)),
                    max_hours_per_week: 5,
                },
                Teacher {
                    id: TeacherId(ord_uuid(21)),
                    max_hours_per_week: 5,
                },
            ],
            rooms: vec![
                Room {
                    id: RoomId(ord_uuid(30)),
                },
                Room {
                    id: RoomId(ord_uuid(31)),
                },
            ],
            subjects: vec![
                Subject {
                    id: SubjectId(ord_uuid(40)),
                },
                Subject {
                    id: SubjectId(ord_uuid(41)),
                },
            ],
            school_classes: vec![
                SchoolClass {
                    id: SchoolClassId(ord_uuid(50)),
                },
                SchoolClass {
                    id: SchoolClassId(ord_uuid(51)),
                },
            ],
            lessons: vec![],
            teacher_qualifications: vec![
                TeacherQualification {
                    teacher_id: TeacherId(ord_uuid(20)),
                    subject_id: SubjectId(ord_uuid(40)),
                },
                TeacherQualification {
                    teacher_id: TeacherId(ord_uuid(21)),
                    subject_id: SubjectId(ord_uuid(41)),
                },
            ],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        }
    }

    #[test]
    fn ffd_order_places_low_eligibility_lesson_first() {
        let mut problem = two_blocks_two_rooms();
        // Lesson A: teacher 20 blocked in TB 10 -> 1 free block.
        // Lesson B: teacher 21 not blocked anywhere -> 2 free blocks.
        problem.teacher_blocked_times.push(TeacherBlockedTime {
            teacher_id: TeacherId(ord_uuid(20)),
            time_block_id: TimeBlockId(ord_uuid(10)),
        });
        problem.lessons.push(Lesson {
            id: LessonId(ord_uuid(70)),
            school_class_id: SchoolClassId(ord_uuid(50)),
            subject_id: SubjectId(ord_uuid(40)),
            teacher_id: TeacherId(ord_uuid(20)),
            hours_per_week: 1,
        });
        problem.lessons.push(Lesson {
            id: LessonId(ord_uuid(71)),
            school_class_id: SchoolClassId(ord_uuid(51)),
            subject_id: SubjectId(ord_uuid(41)),
            teacher_id: TeacherId(ord_uuid(21)),
            hours_per_week: 1,
        });
        let idx = Indexed::new(&problem);
        assert_eq!(ffd_order(&problem, &idx), vec![0, 1]);

        // Reversing input order does not change the FFD order.
        problem.lessons.swap(0, 1);
        let idx = Indexed::new(&problem);
        // Lesson A is now at index 1, B at index 0.
        assert_eq!(ffd_order(&problem, &idx), vec![1, 0]);
    }

    #[test]
    fn ffd_order_tiebreaks_on_lesson_id_when_eligibility_ties() {
        let mut problem = two_blocks_two_rooms();
        problem.lessons.push(Lesson {
            id: LessonId(ord_uuid(81)),
            school_class_id: SchoolClassId(ord_uuid(50)),
            subject_id: SubjectId(ord_uuid(40)),
            teacher_id: TeacherId(ord_uuid(20)),
            hours_per_week: 1,
        });
        problem.lessons.push(Lesson {
            id: LessonId(ord_uuid(80)),
            school_class_id: SchoolClassId(ord_uuid(51)),
            subject_id: SubjectId(ord_uuid(41)),
            teacher_id: TeacherId(ord_uuid(21)),
            hours_per_week: 1,
        });
        let idx = Indexed::new(&problem);
        // Both lessons have eligibility 2 * 2 = 4. Lower id (80) sorts first
        // even though it is at index 1 in the input Vec.
        assert_eq!(ffd_order(&problem, &idx), vec![1, 0]);
    }

    #[test]
    fn ffd_order_returns_every_index_exactly_once() {
        let mut problem = two_blocks_two_rooms();
        for k in 0..6u8 {
            problem.lessons.push(Lesson {
                id: LessonId(ord_uuid(90 + k)),
                school_class_id: SchoolClassId(ord_uuid(50)),
                subject_id: SubjectId(ord_uuid(40)),
                teacher_id: TeacherId(ord_uuid(20)),
                hours_per_week: 1,
            });
        }
        let idx = Indexed::new(&problem);
        let order = ffd_order(&problem, &idx);
        assert_eq!(order.len(), 6);
        let mut sorted = order.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted, vec![0, 1, 2, 3, 4, 5]);
        assert!(order.iter().all(|&i| i < 6));
    }

    #[test]
    fn ffd_order_lifts_unqualified_lesson_to_the_front() {
        // A lesson whose teacher is not qualified for the subject still has
        // free_blocks > 0 and suitable_rooms > 0, so its eligibility is
        // computed as if the placement could happen. The placement loop in
        // `solve_with_config` skips it; `pre_solve_violations` records the
        // `NoQualifiedTeacher` kind. The eligibility metric does not need to
        // gate on qualification; the test below simply confirms the metric
        // is monotonic in the underlying counts.
        let mut problem = two_blocks_two_rooms();
        // Teacher 20 is qualified for subject 40 (set in two_blocks_two_rooms).
        // Teacher 21 is qualified for subject 41 only; lesson C below ties
        // teacher 20 to subject 41 (no qualification) -> placement skipped at
        // solve time, but ffd_order treats it like any other lesson.
        problem.lessons.push(Lesson {
            id: LessonId(ord_uuid(95)),
            school_class_id: SchoolClassId(ord_uuid(50)),
            subject_id: SubjectId(ord_uuid(41)),
            teacher_id: TeacherId(ord_uuid(20)),
            hours_per_week: 1,
        });
        let idx = Indexed::new(&problem);
        let order = ffd_order(&problem, &idx);
        assert_eq!(order, vec![0]);
    }
}
```

- [ ] **Step 2.4: Wire `ordering` into `lib.rs` and `solve.rs`**

Open `solver/solver-core/src/lib.rs`. After the existing `pub mod` and `mod` lines, add:

```rust
mod ordering;
```

Position: alphabetical, between `mod index;` and `pub mod json;` (so the existing `pub(crate) mod index;` stays where it is and `mod ordering;` follows).

The full `lib.rs` after Task 2 should read:

```rust
//! solver-core — pure Rust solver logic. No Python, no PyO3.

#![deny(missing_docs)]

pub mod error;
pub mod ids;
pub(crate) mod index;
pub mod json;
mod ordering;
pub mod solve;
pub mod types;
pub mod validate;

pub use error::Error;
pub use ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
pub use json::{error_envelope_json, solve_json};
pub use solve::{solve, solve_with_config};
pub use types::{
    ConstraintWeights, Lesson, Placement, Problem, Room, RoomBlockedTime, RoomSubjectSuitability,
    SchoolClass, Solution, SolveConfig, Subject, Teacher, TeacherBlockedTime,
    TeacherQualification, TimeBlock, Violation, ViolationKind,
};
```

Open `solver/solver-core/src/solve.rs`. Update the module-level docstring at the top of the file:

```rust
//! First Fit Decreasing greedy timetable solver. Sorts lessons by
//! eligibility (most constrained first) via `ordering::ffd_order`, then
//! commits the first hard-constraint-satisfying (time block, room) for each
//! lesson-hour. Placement failures become typed violations
//! (`TeacherOverCapacity`, `NoFreeTimeBlock`, `NoSuitableRoom`) inside
//! `Solution`; `Err(Error::Input)` is reserved for structural input errors.
```

Then change the placement loop in `solve_with_config` from:

```rust
for lesson in &problem.lessons {
    if !idx.teacher_qualified(lesson.teacher_id, lesson.subject_id) {
        continue;
    }
    for hour_index in 0..lesson.hours_per_week {
        // existing try_place_hour + violation push
    }
}
```

to:

```rust
let order = crate::ordering::ffd_order(problem, &idx);
for &lesson_idx in &order {
    let lesson = &problem.lessons[lesson_idx];
    if !idx.teacher_qualified(lesson.teacher_id, lesson.subject_id) {
        continue;
    }
    for hour_index in 0..lesson.hours_per_week {
        // existing try_place_hour + violation push (unchanged)
    }
}
```

The body of `try_place_hour` and `unplaced_kind` does not change. The only edit inside `solve_with_config` is the loop driver (`for &lesson_idx in &order` instead of `for lesson in &problem.lessons`) and the `let lesson = ...` deref.

- [ ] **Step 2.5: Drop `#[cfg_attr(not(test), allow(dead_code))]` on `impl Indexed`**

Open `solver/solver-core/src/index.rs`. Find:

```rust
// Reason: these methods are consumed by `solve` in task 5; tests cover them
// already but the non-test build has no caller yet.
#[cfg_attr(not(test), allow(dead_code))]
impl Indexed {
```

Now that `ordering::ffd_order` calls `idx.teacher_blocked` and `idx.room_suits_subject` from non-test code (and `solve_with_config` was already calling the others), the attribute is obsolete. Remove both the comment and the `cfg_attr` line:

```rust
impl Indexed {
```

- [ ] **Step 2.6: Run cargo fmt + the unit tests for `ordering` + the integration test**

```bash
cargo fmt -p solver-core
cargo nextest run -p solver-core --lib ordering
cargo nextest run -p solver-core --test ffd_solver_outcome
```

Expected: every `ordering` unit test passes; both integration tests in `ffd_solver_outcome` now pass.

- [ ] **Step 2.7: Run the full solver-core test suite**

```bash
cargo nextest run -p solver-core
```

Expected: every existing test plus the new ones pass without modification. The existing `solve.rs` tests (`single_hour_places_into_first_slot_and_room`, `two_lessons_in_same_class_do_not_double_book_slot`, `no_free_time_block_when_class_slots_are_filled_blocks_second_lesson`, etc.) should all continue to pass because each fixture has a stable FFD order (single lesson, or unique-id tiebreak with predictable ordering).

If any existing test fails: pause, read the failure, and reconcile against the spec's "Tests" walkthrough. The fixture analysis in the spec covered every existing solve test; a failure points at a metric bug, not a brittle test.

- [ ] **Step 2.8: Drop the bench fixture's scarcity-first workaround**

Open `solver/solver-core/benches/solver_fixtures.rs`. Locate the `zweizuegig_fixture` function (the second of the two builders). Find this block:

```rust
    // Iterate subjects in scarcity-first order so the global greedy first-fit
    // can satisfy the cross-class specialist teachers (BEC, HOF, WIL, RIC)
    // before the per-class Klassenlehrer fills the early time blocks. With
    // the natural 0..9 order, RIC (4 b-classes, 20h) lands its hours late
    // in the schedule and runs out of slots that are also free for class 4b;
    // pushing specialist subjects first leaves the b-class Klassenlehrer to
    // fill whatever the specialists leave. The Python solvability test does
    // not hit this because it solves per-class via /api/classes/{id}/schedule;
    // the bench solves all 196 placements globally in one solve() call.
    let subject_order: [usize; 9] = [3, 6, 5, 7, 8, 4, 0, 1, 2];

    let mut lessons = Vec::new();
    let mut quals = Vec::new();
    let mut qual_set: HashSet<(TeacherId, SubjectId)> = HashSet::new();
    let mut lesson_idx: u8 = 0;
    for c_idx in 0..classes.len() {
        for &s_idx in &subject_order {
```

Replace the explanatory block + `subject_order` constant with the natural iteration:

```rust
    let mut lessons = Vec::new();
    let mut quals = Vec::new();
    let mut qual_set: HashSet<(TeacherId, SubjectId)> = HashSet::new();
    let mut lesson_idx: u8 = 0;
    for c_idx in 0..classes.len() {
        for s_idx in 0..subjects.len() {
```

The remainder of the loop body is unchanged. Verify: the loop now visits `(class_idx, subject_idx)` pairs in natural authoring order; FFD inside `solve_with_config` reorders at solve time.

Update the file-level docstring at the top of `solver_fixtures.rs`. The current text mentions the Python seed mirror but does not describe the workaround in the file-level docs (the comment is inline). The file-level docstring needs no change.

- [ ] **Step 2.9: Update `solver/CLAUDE.md`**

Open `solver/CLAUDE.md`. Find the bullet that begins:

```markdown
- **Bench global-solve is sensitive to lesson input order; Python solvability is not.** The bench calls `solve(&problem)` once for the whole school, which runs the MVP greedy first-fit in input-Vec order. ... Future solvers that sort internally (PR 7 FFD, PR 9 LAHC) will be invariant to this and can drop the workaround.
```

Replace the entire bullet (from `- **Bench global-solve…**` through the end of the paragraph that ends `…can drop the workaround.`) with:

```markdown
- **FFD is invariant to lesson input order.** Both bench fixtures iterate subjects in the natural authoring order; `ordering::ffd_order` inside `solve_with_config` sorts lessons by eligibility before placement so the global solve succeeds regardless of input permutation.
```

- [ ] **Step 2.10: Run the full lint pass and the full test suite**

```bash
mise run lint
mise run test:rust
```

Expected: all pass. If the pre-commit hook also runs lint at commit time, this gate is duplicate but cheap and surfaces issues earlier.

- [ ] **Step 2.11: Run the bench locally and refresh `BASELINE.md`**

```bash
mise run bench
```

Expected: criterion produces two rows (grundschule, zweizuegig), both with zero violations. If the bench panics on `assert!(solution.violations.is_empty())`, FFD did not solve `zweizuegig` cleanly and the eligibility metric needs revision; in that case stop and revisit Step 2.3 before continuing.

If the bench passes, refresh the committed baseline:

```bash
mise run bench:record
```

Expected: `solver/solver-core/benches/BASELINE.md` is rewritten with the new numbers and the new "Refreshed YYYY-MM-DD on …" footer. The `Soft score` column stays at `0` (LAHC not yet shipped).

If the p50 deltas are within 20% of the prior committed values (45 µs grundschule, 172 µs zweizuegig), the commit message can simply note the refresh. If a delta exceeds 20%, write a short paragraph in the commit message explaining the surprise.

- [ ] **Step 2.12: Stage and commit**

```bash
git add solver/solver-core/src/ordering.rs solver/solver-core/src/lib.rs solver/solver-core/src/solve.rs solver/solver-core/src/index.rs solver/solver-core/tests/ffd_solver_outcome.rs solver/solver-core/benches/solver_fixtures.rs solver/solver-core/benches/BASELINE.md solver/CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(solver-core): FFD lesson ordering inside solve_with_config

Adds `ordering::ffd_order(problem, idx) -> Vec<usize>` and calls it from
`solve_with_config` so every solver run starts with First Fit Decreasing
order. Eligibility is the product of free teacher time-blocks and rooms
suitable for the subject; tiebreak on `LessonId` byte order keeps the
permutation deterministic.

Drops the manual scarcity-first `subject_order` workaround in the
zweizuegig bench fixture and the matching `solver/CLAUDE.md` paragraph;
FFD is invariant to lesson input order so the workaround is no longer
load-bearing.

Refreshes `solver/solver-core/benches/BASELINE.md` with the new
ordering-aware numbers; the precompute + sort adds a few microseconds
per solve, well inside the sprint's 20% budget.
EOF
)"
```

The pre-commit hook re-runs lint; the commit-msg hook runs `cog verify`.

---

## Task 3: Docs — ADR 0014 + index + OPEN_THINGS update

**Goal:** Capture the load-bearing API decision in an ADR and update the active-sprint tracker.

**Files:**
- Create: `docs/adr/0014-solve-config-and-ffd-ordering.md`
- Modify: `docs/adr/README.md` (index)
- Modify: `docs/superpowers/OPEN_THINGS.md` (mark item 7 shipped)

- [ ] **Step 3.1: Write ADR 0014**

Create `docs/adr/0014-solve-config-and-ffd-ordering.md`:

```markdown
# 0014: SolveConfig API and FFD ordering

- **Status:** Accepted
- **Date:** 2026-04-26

## Context

The active "solver quality + tidy" sprint planned three algorithm-phase PRs (FFD ordering, Doppelstunden, LAHC + soft constraints). All three need a way to pass tunables (`weights`, `seed`, `deadline`) into `solve` without breaking every existing call site, and the latter two need a deterministic, eligibility-aware lesson order to build on. Without a configuration carrier, each PR would either grow `solve`'s positional argument list or wrap a parallel entry point; without FFD, the bench fixtures keep relying on the scarcity-first `subject_order` workaround documented in `solver/CLAUDE.md`.

## Decision

Introduce `pub struct SolveConfig { deadline: Option<Duration>, seed: u64, weights: ConstraintWeights }` and an empty `pub struct ConstraintWeights {}` placeholder, both deriving `Default`. Add `pub fn solve_with_config(problem: &Problem, config: &SolveConfig) -> Result<Solution, Error>`. Reduce `solve(&Problem)` to a delegate over `solve_with_config(p, &SolveConfig::default())`.

Inside `solve_with_config`, sort lessons via `ordering::ffd_order(problem, idx) -> Vec<usize>`. Eligibility is the product of (count of time blocks where the lesson's teacher is not blocked) and (count of rooms suitable for the lesson's subject). Tiebreak on `LessonId` byte order. FFD is unconditional; there is no flag to disable it.

## Alternatives considered

- **Keep `solve` input-Vec ordered; add a parallel `solve_with_config` that runs FFD.** Rejected: two code paths, two mental models, and the bench fixture's workaround stays load-bearing for one of them.
- **archive/v2's `(eligible_slots, eligible_rooms, teacher_max)` tuple metric.** Rejected: the tertiary key buys nothing without per-class availability data, and the secondary key relies on room capacity that the current schema does not model.
- **Live MRV (recompute eligibility per step).** Rejected for this PR: appropriate for the local-search PR (LAHC), where the marginal cost is amortised against the swap budget; overkill for the construction phase.
- **Forgo the ADR.** Rejected: `SolveConfig` is the API surface for two more sprint PRs; documenting the constraints now keeps future contributors from re-litigating them.

## Consequences

The bench fixture's scarcity-first workaround retires. The API gains forward-compat: PR 8 (Doppelstunden) and PR 9 (LAHC + soft constraints) extend `SolveConfig` and `ConstraintWeights` without touching existing callers. `BASELINE.md` updates with FFD-aware numbers; the regression budget is unchanged. We would revisit if FFD's coarse metric proves inadequate on a fixture (e.g., the deferred `demo_gesamtschule`); the next refinement would be the v2-style tuple metric or a live MRV pass.
```

- [ ] **Step 3.2: Index ADR 0014 in `docs/adr/README.md`**

Open `docs/adr/README.md`. Find the index table; the last row is `0013`. Append a new row:

```markdown
| 0014 | [SolveConfig API and FFD ordering](0014-solve-config-and-ffd-ordering.md) | Accepted |
```

The full table should now end with that line.

- [ ] **Step 3.3: Update `docs/superpowers/OPEN_THINGS.md`**

Open `docs/superpowers/OPEN_THINGS.md`. Find the active-sprint algorithm-phase item 7:

```markdown
7. **FFD ordering + `SolveConfig` struct.** `[P0]` Sort lessons by eligibility count (slots × rooms × subject/qualification filters) most-constrained first, stable tiebreak on `lesson.id` for determinism. ...
```

Replace the entire item 7 block (from the bold `**FFD ordering + ...**` through the end of the paragraph that names PRs 8 and 9) with:

```markdown
7. **FFD ordering + `SolveConfig` struct.** `[P0]` ✅ Shipped 2026-04-26. PR `feat/ffd-solve-config`: introduces `pub struct SolveConfig { deadline, seed, weights }` and `pub struct ConstraintWeights {}` (both `Default`-derived), plus `pub fn solve_with_config`. `solve` becomes a one-line delegate over `solve_with_config(p, &SolveConfig::default())`. Adds `solver-core/src/ordering.rs` with `ffd_order(problem, idx) -> Vec<usize>` (eligibility = free-teacher-blocks × suitable-rooms; tiebreak on `LessonId` byte order). Drops the scarcity-first workaround in the zweizuegig bench fixture and the matching paragraph in `solver/CLAUDE.md`; `BASELINE.md` refreshed. ADR 0014 records the API decision. Sprint PR 9 (LAHC + soft constraints) becomes the next P0; PR 8 (Doppelstunden) stays P2.
```

- [ ] **Step 3.4: Stage and commit**

```bash
git add docs/adr/0014-solve-config-and-ffd-ordering.md docs/adr/README.md docs/superpowers/OPEN_THINGS.md
git commit -m "$(cat <<'EOF'
docs: ADR 0014 SolveConfig API and FFD ordering

Records the load-bearing API decision (`SolveConfig`, `solve_with_config`,
unconditional FFD ordering with the free-blocks × suitable-rooms metric
plus `LessonId` tiebreak), the alternatives weighed (parallel solve
entry point, v2 tuple metric, live MRV), and the forward-compat
expectation that PRs 8 and 9 extend the new structs without breaking
callers.

Indexes the ADR in `docs/adr/README.md`; marks active-sprint
algorithm-phase item 7 shipped in `docs/superpowers/OPEN_THINGS.md` and
nudges item 9 (LAHC) as the next P0.
EOF
)"
```

---

## Self-review (run after writing)

**Spec coverage check:**

| Spec section | Tasks |
| --- | --- |
| `SolveConfig` and `ConstraintWeights` (struct, defaults, doc comments) | Task 1, Step 1.1 |
| `lib.rs` re-exports | Task 1, Step 1.2; Task 2, Step 2.4 |
| `solve` becomes delegate; `solve_with_config` is new public | Task 1, Step 1.3 |
| `ordering.rs` (`ffd_order`, eligibility metric, tiebreak) | Task 2, Step 2.3 |
| Inline unit tests on FFD invariants | Task 2, Step 2.3 (tests inside `ordering.rs`) |
| Integration test asserting FFD changes outcome | Task 2, Steps 2.1, 2.2 |
| `solve_with_config` calls `ffd_order` | Task 2, Step 2.4 |
| Drop bench fixture workaround | Task 2, Step 2.8 |
| Update `solver/CLAUDE.md` | Task 2, Step 2.9 |
| Refresh `BASELINE.md` | Task 2, Step 2.11 |
| Drop `cfg_attr(not(test), allow(dead_code))` on `Indexed` | Task 2, Step 2.5 |
| ADR 0014 + index | Task 3, Steps 3.1, 3.2 |
| OPEN_THINGS update | Task 3, Step 3.3 |
| Auto-memory roadmap update | Out of scope (lives in `/autopilot` step 6) |

**Type / signature consistency:**

- `SolveConfig` shape and field names match between Step 1.1, ADR 0014, and the spec.
- `ffd_order(problem: &Problem, idx: &Indexed) -> Vec<usize>` signature matches between Step 2.3 (definition) and Step 2.4 (call site).
- `LessonId.0` access matches the `LessonId(pub Uuid)` newtype.
- The pessimal-input fixture in Step 2.1 produces the `placements.len() == 1, violations.len() == 1` outcome under input-Vec order and the `placements.len() == 2` outcome under FFD; the eligibility math is in the spec.

**Placeholder scan:** none of "TBD", "TODO", "implement later", or "fill in details" appear in this plan.
