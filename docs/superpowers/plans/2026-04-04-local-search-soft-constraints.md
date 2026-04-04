# Local Search + Soft Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LAHC local search with Change/Swap moves and 4 soft constraints to the scheduler, transforming it from feasibility-only to quality-optimizing.

**Architecture:** Extend the existing hand-rolled incremental scoring in `IncrementalState` with soft constraint counters. Add a new `local_search.rs` module with the LAHC loop and move types. The `solve()` function runs construction then local search. Solver statistics are collected and returned in output.

**Tech Stack:** Rust, `rand` (SmallRng), `smallvec`, `criterion` (benchmarks), `bitvec` (existing)

---

### Task 1: Add new dependencies and public API types

**Files:**
- Modify: `scheduler/Cargo.toml`
- Modify: `scheduler/src/types.rs`

- [ ] **Step 1: Add `rand`, `smallvec`, `criterion` to Cargo.toml**

In `scheduler/Cargo.toml`, add dependencies:

```toml
[dependencies]
uuid = { version = "1", features = ["v4"] }
bitvec = "1"
rand = { version = "0.8", features = ["small_rng"] }
smallvec = "1"

[dev-dependencies]
proptest = "1"
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "solver_bench"
harness = false
```

- [ ] **Step 2: Add `class_teacher_id`, `preferred_slots`, `SolveStats` to `types.rs`**

Add `class_teacher_id` to `SchoolClass`:

```rust
#[derive(Debug, Clone)]
pub struct SchoolClass {
    pub id: Uuid,
    pub name: String,
    pub grade_level: u8,
    pub student_count: Option<u32>,
    pub class_teacher_id: Option<Uuid>,
}
```

Add `preferred_slots` to `Teacher`:

```rust
#[derive(Debug, Clone)]
pub struct Teacher {
    pub id: Uuid,
    pub name: String,
    pub max_hours_per_week: u32,
    pub is_part_time: bool,
    pub available_slots: Vec<TimeSlot>,
    pub qualified_subjects: Vec<Uuid>,
    pub preferred_slots: Vec<TimeSlot>,
}
```

Add `SolveStats` struct and update `ScheduleOutput`:

```rust
#[derive(Debug, Clone, Default)]
pub struct SolveStats {
    pub construction_ms: u64,
    pub local_search_ms: u64,
    pub iterations: u64,
    pub iterations_per_sec: f64,
    pub moves_accepted: u64,
    pub moves_rejected: u64,
    pub score_history: Vec<(u64, i64, i64)>, // (iteration, hard, soft)
    pub best_found_at_iteration: u64,
}

#[derive(Debug, Clone, Default)]
pub struct ScheduleOutput {
    pub timetable: Vec<Lesson>,
    pub score: Score,
    pub violations: Vec<Violation>,
    pub stats: Option<SolveStats>,
}
```

- [ ] **Step 3: Fix all compilation errors from the new fields**

Update all places that construct `SchoolClass` to include `class_teacher_id: None`:
- `scheduler/src/mapper.rs` in `to_output` tests (lines ~249, ~310)
- `scheduler/tests/basic.rs` in `class()` helper (line ~33)

Update all places that construct `Teacher` to include `preferred_slots: vec![]`:
- `scheduler/tests/basic.rs` in `teacher()` helper (line ~14)

- [ ] **Step 4: Verify compilation**

Run: `cargo check --workspace`
Expected: compiles with no errors

- [ ] **Step 5: Commit**

```bash
git add scheduler/Cargo.toml scheduler/src/types.rs scheduler/src/mapper.rs scheduler/tests/basic.rs
git commit -m "feat(scheduler): add API types for soft constraints and solver stats"
```

---

### Task 2: Extend planning model and mapper for soft constraint data

**Files:**
- Modify: `scheduler/src/planning.rs`
- Modify: `scheduler/src/mapper.rs`

- [ ] **Step 1: Add `preferred_slots` to `TeacherFact`**

In `scheduler/src/planning.rs`, update `TeacherFact`:

```rust
#[derive(Debug, Clone)]
pub struct TeacherFact {
    pub max_hours: u32,
    /// Bit i is set if teacher is available in timeslot i.
    pub available_slots: BitVec,
    /// Bit i is set if teacher is qualified for subject i.
    pub qualified_subjects: BitVec,
    /// Bit i is set if teacher prefers timeslot i.
    pub preferred_slots: BitVec,
}
```

- [ ] **Step 2: Update mapper to populate new fields**

In `scheduler/src/mapper.rs`, in the `to_planning` function:

Add `preferred_slots` bitvec mapping to the teacher loop (after `qualified_subjects`):

```rust
let mut preferred_slots = bitvec![0; num_timeslots];
for slot in &t.preferred_slots {
    if let Some(&idx) = timeslot_uuid_to_idx.get(&slot.id) {
        preferred_slots.set(idx, true);
    }
}
```

And include it in the `TeacherFact` construction:

```rust
TeacherFact {
    max_hours: t.max_hours_per_week,
    available_slots,
    qualified_subjects,
    preferred_slots,
}
```

Map `class_teacher_id` in the class loop:

```rust
classes.push(ClassFact {
    student_count: c.student_count,
    class_teacher_idx: c.class_teacher_id.and_then(|tid| teacher_uuid_to_idx.get(&tid).copied()),
});
```

- [ ] **Step 3: Fix test helpers that construct `TeacherFact`**

Update all test helpers that construct `TeacherFact` to include `preferred_slots: bitvec![0; num_timeslots]`:
- `scheduler/tests/constraints.rs` `make_facts` helper (line ~21)
- `scheduler/tests/incremental.rs` `make_facts` helper (line ~21)
- `scheduler/tests/construction.rs` `make_facts_with_availability` helper (line ~28)
- `scheduler/tests/proptest_scoring.rs` `arb_problem` helper (line ~28)

- [ ] **Step 4: Verify all tests pass**

Run: `cargo test --workspace`
Expected: all existing tests pass

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/planning.rs scheduler/src/mapper.rs scheduler/tests/
git commit -m "feat(scheduler): extend planning model with preferred_slots and class_teacher mapping"
```

---

### Task 3: Add soft constraints to `full_evaluate` (reference implementation)

**Files:**
- Modify: `scheduler/src/constraints.rs`
- Modify: `scheduler/tests/constraints.rs`

- [ ] **Step 1: Write failing tests for teacher gap constraint**

Add to `scheduler/tests/constraints.rs`:

```rust
#[test]
fn soft_teacher_gap_no_gap() {
    // Teacher with consecutive lessons on same day: periods 0, 1 → 0 gap → 0 soft
    let facts = make_facts(16, 1, 1, 0, 1); // 16 slots = 2 days × 8 periods
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None), // day 0, period 0
        lesson(1, 0, 0, 0, 1, None), // day 0, period 1
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, 0);
}

#[test]
fn soft_teacher_gap_one_gap() {
    // Teacher with lessons on periods 0 and 2 (gap at period 1) → -1 soft
    let facts = make_facts(16, 1, 2, 0, 1);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None), // day 0, period 0
        lesson(1, 0, 1, 0, 2, None), // day 0, period 2
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, -1);
}

#[test]
fn soft_teacher_gap_two_gaps() {
    // Lessons at periods 0 and 3 → 2 gap periods → -2 soft
    let facts = make_facts(16, 1, 2, 0, 1);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None), // day 0, period 0
        lesson(1, 0, 1, 0, 3, None), // day 0, period 3
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, -2);
}

#[test]
fn soft_teacher_gap_different_days_no_penalty() {
    // Lessons on different days → no gap penalty
    let facts = make_facts(16, 1, 2, 0, 1);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None), // day 0, period 0
        lesson(1, 0, 1, 0, 8, None), // day 1, period 0
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, 0);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --package klassenzeit-scheduler --test constraints soft_teacher_gap`
Expected: `soft_teacher_gap_one_gap` and `soft_teacher_gap_two_gaps` FAIL (soft is 0, expected -1 and -2)

- [ ] **Step 3: Write failing tests for subject distribution constraint**

Add to `scheduler/tests/constraints.rs`:

```rust
#[test]
fn soft_subject_distribution_no_duplicate() {
    // One math lesson per day → 0 soft
    let facts = make_facts(16, 1, 1, 0, 1);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None), // day 0, period 0, subject 0
        lesson(1, 0, 0, 0, 8, None), // day 1, period 0, subject 0
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, 0);
}

#[test]
fn soft_subject_distribution_one_duplicate() {
    // Two math lessons same day for same class → -2 soft
    let facts = make_facts(16, 1, 1, 0, 1);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None), // day 0, period 0, subject 0
        lesson(1, 0, 0, 0, 1, None), // day 0, period 1, subject 0
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, -2);
}

#[test]
fn soft_subject_distribution_two_duplicates() {
    // Three math lessons same day for same class → (3-1)*-2 = -4 soft
    let facts = make_facts(16, 1, 1, 0, 1);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 0, 0, 0, 1, None),
        lesson(2, 0, 0, 0, 2, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, -4);
}

#[test]
fn soft_subject_distribution_different_classes_ok() {
    // Two math lessons same day but different classes → 0 soft
    let facts = make_facts(16, 2, 2, 0, 1);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None), // class 0
        lesson(1, 1, 1, 0, 1, None), // class 1
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, 0);
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cargo test --package klassenzeit-scheduler --test constraints soft_subject_distribution`
Expected: `soft_subject_distribution_one_duplicate` and `soft_subject_distribution_two_duplicates` FAIL

- [ ] **Step 5: Write failing tests for preferred slots constraint**

Add to `scheduler/tests/constraints.rs`. First update `make_facts` to accept preferred_slots:

```rust
fn make_facts(
    num_timeslots: usize,
    num_teachers: usize,
    num_classes: usize,
    num_rooms: usize,
    num_subjects: usize,
) -> ProblemFacts {
    ProblemFacts {
        timeslots: (0..num_timeslots)
            .map(|i| Timeslot {
                day: (i / 8) as u8,
                period: (i % 8) as u8,
            })
            .collect(),
        teachers: (0..num_teachers)
            .map(|_| TeacherFact {
                max_hours: 28,
                available_slots: bitvec![1; num_timeslots],
                qualified_subjects: bitvec![1; num_subjects],
                preferred_slots: bitvec![1; num_timeslots], // all preferred by default
            })
            .collect(),
        classes: (0..num_classes)
            .map(|_| ClassFact {
                student_count: Some(25),
                class_teacher_idx: None,
            })
            .collect(),
        rooms: (0..num_rooms)
            .map(|_| RoomFact {
                capacity: Some(30),
                suitable_subjects: bitvec![1; num_subjects],
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact {
                needs_special_room: false,
            })
            .collect(),
    }
}
```

Then add tests:

```rust
#[test]
fn soft_preferred_slot_no_penalty() {
    // All slots preferred → 0 soft
    let facts = make_facts(16, 1, 1, 0, 1);
    let lessons = vec![lesson(0, 0, 0, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, 0);
}

#[test]
fn soft_preferred_slot_one_miss() {
    // Slot 0 not preferred → -1 soft
    let mut facts = make_facts(16, 1, 1, 0, 1);
    facts.teachers[0].preferred_slots.set(0, false);
    let lessons = vec![lesson(0, 0, 0, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, -1);
}

#[test]
fn soft_preferred_slot_two_misses() {
    // Slots 0 and 1 not preferred → -2 soft
    let mut facts = make_facts(16, 1, 1, 0, 1);
    facts.teachers[0].preferred_slots.set(0, false);
    facts.teachers[0].preferred_slots.set(1, false);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None),
        lesson(1, 0, 0, 0, 1, None),
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, -2);
}
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cargo test --package klassenzeit-scheduler --test constraints soft_preferred_slot`
Expected: `soft_preferred_slot_one_miss` and `soft_preferred_slot_two_misses` FAIL

- [ ] **Step 7: Write failing tests for class teacher first period constraint**

```rust
#[test]
fn soft_class_teacher_first_period_satisfied() {
    // Class teacher teaches first period → 0 soft
    let mut facts = make_facts(16, 1, 1, 0, 1);
    facts.classes[0].class_teacher_idx = Some(0);
    let lessons = vec![lesson(0, 0, 0, 0, 0, None)]; // teacher 0, period 0
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, 0);
}

#[test]
fn soft_class_teacher_first_period_violated() {
    // Class has teacher 0, but period 0 on day 0 is taught by teacher 1 → -1 soft
    let mut facts = make_facts(16, 2, 1, 0, 1);
    facts.classes[0].class_teacher_idx = Some(0);
    let lessons = vec![lesson(0, 1, 0, 0, 0, None)]; // teacher 1 at day 0, period 0
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, -1);
}

#[test]
fn soft_class_teacher_first_period_no_class_teacher() {
    // No class teacher assigned → 0 soft (constraint doesn't apply)
    let facts = make_facts(16, 2, 1, 0, 1);
    let lessons = vec![lesson(0, 1, 0, 0, 0, None)];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, 0);
}

#[test]
fn soft_class_teacher_first_period_two_days_one_violated() {
    // Class teacher 0: teaches period 0 on day 0, but teacher 1 teaches period 0 on day 1 → -1 soft
    let mut facts = make_facts(16, 2, 1, 0, 1);
    facts.classes[0].class_teacher_idx = Some(0);
    let lessons = vec![
        lesson(0, 0, 0, 0, 0, None), // day 0, period 0, teacher 0 ✓
        lesson(1, 1, 0, 0, 8, None), // day 1, period 0, teacher 1 ✗
    ];
    let score = klassenzeit_scheduler::constraints::full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, -1);
}
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `cargo test --package klassenzeit-scheduler --test constraints soft_class_teacher`
Expected: `soft_class_teacher_first_period_violated` and `soft_class_teacher_first_period_two_days_one_violated` FAIL

- [ ] **Step 9: Implement soft constraints in `full_evaluate`**

Add to `full_evaluate()` in `scheduler/src/constraints.rs`, after the existing hard constraint code (before the final `score` return):

```rust
// ── Soft constraints ──

// Collect per-teacher-day periods
let num_days = facts.timeslots.iter().map(|t| t.day).max().map_or(0, |d| d + 1) as usize;
let mut teacher_day_periods: Vec<Vec<Vec<u8>>> = vec![vec![Vec::new(); num_days]; facts.teachers.len()];
// Collect per-class-subject-day counts
let mut class_subject_day: Vec<Vec<Vec<u16>>> = vec![vec![vec![0; num_days]; facts.subjects.len()]; facts.classes.len()];
// Collect first-period assignments per class per day
let first_period_per_day: Vec<u8> = {
    let mut fp = vec![u8::MAX; num_days];
    for ts in &facts.timeslots {
        let d = ts.day as usize;
        if d < num_days && ts.period < fp[d] {
            fp[d] = ts.period;
        }
    }
    fp
};
// Track who teaches first period per class per day: (class, day) → set of teacher_idx
let mut class_day_first_teachers: Vec<Vec<Vec<usize>>> = vec![vec![Vec::new(); num_days]; facts.classes.len()];

for lesson in &assigned {
    let ts_idx = lesson.timeslot.unwrap();
    let ts = &facts.timeslots[ts_idx];
    let day = ts.day as usize;
    let period = ts.period;

    // Teacher gap tracking
    teacher_day_periods[lesson.teacher_idx][day].push(period);

    // Subject distribution tracking
    class_subject_day[lesson.class_idx][lesson.subject_idx][day] += 1;

    // Preferred slots
    if !facts.teachers[lesson.teacher_idx].preferred_slots[ts_idx] {
        score += HardSoftScore::soft(-1);
    }

    // Class teacher first period tracking
    if day < num_days && period == first_period_per_day[day] {
        class_day_first_teachers[lesson.class_idx][day].push(lesson.teacher_idx);
    }
}

// Teacher gaps: for each teacher, for each day, sort periods and count gaps
for teacher_days in &teacher_day_periods {
    for periods in teacher_days {
        if periods.len() < 2 {
            continue;
        }
        let mut sorted = periods.clone();
        sorted.sort();
        let span = (sorted.last().unwrap() - sorted.first().unwrap()) as i64;
        let gaps = span - (sorted.len() as i64 - 1);
        score += HardSoftScore::soft(-gaps);
    }
}

// Subject distribution: penalize (count - 1) * -2 for each (class, subject, day)
for class_subjects in &class_subject_day {
    for subject_days in class_subjects {
        for &count in subject_days {
            if count > 1 {
                score += HardSoftScore::soft(-((count - 1) as i64) * 2);
            }
        }
    }
}

// Class teacher first period: penalize if first period exists but class teacher doesn't teach it
for (class_idx, class_days) in class_day_first_teachers.iter().enumerate() {
    if let Some(ct_idx) = facts.classes[class_idx].class_teacher_idx {
        for (day, teachers_at_first) in class_days.iter().enumerate() {
            if !teachers_at_first.is_empty() && !teachers_at_first.contains(&ct_idx) {
                score += HardSoftScore::soft(-1);
            }
        }
    }
}
```

- [ ] **Step 10: Run all soft constraint tests to verify they pass**

Run: `cargo test --package klassenzeit-scheduler --test constraints soft_`
Expected: all 14 soft constraint tests PASS

- [ ] **Step 11: Run all existing tests to verify no regressions**

Run: `cargo test --workspace`
Expected: all tests pass (existing hard constraint tests still have soft == 0 because `make_facts` sets all preferred)

- [ ] **Step 12: Commit**

```bash
git add scheduler/src/constraints.rs scheduler/tests/constraints.rs
git commit -m "feat(scheduler): add 4 soft constraints to full_evaluate reference implementation"
```

---

### Task 4: Add incremental soft constraint scoring to `IncrementalState`

**Files:**
- Modify: `scheduler/src/constraints.rs`
- Modify: `scheduler/tests/incremental.rs`

- [ ] **Step 1: Write failing tests for incremental soft scoring**

Add to `scheduler/tests/incremental.rs`. First update the `make_facts` helper to include `preferred_slots`:

```rust
fn make_facts(
    num_timeslots: usize,
    num_teachers: usize,
    num_classes: usize,
    num_rooms: usize,
    num_subjects: usize,
) -> ProblemFacts {
    ProblemFacts {
        timeslots: (0..num_timeslots)
            .map(|i| Timeslot {
                day: (i / 8) as u8,
                period: (i % 8) as u8,
            })
            .collect(),
        teachers: (0..num_teachers)
            .map(|_| TeacherFact {
                max_hours: 28,
                available_slots: bitvec![1; num_timeslots],
                qualified_subjects: bitvec![1; num_subjects],
                preferred_slots: bitvec![1; num_timeslots],
            })
            .collect(),
        classes: (0..num_classes)
            .map(|_| ClassFact {
                student_count: Some(25),
                class_teacher_idx: None,
            })
            .collect(),
        rooms: (0..num_rooms)
            .map(|_| RoomFact {
                capacity: Some(30),
                suitable_subjects: bitvec![1; num_subjects],
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact {
                needs_special_room: false,
            })
            .collect(),
    }
}
```

Then add tests:

```rust
#[test]
fn incremental_soft_teacher_gap() {
    // 16 slots = 2 days × 8 periods
    let facts = make_facts(16, 1, 2, 0, 1);
    let mut state = IncrementalState::new(&facts);

    // Period 0, day 0
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, None, &facts); // slot 0 = day 0, period 0

    // Period 2, day 0 → gap of 1
    let mut l1 = unassigned_lesson(1, 0, 1, 0);
    state.assign(&mut l1, 2, None, &facts); // slot 2 = day 0, period 2

    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score().soft, -1);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_soft_subject_distribution() {
    let facts = make_facts(16, 2, 1, 0, 1);
    let mut state = IncrementalState::new(&facts);

    // Two lessons of same subject, same class, same day
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 0, 0); // different teacher, same class+subject

    state.assign(&mut l0, 0, None, &facts); // day 0
    state.assign(&mut l1, 1, None, &facts); // day 0

    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score().soft, -2);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_soft_preferred_slots() {
    let mut facts = make_facts(16, 1, 1, 0, 1);
    facts.teachers[0].preferred_slots.set(0, false); // slot 0 not preferred

    let mut state = IncrementalState::new(&facts);
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, None, &facts);

    let lessons = [l0.clone()];
    assert_eq!(state.score().soft, -1);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_soft_class_teacher_first_period() {
    let mut facts = make_facts(16, 2, 1, 0, 1);
    facts.classes[0].class_teacher_idx = Some(0); // teacher 0 is class teacher

    let mut state = IncrementalState::new(&facts);
    // Teacher 1 teaches period 0 on day 0 → violation
    let mut l0 = unassigned_lesson(0, 1, 0, 0);
    state.assign(&mut l0, 0, None, &facts); // slot 0 = day 0, period 0

    let lessons = [l0.clone()];
    assert_eq!(state.score().soft, -1);
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn incremental_soft_unassign_reverses() {
    let mut facts = make_facts(16, 1, 2, 0, 1);
    facts.teachers[0].preferred_slots.set(0, false);

    let mut state = IncrementalState::new(&facts);
    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    state.assign(&mut l0, 0, None, &facts);
    assert_eq!(state.score().soft, -1);

    state.unassign(&mut l0, &facts);
    assert_eq!(state.score(), HardSoftScore::ZERO);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --package klassenzeit-scheduler --test incremental incremental_soft`
Expected: FAIL — soft scores are all 0

- [ ] **Step 3: Add soft constraint state to `IncrementalState`**

In `scheduler/src/constraints.rs`, add to the `IncrementalState` struct fields:

```rust
use smallvec::SmallVec;

pub struct IncrementalState {
    // ... existing fields ...
    teacher_at_slot: Vec<Vec<u16>>,
    class_at_slot: Vec<Vec<u16>>,
    room_at_slot: Vec<Vec<u16>>,
    teacher_hours: Vec<u32>,
    score: HardSoftScore,

    // Soft constraint state
    num_days: usize,
    first_period_per_day: Vec<u8>,
    /// [teacher][day] → sorted periods with lessons
    teacher_day_periods: Vec<Vec<SmallVec<[u8; 4]>>>,
    /// [class][subject][day] → lesson count
    class_subject_day: Vec<Vec<Vec<u16>>>,
    /// [class][day][teacher] → count of lessons at first period
    class_day_first_period: Vec<Vec<Vec<u16>>>,
}
```

Update `IncrementalState::new()`:

```rust
pub fn new(facts: &ProblemFacts) -> Self {
    let num_ts = facts.timeslots.len();
    let num_teachers = facts.teachers.len();
    let num_classes = facts.classes.len();
    let num_rooms = facts.rooms.len();
    let num_subjects = facts.subjects.len();
    let num_days = facts.timeslots.iter().map(|t| t.day as usize).max().map_or(0, |d| d + 1);

    let first_period_per_day = {
        let mut fp = vec![u8::MAX; num_days];
        for ts in &facts.timeslots {
            let d = ts.day as usize;
            if d < num_days && ts.period < fp[d] {
                fp[d] = ts.period;
            }
        }
        fp
    };

    Self {
        teacher_at_slot: vec![vec![0u16; num_ts]; num_teachers],
        class_at_slot: vec![vec![0u16; num_ts]; num_classes],
        room_at_slot: vec![vec![0u16; num_ts]; num_rooms],
        teacher_hours: vec![0u32; num_teachers],
        score: HardSoftScore::ZERO,

        num_days,
        first_period_per_day,
        teacher_day_periods: vec![vec![SmallVec::new(); num_days]; num_teachers],
        class_subject_day: vec![vec![vec![0u16; num_days]; num_subjects]; num_classes],
        class_day_first_period: vec![vec![vec![0u16; num_teachers]; num_days]; num_classes],
    }
}
```

- [ ] **Step 4: Implement incremental soft scoring in `assign`**

Add soft delta computation to `assign()`, after the existing hard constraint updates. The key insight: compute the soft delta *before* updating the soft counters, then update them.

```rust
pub fn assign(
    &mut self,
    lesson: &mut PlanningLesson,
    timeslot: usize,
    room: Option<usize>,
    facts: &ProblemFacts,
) {
    debug_assert!(
        lesson.timeslot.is_none(),
        "assign called on already-assigned lesson {}",
        lesson.id
    );

    let delta = self.evaluate_assign(lesson, timeslot, room, facts);

    // Update hard counters
    self.teacher_at_slot[lesson.teacher_idx][timeslot] += 1;
    self.class_at_slot[lesson.class_idx][timeslot] += 1;
    if let Some(r) = room {
        self.room_at_slot[r][timeslot] += 1;
    }
    self.teacher_hours[lesson.teacher_idx] += 1;

    // Update soft counters
    let ts = &facts.timeslots[timeslot];
    let day = ts.day as usize;
    let period = ts.period;

    // Teacher day periods (insert sorted)
    let periods = &mut self.teacher_day_periods[lesson.teacher_idx][day];
    let pos = periods.binary_search(&period).unwrap_or_else(|p| p);
    periods.insert(pos, period);

    // Class subject day
    self.class_subject_day[lesson.class_idx][lesson.subject_idx][day] += 1;

    // Class day first period
    if day < self.num_days && period == self.first_period_per_day[day] {
        self.class_day_first_period[lesson.class_idx][day][lesson.teacher_idx] += 1;
    }

    // Update lesson
    lesson.timeslot = Some(timeslot);
    lesson.room = room;

    self.score += delta;
}
```

- [ ] **Step 5: Implement incremental soft scoring in `unassign`**

Update `unassign()` similarly — compute delta using `evaluate_unassign` logic, then update soft counters:

```rust
pub fn unassign(&mut self, lesson: &mut PlanningLesson, facts: &ProblemFacts) {
    let timeslot = lesson.timeslot.expect("unassign called on unassigned lesson");
    let room = lesson.room;

    // Decrement hard counters first
    self.teacher_at_slot[lesson.teacher_idx][timeslot] -= 1;
    self.class_at_slot[lesson.class_idx][timeslot] -= 1;
    if let Some(r) = room {
        self.room_at_slot[r][timeslot] -= 1;
    }
    self.teacher_hours[lesson.teacher_idx] -= 1;

    let mut delta = HardSoftScore::ZERO;

    // Hard conflict pairs removed
    let k_teacher = self.teacher_at_slot[lesson.teacher_idx][timeslot] as i64;
    delta += HardSoftScore::hard(k_teacher);
    let k_class = self.class_at_slot[lesson.class_idx][timeslot] as i64;
    delta += HardSoftScore::hard(k_class);
    if let Some(r) = room {
        let k_room = self.room_at_slot[r][timeslot] as i64;
        delta += HardSoftScore::hard(k_room);
    }

    // Per-lesson hard constraints removed
    let teacher = &facts.teachers[lesson.teacher_idx];
    if !teacher.available_slots[timeslot] {
        delta += HardSoftScore::hard(1);
    }
    if !teacher.qualified_subjects[lesson.subject_idx] {
        delta += HardSoftScore::hard(1);
    }
    if let Some(r) = room {
        let room_fact = &facts.rooms[r];
        if !room_fact.suitable_subjects[lesson.subject_idx] {
            delta += HardSoftScore::hard(1);
        }
        if let (Some(cap), Some(count)) = (room_fact.capacity, facts.classes[lesson.class_idx].student_count) {
            if cap < count {
                delta += HardSoftScore::hard(1);
            }
        }
    }
    let new_hours = self.teacher_hours[lesson.teacher_idx];
    if new_hours >= teacher.max_hours {
        delta += HardSoftScore::hard(1);
    }

    // ── Soft delta (before updating soft counters) ──
    let ts = &facts.timeslots[timeslot];
    let day = ts.day as usize;
    let period = ts.period;

    // Teacher gap: old gap penalty minus new gap penalty after removal
    let periods = &self.teacher_day_periods[lesson.teacher_idx][day];
    let old_gap = Self::gap_penalty(periods);
    // Compute new periods without this one
    let mut new_periods = periods.clone();
    if let Some(pos) = new_periods.iter().position(|&p| p == period) {
        new_periods.remove(pos);
    }
    let new_gap = Self::gap_penalty(&new_periods);
    delta += HardSoftScore::soft(new_gap - old_gap); // positive if gap decreased

    // Subject distribution
    let old_count = self.class_subject_day[lesson.class_idx][lesson.subject_idx][day];
    if old_count > 1 {
        // Was contributing (old_count - 1) * -2, will contribute (old_count - 2) * -2
        delta += HardSoftScore::soft(2); // removing one duplicate
    }

    // Preferred slots
    if !teacher.preferred_slots[timeslot] {
        delta += HardSoftScore::soft(1); // removing a miss
    }

    // Class teacher first period
    if day < self.num_days && period == self.first_period_per_day[day] {
        if let Some(ct_idx) = facts.classes[lesson.class_idx].class_teacher_idx {
            let old_was_violated = self.is_first_period_violated(lesson.class_idx, day, ct_idx);
            // After removal
            let my_count = self.class_day_first_period[lesson.class_idx][day][lesson.teacher_idx];
            let total_at_first: u16 = self.class_day_first_period[lesson.class_idx][day].iter().sum();
            let new_total = total_at_first - 1;
            let new_ct_count = if lesson.teacher_idx == ct_idx { my_count - 1 } else { self.class_day_first_period[lesson.class_idx][day][ct_idx] };
            let new_violated = new_total > 0 && new_ct_count == 0;
            if old_was_violated && !new_violated {
                delta += HardSoftScore::soft(1);
            } else if !old_was_violated && new_violated {
                delta += HardSoftScore::soft(-1);
            }
        }
    }

    // Update soft counters
    self.teacher_day_periods[lesson.teacher_idx][day] = new_periods;
    self.class_subject_day[lesson.class_idx][lesson.subject_idx][day] -= 1;
    if day < self.num_days && period == self.first_period_per_day[day] {
        self.class_day_first_period[lesson.class_idx][day][lesson.teacher_idx] -= 1;
    }

    // Clear lesson
    lesson.timeslot = None;
    lesson.room = None;

    self.score += delta;
}
```

- [ ] **Step 6: Implement soft delta in `evaluate_assign`**

Extend `evaluate_assign()` to include soft constraint deltas:

```rust
pub fn evaluate_assign(
    &self,
    lesson: &PlanningLesson,
    timeslot: usize,
    room: Option<usize>,
    facts: &ProblemFacts,
) -> HardSoftScore {
    let mut delta = HardSoftScore::ZERO;

    // ... existing hard constraint delta code (unchanged) ...

    // ── Soft deltas ──
    let ts = &facts.timeslots[timeslot];
    let day = ts.day as usize;
    let period = ts.period;

    // Teacher gap delta
    let periods = &self.teacher_day_periods[lesson.teacher_idx][day];
    let old_gap = Self::gap_penalty(periods);
    let mut new_periods = periods.clone();
    let pos = new_periods.binary_search(&period).unwrap_or_else(|p| p);
    new_periods.insert(pos, period);
    let new_gap = Self::gap_penalty(&new_periods);
    delta += HardSoftScore::soft(new_gap - old_gap);

    // Subject distribution delta
    let count = self.class_subject_day[lesson.class_idx][lesson.subject_idx][day];
    if count > 0 {
        delta += HardSoftScore::soft(-2); // adding one more duplicate
    }

    // Preferred slots
    if !facts.teachers[lesson.teacher_idx].preferred_slots[timeslot] {
        delta += HardSoftScore::soft(-1);
    }

    // Class teacher first period
    if day < self.num_days && period == self.first_period_per_day[day] {
        if let Some(ct_idx) = facts.classes[lesson.class_idx].class_teacher_idx {
            let old_violated = self.is_first_period_violated(lesson.class_idx, day, ct_idx);
            let total: u16 = self.class_day_first_period[lesson.class_idx][day].iter().sum();
            let ct_count = self.class_day_first_period[lesson.class_idx][day][ct_idx];
            let new_total = total + 1;
            let new_ct_count = if lesson.teacher_idx == ct_idx { ct_count + 1 } else { ct_count };
            let new_violated = new_total > 0 && new_ct_count == 0;
            if !old_violated && new_violated {
                delta += HardSoftScore::soft(-1);
            } else if old_violated && !new_violated {
                delta += HardSoftScore::soft(1);
            }
        }
    }

    delta
}
```

- [ ] **Step 7: Add helper methods**

```rust
impl IncrementalState {
    /// Compute gap penalty for a sorted list of periods: span - count + 1 (negated).
    fn gap_penalty(periods: &[u8]) -> i64 {
        if periods.len() < 2 {
            return 0;
        }
        let span = (*periods.last().unwrap() - *periods.first().unwrap()) as i64;
        let gaps = span - (periods.len() as i64 - 1);
        -gaps
    }

    fn is_first_period_violated(&self, class_idx: usize, day: usize, ct_idx: usize) -> bool {
        let total: u16 = self.class_day_first_period[class_idx][day].iter().sum();
        let ct_count = self.class_day_first_period[class_idx][day][ct_idx];
        total > 0 && ct_count == 0
    }
}
```

- [ ] **Step 8: Run incremental soft tests**

Run: `cargo test --package klassenzeit-scheduler --test incremental incremental_soft`
Expected: all 5 tests PASS

- [ ] **Step 9: Run all tests**

Run: `cargo test --workspace`
Expected: all tests pass

- [ ] **Step 10: Commit**

```bash
git add scheduler/src/constraints.rs scheduler/tests/incremental.rs
git commit -m "feat(scheduler): add incremental soft constraint scoring to IncrementalState"
```

---

### Task 5: Update property-based tests for soft constraints

**Files:**
- Modify: `scheduler/tests/proptest_scoring.rs`

- [ ] **Step 1: Update `arb_problem` to generate soft constraint data**

Update the `arb_problem` strategy in `scheduler/tests/proptest_scoring.rs` to include `preferred_slots` and `class_teacher_idx`:

```rust
fn arb_problem() -> impl Strategy<Value = (ProblemFacts, Vec<PlanningLesson>)> {
    (1..=5usize, 1..=4usize, 1..=3usize, 0..=2usize, 1..=3usize).prop_flat_map(
        |(num_slots, num_teachers, num_classes, num_rooms, num_subjects)| {
            let facts_strat = (
                proptest::collection::vec(prop::bool::ANY, num_slots * num_teachers), // teacher availability
                proptest::collection::vec(prop::bool::ANY, num_subjects * num_teachers), // teacher quals
                proptest::collection::vec(1..=30u32, num_teachers), // max hours
                proptest::collection::vec(prop::bool::ANY, num_subjects * num_rooms), // room suitability
                proptest::collection::vec(prop::bool::ANY, num_slots * num_teachers), // preferred slots
                proptest::collection::vec(proptest::option::of(0..num_teachers), num_classes), // class teacher
            )
                .prop_map(move |(avail_bits, qual_bits, max_hours, suit_bits, pref_bits, class_teachers)| {
                    let teachers: Vec<TeacherFact> = (0..num_teachers)
                        .map(|t| {
                            let mut available_slots = bitvec![0; num_slots];
                            let mut preferred_slots = bitvec![0; num_slots];
                            for s in 0..num_slots {
                                available_slots.set(s, avail_bits[t * num_slots + s]);
                                preferred_slots.set(s, pref_bits[t * num_slots + s]);
                            }
                            let mut qualified_subjects = bitvec![0; num_subjects];
                            for s in 0..num_subjects {
                                qualified_subjects.set(s, qual_bits[t * num_subjects + s]);
                            }
                            TeacherFact {
                                max_hours: max_hours[t],
                                available_slots,
                                qualified_subjects,
                                preferred_slots,
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
                            .map(|i| ClassFact {
                                student_count: Some(25),
                                class_teacher_idx: class_teachers[i],
                            })
                            .collect(),
                        rooms,
                        subjects: (0..num_subjects)
                            .map(|_| SubjectFact {
                                needs_special_room: false,
                            })
                            .collect(),
                    }
                });

            let num_lessons = 1..(num_slots * num_classes).min(8) + 1;
            (facts_strat, num_lessons).prop_flat_map(move |(facts, n_lessons)| {
                let nt = num_teachers;
                let nc = num_classes;
                let ns = num_subjects;
                proptest::collection::vec((0..nt, 0..nc, 0..ns), n_lessons).prop_map(
                    move |lesson_specs| {
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
                    },
                )
            })
        },
    )
}
```

- [ ] **Step 2: Run property tests**

Run: `cargo test --package klassenzeit-scheduler --test proptest_scoring -- --nocapture`
Expected: all 200 cases pass for both assign and unassign tests (now exercising soft constraints too)

- [ ] **Step 3: Commit**

```bash
git add scheduler/tests/proptest_scoring.rs
git commit -m "test(scheduler): extend property-based tests to cover soft constraints"
```

---

### Task 6: Implement LAHC local search

**Files:**
- Create: `scheduler/src/local_search.rs`
- Modify: `scheduler/src/lib.rs`

- [ ] **Step 1: Write failing integration test**

Add to `scheduler/tests/basic.rs`. First update the `class` helper:

```rust
fn class(name: &str, grade: u8) -> SchoolClass {
    SchoolClass {
        id: Uuid::new_v4(),
        name: name.to_string(),
        grade_level: grade,
        student_count: None,
        class_teacher_id: None,
    }
}
```

And the `teacher` helper:

```rust
fn teacher(name: &str, slots: Vec<TimeSlot>, subjects: Vec<Uuid>) -> Teacher {
    Teacher {
        id: Uuid::new_v4(),
        name: name.to_string(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: slots,
        qualified_subjects: subjects,
        preferred_slots: vec![], // no preferences
    }
}
```

Then add the LAHC integration test:

```rust
#[test]
fn local_search_improves_soft_score() {
    // Build a problem where construction produces soft violations
    // that local search can fix: 2 math lessons on same day (subject distribution)
    let slots: Vec<TimeSlot> = (0..5)
        .flat_map(|day| (0..6).map(move |period| ts(day, period)))
        .collect();
    let math = subject("Math", false);
    let english = subject("English", false);
    let science = subject("Science", false);

    let t1 = Teacher {
        id: Uuid::new_v4(),
        name: "Alice".into(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: slots.clone(),
        qualified_subjects: vec![math.id, english.id, science.id],
        preferred_slots: slots.clone(), // all preferred
    };
    let t2 = Teacher {
        id: Uuid::new_v4(),
        name: "Bob".into(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: slots.clone(),
        qualified_subjects: vec![math.id, english.id, science.id],
        preferred_slots: slots.clone(),
    };

    let c1 = SchoolClass {
        id: Uuid::new_v4(),
        name: "1A".into(),
        grade_level: 1,
        student_count: Some(25),
        class_teacher_id: None,
    };

    let input = ScheduleInput {
        teachers: vec![t1.clone(), t2.clone()],
        classes: vec![c1.clone()],
        rooms: vec![],
        subjects: vec![math.clone(), english.clone(), science.clone()],
        timeslots: slots,
        requirements: vec![
            LessonRequirement {
                class_id: c1.id,
                subject_id: math.id,
                teacher_id: Some(t1.id),
                hours_per_week: 4, // 4 math lessons → at least one day will double up without LS
            },
            LessonRequirement {
                class_id: c1.id,
                subject_id: english.id,
                teacher_id: Some(t2.id),
                hours_per_week: 4,
            },
            LessonRequirement {
                class_id: c1.id,
                subject_id: science.id,
                teacher_id: Some(t1.id),
                hours_per_week: 2,
            },
        ],
    };

    let output = solve(input);

    // Local search should find a feasible solution
    assert_eq!(output.score.hard_violations, 0);
    // All 10 lessons placed
    assert_eq!(output.timetable.len(), 10);
    // Stats should be populated
    assert!(output.stats.is_some());
    let stats = output.stats.unwrap();
    assert!(stats.iterations > 0);
    assert!(stats.local_search_ms > 0);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --package klassenzeit-scheduler --test basic local_search_improves`
Expected: FAIL — `stats` field doesn't exist or is None, `local_search` module doesn't exist

- [ ] **Step 3: Create `local_search.rs` with LAHC implementation**

Create `scheduler/src/local_search.rs`:

```rust
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use std::time::Instant;

use crate::constraints::IncrementalState;
use crate::planning::*;
use crate::types::SolveStats;

/// LAHC configuration.
pub struct LahcConfig {
    pub list_length: usize,
    pub max_seconds: u64,
    pub max_idle_seconds: u64,
    pub seed: Option<u64>,
    pub history_sample_interval: u64,
}

impl Default for LahcConfig {
    fn default() -> Self {
        Self {
            list_length: 500,
            max_seconds: 60,
            max_idle_seconds: 30,
            seed: None,
            history_sample_interval: 1000,
        }
    }
}

/// Run LAHC local search on an already-constructed solution.
/// Modifies `lessons` in place and returns stats.
pub fn optimize(
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
    config: &LahcConfig,
) -> SolveStats {
    let mut stats = SolveStats::default();

    let assigned_count = lessons.iter().filter(|l| l.timeslot.is_some()).count();
    if assigned_count < 2 {
        return stats;
    }

    let mut rng = match config.seed {
        Some(s) => SmallRng::seed_from_u64(s),
        None => SmallRng::from_entropy(),
    };

    let num_timeslots = facts.timeslots.len();

    // Precompute rooms per subject for change moves
    let rooms_for_subject: Vec<Vec<usize>> = (0..facts.subjects.len())
        .map(|subj_idx| {
            (0..facts.rooms.len())
                .filter(|&r| facts.rooms[r].suitable_subjects[subj_idx])
                .collect()
        })
        .collect();

    let initial_score = state.score();
    let mut current_score = initial_score;
    let mut best_score = initial_score;
    let mut best_lessons = lessons.to_vec();

    // LAHC fitness list
    let mut fitness_list = vec![initial_score; config.list_length];

    let start = Instant::now();
    let mut last_improvement = start;
    let mut iteration: u64 = 0;

    stats.score_history.push((0, initial_score.hard, initial_score.soft));

    loop {
        let elapsed = start.elapsed().as_secs();
        let idle = last_improvement.elapsed().as_secs();

        if elapsed >= config.max_seconds || idle >= config.max_idle_seconds {
            break;
        }

        // Generate and apply a random move
        let applied = if rng.gen_bool(0.5) {
            try_change_move(lessons, facts, state, &rooms_for_subject, num_timeslots, &mut rng)
        } else {
            try_swap_move(lessons, facts, state, &mut rng)
        };

        if let Some(undo_info) = applied {
            let new_score = state.score();
            let list_idx = (iteration as usize) % config.list_length;

            if new_score >= fitness_list[list_idx] || new_score >= current_score {
                // Accept
                current_score = new_score;
                stats.moves_accepted += 1;

                if new_score > best_score {
                    best_score = new_score;
                    best_lessons = lessons.to_vec();
                    stats.best_found_at_iteration = iteration;
                    last_improvement = Instant::now();
                }
            } else {
                // Reject — undo the move
                undo_move(lessons, facts, state, &undo_info);
                stats.moves_rejected += 1;
            }

            fitness_list[list_idx] = current_score;
        }

        iteration += 1;

        if iteration % config.history_sample_interval == 0 {
            stats.score_history.push((iteration, current_score.hard, current_score.soft));
        }
    }

    stats.iterations = iteration;
    stats.local_search_ms = start.elapsed().as_millis() as u64;
    if stats.local_search_ms > 0 {
        stats.iterations_per_sec = iteration as f64 / (stats.local_search_ms as f64 / 1000.0);
    }

    // Restore best solution
    if best_score > current_score {
        restore_solution(lessons, facts, state, &best_lessons);
    }

    stats
}

// ---------------------------------------------------------------------------
// Move types
// ---------------------------------------------------------------------------

/// Info needed to undo a move.
enum UndoInfo {
    Change {
        lesson_idx: usize,
        old_timeslot: usize,
        old_room: Option<usize>,
    },
    Swap {
        idx_a: usize,
        idx_b: usize,
    },
}

/// Change move: pick a random assigned lesson, move it to a random timeslot (+room).
fn try_change_move(
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
    rooms_for_subject: &[Vec<usize>],
    num_timeslots: usize,
    rng: &mut SmallRng,
) -> Option<UndoInfo> {
    let assigned: Vec<usize> = lessons
        .iter()
        .enumerate()
        .filter(|(_, l)| l.timeslot.is_some())
        .map(|(i, _)| i)
        .collect();

    if assigned.is_empty() || num_timeslots == 0 {
        return None;
    }

    let idx = assigned[rng.gen_range(0..assigned.len())];
    let old_ts = lessons[idx].timeslot.unwrap();
    let old_room = lessons[idx].room;

    let new_ts = rng.gen_range(0..num_timeslots);
    let needs_room = facts.subjects[lessons[idx].subject_idx].needs_special_room;
    let new_room = if needs_room {
        let suitable = &rooms_for_subject[lessons[idx].subject_idx];
        if suitable.is_empty() {
            None
        } else {
            Some(suitable[rng.gen_range(0..suitable.len())])
        }
    } else {
        None
    };

    // Skip no-op
    if new_ts == old_ts && new_room == old_room {
        return None;
    }

    state.unassign(&mut lessons[idx], facts);
    state.assign(&mut lessons[idx], new_ts, new_room, facts);

    Some(UndoInfo::Change {
        lesson_idx: idx,
        old_timeslot: old_ts,
        old_room,
    })
}

/// Swap move: pick two random assigned lessons, swap their timeslot+room.
fn try_swap_move(
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
    rng: &mut SmallRng,
) -> Option<UndoInfo> {
    let assigned: Vec<usize> = lessons
        .iter()
        .enumerate()
        .filter(|(_, l)| l.timeslot.is_some())
        .map(|(i, _)| i)
        .collect();

    if assigned.len() < 2 {
        return None;
    }

    let i = rng.gen_range(0..assigned.len());
    let mut j = rng.gen_range(0..assigned.len() - 1);
    if j >= i {
        j += 1;
    }
    let idx_a = assigned[i];
    let idx_b = assigned[j];

    let ts_a = lessons[idx_a].timeslot.unwrap();
    let room_a = lessons[idx_a].room;
    let ts_b = lessons[idx_b].timeslot.unwrap();
    let room_b = lessons[idx_b].room;

    // Skip no-op
    if ts_a == ts_b && room_a == room_b {
        return None;
    }

    // Unassign both, then reassign swapped
    state.unassign(&mut lessons[idx_a], facts);
    state.unassign(&mut lessons[idx_b], facts);
    state.assign(&mut lessons[idx_a], ts_b, room_b, facts);
    state.assign(&mut lessons[idx_b], ts_a, room_a, facts);

    Some(UndoInfo::Swap { idx_a, idx_b })
}

fn undo_move(
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
    undo: &UndoInfo,
) {
    match undo {
        UndoInfo::Change {
            lesson_idx,
            old_timeslot,
            old_room,
        } => {
            state.unassign(&mut lessons[*lesson_idx], facts);
            state.assign(&mut lessons[*lesson_idx], *old_timeslot, *old_room, facts);
        }
        UndoInfo::Swap { idx_a, idx_b } => {
            // Swap back
            let ts_a = lessons[*idx_a].timeslot.unwrap();
            let room_a = lessons[*idx_a].room;
            let ts_b = lessons[*idx_b].timeslot.unwrap();
            let room_b = lessons[*idx_b].room;

            state.unassign(&mut lessons[*idx_a], facts);
            state.unassign(&mut lessons[*idx_b], facts);
            state.assign(&mut lessons[*idx_a], ts_b, room_b, facts);
            state.assign(&mut lessons[*idx_b], ts_a, room_a, facts);
        }
    }
}

fn restore_solution(
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
    best: &[PlanningLesson],
) {
    // Unassign all current
    for i in 0..lessons.len() {
        if lessons[i].timeslot.is_some() {
            state.unassign(&mut lessons[i], facts);
        }
    }
    // Reassign from best
    for i in 0..lessons.len() {
        if let Some(ts) = best[i].timeslot {
            state.assign(&mut lessons[i], ts, best[i].room, facts);
        }
    }
}
```

- [ ] **Step 4: Register module in `lib.rs` and update `solve()`**

Update `scheduler/src/lib.rs`:

```rust
pub mod types;
pub mod planning;
pub mod mapper;
pub mod constraints;
pub mod construction;
pub mod local_search;

use std::time::Instant;
use types::*;

pub fn solve(input: ScheduleInput) -> ScheduleOutput {
    if input.requirements.is_empty() {
        return ScheduleOutput::default();
    }

    let mut pre_violations = Vec::new();
    let filterable_input = pre_validate(&input, &mut pre_violations);

    if filterable_input.requirements.is_empty() {
        return ScheduleOutput {
            timetable: vec![],
            score: Score {
                hard_violations: pre_violations.len() as u32,
                soft_score: 0.0,
            },
            violations: pre_violations,
            stats: None,
        };
    }

    let (mut solution, maps) = mapper::to_planning(&filterable_input);

    // Construction phase
    let construction_start = Instant::now();
    let mut state = constraints::IncrementalState::new(&solution.facts);
    construction::construct_with_state(&mut solution.lessons, &solution.facts, &mut state);
    let construction_ms = construction_start.elapsed().as_millis() as u64;

    // Local search phase
    let config = local_search::LahcConfig::default();
    let mut stats = local_search::optimize(&mut solution.lessons, &solution.facts, &mut state, &config);
    stats.construction_ms = construction_ms;

    solution.score = state.score();

    let mut output = mapper::to_output(&solution, &maps, &filterable_input);

    output.score.hard_violations += pre_violations.len() as u32;
    output.violations.extend(pre_violations);
    output.stats = Some(stats);
    output
}

// ... pre_validate unchanged ...
```

- [ ] **Step 5: Refactor `construct` to accept external `IncrementalState`**

Add a new function to `scheduler/src/construction.rs` that takes an `&mut IncrementalState` parameter, so the same state can be reused by local search:

```rust
/// Construction heuristic that uses an externally-provided IncrementalState.
/// This allows the caller to reuse the state for subsequent local search.
pub fn construct_with_state(
    lessons: &mut [PlanningLesson],
    facts: &ProblemFacts,
    state: &mut IncrementalState,
) -> HardSoftScore {
    // Build sorted order: most constrained lessons first
    let mut order: Vec<usize> = (0..lessons.len()).collect();
    order.sort_by(|&a, &b| {
        let tightness_a = constraint_tightness(&lessons[a], facts);
        let tightness_b = constraint_tightness(&lessons[b], facts);
        tightness_a.cmp(&tightness_b)
    });

    let mut sorted_slot_indices: Vec<usize> = (0..facts.timeslots.len()).collect();
    sorted_slot_indices.sort_by_key(|&i| (facts.timeslots[i].day, facts.timeslots[i].period));

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
            sorted_slot_indices
                .iter()
                .flat_map(|&slot| {
                    rooms_for_subject[lesson.subject_idx]
                        .iter()
                        .map(move |&room| (slot, Some(room)))
                })
                .collect()
        } else {
            sorted_slot_indices
                .iter()
                .map(|&slot| (slot, None))
                .collect()
        };

        let mut best: Option<(usize, Option<usize>, HardSoftScore)> = None;
        for (slot, room) in candidates {
            let delta = state.evaluate_assign(lesson, slot, room, facts);
            if delta == HardSoftScore::ZERO {
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
    }

    state.score()
}

/// Original construct function for backwards compatibility with tests.
pub fn construct(lessons: &mut [PlanningLesson], facts: &ProblemFacts) -> HardSoftScore {
    let mut state = IncrementalState::new(facts);
    construct_with_state(lessons, facts, &mut state)
}
```

- [ ] **Step 6: Run all tests**

Run: `cargo test --workspace`
Expected: all tests pass including the new `local_search_improves_soft_score`

- [ ] **Step 7: Commit**

```bash
git add scheduler/src/local_search.rs scheduler/src/lib.rs scheduler/src/construction.rs scheduler/tests/basic.rs
git commit -m "feat(scheduler): add LAHC local search with Change and Swap moves"
```

---

### Task 7: Move correctness tests

**Files:**
- Create: `scheduler/tests/local_search.rs`

- [ ] **Step 1: Write move correctness tests**

Create `scheduler/tests/local_search.rs`:

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
            .map(|i| Timeslot {
                day: (i / 8) as u8,
                period: (i % 8) as u8,
            })
            .collect(),
        teachers: (0..num_teachers)
            .map(|_| TeacherFact {
                max_hours: 28,
                available_slots: bitvec![1; num_timeslots],
                qualified_subjects: bitvec![1; num_subjects],
                preferred_slots: bitvec![1; num_timeslots],
            })
            .collect(),
        classes: (0..num_classes)
            .map(|_| ClassFact {
                student_count: Some(25),
                class_teacher_idx: None,
            })
            .collect(),
        rooms: (0..num_rooms)
            .map(|_| RoomFact {
                capacity: Some(30),
                suitable_subjects: bitvec![1; num_subjects],
            })
            .collect(),
        subjects: (0..num_subjects)
            .map(|_| SubjectFact {
                needs_special_room: false,
            })
            .collect(),
    }
}

fn unassigned_lesson(id: usize, teacher: usize, class: usize, subject: usize) -> PlanningLesson {
    PlanningLesson {
        id,
        subject_idx: subject,
        teacher_idx: teacher,
        class_idx: class,
        timeslot: None,
        room: None,
    }
}

#[test]
fn change_move_score_matches_full_eval() {
    let facts = make_facts(16, 2, 2, 0, 2);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 1, 1);
    let mut l2 = unassigned_lesson(2, 0, 0, 0);

    // Assign initial
    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 1, None, &facts);
    state.assign(&mut l2, 2, None, &facts);

    // Simulate change move: move l0 from slot 0 to slot 5
    state.unassign(&mut l0, &facts);
    state.assign(&mut l0, 5, None, &facts);

    let lessons = [l0.clone(), l1.clone(), l2.clone()];
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn swap_move_score_matches_full_eval() {
    let facts = make_facts(16, 2, 2, 0, 2);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 1, 1);

    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 3, None, &facts);

    // Simulate swap: l0 gets slot 3, l1 gets slot 0
    let ts_a = l0.timeslot.unwrap();
    let room_a = l0.room;
    let ts_b = l1.timeslot.unwrap();
    let room_b = l1.room;

    state.unassign(&mut l0, &facts);
    state.unassign(&mut l1, &facts);
    state.assign(&mut l0, ts_b, room_b, &facts);
    state.assign(&mut l1, ts_a, room_a, &facts);

    let lessons = [l0.clone(), l1.clone()];
    assert_eq!(state.score(), full_evaluate(&lessons, &facts));
}

#[test]
fn undo_change_restores_score() {
    let facts = make_facts(16, 2, 2, 0, 2);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 1, 1);

    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 1, None, &facts);

    let original_score = state.score();

    // Apply change
    let old_ts = l0.timeslot.unwrap();
    state.unassign(&mut l0, &facts);
    state.assign(&mut l0, 5, None, &facts);

    // Undo change
    state.unassign(&mut l0, &facts);
    state.assign(&mut l0, old_ts, None, &facts);

    assert_eq!(state.score(), original_score);
}

#[test]
fn undo_swap_restores_score() {
    let facts = make_facts(16, 2, 2, 0, 2);
    let mut state = IncrementalState::new(&facts);

    let mut l0 = unassigned_lesson(0, 0, 0, 0);
    let mut l1 = unassigned_lesson(1, 1, 1, 1);

    state.assign(&mut l0, 0, None, &facts);
    state.assign(&mut l1, 3, None, &facts);

    let original_score = state.score();

    // Apply swap
    let ts_a = l0.timeslot.unwrap();
    let ts_b = l1.timeslot.unwrap();
    state.unassign(&mut l0, &facts);
    state.unassign(&mut l1, &facts);
    state.assign(&mut l0, ts_b, None, &facts);
    state.assign(&mut l1, ts_a, None, &facts);

    // Undo swap
    let ts_a2 = l0.timeslot.unwrap();
    let ts_b2 = l1.timeslot.unwrap();
    state.unassign(&mut l0, &facts);
    state.unassign(&mut l1, &facts);
    state.assign(&mut l0, ts_b2, None, &facts);
    state.assign(&mut l1, ts_a2, None, &facts);

    assert_eq!(state.score(), original_score);
}
```

- [ ] **Step 2: Run move tests**

Run: `cargo test --package klassenzeit-scheduler --test local_search`
Expected: all 4 tests pass

- [ ] **Step 3: Commit**

```bash
git add scheduler/tests/local_search.rs
git commit -m "test(scheduler): add move correctness tests for change and swap"
```

---

### Task 8: Update backend scheduler service for new fields

**Files:**
- Modify: `backend/src/services/scheduler.rs`

- [ ] **Step 1: Pass `class_teacher_id` and `preferred_slots` through the mapper**

Update the `sched_classes` mapping in `load_schedule_input` to include `class_teacher_id`:

```rust
let sched_classes: Vec<sched::SchoolClass> = db_classes
    .iter()
    .map(|c| sched::SchoolClass {
        id: c.id,
        name: c.name.clone(),
        grade_level: c.grade_level as u8,
        student_count: c.student_count.map(|s| s as u32),
        class_teacher_id: c.class_teacher_id,
    })
    .collect();
```

Update the `sched_teachers` mapping to include `preferred_slots`:

```rust
let preferred: std::collections::HashSet<(i16, i16)> = availabilities
    .iter()
    .filter(|a| a.teacher_id == t.id && a.availability_type == "preferred")
    .map(|a| (a.day_of_week, a.period))
    .collect();

let preferred_slots: Vec<sched::TimeSlot> = sched_timeslots
    .iter()
    .filter(|ts| preferred.contains(&(ts.day as i16, ts.period as i16)))
    .cloned()
    .collect();

sched::Teacher {
    id: t.id,
    name: format!("{} {}", t.first_name, t.last_name),
    max_hours_per_week: t.max_hours_per_week as u32,
    is_part_time: t.is_part_time,
    available_slots,
    qualified_subjects,
    preferred_slots,
}
```

- [ ] **Step 2: Update `SolveResult` to include stats**

Add to `SolveResult`:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct SolveResult {
    pub timetable: Vec<SolveLesson>,
    pub score: SolveScore,
    pub violations: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<SolveStatsDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SolveStatsDto {
    pub construction_ms: u64,
    pub local_search_ms: u64,
    pub iterations: u64,
    pub iterations_per_sec: f64,
    pub moves_accepted: u64,
    pub moves_rejected: u64,
    pub best_found_at_iteration: u64,
}
```

Update `to_solve_result`:

```rust
pub fn to_solve_result(output: sched::ScheduleOutput) -> SolveResult {
    SolveResult {
        timetable: output
            .timetable
            .into_iter()
            .map(|l| SolveLesson {
                teacher_id: l.teacher_id,
                class_id: l.class_id,
                subject_id: l.subject_id,
                room_id: l.room_id,
                timeslot_id: l.timeslot.id,
            })
            .collect(),
        score: SolveScore {
            hard_violations: output.score.hard_violations,
            soft_score: output.score.soft_score,
        },
        violations: output
            .violations
            .into_iter()
            .map(|v| v.description)
            .collect(),
        stats: output.stats.map(|s| SolveStatsDto {
            construction_ms: s.construction_ms,
            local_search_ms: s.local_search_ms,
            iterations: s.iterations,
            iterations_per_sec: s.iterations_per_sec,
            moves_accepted: s.moves_accepted,
            moves_rejected: s.moves_rejected,
            best_found_at_iteration: s.best_found_at_iteration,
        }),
    }
}
```

- [ ] **Step 3: Verify backend compiles**

Run: `cargo check --workspace`
Expected: compiles

- [ ] **Step 4: Run backend tests**

Run: `cargo test --workspace`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/scheduler.rs
git commit -m "feat(backend): pass soft constraint data and solver stats through scheduler service"
```

---

### Task 9: Criterion benchmarks

**Files:**
- Create: `scheduler/benches/solver_bench.rs`

- [ ] **Step 1: Create benchmark file**

Create `scheduler/benches/solver_bench.rs`:

```rust
use bitvec::prelude::*;
use criterion::{criterion_group, criterion_main, Criterion};
use klassenzeit_scheduler::constraints::IncrementalState;
use klassenzeit_scheduler::construction::{construct, construct_with_state};
use klassenzeit_scheduler::planning::*;

fn make_bench_facts(num_classes: usize) -> (ProblemFacts, Vec<PlanningLesson>) {
    let num_teachers = num_classes * 2;
    let num_subjects = 8;
    let num_rooms = 3;
    let periods_per_day = 6;
    let days = 5;
    let num_timeslots = days * periods_per_day;

    let teachers: Vec<TeacherFact> = (0..num_teachers)
        .map(|t| {
            let mut available_slots = bitvec![1; num_timeslots];
            // Block ~20% of slots randomly (deterministic pattern)
            for s in 0..num_timeslots {
                if (t * 7 + s * 13) % 5 == 0 {
                    available_slots.set(s, false);
                }
            }
            let mut qualified_subjects = bitvec![0; num_subjects];
            // Each teacher qualified for 2-3 subjects
            for s in 0..num_subjects {
                if (t + s) % 3 != 0 {
                    qualified_subjects.set(s, true);
                }
            }
            let mut preferred_slots = bitvec![0; num_timeslots];
            // Prefer ~60% of slots
            for s in 0..num_timeslots {
                if (t * 3 + s * 7) % 5 != 0 {
                    preferred_slots.set(s, true);
                }
            }
            TeacherFact {
                max_hours: 24,
                available_slots,
                qualified_subjects,
                preferred_slots,
            }
        })
        .collect();

    let rooms: Vec<RoomFact> = (0..num_rooms)
        .map(|r| {
            let mut suitable_subjects = bitvec![0; num_subjects];
            // Each room suitable for some subjects
            for s in 0..num_subjects {
                if (r + s) % 2 == 0 {
                    suitable_subjects.set(s, true);
                }
            }
            RoomFact {
                capacity: Some(30),
                suitable_subjects,
            }
        })
        .collect();

    let facts = ProblemFacts {
        timeslots: (0..num_timeslots)
            .map(|i| Timeslot {
                day: (i / periods_per_day) as u8,
                period: (i % periods_per_day) as u8,
            })
            .collect(),
        teachers,
        classes: (0..num_classes)
            .map(|i| ClassFact {
                student_count: Some(25),
                class_teacher_idx: Some(i % num_teachers),
            })
            .collect(),
        rooms,
        subjects: (0..num_subjects)
            .map(|s| SubjectFact {
                needs_special_room: s < num_rooms,
            })
            .collect(),
    };

    // Generate lessons: each class gets 3-4 hours of each of 4 subjects
    let mut lessons = Vec::new();
    let mut id = 0;
    for class_idx in 0..num_classes {
        for subj_idx in 0..4.min(num_subjects) {
            let hours = 3 + (class_idx + subj_idx) % 2; // 3 or 4
            // Find a qualified teacher
            let teacher_idx = (0..facts.teachers.len())
                .find(|&t| facts.teachers[t].qualified_subjects[subj_idx])
                .unwrap_or(0);
            for _ in 0..hours {
                lessons.push(PlanningLesson {
                    id,
                    subject_idx: subj_idx,
                    teacher_idx,
                    class_idx,
                    timeslot: None,
                    room: None,
                });
                id += 1;
            }
        }
    }

    (facts, lessons)
}

fn bench_construct_small(c: &mut Criterion) {
    let (facts, lessons) = make_bench_facts(6);
    c.bench_function("construct_6_classes", |b| {
        b.iter(|| {
            let mut l = lessons.clone();
            construct(&mut l, &facts);
        })
    });
}

fn bench_construct_medium(c: &mut Criterion) {
    let (facts, lessons) = make_bench_facts(15);
    c.bench_function("construct_15_classes", |b| {
        b.iter(|| {
            let mut l = lessons.clone();
            construct(&mut l, &facts);
        })
    });
}

fn bench_evaluate_assign(c: &mut Criterion) {
    let (facts, mut lessons) = make_bench_facts(6);
    let mut state = IncrementalState::new(&facts);
    // Assign most lessons
    for i in 0..lessons.len().saturating_sub(1) {
        let slot = i % facts.timeslots.len();
        state.assign(&mut lessons[i], slot, None, &facts);
    }
    let last = &lessons[lessons.len() - 1];
    c.bench_function("evaluate_assign_delta", |b| {
        b.iter(|| {
            state.evaluate_assign(last, 5, None, &facts);
        })
    });
}

fn bench_solve_small(c: &mut Criterion) {
    use klassenzeit_scheduler::local_search::{self, LahcConfig};

    let (facts, lessons) = make_bench_facts(6);

    let config = LahcConfig {
        max_seconds: 5,
        max_idle_seconds: 3,
        seed: Some(42),
        ..Default::default()
    };

    c.bench_function("solve_6_classes_5s", |b| {
        b.iter(|| {
            let mut l = lessons.clone();
            let mut state = IncrementalState::new(&facts);
            klassenzeit_scheduler::construction::construct_with_state(&mut l, &facts, &mut state);
            local_search::optimize(&mut l, &facts, &mut state, &config);
        })
    });
}

criterion_group!(
    benches,
    bench_construct_small,
    bench_construct_medium,
    bench_evaluate_assign,
    bench_solve_small,
);
criterion_main!(benches);
```

- [ ] **Step 2: Verify benchmarks compile**

Run: `cargo bench --package klassenzeit-scheduler --no-run`
Expected: compiles

- [ ] **Step 3: Run a quick benchmark**

Run: `cargo bench --package klassenzeit-scheduler -- --quick`
Expected: outputs benchmark results for all 4 benchmarks

- [ ] **Step 4: Commit**

```bash
git add scheduler/benches/solver_bench.rs
git commit -m "feat(scheduler): add criterion benchmarks for construction and local search"
```

---

### Task 10: Final integration and cleanup

**Files:**
- Modify: `scheduler/src/construction.rs` (already done in Task 6)
- Various test files

- [ ] **Step 1: Run full test suite**

Run: `cargo test --workspace`
Expected: all tests pass

- [ ] **Step 2: Run clippy**

Run: `cargo clippy --workspace -- -D warnings`
Expected: no warnings

- [ ] **Step 3: Run benchmarks**

Run: `cargo bench --package klassenzeit-scheduler -- --quick`
Expected: benchmarks run successfully

- [ ] **Step 4: Commit any cleanup**

If any clippy fixes were needed:

```bash
git add -A
git commit -m "fix(scheduler): address clippy warnings"
```

- [ ] **Step 5: Create PR**

```bash
git checkout -b feat/local-search-soft-constraints
git push -u origin feat/local-search-soft-constraints
gh pr create --title "feat(scheduler): LAHC local search + 4 soft constraints" --body "..."
```
