# Solver Domain Model + Construction Heuristic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the greedy scheduler with a constraint-based architecture using incremental scoring, bitset conflict matrices, and First Fit Decreasing construction heuristic.

**Architecture:** Internal `usize`-indexed domain model (`planning.rs`) with bitset-backed incremental state (`constraints.rs`). A mapper converts between the public UUID-based `ScheduleInput`/`ScheduleOutput` types and the internal model. Construction heuristic sorts lessons most-constrained-first and greedily assigns the best (timeslot, room) pair. The public `solve()` signature is unchanged — the backend needs zero modifications.

**Tech Stack:** Rust, `bitvec` crate for bitset matrices, `proptest` for property-based testing.

**Spec:** `docs/superpowers/specs/2026-04-04-solver-domain-model-design.md`

---

## File Structure

```
scheduler/
├── Cargo.toml              # Add bitvec, proptest deps
├── src/
│   ├── lib.rs              # Rewrite: thin wrapper calling mapper → construction → mapper
│   ├── types.rs            # UNCHANGED — public API types
│   ├── planning.rs         # NEW — internal domain model + HardSoftScore
│   ├── constraints.rs      # NEW — full_evaluate() + IncrementalState
│   ├── construction.rs     # NEW — First Fit Decreasing heuristic
│   └── mapper.rs           # NEW — ScheduleInput ↔ internal model conversion
├── tests/
│   ├── basic.rs            # UPDATE — port existing tests (same assertions)
│   ├── constraints.rs      # NEW — unit test per constraint
│   └── construction.rs     # NEW — solvable/unsolvable instance tests
```

---

### Task 1: Add dependencies

**Files:**
- Modify: `scheduler/Cargo.toml`

- [ ] **Step 1: Add bitvec and proptest to Cargo.toml**

```toml
[package]
name = "klassenzeit-scheduler"
version = "0.1.0"
edition = "2021"

[dependencies]
uuid = { version = "1", features = ["v4"] }
bitvec = "1"

[dev-dependencies]
proptest = "1"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/pascal/Code/Klassenzeit && cargo check -p klassenzeit-scheduler`
Expected: compiles with no errors (existing code untouched)

- [ ] **Step 3: Commit**

```bash
git add scheduler/Cargo.toml
git commit -m "chore(scheduler): add bitvec and proptest dependencies"
```

---

### Task 2: Planning domain model

**Files:**
- Create: `scheduler/src/planning.rs`
- Modify: `scheduler/src/lib.rs` (add `mod planning;`)

- [ ] **Step 1: Create planning.rs with all domain types**

```rust
use bitvec::prelude::*;
use std::cmp::Ordering;
use std::fmt;
use std::ops::{Add, AddAssign};

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/// Lexicographic score: hard violations take absolute priority over soft.
/// Both fields are ≤ 0 (penalties). A perfect score is (0, 0).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct HardSoftScore {
    pub hard: i64,
    pub soft: i64,
}

impl HardSoftScore {
    pub const ZERO: Self = Self { hard: 0, soft: 0 };

    pub fn hard(penalty: i64) -> Self {
        Self { hard: penalty, soft: 0 }
    }

    pub fn soft(penalty: i64) -> Self {
        Self { hard: 0, soft: penalty }
    }

    pub fn is_feasible(&self) -> bool {
        self.hard == 0
    }
}

impl Ord for HardSoftScore {
    fn cmp(&self, other: &Self) -> Ordering {
        self.hard.cmp(&other.hard).then(self.soft.cmp(&other.soft))
    }
}

impl PartialOrd for HardSoftScore {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Add for HardSoftScore {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self {
            hard: self.hard + rhs.hard,
            soft: self.soft + rhs.soft,
        }
    }
}

impl AddAssign for HardSoftScore {
    fn add_assign(&mut self, rhs: Self) {
        self.hard += rhs.hard;
        self.soft += rhs.soft;
    }
}

impl fmt::Display for HardSoftScore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}hard/{}soft", self.hard, self.soft)
    }
}

// ---------------------------------------------------------------------------
// Problem facts (immutable during solving)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ProblemFacts {
    pub timeslots: Vec<Timeslot>,
    pub rooms: Vec<RoomFact>,
    pub teachers: Vec<TeacherFact>,
    pub classes: Vec<ClassFact>,
    pub subjects: Vec<SubjectFact>,
}

#[derive(Debug, Clone)]
pub struct Timeslot {
    pub day: u8,
    pub period: u8,
}

#[derive(Debug, Clone)]
pub struct RoomFact {
    pub capacity: Option<u32>,
    /// Bit i is set if this room is suitable for subject i.
    pub suitable_subjects: BitVec,
}

#[derive(Debug, Clone)]
pub struct TeacherFact {
    pub max_hours: u32,
    /// Bit i is set if teacher is available in timeslot i.
    pub available_slots: BitVec,
    /// Bit i is set if teacher is qualified for subject i.
    pub qualified_subjects: BitVec,
}

#[derive(Debug, Clone)]
pub struct ClassFact {
    pub student_count: Option<u32>,
    pub class_teacher_idx: Option<usize>,
}

#[derive(Debug, Clone)]
pub struct SubjectFact {
    pub needs_special_room: bool,
}

// ---------------------------------------------------------------------------
// Planning entity
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct PlanningLesson {
    pub id: usize,
    pub subject_idx: usize,
    pub teacher_idx: usize,
    pub class_idx: usize,
    pub timeslot: Option<usize>,
    pub room: Option<usize>,
}

// ---------------------------------------------------------------------------
// Solution container
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct PlanningSolution {
    pub lessons: Vec<PlanningLesson>,
    pub facts: ProblemFacts,
    pub score: HardSoftScore,
}
```

- [ ] **Step 2: Register the module in lib.rs**

Add at the top of `scheduler/src/lib.rs`, below the existing `pub mod types;`:

```rust
pub mod planning;
```

Don't change anything else in `lib.rs` yet.

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p klassenzeit-scheduler`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add scheduler/src/planning.rs scheduler/src/lib.rs
git commit -m "feat(scheduler): add planning domain model with HardSoftScore"
```

---

### Task 3: Mapper — ScheduleInput to internal model

**Files:**
- Create: `scheduler/src/mapper.rs`
- Modify: `scheduler/src/lib.rs` (add `mod mapper;`)

- [ ] **Step 1: Write the failing test**

Add to the bottom of `scheduler/src/mapper.rs` (the test will be part of the same file):

```rust
use bitvec::prelude::*;
use std::collections::HashMap;
use uuid::Uuid;

use crate::planning::*;
use crate::types::*;

// ---------------------------------------------------------------------------
// Index maps for UUID ↔ usize translation
// ---------------------------------------------------------------------------

pub struct IndexMaps {
    pub teacher_uuid_to_idx: HashMap<Uuid, usize>,
    pub class_uuid_to_idx: HashMap<Uuid, usize>,
    pub room_uuid_to_idx: HashMap<Uuid, usize>,
    pub subject_uuid_to_idx: HashMap<Uuid, usize>,
    pub timeslot_uuid_to_idx: HashMap<Uuid, usize>,
    // Reverse maps for output conversion
    pub teacher_uuids: Vec<Uuid>,
    pub class_uuids: Vec<Uuid>,
    pub room_uuids: Vec<Uuid>,
    pub subject_uuids: Vec<Uuid>,
    pub timeslot_uuids: Vec<Uuid>,
}

pub fn to_planning(input: &ScheduleInput) -> (PlanningSolution, IndexMaps) {
    todo!()
}

pub fn to_output(
    solution: &PlanningSolution,
    maps: &IndexMaps,
    input: &ScheduleInput,
) -> ScheduleOutput {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(day: u8, period: u8) -> TimeSlot {
        TimeSlot { id: Uuid::new_v4(), day, period }
    }

    #[test]
    fn round_trip_single_lesson() {
        let slots = vec![ts(0, 1), ts(0, 2)];
        let math_id = Uuid::new_v4();
        let input = ScheduleInput {
            teachers: vec![Teacher {
                id: Uuid::new_v4(),
                name: "Alice".into(),
                max_hours_per_week: 28,
                is_part_time: false,
                available_slots: slots.clone(),
                qualified_subjects: vec![math_id],
            }],
            classes: vec![SchoolClass {
                id: Uuid::new_v4(),
                name: "1A".into(),
                grade_level: 1,
                student_count: Some(25),
            }],
            rooms: vec![],
            subjects: vec![Subject {
                id: math_id,
                name: "Math".into(),
                needs_special_room: false,
            }],
            timeslots: slots,
            requirements: vec![LessonRequirement {
                class_id: Uuid::nil(), // placeholder — set below
                subject_id: math_id,
                teacher_id: None,
                hours_per_week: 2,
            }],
        };
        // Fix up class_id
        let mut input = input;
        input.requirements[0].class_id = input.classes[0].id;

        let (solution, maps) = to_planning(&input);

        // Should have 2 lessons (hours_per_week = 2)
        assert_eq!(solution.lessons.len(), 2);
        // Should have 2 timeslots
        assert_eq!(solution.facts.timeslots.len(), 2);
        // Should have 1 teacher, 1 class, 0 rooms, 1 subject
        assert_eq!(solution.facts.teachers.len(), 1);
        assert_eq!(solution.facts.classes.len(), 1);
        assert_eq!(solution.facts.rooms.len(), 0);
        assert_eq!(solution.facts.subjects.len(), 1);
        // Teacher should be available in both timeslots
        assert_eq!(solution.facts.teachers[0].available_slots.count_ones(), 2);
        // Teacher should be qualified for math (subject idx 0)
        assert!(solution.facts.teachers[0].qualified_subjects[0]);
        // Index maps should be consistent
        assert_eq!(maps.teacher_uuids.len(), 1);
        assert_eq!(maps.timeslot_uuids.len(), 2);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p klassenzeit-scheduler round_trip_single_lesson -- --nocapture`
Expected: FAIL with "not yet implemented"

- [ ] **Step 3: Implement to_planning**

Replace the `todo!()` in `to_planning` with:

```rust
pub fn to_planning(input: &ScheduleInput) -> (PlanningSolution, IndexMaps) {
    let num_subjects = input.subjects.len();
    let num_timeslots = input.timeslots.len();

    // Build UUID → index maps
    let mut subject_uuid_to_idx = HashMap::new();
    let mut subject_uuids = Vec::new();
    for (i, s) in input.subjects.iter().enumerate() {
        subject_uuid_to_idx.insert(s.id, i);
        subject_uuids.push(s.id);
    }

    let mut timeslot_uuid_to_idx = HashMap::new();
    let mut timeslot_uuids = Vec::new();
    for (i, ts) in input.timeslots.iter().enumerate() {
        timeslot_uuid_to_idx.insert(ts.id, i);
        timeslot_uuids.push(ts.id);
    }

    let mut teacher_uuid_to_idx = HashMap::new();
    let mut teacher_uuids = Vec::new();
    let mut teachers = Vec::new();
    for (i, t) in input.teachers.iter().enumerate() {
        teacher_uuid_to_idx.insert(t.id, i);
        teacher_uuids.push(t.id);

        let mut available_slots = bitvec![0; num_timeslots];
        for slot in &t.available_slots {
            if let Some(&idx) = timeslot_uuid_to_idx.get(&slot.id) {
                available_slots.set(idx, true);
            }
        }

        let mut qualified_subjects = bitvec![0; num_subjects];
        for &subj_id in &t.qualified_subjects {
            if let Some(&idx) = subject_uuid_to_idx.get(&subj_id) {
                qualified_subjects.set(idx, true);
            }
        }

        teachers.push(TeacherFact {
            max_hours: t.max_hours_per_week,
            available_slots,
            qualified_subjects,
        });
    }

    let mut class_uuid_to_idx = HashMap::new();
    let mut class_uuids = Vec::new();
    let mut classes = Vec::new();
    for (i, c) in input.classes.iter().enumerate() {
        class_uuid_to_idx.insert(c.id, i);
        class_uuids.push(c.id);
        classes.push(ClassFact {
            student_count: c.student_count,
            class_teacher_idx: None, // no class_teacher in current schema
        });
    }

    let mut room_uuid_to_idx = HashMap::new();
    let mut room_uuids = Vec::new();
    let mut rooms = Vec::new();
    for (i, r) in input.rooms.iter().enumerate() {
        room_uuid_to_idx.insert(r.id, i);
        room_uuids.push(r.id);

        let mut suitable_subjects = bitvec![0; num_subjects];
        for &subj_id in &r.suitable_subjects {
            if let Some(&idx) = subject_uuid_to_idx.get(&subj_id) {
                suitable_subjects.set(idx, true);
            }
        }

        rooms.push(RoomFact {
            capacity: r.capacity,
            suitable_subjects,
        });
    }

    let timeslots: Vec<Timeslot> = input
        .timeslots
        .iter()
        .map(|ts| Timeslot { day: ts.day, period: ts.period })
        .collect();

    let subjects: Vec<SubjectFact> = input
        .subjects
        .iter()
        .map(|s| SubjectFact { needs_special_room: s.needs_special_room })
        .collect();

    // Expand requirements into individual lessons
    let mut lessons = Vec::new();
    let mut lesson_id = 0;
    for req in &input.requirements {
        let class_idx = class_uuid_to_idx[&req.class_id];
        let subject_idx = subject_uuid_to_idx[&req.subject_id];

        let teacher_idx = if let Some(tid) = req.teacher_id {
            teacher_uuid_to_idx[&tid]
        } else {
            // Find first qualified teacher — construction heuristic will optimize
            teachers
                .iter()
                .position(|t| t.qualified_subjects[subject_idx])
                .unwrap_or(0) // will produce a qualification violation if none qualified
        };

        for _ in 0..req.hours_per_week {
            lessons.push(PlanningLesson {
                id: lesson_id,
                subject_idx,
                teacher_idx,
                class_idx,
                timeslot: None,
                room: None,
            });
            lesson_id += 1;
        }
    }

    let facts = ProblemFacts {
        timeslots,
        rooms,
        teachers,
        classes,
        subjects,
    };

    let solution = PlanningSolution {
        lessons,
        facts,
        score: HardSoftScore::ZERO,
    };

    let maps = IndexMaps {
        teacher_uuid_to_idx,
        class_uuid_to_idx,
        room_uuid_to_idx,
        subject_uuid_to_idx,
        timeslot_uuid_to_idx,
        teacher_uuids,
        class_uuids,
        room_uuids,
        subject_uuids,
        timeslot_uuids,
    };

    (solution, maps)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p klassenzeit-scheduler round_trip_single_lesson -- --nocapture`
Expected: PASS

- [ ] **Step 5: Write the to_output failing test**

Add to the `mod tests` block in `mapper.rs`:

```rust
    #[test]
    fn to_output_maps_back_to_uuids() {
        let slot = ts(0, 1);
        let math_id = Uuid::new_v4();
        let teacher_id = Uuid::new_v4();
        let class_id = Uuid::new_v4();

        let input = ScheduleInput {
            teachers: vec![Teacher {
                id: teacher_id,
                name: "Alice".into(),
                max_hours_per_week: 28,
                is_part_time: false,
                available_slots: vec![slot.clone()],
                qualified_subjects: vec![math_id],
            }],
            classes: vec![SchoolClass {
                id: class_id,
                name: "1A".into(),
                grade_level: 1,
                student_count: None,
            }],
            rooms: vec![],
            subjects: vec![Subject {
                id: math_id,
                name: "Math".into(),
                needs_special_room: false,
            }],
            timeslots: vec![slot.clone()],
            requirements: vec![LessonRequirement {
                class_id,
                subject_id: math_id,
                teacher_id: Some(teacher_id),
                hours_per_week: 1,
            }],
        };

        let (mut solution, maps) = to_planning(&input);
        // Simulate assignment: lesson 0 → timeslot 0, no room
        solution.lessons[0].timeslot = Some(0);
        solution.score = HardSoftScore::ZERO;

        let output = to_output(&solution, &maps, &input);
        assert_eq!(output.timetable.len(), 1);
        assert_eq!(output.timetable[0].teacher_id, teacher_id);
        assert_eq!(output.timetable[0].class_id, class_id);
        assert_eq!(output.timetable[0].subject_id, math_id);
        assert_eq!(output.timetable[0].timeslot.id, slot.id);
        assert_eq!(output.timetable[0].room_id, None);
        assert_eq!(output.score.hard_violations, 0);
    }
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cargo test -p klassenzeit-scheduler to_output_maps_back -- --nocapture`
Expected: FAIL with "not yet implemented"

- [ ] **Step 7: Implement to_output**

Replace the `todo!()` in `to_output` with:

```rust
pub fn to_output(
    solution: &PlanningSolution,
    maps: &IndexMaps,
    input: &ScheduleInput,
) -> ScheduleOutput {
    let mut timetable = Vec::new();
    let mut violations = Vec::new();

    for lesson in &solution.lessons {
        if let Some(ts_idx) = lesson.timeslot {
            timetable.push(Lesson {
                teacher_id: maps.teacher_uuids[lesson.teacher_idx],
                class_id: maps.class_uuids[lesson.class_idx],
                subject_id: maps.subject_uuids[lesson.subject_idx],
                room_id: lesson.room.map(|r| maps.room_uuids[r]),
                timeslot: input.timeslots[ts_idx].clone(),
            });
        } else {
            violations.push(Violation {
                description: format!(
                    "Could not place lesson: subject {} for class {}",
                    maps.subject_uuids[lesson.subject_idx],
                    maps.class_uuids[lesson.class_idx],
                ),
            });
        }
    }

    // Also report constraint violations from the score
    let hard_violations = (-solution.score.hard) as u32;
    let unplaced = violations.len() as u32;

    ScheduleOutput {
        timetable,
        score: Score {
            hard_violations: hard_violations + unplaced,
            soft_score: solution.score.soft as f64,
        },
        violations,
    }
}
```

- [ ] **Step 8: Register module and run all tests**

Add `pub mod mapper;` to `scheduler/src/lib.rs`.

Run: `cargo test -p klassenzeit-scheduler -- --nocapture`
Expected: all existing tests + 2 new mapper tests pass

- [ ] **Step 9: Commit**

```bash
git add scheduler/src/mapper.rs scheduler/src/lib.rs
git commit -m "feat(scheduler): add mapper between public API types and internal planning model"
```

---

### Task 4: Full constraint evaluation

**Files:**
- Create: `scheduler/src/constraints.rs`
- Create: `scheduler/tests/constraints.rs`
- Modify: `scheduler/src/lib.rs` (add `mod constraints;`)

- [ ] **Step 1: Write failing tests for all 8 constraints**

Create `scheduler/tests/constraints.rs`:

```rust
use bitvec::prelude::*;
use klassenzeit_scheduler::planning::*;

/// Helper: create minimal problem facts with given counts.
fn make_facts(
    num_timeslots: usize,
    num_teachers: usize,
    num_classes: usize,
    num_rooms: usize,
    num_subjects: usize,
) -> ProblemFacts {
    ProblemFacts {
        timeslots: (0..num_timeslots)
            .map(|i| Timeslot { day: (i / 8) as u8, period: (i % 8) as u8 })
            .collect(),
        teachers: (0..num_teachers)
            .map(|_| TeacherFact {
                max_hours: 28,
                available_slots: bitvec![1; num_timeslots],
                qualified_subjects: bitvec![1; num_subjects],
            })
            .collect(),
        classes: (0..num_classes)
            .map(|_| ClassFact { student_count: Some(25), class_teacher_idx: None })
            .collect(),
        rooms: (0..num_rooms)
            .map(|_| RoomFact {
                capacity: Some(30),
                suitable_subjects: bitvec![1; num_subjects],
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact { needs_special_room: false })
            .collect(),
    }
}

fn lesson(id: usize, teacher: usize, class: usize, subject: usize, ts: usize, room: Option<usize>) -> PlanningLesson {
    PlanningLesson {
        id,
        subject_idx: subject,
        teacher_idx: teacher,
        class_idx: class,
        timeslot: Some(ts),
        room,
    }
}

#[test]
fn no_violations_for_valid_assignment() {
    let facts = make_facts(2, 2, 2, 0, 1);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 1, 1, 0, 1, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score, HardSoftScore::ZERO);
}

#[test]
fn teacher_conflict_detected() {
    let facts = make_facts(2, 1, 2, 0, 1);
    // Same teacher (0), same timeslot (0), different classes
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 0, 1, 0, 0, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn class_conflict_detected() {
    let facts = make_facts(2, 2, 1, 0, 1);
    // Different teachers, same class (0), same timeslot (0)
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 1, 0, 0, 0, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_conflict_detected() {
    let facts = make_facts(2, 2, 2, 1, 1);
    // Different teachers/classes, same room (0), same timeslot (0)
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, Some(0)),
        lesson(1, 1, 1, 0, 0, Some(0)),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_conflict_skipped_when_no_room() {
    let facts = make_facts(2, 2, 2, 1, 1);
    // Same timeslot but no room assigned — no room conflict
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 1, 1, 0, 0, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, 0);
}

#[test]
fn teacher_availability_violation() {
    let mut facts = make_facts(2, 1, 1, 0, 1);
    // Teacher 0 is NOT available in timeslot 0
    facts.teachers[0].available_slots.set(0, false);
    let lessons = vec![lesson(0, 0, 0, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn teacher_over_capacity_violation() {
    let mut facts = make_facts(3, 1, 1, 0, 1);
    facts.teachers[0].max_hours = 1; // only 1 hour allowed
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 0, 0, 0, 1, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    // 2 lessons assigned, max 1 → 1 excess hour → -1
    assert_eq!(score.hard, -1);
}

#[test]
fn teacher_over_capacity_proportional() {
    let mut facts = make_facts(4, 1, 1, 0, 1);
    facts.teachers[0].max_hours = 1;
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 0, 0, 0, 1, None),
        lesson(2, 0, 0, 0, 2, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    // 3 lessons, max 1 → 2 excess → -2
    assert_eq!(score.hard, -2);
}

#[test]
fn teacher_qualification_violation() {
    let mut facts = make_facts(2, 1, 1, 0, 2);
    // Teacher 0 is qualified for subject 0 but NOT subject 1
    facts.teachers[0].qualified_subjects.set(1, false);
    let lessons = vec![lesson(0, 0, 0, 1, 0, None)]; // subject 1
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_suitability_violation() {
    let mut facts = make_facts(2, 1, 1, 1, 2);
    facts.subjects[1].needs_special_room = true;
    // Room 0 is suitable for subject 0 but NOT subject 1
    facts.rooms[0].suitable_subjects.set(1, false);
    let lessons = vec![lesson(0, 0, 0, 1, 0, Some(0))]; // subject 1, room 0
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_capacity_violation() {
    let mut facts = make_facts(2, 1, 1, 1, 1);
    facts.classes[0].student_count = Some(35);
    facts.rooms[0].capacity = Some(30); // too small
    let lessons = vec![lesson(0, 0, 0, 0, 0, Some(0))];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1);
}

#[test]
fn room_capacity_ok_when_none() {
    let mut facts = make_facts(2, 1, 1, 1, 1);
    facts.classes[0].student_count = None; // unknown count
    facts.rooms[0].capacity = Some(30);
    let lessons = vec![lesson(0, 0, 0, 0, 0, Some(0))];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, 0);
}

#[test]
fn multiple_violations_stack() {
    let mut facts = make_facts(2, 1, 2, 0, 1);
    // Teacher conflict (same teacher, same timeslot) + teacher over-capacity (max 1)
    facts.teachers[0].max_hours = 1;
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 0, 1, 0, 0, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    // -1 teacher conflict + -1 over-capacity = -2
    assert_eq!(score.hard, -2);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-scheduler --test constraints`
Expected: compilation error — `constraints` module doesn't exist yet

- [ ] **Step 3: Implement full_evaluate in constraints.rs**

Create `scheduler/src/constraints.rs`:

```rust
use std::collections::HashMap;

use bitvec::prelude::*;

use crate::planning::*;

/// Evaluate all hard constraints from scratch. O(n²) for conflict constraints.
/// Used as the reference implementation for correctness testing.
pub fn full_evaluate(lessons: &[PlanningLesson], facts: &ProblemFacts) -> HardSoftScore {
    let mut score = HardSoftScore::ZERO;

    // Only consider assigned lessons
    let assigned: Vec<&PlanningLesson> = lessons.iter().filter(|l| l.timeslot.is_some()).collect();

    // --- Pairwise constraints (teacher/class/room conflicts) ---
    for i in 0..assigned.len() {
        for j in (i + 1)..assigned.len() {
            let a = assigned[i];
            let b = assigned[j];
            let same_slot = a.timeslot == b.timeslot;
            if !same_slot {
                continue;
            }

            // 1. Teacher conflict
            if a.teacher_idx == b.teacher_idx {
                score += HardSoftScore::hard(-1);
            }

            // 2. Class conflict
            if a.class_idx == b.class_idx {
                score += HardSoftScore::hard(-1);
            }

            // 3. Room conflict (skip if either has no room)
            if let (Some(ra), Some(rb)) = (a.room, b.room) {
                if ra == rb {
                    score += HardSoftScore::hard(-1);
                }
            }
        }
    }

    // --- Per-lesson constraints ---
    for lesson in &assigned {
        let ts_idx = lesson.timeslot.unwrap();
        let teacher = &facts.teachers[lesson.teacher_idx];

        // 4. Teacher availability
        if !teacher.available_slots[ts_idx] {
            score += HardSoftScore::hard(-1);
        }

        // 6. Teacher qualification
        if !teacher.qualified_subjects[lesson.subject_idx] {
            score += HardSoftScore::hard(-1);
        }

        // 7. Room suitability (only if room assigned)
        if let Some(room_idx) = lesson.room {
            let room = &facts.rooms[room_idx];
            if !room.suitable_subjects[lesson.subject_idx] {
                score += HardSoftScore::hard(-1);
            }

            // 8. Room capacity
            if let (Some(cap), Some(count)) =
                (room.capacity, facts.classes[lesson.class_idx].student_count)
            {
                if cap < count {
                    score += HardSoftScore::hard(-1);
                }
            }
        }
    }

    // 5. Teacher over-capacity
    let mut teacher_hours: HashMap<usize, u32> = HashMap::new();
    for lesson in &assigned {
        *teacher_hours.entry(lesson.teacher_idx).or_insert(0) += 1;
    }
    for (&teacher_idx, &hours) in &teacher_hours {
        let max = facts.teachers[teacher_idx].max_hours;
        if hours > max {
            score += HardSoftScore::hard(-((hours - max) as i64));
        }
    }

    score
}
```

- [ ] **Step 4: Register module and run constraint tests**

Add `pub mod constraints;` to `scheduler/src/lib.rs`.

Run: `cargo test -p klassenzeit-scheduler --test constraints -- --nocapture`
Expected: all 13 constraint tests pass

- [ ] **Step 5: Run all tests**

Run: `cargo test -p klassenzeit-scheduler -- --nocapture`
Expected: all tests pass (existing basic tests + mapper tests + constraint tests)

- [ ] **Step 6: Commit**

```bash
git add scheduler/src/constraints.rs scheduler/tests/constraints.rs scheduler/src/lib.rs
git commit -m "feat(scheduler): add full constraint evaluation with 8 hard constraints"
```

---

### Task 5: Incremental scoring state

**Files:**
- Modify: `scheduler/src/constraints.rs`
- Create: `scheduler/tests/incremental.rs`

- [ ] **Step 1: Write failing test for incremental state**

Create `scheduler/tests/incremental.rs`:

```rust
use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::{full_evaluate, IncrementalState};
use klassenzeit_scheduler::planning::*;

fn make_facts(
    num_timeslots: usize,
    num_teachers: usize,
    num_classes: usize,
    num_rooms: usize,
    num_subjects: usize,
) -> ProblemFacts {
    ProblemFacts {
        timeslots: (0..num_timeslots)
            .map(|i| Timeslot { day: (i / 8) as u8, period: (i % 8) as u8 })
            .collect(),
        teachers: (0..num_teachers)
            .map(|_| TeacherFact {
                max_hours: 28,
                available_slots: bitvec![1; num_timeslots],
                qualified_subjects: bitvec![1; num_subjects],
            })
            .collect(),
        classes: (0..num_classes)
            .map(|_| ClassFact { student_count: Some(25), class_teacher_idx: None })
            .collect(),
        rooms: (0..num_rooms)
            .map(|_| RoomFact {
                capacity: Some(30),
                suitable_subjects: bitvec![1; num_subjects],
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact { needs_special_room: false })
            .collect(),
    }
}

#[test]
fn incremental_matches_full_after_assign() {
    let facts = make_facts(4, 2, 2, 0, 1);
    let mut lessons = vec![
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 1, class_idx: 1, timeslot: None, room: None },
    ];

    let mut state = IncrementalState::new(&facts);

    // Assign lesson 0 to timeslot 0
    state.assign(&mut lessons[0], 0, None, &facts);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));

    // Assign lesson 1 to timeslot 0 (no conflict — different teacher, different class)
    state.assign(&mut lessons[1], 0, None, &facts);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_detects_teacher_conflict() {
    let facts = make_facts(4, 1, 2, 0, 1);
    let mut lessons = vec![
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 0, class_idx: 1, timeslot: None, room: None },
    ];

    let mut state = IncrementalState::new(&facts);
    state.assign(&mut lessons[0], 0, None, &facts);
    state.assign(&mut lessons[1], 0, None, &facts); // same teacher, same slot

    assert_eq!(state.score().hard, -1);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_unassign_removes_violations() {
    let facts = make_facts(4, 1, 2, 0, 1);
    let mut lessons = vec![
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 0, class_idx: 1, timeslot: None, room: None },
    ];

    let mut state = IncrementalState::new(&facts);
    state.assign(&mut lessons[0], 0, None, &facts);
    state.assign(&mut lessons[1], 0, None, &facts);
    assert_eq!(state.score().hard, -1);

    // Unassign lesson 1 — conflict should disappear
    state.unassign(&mut lessons[1], &facts);
    assert_eq!(state.score().hard, 0);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_reassign_updates_correctly() {
    let facts = make_facts(4, 1, 2, 0, 1);
    let mut lessons = vec![
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 0, class_idx: 1, timeslot: None, room: None },
    ];

    let mut state = IncrementalState::new(&facts);
    state.assign(&mut lessons[0], 0, None, &facts);
    state.assign(&mut lessons[1], 0, None, &facts); // conflict
    assert_eq!(state.score().hard, -1);

    // Reassign lesson 1 to timeslot 1 — no more conflict
    state.unassign(&mut lessons[1], &facts);
    state.assign(&mut lessons[1], 1, None, &facts);
    assert_eq!(state.score().hard, 0);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_triple_conflict_counts_pairs() {
    // 3 lessons with same teacher at same slot = C(3,2) = 3 conflict pairs
    let facts = make_facts(4, 1, 3, 0, 1);
    let mut lessons = vec![
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 0, class_idx: 1, timeslot: None, room: None },
        PlanningLesson { id: 2, subject_idx: 0, teacher_idx: 0, class_idx: 2, timeslot: None, room: None },
    ];

    let mut state = IncrementalState::new(&facts);
    state.assign(&mut lessons[0], 0, None, &facts);
    state.assign(&mut lessons[1], 0, None, &facts);
    state.assign(&mut lessons[2], 0, None, &facts);

    // 3 teacher conflict pairs: (0,1), (0,2), (1,2)
    assert_eq!(state.score().hard, -3);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-scheduler --test incremental`
Expected: compilation error — `IncrementalState` doesn't exist yet

- [ ] **Step 3: Implement IncrementalState**

Add to `scheduler/src/constraints.rs` (no additional imports needed — this uses `Vec<Vec<u16>>` instead of bitvec):

```rust
/// Incremental constraint state backed by counter matrices.
/// Uses counters (not booleans) so that 3 lessons at the same (teacher, slot)
/// correctly produces 3 conflict pairs, matching `full_evaluate`'s O(n²) counting.
///
/// Maintains running score that matches `full_evaluate` at all times.
pub struct IncrementalState {
    /// teacher_at_slot[teacher_idx][timeslot_idx] = number of lessons occupying this (teacher, slot)
    teacher_at_slot: Vec<Vec<u16>>,
    /// class_at_slot[class_idx][timeslot_idx] = count
    class_at_slot: Vec<Vec<u16>>,
    /// room_at_slot[room_idx][timeslot_idx] = count
    room_at_slot: Vec<Vec<u16>>,
    /// Number of assigned lessons per teacher
    teacher_hours: Vec<u32>,
    /// Running score
    score: HardSoftScore,
}

impl IncrementalState {
    pub fn new(facts: &ProblemFacts) -> Self {
        let num_slots = facts.timeslots.len();
        Self {
            teacher_at_slot: vec![vec![0u16; num_slots]; facts.teachers.len()],
            class_at_slot: vec![vec![0u16; num_slots]; facts.classes.len()],
            room_at_slot: vec![vec![0u16; num_slots]; facts.rooms.len()],
            teacher_hours: vec![0; facts.teachers.len()],
            score: HardSoftScore::ZERO,
        }
    }

    pub fn score(&self) -> HardSoftScore {
        self.score
    }

    /// Assign a lesson to a timeslot (and optionally a room).
    /// Updates the lesson's fields and the incremental score.
    ///
    /// Conflict penalty math: adding a lesson to a slot where `k` lessons already
    /// exist creates `k` new conflict pairs (one with each existing lesson).
    pub fn assign(
        &mut self,
        lesson: &mut PlanningLesson,
        timeslot: usize,
        room: Option<usize>,
        facts: &ProblemFacts,
    ) {
        debug_assert!(lesson.timeslot.is_none(), "lesson already assigned — unassign first");

        let teacher = lesson.teacher_idx;
        let class = lesson.class_idx;

        // --- Conflict violations: delta = -(existing count at this slot) ---

        let existing_teacher = self.teacher_at_slot[teacher][timeslot] as i64;
        if existing_teacher > 0 {
            self.score += HardSoftScore::hard(-existing_teacher);
        }

        let existing_class = self.class_at_slot[class][timeslot] as i64;
        if existing_class > 0 {
            self.score += HardSoftScore::hard(-existing_class);
        }

        if let Some(r) = room {
            let existing_room = self.room_at_slot[r][timeslot] as i64;
            if existing_room > 0 {
                self.score += HardSoftScore::hard(-existing_room);
            }
        }

        // --- Per-lesson constraints ---
        let teacher_fact = &facts.teachers[teacher];

        // Teacher availability
        if !teacher_fact.available_slots[timeslot] {
            self.score += HardSoftScore::hard(-1);
        }

        // Teacher qualification
        if !teacher_fact.qualified_subjects[lesson.subject_idx] {
            self.score += HardSoftScore::hard(-1);
        }

        // Room suitability and capacity
        if let Some(r) = room {
            let room_fact = &facts.rooms[r];
            if !room_fact.suitable_subjects[lesson.subject_idx] {
                self.score += HardSoftScore::hard(-1);
            }
            if let (Some(cap), Some(count)) =
                (room_fact.capacity, facts.classes[class].student_count)
            {
                if cap < count {
                    self.score += HardSoftScore::hard(-1);
                }
            }
        }

        // Teacher over-capacity (check before incrementing)
        let old_hours = self.teacher_hours[teacher];
        let max = teacher_fact.max_hours;
        if old_hours >= max {
            self.score += HardSoftScore::hard(-1);
        }
        self.teacher_hours[teacher] = old_hours + 1;

        // --- Update state ---
        self.teacher_at_slot[teacher][timeslot] += 1;
        self.class_at_slot[class][timeslot] += 1;
        if let Some(r) = room {
            self.room_at_slot[r][timeslot] += 1;
        }

        lesson.timeslot = Some(timeslot);
        lesson.room = room;
    }

    /// Remove a lesson's assignment. Reverses all scoring effects of `assign`.
    ///
    /// Conflict undo math: removing a lesson from a slot where `k` lessons exist
    /// (including this one) removes `k-1` conflict pairs.
    pub fn unassign(&mut self, lesson: &mut PlanningLesson, facts: &ProblemFacts) {
        let timeslot = lesson.timeslot.expect("lesson not assigned");
        let room = lesson.room;
        let teacher = lesson.teacher_idx;
        let class = lesson.class_idx;

        // --- Decrement counters first ---
        self.teacher_at_slot[teacher][timeslot] -= 1;
        self.class_at_slot[class][timeslot] -= 1;
        if let Some(r) = room {
            self.room_at_slot[r][timeslot] -= 1;
        }

        // --- Undo conflict violations: delta = +(remaining count) ---
        let remaining_teacher = self.teacher_at_slot[teacher][timeslot] as i64;
        if remaining_teacher > 0 {
            self.score += HardSoftScore::hard(remaining_teacher);
        }

        let remaining_class = self.class_at_slot[class][timeslot] as i64;
        if remaining_class > 0 {
            self.score += HardSoftScore::hard(remaining_class);
        }

        if let Some(r) = room {
            let remaining_room = self.room_at_slot[r][timeslot] as i64;
            if remaining_room > 0 {
                self.score += HardSoftScore::hard(remaining_room);
            }
        }

        // --- Undo per-lesson constraints ---
        let teacher_fact = &facts.teachers[teacher];

        if !teacher_fact.available_slots[timeslot] {
            self.score += HardSoftScore::hard(1);
        }
        if !teacher_fact.qualified_subjects[lesson.subject_idx] {
            self.score += HardSoftScore::hard(1);
        }
        if let Some(r) = room {
            let room_fact = &facts.rooms[r];
            if !room_fact.suitable_subjects[lesson.subject_idx] {
                self.score += HardSoftScore::hard(1);
            }
            if let (Some(cap), Some(count)) =
                (room_fact.capacity, facts.classes[class].student_count)
            {
                if cap < count {
                    self.score += HardSoftScore::hard(1);
                }
            }
        }

        // Teacher over-capacity
        self.teacher_hours[teacher] -= 1;
        let new_hours = self.teacher_hours[teacher];
        let max = teacher_fact.max_hours;
        if new_hours >= max {
            self.score += HardSoftScore::hard(1);
        }

        lesson.timeslot = None;
        lesson.room = None;
    }

    /// Calculate the score delta if this lesson were assigned to (timeslot, room),
    /// WITHOUT actually modifying state. Used by construction heuristic to compare candidates.
    pub fn evaluate_assign(
        &self,
        lesson: &PlanningLesson,
        timeslot: usize,
        room: Option<usize>,
        facts: &ProblemFacts,
    ) -> HardSoftScore {
        let mut delta = HardSoftScore::ZERO;
        let teacher = lesson.teacher_idx;
        let class = lesson.class_idx;

        let existing_teacher = self.teacher_at_slot[teacher][timeslot] as i64;
        if existing_teacher > 0 {
            delta += HardSoftScore::hard(-existing_teacher);
        }

        let existing_class = self.class_at_slot[class][timeslot] as i64;
        if existing_class > 0 {
            delta += HardSoftScore::hard(-existing_class);
        }

        if let Some(r) = room {
            let existing_room = self.room_at_slot[r][timeslot] as i64;
            if existing_room > 0 {
                delta += HardSoftScore::hard(-existing_room);
            }
        }

        let teacher_fact = &facts.teachers[teacher];
        if !teacher_fact.available_slots[timeslot] {
            delta += HardSoftScore::hard(-1);
        }
        if !teacher_fact.qualified_subjects[lesson.subject_idx] {
            delta += HardSoftScore::hard(-1);
        }
        if let Some(r) = room {
            let room_fact = &facts.rooms[r];
            if !room_fact.suitable_subjects[lesson.subject_idx] {
                delta += HardSoftScore::hard(-1);
            }
            if let (Some(cap), Some(count)) =
                (room_fact.capacity, facts.classes[class].student_count)
            {
                if cap < count {
                    delta += HardSoftScore::hard(-1);
                }
            }
        }

        if self.teacher_hours[teacher] >= teacher_fact.max_hours {
            delta += HardSoftScore::hard(-1);
        }

        delta
    }
}
```

- [ ] **Step 4: Run incremental tests**

Run: `cargo test -p klassenzeit-scheduler --test incremental -- --nocapture`
Expected: all 5 tests pass (including triple conflict)

- [ ] **Step 5: Run all tests**

Run: `cargo test -p klassenzeit-scheduler -- --nocapture`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add scheduler/src/constraints.rs scheduler/tests/incremental.rs
git commit -m "feat(scheduler): add incremental scoring state with bitset conflict matrices"
```

---

### Task 6: Property-based test — incremental vs full evaluation

**Files:**
- Create: `scheduler/tests/proptest_scoring.rs`

- [ ] **Step 1: Write the property-based test**

Create `scheduler/tests/proptest_scoring.rs`:

```rust
use bitvec::prelude::*;
use klassenzeit_scheduler::constraints::{full_evaluate, IncrementalState};
use klassenzeit_scheduler::planning::*;
use proptest::prelude::*;

/// Generate a random problem with constrained dimensions.
fn arb_problem() -> impl Strategy<Value = (ProblemFacts, Vec<PlanningLesson>)> {
    // Small sizes to keep tests fast
    (1..=5usize, 1..=4usize, 1..=3usize, 0..=2usize, 1..=3usize).prop_flat_map(
        |(num_slots, num_teachers, num_classes, num_rooms, num_subjects)| {
            let facts_strat = (
                proptest::collection::vec(prop::bool::ANY, num_slots * num_teachers), // teacher availability
                proptest::collection::vec(prop::bool::ANY, num_subjects * num_teachers), // teacher quals
                proptest::collection::vec(1..=30u32, num_teachers), // max hours
                proptest::collection::vec(prop::bool::ANY, num_subjects * num_rooms), // room suitability
            )
                .prop_map(
                    move |(avail_bits, qual_bits, max_hours, suit_bits)| {
                        let teachers: Vec<TeacherFact> = (0..num_teachers)
                            .map(|t| {
                                let mut available_slots = bitvec![0; num_slots];
                                for s in 0..num_slots {
                                    available_slots.set(s, avail_bits[t * num_slots + s]);
                                }
                                let mut qualified_subjects = bitvec![0; num_subjects];
                                for s in 0..num_subjects {
                                    qualified_subjects.set(s, qual_bits[t * num_subjects + s]);
                                }
                                TeacherFact {
                                    max_hours: max_hours[t],
                                    available_slots,
                                    qualified_subjects,
                                }
                            })
                            .collect();

                        let rooms: Vec<RoomFact> = (0..num_rooms)
                            .map(|r| {
                                let mut suitable_subjects = bitvec![0; num_subjects];
                                for s in 0..num_subjects {
                                    suitable_subjects.set(s, suit_bits[r * num_subjects + s]);
                                }
                                RoomFact {
                                    capacity: Some(30),
                                    suitable_subjects,
                                }
                            })
                            .collect();

                        ProblemFacts {
                            timeslots: (0..num_slots)
                                .map(|i| Timeslot {
                                    day: (i / 8) as u8,
                                    period: (i % 8) as u8,
                                })
                                .collect(),
                            teachers,
                            classes: (0..num_classes)
                                .map(|_| ClassFact {
                                    student_count: Some(25),
                                    class_teacher_idx: None,
                                })
                                .collect(),
                            rooms,
                            subjects: (0..num_subjects)
                                .map(|_| SubjectFact {
                                    needs_special_room: false,
                                })
                                .collect(),
                        }
                    },
                );

            // Generate random lessons
            let num_lessons = 1..(num_slots * num_classes).min(8) + 1;
            (facts_strat, num_lessons).prop_flat_map(move |(facts, n_lessons)| {
                let nt = num_teachers;
                let nc = num_classes;
                let ns = num_subjects;
                proptest::collection::vec(
                    (0..nt, 0..nc, 0..ns),
                    n_lessons,
                )
                .prop_map(move |lesson_specs| {
                    let lessons: Vec<PlanningLesson> = lesson_specs
                        .iter()
                        .enumerate()
                        .map(|(id, &(t, c, s))| PlanningLesson {
                            id,
                            teacher_idx: t,
                            class_idx: c,
                            subject_idx: s,
                            timeslot: None,
                            room: None,
                        })
                        .collect();
                    (facts.clone(), lessons)
                })
            })
        },
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    #[test]
    fn incremental_matches_full_on_random_assigns(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..8),
    ) {
        let num_slots = facts.timeslots.len();
        let mut state = IncrementalState::new(&facts);

        for (i, lesson) in lessons.iter_mut().enumerate() {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            state.assign(lesson, slot, None, &facts);

            let full_score = full_evaluate(&lessons, &facts);
            prop_assert_eq!(
                state.score(), full_score,
                "Mismatch after assigning lesson {} to slot {}",
                i, slot
            );
        }
    }

    #[test]
    fn incremental_matches_full_after_unassign(
        (facts, mut lessons) in arb_problem(),
        slot_assignments in proptest::collection::vec(0..5usize, 1..8),
    ) {
        let num_slots = facts.timeslots.len();
        let mut state = IncrementalState::new(&facts);

        // Assign all
        for (i, lesson) in lessons.iter_mut().enumerate() {
            let slot = slot_assignments.get(i).copied().unwrap_or(0) % num_slots;
            state.assign(lesson, slot, None, &facts);
        }

        // Unassign one by one and verify
        for i in (0..lessons.len()).rev() {
            state.unassign(&mut lessons[i], &facts);
            let full_score = full_evaluate(&lessons, &facts);
            prop_assert_eq!(
                state.score(), full_score,
                "Mismatch after unassigning lesson {}",
                i
            );
        }
    }
}
```

- [ ] **Step 2: Run the property tests**

Run: `cargo test -p klassenzeit-scheduler --test proptest_scoring -- --nocapture`
Expected: PASS (200 random cases each)

- [ ] **Step 3: Commit**

```bash
git add scheduler/tests/proptest_scoring.rs
git commit -m "test(scheduler): add property-based tests for incremental scoring correctness"
```

---

### Task 7: Construction heuristic

**Files:**
- Create: `scheduler/src/construction.rs`
- Create: `scheduler/tests/construction.rs`
- Modify: `scheduler/src/lib.rs` (add `mod construction;`)

- [ ] **Step 1: Write failing tests**

Create `scheduler/tests/construction.rs`:

```rust
use bitvec::prelude::*;
use klassenzeit_scheduler::construction::construct;
use klassenzeit_scheduler::planning::*;

fn make_facts_with_availability(
    num_timeslots: usize,
    teacher_configs: Vec<(u32, Vec<bool>)>, // (max_hours, available per slot)
    num_classes: usize,
    num_rooms: usize,
    num_subjects: usize,
) -> ProblemFacts {
    ProblemFacts {
        timeslots: (0..num_timeslots)
            .map(|i| Timeslot { day: (i / 8) as u8, period: (i % 8) as u8 })
            .collect(),
        teachers: teacher_configs
            .into_iter()
            .map(|(max_hours, avail)| {
                let mut available_slots = bitvec![0; num_timeslots];
                for (i, &a) in avail.iter().enumerate() {
                    if i < num_timeslots {
                        available_slots.set(i, a);
                    }
                }
                TeacherFact {
                    max_hours,
                    available_slots,
                    qualified_subjects: bitvec![1; num_subjects],
                }
            })
            .collect(),
        classes: (0..num_classes)
            .map(|_| ClassFact { student_count: Some(25), class_teacher_idx: None })
            .collect(),
        rooms: (0..num_rooms)
            .map(|_| RoomFact {
                capacity: Some(30),
                suitable_subjects: bitvec![1; num_subjects],
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact { needs_special_room: false })
            .collect(),
    }
}

#[test]
fn construct_single_lesson() {
    let facts = make_facts_with_availability(
        2,
        vec![(28, vec![true, true])],
        1, 0, 1,
    );
    let mut lessons = vec![PlanningLesson {
        id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0,
        timeslot: None, room: None,
    }];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    assert!(lessons[0].timeslot.is_some());
}

#[test]
fn construct_avoids_teacher_conflict() {
    // 1 teacher, 2 classes, 2 timeslots, 1 subject
    let facts = make_facts_with_availability(
        2,
        vec![(28, vec![true, true])],
        2, 0, 1,
    );
    let mut lessons = vec![
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 0, class_idx: 1, timeslot: None, room: None },
    ];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    assert_ne!(lessons[0].timeslot, lessons[1].timeslot);
}

#[test]
fn construct_respects_teacher_availability() {
    // Teacher available only in slot 1 (not slot 0)
    let facts = make_facts_with_availability(
        2,
        vec![(28, vec![false, true])],
        1, 0, 1,
    );
    let mut lessons = vec![PlanningLesson {
        id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0,
        timeslot: None, room: None,
    }];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    assert_eq!(lessons[0].timeslot, Some(1));
}

#[test]
fn construct_assigns_room_for_special_subject() {
    let mut facts = make_facts_with_availability(
        2,
        vec![(28, vec![true, true])],
        1, 1, 1,
    );
    facts.subjects[0].needs_special_room = true;

    let mut lessons = vec![PlanningLesson {
        id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0,
        timeslot: None, room: None,
    }];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    assert_eq!(lessons[0].room, Some(0));
}

#[test]
fn construct_unsolvable_reports_violations() {
    // 1 teacher, 1 class, 1 timeslot, but 2 lessons needed — impossible
    let facts = make_facts_with_availability(
        1,
        vec![(28, vec![true])],
        1, 0, 1,
    );
    let mut lessons = vec![
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
    ];

    let score = construct(&mut lessons, &facts);
    // One lesson placed, one can't be (class conflict at same slot)
    // The second lesson gets placed anyway with best-effort → hard violation
    assert!(!score.is_feasible());
}

#[test]
fn construct_most_constrained_first() {
    // Teacher 0: available only in slot 0
    // Teacher 1: available in slots 0 and 1
    // Both teach same class → teacher 0 must go in slot 0, teacher 1 in slot 1
    let facts = make_facts_with_availability(
        2,
        vec![
            (28, vec![true, false]),  // teacher 0: only slot 0
            (28, vec![true, true]),   // teacher 1: both slots
        ],
        1, 0, 1,
    );
    let mut lessons = vec![
        // Lesson order doesn't matter — heuristic should sort by constraint tightness
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 1, class_idx: 0, timeslot: None, room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: None, room: None },
    ];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible());
    // Teacher 0 (more constrained) should get slot 0
    let teacher0_lesson = lessons.iter().find(|l| l.teacher_idx == 0).unwrap();
    assert_eq!(teacher0_lesson.timeslot, Some(0));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-scheduler --test construction`
Expected: compilation error — `construction` module doesn't exist yet

- [ ] **Step 3: Implement construction heuristic**

Create `scheduler/src/construction.rs`:

```rust
use crate::constraints::IncrementalState;
use crate::planning::*;

/// First Fit Decreasing construction heuristic.
///
/// Sorts lessons by constraint tightness (most constrained first), then
/// greedily assigns each lesson to the (timeslot, room) pair with the best
/// (least negative) score delta.
pub fn construct(lessons: &mut [PlanningLesson], facts: &ProblemFacts) -> HardSoftScore {
    let mut state = IncrementalState::new(facts);

    // Build sorted order: most constrained lessons first
    let mut order: Vec<usize> = (0..lessons.len()).collect();
    order.sort_by(|&a, &b| {
        let tightness_a = constraint_tightness(&lessons[a], facts);
        let tightness_b = constraint_tightness(&lessons[b], facts);
        tightness_a.cmp(&tightness_b)
    });

    // Sort timeslots by (day, period) for deterministic ordering
    let mut sorted_slot_indices: Vec<usize> = (0..facts.timeslots.len()).collect();
    sorted_slot_indices.sort_by_key(|&i| (facts.timeslots[i].day, facts.timeslots[i].period));

    // Precompute sorted rooms per subject (smallest suitable room first)
    let rooms_for_subject: Vec<Vec<usize>> = (0..facts.subjects.len())
        .map(|subj_idx| {
            let mut suitable: Vec<usize> = (0..facts.rooms.len())
                .filter(|&r| facts.rooms[r].suitable_subjects[subj_idx])
                .collect();
            suitable.sort_by_key(|&r| facts.rooms[r].capacity.unwrap_or(u32::MAX));
            suitable
        })
        .collect();

    for &lesson_idx in &order {
        let lesson = &lessons[lesson_idx];
        let needs_room = facts.subjects[lesson.subject_idx].needs_special_room;

        let candidates: Vec<(usize, Option<usize>)> = if needs_room {
            // Try all (slot, room) combinations
            sorted_slot_indices
                .iter()
                .flat_map(|&slot| {
                    rooms_for_subject[lesson.subject_idx]
                        .iter()
                        .map(move |&room| (slot, Some(room)))
                })
                .collect()
        } else {
            sorted_slot_indices.iter().map(|&slot| (slot, None)).collect()
        };

        // Find the best candidate
        let mut best: Option<(usize, Option<usize>, HardSoftScore)> = None;
        for (slot, room) in candidates {
            let delta = state.evaluate_assign(lesson, slot, room, facts);
            if delta == HardSoftScore::ZERO {
                // Perfect — no violations, use it immediately
                best = Some((slot, room, delta));
                break;
            }
            match &best {
                None => best = Some((slot, room, delta)),
                Some((_, _, best_delta)) if delta > *best_delta => {
                    best = Some((slot, room, delta));
                }
                _ => {}
            }
        }

        if let Some((slot, room, _)) = best {
            state.assign(&mut lessons[lesson_idx], slot, room, facts);
        }
        // If no candidate at all (empty timeslots), lesson stays unassigned
    }

    state.score()
}

/// Lower = more constrained = should be placed first.
fn constraint_tightness(lesson: &PlanningLesson, facts: &ProblemFacts) -> (usize, usize) {
    let teacher = &facts.teachers[lesson.teacher_idx];

    // Primary: number of available timeslots for this teacher
    let eligible_slots = teacher.available_slots.count_ones();

    // Secondary: number of suitable rooms (0 if no special room needed)
    let eligible_rooms = if facts.subjects[lesson.subject_idx].needs_special_room {
        (0..facts.rooms.len())
            .filter(|&r| facts.rooms[r].suitable_subjects[lesson.subject_idx])
            .count()
    } else {
        usize::MAX // doesn't need a room, least constrained on this dimension
    };

    (eligible_slots, eligible_rooms)
}
```

- [ ] **Step 4: Register module and run construction tests**

Add `pub mod construction;` to `scheduler/src/lib.rs`.

Run: `cargo test -p klassenzeit-scheduler --test construction -- --nocapture`
Expected: all 6 tests pass

- [ ] **Step 5: Run all tests**

Run: `cargo test -p klassenzeit-scheduler -- --nocapture`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add scheduler/src/construction.rs scheduler/tests/construction.rs scheduler/src/lib.rs
git commit -m "feat(scheduler): add First Fit Decreasing construction heuristic"
```

---

### Task 8: Wire up new solver — replace greedy algorithm

**Files:**
- Modify: `scheduler/src/lib.rs` (rewrite `solve()`)
- Modify: `scheduler/tests/basic.rs` (update if needed)

- [ ] **Step 1: Rewrite lib.rs to use new modules**

Replace the entire contents of `scheduler/src/lib.rs`:

```rust
pub mod types;

pub mod planning;
pub mod constraints;
pub mod construction;
pub mod mapper;

use types::*;

pub fn solve(input: ScheduleInput) -> ScheduleOutput {
    if input.requirements.is_empty() {
        return ScheduleOutput::default();
    }

    let (mut solution, maps) = mapper::to_planning(&input);
    solution.score = construction::construct(&mut solution.lessons, &solution.facts);
    mapper::to_output(&solution, &maps, &input)
}
```

- [ ] **Step 2: Run existing basic tests**

Run: `cargo test -p klassenzeit-scheduler --test basic -- --nocapture`
Expected: all 9 existing tests pass with no changes

- [ ] **Step 3: Run all tests**

Run: `cargo test -p klassenzeit-scheduler -- --nocapture`
Expected: all tests pass (basic + mapper + constraints + incremental + proptest + construction)

- [ ] **Step 4: Commit**

```bash
git add scheduler/src/lib.rs
git commit -m "feat(scheduler): replace greedy solver with constraint-based construction heuristic"
```

---

### Task 9: Backend integration verification

**Files:**
- No file changes — verification only

- [ ] **Step 1: Check workspace compiles**

Run: `cargo check --workspace`
Expected: compiles with no errors (the backend's `ScheduleInput`/`ScheduleOutput` types are unchanged)

- [ ] **Step 2: Run backend integration tests**

Run: `cargo test -p klassenzeit-backend --test mod -- --nocapture` (requires running Postgres — skip if no DB)
If DB is available, expected: all pass. If not, the workspace compile check confirms compatibility.

- [ ] **Step 3: Run all scheduler tests one final time**

Run: `cargo test -p klassenzeit-scheduler -- --nocapture`
Expected: all tests pass

- [ ] **Step 4: Commit cleanup if needed**

If any test required changes, commit them. Otherwise no commit needed.

---

### Task 10: Update documentation

**Files:**
- Modify: `docs/superpowers/next-steps.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Update next-steps.md**

Change item 1b status from `ready` to `done`:

```markdown
| 1b | ~~**Domain model + construction heuristic**~~ | done | — | M |
| | Define `Lesson` as planning entity with `timeslot` + `room` as planning variables. Implement 8 hard constraints as ConstraintStream rules. First Fit Decreasing construction heuristic (most-constrained-first). | | | |
```

- [ ] **Step 2: Update STATUS.md**

Add a new section under Completed Steps:

```markdown
### Solver Domain Model + Construction Heuristic
- Spec: `superpowers/specs/2026-04-04-solver-domain-model-design.md`
- Plan: `superpowers/plans/2026-04-04-solver-domain-model.md`
- PR: #XX (merged)
```

Update "Next Up" to:

```markdown
## Next Up

Step 1c: Local search + soft constraints — LAHC algorithm with Change + Swap moves, 4 soft constraints (teacher gaps, subject distribution, preferred slots, class teacher first period).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/next-steps.md docs/STATUS.md
git commit -m "docs: update status for solver domain model completion"
```
