# solver-core MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `reverse_chars` stub in `solver/solver-core` with a pure-Rust greedy first-fit timetable solver, exposed as `solve(&Problem) -> Result<Solution, Error>` and `solve_json(&str) -> Result<String, Error>`.

**Architecture:** Typed serde structs mirror the backend's SQL join tables (flat `Vec`s of relation pairs); a private `Indexed` struct builds O(1) constraint lookups once at the top of `solve`; the algorithm iterates lessons, hours, time blocks, rooms in caller-provided order, committing the first `(time_block, room)` pair that satisfies every hard constraint, and records `UnplacedLesson` / `NoQualifiedTeacher` violations inside `Solution` rather than erroring out. `Err(Error::Input)` stays reserved for structural input errors.

**Tech Stack:** Rust 1.85, serde 1 (derive), serde_json 1, thiserror 2, uuid 1 (serde + v4), proptest 1 (dev).

**Spec:** `docs/superpowers/specs/2026-04-22-solver-core-mvp-design.md`.

---

## File Structure

### Files created

- `solver/solver-core/src/error.rs` — `pub enum Error { Input(String) }` with `thiserror` derive and `#[non_exhaustive]`.
- `solver/solver-core/src/ids.rs` — six newtype IDs (`LessonId`, `TeacherId`, `RoomId`, `TimeBlockId`, `SubjectId`, `SchoolClassId`) wrapping `uuid::Uuid` with `#[serde(transparent)]`.
- `solver/solver-core/src/types.rs` — `Problem`, `Solution`, `Placement`, `Violation`, `ViolationKind`, and the entity + relation structs.
- `solver/solver-core/src/validate.rs` — `validate_structural(&Problem) -> Result<(), Error>` and `pre_solve_violations(&Problem) -> Vec<Violation>`.
- `solver/solver-core/src/index.rs` — private `Indexed` struct with four lookup predicates.
- `solver/solver-core/src/solve.rs` — `pub fn solve(&Problem) -> Result<Solution, Error>`.
- `solver/solver-core/src/json.rs` — `pub fn solve_json(&str) -> Result<String, Error>` + `Error::Input` wire envelope.
- `solver/solver-core/tests/common/mod.rs` — shared test fixture builders used by integration/property tests.
- `solver/solver-core/tests/properties.rs` — proptest invariants.
- `solver/solver-core/tests/grundschule_smoke.rs` — realistic Grundschule-shaped integration test.

### Files modified

- `Cargo.toml` (repo root) — add four new `[workspace.dependencies]` entries.
- `solver/solver-core/Cargo.toml` — inherit the four new deps with `{ workspace = true }`.
- `solver/solver-core/src/lib.rs` — replace stub-only contents with module declarations and `pub use`s; keep `reverse_chars` + its inline tests until step 2 of the sprint.
- `solver/CLAUDE.md` — remove the `Error::Infeasible` variant from the illustrative code block to match the new `Error` enum.
- `docs/superpowers/OPEN_THINGS.md` — strike the completed bullets, add the Backlog follow-up.

### Files untouched

- `solver/solver-py/` — every file. The PyO3 binding still exposes `reverse_chars` only; step 2 adds the real `solve_json` wrapper.
- `backend/`, `frontend/`, `scripts/`.

---

## Task 1: Workspace deps, error type, and newtype IDs

**Files:**
- Modify: `Cargo.toml` (root)
- Modify: `solver/solver-core/Cargo.toml`
- Create: `solver/solver-core/src/error.rs`
- Create: `solver/solver-core/src/ids.rs`
- Modify: `solver/solver-core/src/lib.rs`

Deps and first consumers land together so `cargo machete` has something to bind to and the pre-commit hook passes on the first commit. Hooks are never bypassed.

- [ ] **Step 1: Extend the workspace `[workspace.dependencies]` table**

Open `Cargo.toml` and add the four deps so the block reads:

```toml
[workspace]
resolver = "2"
members = ["solver/solver-core", "solver/solver-py"]

[workspace.package]
edition      = "2021"
rust-version = "1.85"

[workspace.dependencies]
proptest = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
uuid = { version = "1", features = ["serde", "v4"] }
```

- [ ] **Step 2: Inherit the deps in `solver-core`**

Rewrite `solver/solver-core/Cargo.toml`:

```toml
[package]
name         = "solver-core"
version      = "0.1.0"
publish      = false
edition.workspace      = true
rust-version.workspace = true

[lib]
# default rlib

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
uuid = { workspace = true }

[dev-dependencies]
proptest = { workspace = true }
```

- [ ] **Step 3: Write `ids.rs`**

Create `solver/solver-core/src/ids.rs`:

```rust
//! Newtype wrappers around `uuid::Uuid` for each solver entity. Newtypes prevent
//! ID-category confusion at compile time (passing a `TeacherId` where a `RoomId`
//! is expected becomes a type error).

use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! define_id {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub Uuid);

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }
    };
}

define_id!(LessonId);
define_id!(TeacherId);
define_id!(RoomId);
define_id!(TimeBlockId);
define_id!(SubjectId);
define_id!(SchoolClassId);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_round_trips_as_plain_string_in_json() {
        let id = LessonId(Uuid::nil());
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "\"00000000-0000-0000-0000-000000000000\"");
        let parsed: LessonId = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, id);
    }

    #[test]
    fn id_categories_are_distinct_types() {
        // This test compiles only if LessonId and TeacherId are distinct types.
        // If the macro ever collapses them (e.g. into a single alias), the two
        // `fn` signatures below would collide — which is exactly the property
        // we want to lock in.
        fn takes_lesson_id(_: LessonId) {}
        fn takes_teacher_id(_: TeacherId) {}
        takes_lesson_id(LessonId(Uuid::nil()));
        takes_teacher_id(TeacherId(Uuid::nil()));
    }
}
```

- [ ] **Step 4: Write `error.rs`**

Create `solver/solver-core/src/error.rs`:

```rust
//! Error type for `solver-core`. Placement failures are not errors; they become
//! `Violation` entries inside `Solution`. `Error` is reserved for structural
//! problems in the input.

use thiserror::Error;

#[derive(Debug, Error)]
#[non_exhaustive]
pub enum Error {
    #[error("input: {0}")]
    Input(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_error_displays_with_prefix() {
        let e = Error::Input("missing time blocks".to_string());
        assert_eq!(format!("{e}"), "input: missing time blocks");
    }
}
```

- [ ] **Step 5: Wire both modules into `lib.rs`**

Rewrite `solver/solver-core/src/lib.rs`:

```rust
//! solver-core — pure Rust solver logic. No Python, no PyO3.

#![deny(missing_docs)]

pub mod error;
pub mod ids;

pub use error::Error;
pub use ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};

/// Reverse the characters in a string. Legacy stub; removed in sprint step 2 when
/// `solve_json` replaces it as the `solver-py` entrypoint.
pub fn reverse_chars(s: &str) -> String {
    s.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reverses_hello() {
        assert_eq!(reverse_chars("hello"), "olleh");
    }

    #[test]
    fn reverses_empty() {
        assert_eq!(reverse_chars(""), "");
    }

    #[test]
    fn reverses_unicode() {
        assert_eq!(reverse_chars("äöü"), "üöä");
    }
}
```

- [ ] **Step 6: Run the new tests**

Run: `cargo nextest run -p solver-core`
Expected: all four old `reverse_chars` tests plus the three new id/error tests pass.

- [ ] **Step 7: Verify lint is clean**

Run: `mise run lint`
Expected: clean. `cargo machete` is satisfied because `serde`, `thiserror`, `uuid` are all imported by the new modules. `serde_json` is only used in tests at this task, so `cargo machete` may treat it as a dev-only candidate; if it flags, move `serde_json` to `[dev-dependencies]` in `solver-core/Cargo.toml` for now and promote it back to `[dependencies]` in task 6 when `json.rs` uses it at runtime.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml solver/solver-core/Cargo.toml solver/solver-core/src/error.rs solver/solver-core/src/ids.rs solver/solver-core/src/lib.rs
git commit -m "build(solver-core): add solver deps and scaffold error + ids modules"
```

---

## Task 2: Problem, Solution, and Violation types

**Files:**
- Create: `solver/solver-core/src/types.rs`
- Modify: `solver/solver-core/src/lib.rs`

- [ ] **Step 1: Write `types.rs` with derives and a failing round-trip test**

Create `solver/solver-core/src/types.rs`. The file is medium-sized; write it in full here so nothing is ambiguous:

```rust
//! Public data types for `solver-core`. Field names match the backend's SQL
//! join-table columns; wire format is JSON with snake_case fields.

use serde::{Deserialize, Serialize};

use crate::ids::{
    LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Problem {
    pub time_blocks: Vec<TimeBlock>,
    pub teachers: Vec<Teacher>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub school_classes: Vec<SchoolClass>,
    pub lessons: Vec<Lesson>,
    pub teacher_qualifications: Vec<TeacherQualification>,
    pub teacher_blocked_times: Vec<TeacherBlockedTime>,
    pub room_blocked_times: Vec<RoomBlockedTime>,
    pub room_subject_suitabilities: Vec<RoomSubjectSuitability>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TimeBlock {
    pub id: TimeBlockId,
    pub day_of_week: u8,
    pub position: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Teacher {
    pub id: TeacherId,
    pub max_hours_per_week: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Room {
    pub id: RoomId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Subject {
    pub id: SubjectId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SchoolClass {
    pub id: SchoolClassId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lesson {
    pub id: LessonId,
    pub school_class_id: SchoolClassId,
    pub subject_id: SubjectId,
    pub teacher_id: TeacherId,
    pub hours_per_week: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeacherQualification {
    pub teacher_id: TeacherId,
    pub subject_id: SubjectId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeacherBlockedTime {
    pub teacher_id: TeacherId,
    pub time_block_id: TimeBlockId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoomBlockedTime {
    pub room_id: RoomId,
    pub time_block_id: TimeBlockId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoomSubjectSuitability {
    pub room_id: RoomId,
    pub subject_id: SubjectId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Solution {
    pub placements: Vec<Placement>,
    pub violations: Vec<Violation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Placement {
    pub lesson_id: LessonId,
    pub time_block_id: TimeBlockId,
    pub room_id: RoomId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Violation {
    pub kind: ViolationKind,
    pub lesson_id: LessonId,
    pub hour_index: u8,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViolationKind {
    NoQualifiedTeacher,
    UnplacedLesson,
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn lesson_id() -> LessonId {
        LessonId(Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap())
    }

    #[test]
    fn problem_round_trips_through_json() {
        let original = Problem {
            time_blocks: vec![],
            teachers: vec![],
            rooms: vec![],
            subjects: vec![],
            school_classes: vec![],
            lessons: vec![],
            teacher_qualifications: vec![],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        let json = serde_json::to_string(&original).unwrap();
        let parsed: Problem = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, original);
    }

    #[test]
    fn violation_kind_serialises_in_snake_case() {
        assert_eq!(
            serde_json::to_string(&ViolationKind::NoQualifiedTeacher).unwrap(),
            "\"no_qualified_teacher\""
        );
        assert_eq!(
            serde_json::to_string(&ViolationKind::UnplacedLesson).unwrap(),
            "\"unplaced_lesson\""
        );
    }

    #[test]
    fn lesson_rejects_unknown_preferred_block_size_field() {
        let json = format!(
            r#"{{"id":"{}","school_class_id":"{}","subject_id":"{}","teacher_id":"{}","hours_per_week":1,"preferred_block_size":2}}"#,
            Uuid::nil(), Uuid::nil(), Uuid::nil(), Uuid::nil()
        );
        let err = serde_json::from_str::<Lesson>(&json).unwrap_err();
        assert!(
            err.to_string().contains("preferred_block_size"),
            "error should name the unknown field: {err}"
        );
    }

    #[test]
    fn solution_round_trips_with_placements_and_violations() {
        let solution = Solution {
            placements: vec![Placement {
                lesson_id: lesson_id(),
                time_block_id: TimeBlockId(Uuid::nil()),
                room_id: RoomId(Uuid::nil()),
            }],
            violations: vec![Violation {
                kind: ViolationKind::UnplacedLesson,
                lesson_id: lesson_id(),
                hour_index: 0,
                message: "teacher busy".to_string(),
            }],
        };
        let json = serde_json::to_string(&solution).unwrap();
        let parsed: Solution = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, solution);
    }
}
```

- [ ] **Step 2: Register the module in `lib.rs`**

Add `pub mod types;` and a `pub use` for the main types:

```rust
pub mod error;
pub mod ids;
pub mod types;

pub use error::Error;
pub use ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
pub use types::{
    Lesson, Placement, Problem, Room, RoomBlockedTime, RoomSubjectSuitability, SchoolClass,
    Solution, Subject, Teacher, TeacherBlockedTime, TeacherQualification, TimeBlock, Violation,
    ViolationKind,
};
```

- [ ] **Step 3: Run the tests**

Run: `cargo nextest run -p solver-core`
Expected: four `types.rs` tests plus all prior tests pass.

- [ ] **Step 4: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add solver/solver-core/src/types.rs solver/solver-core/src/lib.rs
git commit -m "feat(solver-core): add problem/solution/violation types"
```

---

## Task 3: Structural validation and pre-solve qualification check

**Files:**
- Create: `solver/solver-core/src/validate.rs`
- Modify: `solver/solver-core/src/lib.rs`

- [ ] **Step 1: Write `validate.rs` with TDD tests and implementation**

Create `solver/solver-core/src/validate.rs`:

```rust
//! Structural validation and the pre-solve cross-entity check.
//!
//! `validate_structural` returns `Err(Error::Input)` on malformed input (unknown
//! references, duplicate IDs, `hours_per_week == 0`, empty `time_blocks` or
//! `rooms`). `pre_solve_violations` takes a structurally-valid `Problem` and
//! emits `NoQualifiedTeacher` violations for every lesson whose teacher lacks
//! the subject qualification.

use std::collections::HashSet;

use crate::error::Error;
use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
use crate::types::{Problem, Violation, ViolationKind};

pub fn validate_structural(problem: &Problem) -> Result<(), Error> {
    if problem.time_blocks.is_empty() {
        return Err(Error::Input("problem has no time_blocks".into()));
    }
    if problem.rooms.is_empty() {
        return Err(Error::Input("problem has no rooms".into()));
    }

    let time_block_ids: HashSet<TimeBlockId> = collect_unique(problem.time_blocks.iter().map(|tb| tb.id), "time_blocks")?;
    let teacher_ids: HashSet<TeacherId> = collect_unique(problem.teachers.iter().map(|t| t.id), "teachers")?;
    let room_ids: HashSet<RoomId> = collect_unique(problem.rooms.iter().map(|r| r.id), "rooms")?;
    let subject_ids: HashSet<SubjectId> = collect_unique(problem.subjects.iter().map(|s| s.id), "subjects")?;
    let class_ids: HashSet<SchoolClassId> = collect_unique(problem.school_classes.iter().map(|c| c.id), "school_classes")?;
    let _lesson_ids: HashSet<LessonId> = collect_unique(problem.lessons.iter().map(|l| l.id), "lessons")?;

    for lesson in &problem.lessons {
        if lesson.hours_per_week == 0 {
            return Err(Error::Input(format!("lesson {} has hours_per_week = 0", lesson.id.0)));
        }
        if !teacher_ids.contains(&lesson.teacher_id) {
            return Err(Error::Input(format!(
                "lesson {} references unknown teacher {}",
                lesson.id.0, lesson.teacher_id.0
            )));
        }
        if !subject_ids.contains(&lesson.subject_id) {
            return Err(Error::Input(format!(
                "lesson {} references unknown subject {}",
                lesson.id.0, lesson.subject_id.0
            )));
        }
        if !class_ids.contains(&lesson.school_class_id) {
            return Err(Error::Input(format!(
                "lesson {} references unknown school_class {}",
                lesson.id.0, lesson.school_class_id.0
            )));
        }
    }
    for q in &problem.teacher_qualifications {
        if !teacher_ids.contains(&q.teacher_id) {
            return Err(Error::Input(format!("teacher_qualification references unknown teacher {}", q.teacher_id.0)));
        }
        if !subject_ids.contains(&q.subject_id) {
            return Err(Error::Input(format!("teacher_qualification references unknown subject {}", q.subject_id.0)));
        }
    }
    for b in &problem.teacher_blocked_times {
        if !teacher_ids.contains(&b.teacher_id) {
            return Err(Error::Input(format!("teacher_blocked_time references unknown teacher {}", b.teacher_id.0)));
        }
        if !time_block_ids.contains(&b.time_block_id) {
            return Err(Error::Input(format!("teacher_blocked_time references unknown time_block {}", b.time_block_id.0)));
        }
    }
    for b in &problem.room_blocked_times {
        if !room_ids.contains(&b.room_id) {
            return Err(Error::Input(format!("room_blocked_time references unknown room {}", b.room_id.0)));
        }
        if !time_block_ids.contains(&b.time_block_id) {
            return Err(Error::Input(format!("room_blocked_time references unknown time_block {}", b.time_block_id.0)));
        }
    }
    for s in &problem.room_subject_suitabilities {
        if !room_ids.contains(&s.room_id) {
            return Err(Error::Input(format!("room_subject_suitability references unknown room {}", s.room_id.0)));
        }
        if !subject_ids.contains(&s.subject_id) {
            return Err(Error::Input(format!("room_subject_suitability references unknown subject {}", s.subject_id.0)));
        }
    }
    Ok(())
}

fn collect_unique<Id, I>(iter: I, kind: &'static str) -> Result<HashSet<Id>, Error>
where
    Id: std::hash::Hash + Eq + Copy + std::fmt::Display,
    I: IntoIterator<Item = Id>,
{
    let mut set = HashSet::new();
    for id in iter {
        if !set.insert(id) {
            return Err(Error::Input(format!("duplicate id {id} in {kind}")));
        }
    }
    Ok(set)
}

pub fn pre_solve_violations(problem: &Problem) -> Vec<Violation> {
    let mut qualified: HashSet<(TeacherId, SubjectId)> = HashSet::new();
    for q in &problem.teacher_qualifications {
        qualified.insert((q.teacher_id, q.subject_id));
    }

    let mut out = Vec::new();
    for lesson in &problem.lessons {
        if qualified.contains(&(lesson.teacher_id, lesson.subject_id)) {
            continue;
        }
        for hour_index in 0..lesson.hours_per_week {
            out.push(Violation {
                kind: ViolationKind::NoQualifiedTeacher,
                lesson_id: lesson.id,
                hour_index,
                message: format!(
                    "teacher {} is not qualified for subject {}",
                    lesson.teacher_id.0, lesson.subject_id.0
                ),
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        Lesson, Problem, Room, RoomSubjectSuitability, SchoolClass, Subject, Teacher,
        TeacherQualification, TimeBlock,
    };
    use uuid::Uuid;

    fn uuid(n: u8) -> Uuid {
        Uuid::from_bytes([n; 16])
    }

    fn minimal_problem() -> Problem {
        let tb = TimeBlock { id: TimeBlockId(uuid(1)), day_of_week: 0, position: 0 };
        let teacher = Teacher { id: TeacherId(uuid(2)), max_hours_per_week: 10 };
        let room = Room { id: RoomId(uuid(3)) };
        let subject = Subject { id: SubjectId(uuid(4)) };
        let class = SchoolClass { id: SchoolClassId(uuid(5)) };
        let lesson = Lesson {
            id: LessonId(uuid(6)),
            school_class_id: class.id,
            subject_id: subject.id,
            teacher_id: teacher.id,
            hours_per_week: 1,
        };
        Problem {
            time_blocks: vec![tb],
            teachers: vec![teacher],
            rooms: vec![room],
            subjects: vec![subject],
            school_classes: vec![class],
            lessons: vec![lesson],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: TeacherId(uuid(2)),
                subject_id: SubjectId(uuid(4)),
            }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        }
    }

    #[test]
    fn minimal_problem_is_structurally_valid() {
        validate_structural(&minimal_problem()).unwrap();
    }

    #[test]
    fn empty_time_blocks_is_input_error() {
        let mut p = minimal_problem();
        p.time_blocks.clear();
        let err = validate_structural(&p).unwrap_err();
        assert!(matches!(err, Error::Input(msg) if msg.contains("time_blocks")));
    }

    #[test]
    fn empty_rooms_is_input_error() {
        let mut p = minimal_problem();
        p.rooms.clear();
        let err = validate_structural(&p).unwrap_err();
        assert!(matches!(err, Error::Input(msg) if msg.contains("rooms")));
    }

    #[test]
    fn duplicate_teacher_id_is_input_error() {
        let mut p = minimal_problem();
        p.teachers.push(p.teachers[0].clone());
        let err = validate_structural(&p).unwrap_err();
        assert!(matches!(err, Error::Input(msg) if msg.contains("duplicate id")));
    }

    #[test]
    fn lesson_with_zero_hours_is_input_error() {
        let mut p = minimal_problem();
        p.lessons[0].hours_per_week = 0;
        let err = validate_structural(&p).unwrap_err();
        assert!(matches!(err, Error::Input(msg) if msg.contains("hours_per_week")));
    }

    #[test]
    fn unknown_teacher_ref_is_input_error() {
        let mut p = minimal_problem();
        p.lessons[0].teacher_id = TeacherId(uuid(99));
        let err = validate_structural(&p).unwrap_err();
        assert!(matches!(err, Error::Input(msg) if msg.contains("unknown teacher")));
    }

    #[test]
    fn unknown_room_suitability_ref_is_input_error() {
        let mut p = minimal_problem();
        p.room_subject_suitabilities.push(RoomSubjectSuitability {
            room_id: RoomId(uuid(99)),
            subject_id: SubjectId(uuid(4)),
        });
        let err = validate_structural(&p).unwrap_err();
        assert!(matches!(err, Error::Input(msg) if msg.contains("unknown room")));
    }

    #[test]
    fn pre_solve_emits_no_violations_when_all_teachers_qualified() {
        let violations = pre_solve_violations(&minimal_problem());
        assert!(violations.is_empty());
    }

    #[test]
    fn pre_solve_emits_violations_per_hour_for_unqualified_teacher() {
        let mut p = minimal_problem();
        p.teacher_qualifications.clear();
        p.lessons[0].hours_per_week = 3;
        let violations = pre_solve_violations(&p);
        assert_eq!(violations.len(), 3);
        assert!(violations.iter().all(|v| v.kind == ViolationKind::NoQualifiedTeacher));
        assert_eq!(
            violations.iter().map(|v| v.hour_index).collect::<Vec<_>>(),
            vec![0, 1, 2]
        );
    }
}
```

- [ ] **Step 2: Register the module**

In `solver/solver-core/src/lib.rs`, add:

```rust
pub mod validate;
```

No `pub use` — `validate_structural` and `pre_solve_violations` are called from `solve`, which will live in its own module; external callers go through `solve`.

- [ ] **Step 3: Run the tests**

Run: `cargo nextest run -p solver-core`
Expected: the nine new validation tests plus all prior tests pass.

- [ ] **Step 4: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add solver/solver-core/src/validate.rs solver/solver-core/src/lib.rs
git commit -m "feat(solver-core): add structural validation and no-qualified-teacher pre-check"
```

---

## Task 4: Indexed lookup tables

**Files:**
- Create: `solver/solver-core/src/index.rs`
- Modify: `solver/solver-core/src/lib.rs`

- [ ] **Step 1: Write `index.rs`**

Create `solver/solver-core/src/index.rs`. Module is `pub(crate)` because it is an internal detail, not part of the public API:

```rust
//! Private index of `Problem` relations. Built once at the top of `solve`.
//! Each predicate is an O(1) hashmap / hashset probe.

use std::collections::{HashMap, HashSet};

use crate::ids::{RoomId, SubjectId, TeacherId, TimeBlockId};
use crate::types::Problem;

pub(crate) struct Indexed {
    teacher_subject: HashMap<TeacherId, HashSet<SubjectId>>,
    teacher_blocked: HashSet<(TeacherId, TimeBlockId)>,
    /// Absence of key means "room has no suitability filter → suits every subject".
    /// Presence of key with an empty set means "room suits zero subjects".
    room_subject: HashMap<RoomId, HashSet<SubjectId>>,
    room_blocked: HashSet<(RoomId, TimeBlockId)>,
}

impl Indexed {
    pub(crate) fn new(problem: &Problem) -> Self {
        let mut teacher_subject: HashMap<TeacherId, HashSet<SubjectId>> = HashMap::new();
        for q in &problem.teacher_qualifications {
            teacher_subject.entry(q.teacher_id).or_default().insert(q.subject_id);
        }

        let mut teacher_blocked: HashSet<(TeacherId, TimeBlockId)> = HashSet::new();
        for b in &problem.teacher_blocked_times {
            teacher_blocked.insert((b.teacher_id, b.time_block_id));
        }

        let mut room_subject: HashMap<RoomId, HashSet<SubjectId>> = HashMap::new();
        for s in &problem.room_subject_suitabilities {
            room_subject.entry(s.room_id).or_default().insert(s.subject_id);
        }

        let mut room_blocked: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
        for b in &problem.room_blocked_times {
            room_blocked.insert((b.room_id, b.time_block_id));
        }

        Self { teacher_subject, teacher_blocked, room_subject, room_blocked }
    }

    pub(crate) fn teacher_qualified(&self, teacher: TeacherId, subject: SubjectId) -> bool {
        self.teacher_subject.get(&teacher).is_some_and(|s| s.contains(&subject))
    }

    pub(crate) fn teacher_blocked(&self, teacher: TeacherId, tb: TimeBlockId) -> bool {
        self.teacher_blocked.contains(&(teacher, tb))
    }

    /// True when room has no suitability entries (suits all) or explicitly lists the subject.
    pub(crate) fn room_suits_subject(&self, room: RoomId, subject: SubjectId) -> bool {
        match self.room_subject.get(&room) {
            None => true,
            Some(set) => set.contains(&subject),
        }
    }

    pub(crate) fn room_blocked(&self, room: RoomId, tb: TimeBlockId) -> bool {
        self.room_blocked.contains(&(room, tb))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
    use crate::types::{
        Lesson, Problem, Room, RoomBlockedTime, RoomSubjectSuitability, SchoolClass, Subject,
        Teacher, TeacherBlockedTime, TeacherQualification, TimeBlock,
    };
    use uuid::Uuid;

    fn u(n: u8) -> Uuid { Uuid::from_bytes([n; 16]) }

    fn problem() -> Problem {
        Problem {
            time_blocks: vec![TimeBlock { id: TimeBlockId(u(1)), day_of_week: 0, position: 0 }],
            teachers: vec![Teacher { id: TeacherId(u(2)), max_hours_per_week: 10 }],
            rooms: vec![
                Room { id: RoomId(u(3)) },
                Room { id: RoomId(u(4)) },
            ],
            subjects: vec![
                Subject { id: SubjectId(u(5)) },
                Subject { id: SubjectId(u(6)) },
            ],
            school_classes: vec![SchoolClass { id: SchoolClassId(u(7)) }],
            lessons: vec![Lesson {
                id: LessonId(u(8)),
                school_class_id: SchoolClassId(u(7)),
                subject_id: SubjectId(u(5)),
                teacher_id: TeacherId(u(2)),
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: TeacherId(u(2)),
                subject_id: SubjectId(u(5)),
            }],
            teacher_blocked_times: vec![TeacherBlockedTime {
                teacher_id: TeacherId(u(2)),
                time_block_id: TimeBlockId(u(1)),
            }],
            room_blocked_times: vec![RoomBlockedTime {
                room_id: RoomId(u(3)),
                time_block_id: TimeBlockId(u(1)),
            }],
            room_subject_suitabilities: vec![RoomSubjectSuitability {
                room_id: RoomId(u(3)),
                subject_id: SubjectId(u(5)),
            }],
        }
    }

    #[test]
    fn teacher_qualified_hits_and_misses() {
        let idx = Indexed::new(&problem());
        assert!(idx.teacher_qualified(TeacherId(u(2)), SubjectId(u(5))));
        assert!(!idx.teacher_qualified(TeacherId(u(2)), SubjectId(u(6))));
        assert!(!idx.teacher_qualified(TeacherId(u(99)), SubjectId(u(5))));
    }

    #[test]
    fn teacher_blocked_matches_pair() {
        let idx = Indexed::new(&problem());
        assert!(idx.teacher_blocked(TeacherId(u(2)), TimeBlockId(u(1))));
        assert!(!idx.teacher_blocked(TeacherId(u(2)), TimeBlockId(u(99))));
    }

    #[test]
    fn room_with_entries_suits_only_listed_subjects() {
        let idx = Indexed::new(&problem());
        assert!(idx.room_suits_subject(RoomId(u(3)), SubjectId(u(5))));
        assert!(!idx.room_suits_subject(RoomId(u(3)), SubjectId(u(6))));
    }

    #[test]
    fn room_with_no_entries_suits_all_subjects() {
        let idx = Indexed::new(&problem());
        assert!(idx.room_suits_subject(RoomId(u(4)), SubjectId(u(5))));
        assert!(idx.room_suits_subject(RoomId(u(4)), SubjectId(u(6))));
    }

    #[test]
    fn room_blocked_matches_pair() {
        let idx = Indexed::new(&problem());
        assert!(idx.room_blocked(RoomId(u(3)), TimeBlockId(u(1))));
        assert!(!idx.room_blocked(RoomId(u(4)), TimeBlockId(u(1))));
    }
}
```

- [ ] **Step 2: Register the module**

In `lib.rs`:

```rust
pub(crate) mod index;
```

- [ ] **Step 3: Run the tests**

Run: `cargo nextest run -p solver-core`
Expected: five new `index.rs` tests pass.

- [ ] **Step 4: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add solver/solver-core/src/index.rs solver/solver-core/src/lib.rs
git commit -m "feat(solver-core): add indexed lookup tables for constraint checks"
```

---

## Task 5: Greedy first-fit placement algorithm

**Files:**
- Create: `solver/solver-core/src/solve.rs`
- Modify: `solver/solver-core/src/lib.rs`

- [ ] **Step 1: Write `solve.rs`**

Create `solver/solver-core/src/solve.rs`. This is the algorithm; tests in-module cover each hard constraint individually:

```rust
//! Greedy first-fit timetable solver. Iterates lessons, hours, time blocks, rooms
//! in caller-provided order; commits the first candidate that satisfies every hard
//! constraint. Placement failures become `UnplacedLesson` violations inside
//! `Solution`; `Err(Error::Input)` is reserved for structural input errors.

use std::collections::{HashMap, HashSet};

use crate::error::Error;
use crate::ids::{RoomId, SchoolClassId, TeacherId, TimeBlockId};
use crate::index::Indexed;
use crate::types::{Lesson, Placement, Problem, Solution, Violation, ViolationKind};
use crate::validate::{pre_solve_violations, validate_structural};

pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    validate_structural(problem)?;

    let idx = Indexed::new(problem);
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

    for lesson in &problem.lessons {
        // Skip placements for lessons with pre-solve violations; `pre_solve_violations`
        // already recorded one violation per hour.
        if !idx.teacher_qualified(lesson.teacher_id, lesson.subject_id) {
            continue;
        }

        for hour_index in 0..lesson.hours_per_week {
            let placed = try_place_hour(
                problem,
                lesson,
                &idx,
                &teacher_max,
                &mut used_teacher,
                &mut used_class,
                &mut used_room,
                &mut hours_by_teacher,
                &mut solution.placements,
            );
            if !placed {
                solution.violations.push(Violation {
                    kind: ViolationKind::UnplacedLesson,
                    lesson_id: lesson.id,
                    hour_index,
                    message: unplaced_reason(
                        problem,
                        lesson,
                        &idx,
                        &teacher_max,
                        &used_teacher,
                        &used_class,
                        &used_room,
                        &hours_by_teacher,
                    ),
                });
            }
        }
    }

    Ok(solution)
}

#[allow(clippy::too_many_arguments)] // Reason: internal helper; refactoring to a struct hurts clarity more than it helps
fn try_place_hour(
    problem: &Problem,
    lesson: &Lesson,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    used_teacher: &mut HashSet<(TeacherId, TimeBlockId)>,
    used_class: &mut HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &mut HashSet<(RoomId, TimeBlockId)>,
    hours_by_teacher: &mut HashMap<TeacherId, u8>,
    placements: &mut Vec<Placement>,
) -> bool {
    for tb in &problem.time_blocks {
        if used_teacher.contains(&(lesson.teacher_id, tb.id)) {
            continue;
        }
        if used_class.contains(&(lesson.school_class_id, tb.id)) {
            continue;
        }
        if idx.teacher_blocked(lesson.teacher_id, tb.id) {
            continue;
        }
        let current = hours_by_teacher.get(&lesson.teacher_id).copied().unwrap_or(0);
        let max = teacher_max.get(&lesson.teacher_id).copied().unwrap_or(0);
        if current.saturating_add(1) > max {
            continue;
        }

        for room in &problem.rooms {
            if used_room.contains(&(room.id, tb.id)) {
                continue;
            }
            if !idx.room_suits_subject(room.id, lesson.subject_id) {
                continue;
            }
            if idx.room_blocked(room.id, tb.id) {
                continue;
            }

            placements.push(Placement {
                lesson_id: lesson.id,
                time_block_id: tb.id,
                room_id: room.id,
            });
            used_teacher.insert((lesson.teacher_id, tb.id));
            used_class.insert((lesson.school_class_id, tb.id));
            used_room.insert((room.id, tb.id));
            *hours_by_teacher.entry(lesson.teacher_id).or_insert(0) += 1;
            return true;
        }
    }
    false
}

#[allow(clippy::too_many_arguments)] // Reason: diagnostic-only helper; arguments mirror try_place_hour for parity
fn unplaced_reason(
    problem: &Problem,
    lesson: &Lesson,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    used_teacher: &HashSet<(TeacherId, TimeBlockId)>,
    used_class: &HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &HashSet<(RoomId, TimeBlockId)>,
    hours_by_teacher: &HashMap<TeacherId, u8>,
) -> String {
    let current = hours_by_teacher.get(&lesson.teacher_id).copied().unwrap_or(0);
    let max = teacher_max.get(&lesson.teacher_id).copied().unwrap_or(0);
    if current >= max {
        return format!(
            "teacher {} already at max_hours_per_week ({})",
            lesson.teacher_id.0, max
        );
    }

    let any_slot_open = problem.time_blocks.iter().any(|tb| {
        !used_teacher.contains(&(lesson.teacher_id, tb.id))
            && !used_class.contains(&(lesson.school_class_id, tb.id))
            && !idx.teacher_blocked(lesson.teacher_id, tb.id)
    });
    if !any_slot_open {
        return "no free time_block for teacher and class".to_string();
    }
    let any_room_open = problem.time_blocks.iter().any(|tb| {
        problem.rooms.iter().any(|room| {
            !used_room.contains(&(room.id, tb.id))
                && idx.room_suits_subject(room.id, lesson.subject_id)
                && !idx.room_blocked(room.id, tb.id)
        })
    });
    if !any_room_open {
        return "no suitable room available at any time_block".to_string();
    }
    "no viable (time_block, room) combination".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
    use crate::types::{
        Lesson, Problem, Room, RoomBlockedTime, RoomSubjectSuitability, SchoolClass, Subject,
        Teacher, TeacherBlockedTime, TeacherQualification, TimeBlock,
    };
    use uuid::Uuid;

    fn u(n: u8) -> Uuid { Uuid::from_bytes([n; 16]) }

    fn base_problem() -> Problem {
        Problem {
            time_blocks: vec![
                TimeBlock { id: TimeBlockId(u(10)), day_of_week: 0, position: 0 },
                TimeBlock { id: TimeBlockId(u(11)), day_of_week: 0, position: 1 },
            ],
            teachers: vec![Teacher { id: TeacherId(u(20)), max_hours_per_week: 10 }],
            rooms: vec![Room { id: RoomId(u(30)) }],
            subjects: vec![Subject { id: SubjectId(u(40)) }],
            school_classes: vec![SchoolClass { id: SchoolClassId(u(50)) }],
            lessons: vec![Lesson {
                id: LessonId(u(60)),
                school_class_id: SchoolClassId(u(50)),
                subject_id: SubjectId(u(40)),
                teacher_id: TeacherId(u(20)),
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: TeacherId(u(20)),
                subject_id: SubjectId(u(40)),
            }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        }
    }

    #[test]
    fn single_hour_places_into_first_slot_and_room() {
        let s = solve(&base_problem()).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.placements[0].time_block_id, TimeBlockId(u(10)));
        assert_eq!(s.placements[0].room_id, RoomId(u(30)));
        assert!(s.violations.is_empty());
    }

    #[test]
    fn unqualified_teacher_emits_violation_and_skips_placement() {
        let mut p = base_problem();
        p.teacher_qualifications.clear();
        let s = solve(&p).unwrap();
        assert!(s.placements.is_empty());
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::NoQualifiedTeacher);
    }

    #[test]
    fn teacher_blocked_time_prevents_placement_there() {
        let mut p = base_problem();
        p.teacher_blocked_times.push(TeacherBlockedTime {
            teacher_id: TeacherId(u(20)),
            time_block_id: TimeBlockId(u(10)),
        });
        let s = solve(&p).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.placements[0].time_block_id, TimeBlockId(u(11)));
    }

    #[test]
    fn room_unsuitable_for_subject_is_skipped() {
        let mut p = base_problem();
        // Mark the sole room as suitable only for an unrelated subject, but add that
        // subject to keep validation happy. Room now suits no subject we place.
        p.subjects.push(Subject { id: SubjectId(u(41)) });
        p.room_subject_suitabilities.push(RoomSubjectSuitability {
            room_id: RoomId(u(30)),
            subject_id: SubjectId(u(41)),
        });
        let s = solve(&p).unwrap();
        assert!(s.placements.is_empty());
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::UnplacedLesson);
    }

    #[test]
    fn room_blocked_time_pushes_placement_to_next_slot() {
        let mut p = base_problem();
        p.room_blocked_times.push(RoomBlockedTime {
            room_id: RoomId(u(30)),
            time_block_id: TimeBlockId(u(10)),
        });
        let s = solve(&p).unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_eq!(s.placements[0].time_block_id, TimeBlockId(u(11)));
    }

    #[test]
    fn teacher_max_hours_cap_emits_unplaced_violation() {
        let mut p = base_problem();
        p.teachers[0].max_hours_per_week = 0;
        let s = solve(&p).unwrap();
        assert!(s.placements.is_empty());
        assert_eq!(s.violations.len(), 1);
        assert_eq!(s.violations[0].kind, ViolationKind::UnplacedLesson);
        assert!(s.violations[0].message.contains("max_hours_per_week"));
    }

    #[test]
    fn two_lessons_in_same_class_do_not_double_book_slot() {
        let mut p = base_problem();
        p.subjects.push(Subject { id: SubjectId(u(41)) });
        p.teacher_qualifications.push(TeacherQualification {
            teacher_id: TeacherId(u(20)),
            subject_id: SubjectId(u(41)),
        });
        p.lessons.push(Lesson {
            id: LessonId(u(61)),
            school_class_id: SchoolClassId(u(50)),
            subject_id: SubjectId(u(41)),
            teacher_id: TeacherId(u(20)),
            hours_per_week: 1,
        });
        let s = solve(&p).unwrap();
        assert_eq!(s.placements.len(), 2);
        assert_ne!(s.placements[0].time_block_id, s.placements[1].time_block_id);
    }

    #[test]
    fn two_rooms_used_in_parallel_for_different_classes_in_same_slot() {
        let mut p = base_problem();
        // second class with its own lesson
        p.school_classes.push(SchoolClass { id: SchoolClassId(u(51)) });
        p.teachers.push(Teacher { id: TeacherId(u(21)), max_hours_per_week: 10 });
        p.teacher_qualifications.push(TeacherQualification {
            teacher_id: TeacherId(u(21)),
            subject_id: SubjectId(u(40)),
        });
        p.rooms.push(Room { id: RoomId(u(31)) });
        p.lessons.push(Lesson {
            id: LessonId(u(61)),
            school_class_id: SchoolClassId(u(51)),
            subject_id: SubjectId(u(40)),
            teacher_id: TeacherId(u(21)),
            hours_per_week: 1,
        });
        let s = solve(&p).unwrap();
        assert_eq!(s.placements.len(), 2);
        // both placements happened in the first slot but in different rooms
        assert_eq!(s.placements[0].time_block_id, s.placements[1].time_block_id);
        assert_ne!(s.placements[0].room_id, s.placements[1].room_id);
    }

    #[test]
    fn structural_error_returns_err_input() {
        let mut p = base_problem();
        p.time_blocks.clear();
        let err = solve(&p).unwrap_err();
        assert!(matches!(err, Error::Input(_)));
    }
}
```

- [ ] **Step 2: Register and re-export `solve` in `lib.rs`**

```rust
pub mod solve;

pub use solve::solve;
```

- [ ] **Step 3: Run the tests**

Run: `cargo nextest run -p solver-core`
Expected: nine new algorithm tests plus all prior tests pass.

- [ ] **Step 4: Lint**

Run: `mise run lint`
Expected: clean. The two `#[allow(clippy::too_many_arguments)]` entries each carry a `// Reason:` comment as required by `solver/CLAUDE.md`.

- [ ] **Step 5: Commit**

```bash
git add solver/solver-core/src/solve.rs solver/solver-core/src/lib.rs
git commit -m "feat(solver-core): add greedy first-fit placement algorithm"
```

---

## Task 6: `solve_json` string adapter

**Files:**
- Create: `solver/solver-core/src/json.rs`
- Modify: `solver/solver-core/src/lib.rs`

- [ ] **Step 1: Write `json.rs`**

Create `solver/solver-core/src/json.rs`:

```rust
//! JSON string adapter over `solve`. Consumed by `solver-py` in step 2 of the
//! sprint. Input errors are wrapped in a tagged envelope; success emits the
//! `Solution` JSON directly.

use serde::Serialize;

use crate::error::Error;
use crate::solve::solve;
use crate::types::Problem;

pub fn solve_json(json: &str) -> Result<String, Error> {
    let problem: Problem = serde_json::from_str(json)
        .map_err(|e| Error::Input(format!("json: {e}")))?;
    let solution = solve(&problem)?;
    serde_json::to_string(&solution)
        .map_err(|e| Error::Input(format!("serialize: {e}")))
}

/// Tagged JSON envelope that step 2's `solver-py` wrapper emits to Python so the
/// FastAPI layer can branch on a single field instead of parsing error strings.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ErrorEnvelope<'a> {
    Input { reason: &'a str },
}

impl<'a> From<&'a Error> for ErrorEnvelope<'a> {
    fn from(e: &'a Error) -> Self {
        match e {
            Error::Input(msg) => ErrorEnvelope::Input { reason: msg.as_str() },
        }
    }
}

pub fn error_envelope_json(e: &Error) -> String {
    serde_json::to_string(&ErrorEnvelope::from(e))
        .unwrap_or_else(|_| "{\"kind\":\"input\",\"reason\":\"serialize failed\"}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
    use crate::types::{
        Lesson, Problem, Room, SchoolClass, Subject, Teacher, TeacherQualification, TimeBlock,
    };
    use uuid::Uuid;

    fn u(n: u8) -> Uuid { Uuid::from_bytes([n; 16]) }

    fn minimal_json() -> String {
        let p = Problem {
            time_blocks: vec![TimeBlock { id: TimeBlockId(u(10)), day_of_week: 0, position: 0 }],
            teachers: vec![Teacher { id: TeacherId(u(20)), max_hours_per_week: 5 }],
            rooms: vec![Room { id: RoomId(u(30)) }],
            subjects: vec![Subject { id: SubjectId(u(40)) }],
            school_classes: vec![SchoolClass { id: SchoolClassId(u(50)) }],
            lessons: vec![Lesson {
                id: LessonId(u(60)),
                school_class_id: SchoolClassId(u(50)),
                subject_id: SubjectId(u(40)),
                teacher_id: TeacherId(u(20)),
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: TeacherId(u(20)),
                subject_id: SubjectId(u(40)),
            }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        serde_json::to_string(&p).unwrap()
    }

    #[test]
    fn solve_json_round_trips_minimal_problem() {
        let out = solve_json(&minimal_json()).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["placements"].as_array().unwrap().len(), 1);
        assert_eq!(parsed["violations"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn solve_json_returns_input_error_for_malformed_json() {
        let err = solve_json("not json").unwrap_err();
        assert!(matches!(err, Error::Input(msg) if msg.contains("json:")));
    }

    #[test]
    fn error_envelope_tags_input_variant() {
        let env = error_envelope_json(&Error::Input("no time_blocks".into()));
        let parsed: serde_json::Value = serde_json::from_str(&env).unwrap();
        assert_eq!(parsed["kind"], "input");
        assert_eq!(parsed["reason"], "no time_blocks");
    }
}
```

- [ ] **Step 2: Wire into `lib.rs`**

```rust
pub mod json;

pub use json::{error_envelope_json, solve_json};
```

- [ ] **Step 3: Run the tests**

Run: `cargo nextest run -p solver-core`
Expected: three new json tests plus all prior tests pass.

- [ ] **Step 4: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add solver/solver-core/src/json.rs solver/solver-core/src/lib.rs
git commit -m "feat(solver-core): add solve_json string adapter"
```

---

## Task 7: Property tests for placement invariants

**Files:**
- Create: `solver/solver-core/tests/common/mod.rs`
- Create: `solver/solver-core/tests/properties.rs`

- [ ] **Step 1: Write the shared fixture builder**

Create `solver/solver-core/tests/common/mod.rs`:

```rust
//! Test-only fixtures shared between integration and property tests.

use solver_core::{
    ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId},
    types::{
        Lesson, Problem, Room, RoomSubjectSuitability, SchoolClass, Subject, Teacher,
        TeacherQualification, TimeBlock,
    },
};
use uuid::Uuid;

pub fn u(n: u8) -> Uuid {
    Uuid::from_bytes([n; 16])
}

pub fn big_u(hi: u8, lo: u8) -> Uuid {
    let mut bytes = [0u8; 16];
    bytes[0] = hi;
    bytes[15] = lo;
    Uuid::from_bytes(bytes)
}

/// Build a feasible problem with `classes` classes, `teachers` teachers, `rooms`
/// rooms, and exactly `blocks` time blocks distributed across 5 weekdays.
/// Every teacher qualifies for every subject and is available everywhere;
/// rooms have no suitability filter; no teacher/room blocked times.
#[allow(dead_code)] // Reason: used only by tests/properties.rs; other integration tests may ignore this
pub fn feasible_problem(
    classes: u8,
    teachers: u8,
    rooms: u8,
    blocks: u8,
    subjects: u8,
    hours_per_lesson: u8,
) -> Problem {
    let time_blocks: Vec<TimeBlock> = (0..blocks)
        .map(|i| TimeBlock {
            id: TimeBlockId(u(200 + i)),
            day_of_week: i / 5,
            position: i % 5,
        })
        .collect();

    let teachers_vec: Vec<Teacher> = (0..teachers)
        .map(|i| Teacher {
            id: TeacherId(u(50 + i)),
            max_hours_per_week: 255,
        })
        .collect();

    let rooms_vec: Vec<Room> = (0..rooms).map(|i| Room { id: RoomId(u(100 + i)) }).collect();
    let subjects_vec: Vec<Subject> = (0..subjects).map(|i| Subject { id: SubjectId(u(150 + i)) }).collect();
    let classes_vec: Vec<SchoolClass> = (0..classes).map(|i| SchoolClass { id: SchoolClassId(u(20 + i)) }).collect();

    let mut lessons = Vec::new();
    let mut quals = Vec::new();
    for (c_idx, class) in classes_vec.iter().enumerate() {
        for (s_idx, subject) in subjects_vec.iter().enumerate() {
            let teacher = &teachers_vec[(c_idx + s_idx) % teachers_vec.len()];
            lessons.push(Lesson {
                id: LessonId(big_u((c_idx as u8) + 1, s_idx as u8)),
                school_class_id: class.id,
                subject_id: subject.id,
                teacher_id: teacher.id,
                hours_per_week: hours_per_lesson,
            });
        }
    }
    for teacher in &teachers_vec {
        for subject in &subjects_vec {
            quals.push(TeacherQualification { teacher_id: teacher.id, subject_id: subject.id });
        }
    }

    Problem {
        time_blocks,
        teachers: teachers_vec,
        rooms: rooms_vec,
        subjects: subjects_vec,
        school_classes: classes_vec,
        lessons,
        teacher_qualifications: quals,
        teacher_blocked_times: vec![],
        room_blocked_times: vec![],
        room_subject_suitabilities: Vec::<RoomSubjectSuitability>::new(),
    }
}
```

- [ ] **Step 2: Write the property test file**

Create `solver/solver-core/tests/properties.rs`:

```rust
//! Property tests for the greedy solver's hard-constraint invariants.

mod common;

use std::collections::{HashMap, HashSet};

use proptest::prelude::*;
use solver_core::{
    ids::{RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId},
    solve,
    types::{Problem, Solution, ViolationKind},
};

use common::feasible_problem;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn all_placements_are_feasible(
        classes in 1u8..=4,
        teachers in 2u8..=6,
        rooms in 2u8..=5,
        blocks in 15u8..=25,
        subjects in 2u8..=4,
        hours in 1u8..=3,
    ) {
        let p = feasible_problem(classes, teachers, rooms, blocks, subjects, hours);
        let s = solve(&p).unwrap();
        assert_every_placement_is_feasible_and_no_double_booking(&p, &s);
        assert_teacher_hours_respected(&p, &s);
        assert_total_hours_accounted_for(&p, &s);
    }

    #[test]
    fn output_is_byte_deterministic(
        classes in 1u8..=4,
        teachers in 2u8..=6,
        rooms in 2u8..=5,
        blocks in 15u8..=25,
        subjects in 2u8..=4,
        hours in 1u8..=3,
    ) {
        let p = feasible_problem(classes, teachers, rooms, blocks, subjects, hours);
        let a = serde_json::to_string(&solve(&p).unwrap()).unwrap();
        let b = serde_json::to_string(&solve(&p).unwrap()).unwrap();
        assert_eq!(a, b, "same input must produce byte-identical output");
    }
}

fn assert_every_placement_is_feasible_and_no_double_booking(p: &Problem, s: &Solution) {
    let qualifications: HashSet<(TeacherId, SubjectId)> =
        p.teacher_qualifications.iter().map(|q| (q.teacher_id, q.subject_id)).collect();
    let teacher_blocked: HashSet<(TeacherId, TimeBlockId)> =
        p.teacher_blocked_times.iter().map(|b| (b.teacher_id, b.time_block_id)).collect();
    let room_blocked: HashSet<(RoomId, TimeBlockId)> =
        p.room_blocked_times.iter().map(|b| (b.room_id, b.time_block_id)).collect();
    let mut room_suit: HashMap<RoomId, HashSet<SubjectId>> = HashMap::new();
    for s in &p.room_subject_suitabilities {
        room_suit.entry(s.room_id).or_default().insert(s.subject_id);
    }

    let lesson_by_id: HashMap<_, _> = p.lessons.iter().map(|l| (l.id, l)).collect();

    let mut teacher_slot: HashSet<(TeacherId, TimeBlockId)> = HashSet::new();
    let mut class_slot: HashSet<(SchoolClassId, TimeBlockId)> = HashSet::new();
    let mut room_slot: HashSet<(RoomId, TimeBlockId)> = HashSet::new();

    for pl in &s.placements {
        let lesson = lesson_by_id.get(&pl.lesson_id).unwrap();
        assert!(qualifications.contains(&(lesson.teacher_id, lesson.subject_id)));
        assert!(!teacher_blocked.contains(&(lesson.teacher_id, pl.time_block_id)));
        assert!(!room_blocked.contains(&(pl.room_id, pl.time_block_id)));
        match room_suit.get(&pl.room_id) {
            None => {}
            Some(set) => assert!(set.contains(&lesson.subject_id)),
        }
        assert!(teacher_slot.insert((lesson.teacher_id, pl.time_block_id)), "teacher double-book");
        assert!(class_slot.insert((lesson.school_class_id, pl.time_block_id)), "class double-book");
        assert!(room_slot.insert((pl.room_id, pl.time_block_id)), "room double-book");
    }
}

fn assert_teacher_hours_respected(p: &Problem, s: &Solution) {
    let teacher_of: HashMap<_, _> = p.lessons.iter().map(|l| (l.id, l.teacher_id)).collect();
    let teacher_max: HashMap<_, _> = p.teachers.iter().map(|t| (t.id, t.max_hours_per_week)).collect();
    let mut hours: HashMap<TeacherId, u32> = HashMap::new();
    for pl in &s.placements {
        *hours.entry(*teacher_of.get(&pl.lesson_id).unwrap()).or_insert(0) += 1;
    }
    for (tid, h) in hours {
        assert!(h <= u32::from(*teacher_max.get(&tid).unwrap()));
    }
}

fn assert_total_hours_accounted_for(p: &Problem, s: &Solution) {
    let total_required: u32 = p.lessons.iter().map(|l| u32::from(l.hours_per_week)).sum();
    let placed: u32 = s.placements.len() as u32;
    let unplaced_hour_violations = s
        .violations
        .iter()
        .filter(|v| matches!(v.kind, ViolationKind::UnplacedLesson | ViolationKind::NoQualifiedTeacher))
        .count() as u32;
    assert_eq!(placed + unplaced_hour_violations, total_required);
}
```

The `assert_no_double_booking` helper is intentionally narrower than the combined per-constraint check because cross-referencing teacher/class IDs here would duplicate `assert_every_placement_is_feasible`. The combined invariant + the room-slot `HashSet::insert` assert is enough to catch regressions.

- [ ] **Step 3: Run the property tests**

Run: `cargo nextest run -p solver-core --test properties`
Expected: both properties pass under 256 cases each. Set `PROPTEST_CASES=1024` locally if you want denser coverage.

- [ ] **Step 4: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add solver/solver-core/tests/common/mod.rs solver/solver-core/tests/properties.rs
git commit -m "test(solver-core): add property tests for placement invariants"
```

---

## Task 8: Grundschule smoke integration test

**Files:**
- Create: `solver/solver-core/tests/grundschule_smoke.rs`

- [ ] **Step 1: Write the integration fixture**

Create `solver/solver-core/tests/grundschule_smoke.rs`:

```rust
//! Grundschule-shaped smoke test. Two classes (one grade-1/2 Pflichtstunden at 21
//! hours, one grade-3/4 at 25 hours) across 5 weekdays × 5 periods = 25 time
//! blocks. 8 teachers, 5 rooms including one "gym" limited to sports. The greedy
//! must place every hour with zero violations.

use std::collections::HashSet;

use solver_core::{
    ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId},
    solve,
    types::{
        Lesson, Problem, Room, RoomSubjectSuitability, SchoolClass, Subject, Teacher,
        TeacherQualification, TimeBlock,
    },
};
use uuid::Uuid;

fn u(n: u8) -> Uuid { Uuid::from_bytes([n; 16]) }

fn grundschule() -> Problem {
    // 5 weekdays, 5 periods per day = 25 time blocks
    let time_blocks: Vec<TimeBlock> = (0..25)
        .map(|i| TimeBlock {
            id: TimeBlockId(u(100 + i)),
            day_of_week: i / 5,
            position: i % 5,
        })
        .collect();

    // 8 teachers, generous caps
    let teachers: Vec<Teacher> = (0..8)
        .map(|i| Teacher { id: TeacherId(u(30 + i)), max_hours_per_week: 28 })
        .collect();

    // 5 rooms: 2 regular classrooms, 1 music, 1 art, 1 gym
    let rooms: Vec<Room> = (0..5).map(|i| Room { id: RoomId(u(50 + i)) }).collect();

    // 7 subjects: Deutsch, Mathe, Sachunterricht, Fremdsprache, Religion, Musik, Kunst, Sport
    // (actually 8; renumbered below)
    let subject_ids: Vec<SubjectId> = (0..8).map(|i| SubjectId(u(60 + i))).collect();
    let subjects: Vec<Subject> = subject_ids.iter().map(|id| Subject { id: *id }).collect();

    // 2 classes: class 1/2 (index 0), class 3/4 (index 1)
    let classes: Vec<SchoolClass> = (0..2).map(|i| SchoolClass { id: SchoolClassId(u(70 + i)) }).collect();

    // Stundentafeln (hessische Grundschule, abgespeckt)
    // Klasse 1/2: Deutsch 6, Mathe 5, Sachunterricht 2, Religion 2, Kunst 1, Musik 1, Werken 1, Sport 3 = 21
    // Klasse 3/4: Deutsch 5, Mathe 5, Sachunterricht 4, Fremdsprache 2, Religion 2, Kunst 1, Musik 1, Werken 1, Sport 3 = 24; +1 Förder für 25
    // For solver determinism we size to 21 and 24 respectively; stories within ±2 of the real figures.
    let hours_per_class: [[u8; 8]; 2] = [
        // Deutsch, Mathe, Sachunterricht, Fremdsprache, Religion, Musik, Kunst, Sport
        [6, 5, 2, 0, 2, 1, 2, 3],
        [5, 5, 4, 2, 2, 1, 2, 3],
    ];

    // One teacher per (class, subject) pair, round-robin.
    let mut lessons = Vec::new();
    let mut quals = Vec::new();
    let mut lesson_idx = 0u8;
    for (c_idx, class) in classes.iter().enumerate() {
        for (s_idx, subject) in subjects.iter().enumerate() {
            let hours = hours_per_class[c_idx][s_idx];
            if hours == 0 {
                continue;
            }
            let teacher = &teachers[(c_idx * 4 + s_idx) % teachers.len()];
            lessons.push(Lesson {
                id: LessonId(u(200 + lesson_idx)),
                school_class_id: class.id,
                subject_id: subject.id,
                teacher_id: teacher.id,
                hours_per_week: hours,
            });
            lesson_idx += 1;
            quals.push(TeacherQualification { teacher_id: teacher.id, subject_id: subject.id });
        }
    }

    // Gym (room index 4) suits only Sport (subject index 7). Others suit all.
    let sport_subject = subject_ids[7];
    let gym = rooms[4].id;
    let suits: Vec<RoomSubjectSuitability> = vec![RoomSubjectSuitability { room_id: gym, subject_id: sport_subject }];

    Problem {
        time_blocks,
        teachers,
        rooms,
        subjects,
        school_classes: classes,
        lessons,
        teacher_qualifications: quals,
        teacher_blocked_times: vec![],
        room_blocked_times: vec![],
        room_subject_suitabilities: suits,
    }
}

#[test]
fn grundschule_shape_places_every_hour_with_zero_violations() {
    let problem = grundschule();
    let expected_hours: u32 = problem.lessons.iter().map(|l| u32::from(l.hours_per_week)).sum();
    let solution = solve(&problem).unwrap();
    assert!(
        solution.violations.is_empty(),
        "expected zero violations, got {:?}",
        solution.violations
    );
    assert_eq!(solution.placements.len() as u32, expected_hours);

    // Basic room no-double-booking sanity (the property test covers the rest)
    let mut seen: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
    for pl in &solution.placements {
        assert!(seen.insert((pl.room_id, pl.time_block_id)), "room double-book");
    }
}
```

- [ ] **Step 2: Run the integration test**

Run: `cargo nextest run -p solver-core --test grundschule_smoke`
Expected: one test, passes.

Note: the fixture is sized so pure input-order greedy succeeds. If the Gym-only-fits-Sport constraint is too tight relative to Sport hours per class (3 × 2 classes = 6 Sport hours; 25 time blocks × 1 gym room = 25 potential Sport slots), the greedy still succeeds because other rooms also suit Sport (no explicit suitability = suits all). This is intentional.

- [ ] **Step 3: Lint**

Run: `mise run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add solver/solver-core/tests/grundschule_smoke.rs
git commit -m "test(solver-core): add grundschule smoke test"
```

---

## Task 9: Update `solver/CLAUDE.md` to drop the stale `Error::Infeasible` example

**Files:**
- Modify: `solver/CLAUDE.md:17-25`

- [ ] **Step 1: Locate the stale example**

The current file shows:

```rust
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("input: {0}")]
    Input(String),
    #[error("infeasible at step {step}: {reason}")]
    Infeasible { step: &'static str, reason: String },
}
```

- [ ] **Step 2: Replace with the current shape**

Use the `Edit` tool (or your editor) to swap the block to:

```rust
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    #[error("input: {0}")]
    Input(String),
}
```

Adjust surrounding prose (if any) that references `Infeasible` similarly; the spec documents that placement failures are now `Violation`s inside `Solution`.

- [ ] **Step 3: Lint**

Run: `mise run lint`
Expected: clean (this edit is prose, not Rust code).

- [ ] **Step 4: Commit**

```bash
git add solver/CLAUDE.md
git commit -m "docs(solver): drop stale Error::Infeasible example after MVP landed"
```

---

## Task 10: Update `docs/superpowers/OPEN_THINGS.md`

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Remove sprint step 1**

In the "Prototype sprint" section, delete the `1. **Solver MVP in solver-core.** …` bullet. Renumber the remaining six items (2-6 → 1-5).

- [ ] **Step 2: Remove the cross-entity validation "Pay down" bullet**

Under "Pay down alongside the sprint", delete the bullet that begins with `Decide cross-entity validation strategy before step 2.` The spec's pre-solve `NoQualifiedTeacher` violation implements option (b) from that item.

- [ ] **Step 3: Add the FFD follow-up**

Add a new bullet under `Backlog → Product capabilities` (top of that section):

```
- **First-Fit Decreasing ordering for the greedy solver.** Pure input-order greedy emits `UnplacedLesson` violations for lessons whose slots were claimed by less-constrained lessons earlier in the input. Sort lessons by eligibility count (slots × rooms × subject/qualification filters) most-constrained first, with a stable tiebreaker on `lesson.id` for determinism. Still no backtracking. Measurable win on synthetic densely-constrained inputs; landed as a separate PR so the MVP diff stayed small.
```

- [ ] **Step 4: Add a follow-up bullet for `reverse_chars` cleanup**

Under `Backlog → Toolchain & build friction` add:

```
- **Remove `reverse_chars` from `solver-core` and `solver-py`.** Step 2 of the sprint (`solver-py` PyO3 binding + FastAPI endpoint) supersedes it. Do the cleanup in that PR: the `/healthz` smoke check in `backend/main.py`, the `.pyi` stubs in `solver-py/python/klassenzeit_solver/`, the stub Python re-export, and the proptest at `solver/solver-core/tests/proptest_reverse.rs` all go with the binding.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs(open-things): retire solver MVP sprint bullet and record follow-ups"
```

---

## Self-review checklist

After finishing all 10 tasks:

- [ ] `mise run test` passes (Rust + Python + frontend).
- [ ] `mise run lint` passes.
- [ ] `cargo nextest run -p solver-core` reports all unit + integration + property tests passing.
- [ ] `git log --oneline feat/solver-core-mvp ^master` shows 11 commits with Conventional Commits prefixes (10 plan-tasks + the earlier spec commit).
- [ ] `solver/CLAUDE.md` no longer references `Error::Infeasible`.
- [ ] `docs/superpowers/OPEN_THINGS.md` has step 1 removed, the qualification pre-check item removed, and the FFD + `reverse_chars` follow-ups added.
- [ ] No `.pyi` file, no `solver-py` source, no backend file touched.
