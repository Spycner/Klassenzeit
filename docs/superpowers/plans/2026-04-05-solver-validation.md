# Solver Validation + Benchmarking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add class availability constraint, Stundentafel expansion, realistic Hessen Grundschule test instances, and a benchmark harness to validate the LAHC solver.

**Architecture:** Extend `types.rs` with class availability + Stundentafel types. Add hard constraint #9 (class availability) to both reference and incremental scoring. Expand Stundentafeln in the mapper. Build 3 deterministic instances (4/8/16 classes). Diagnostic CLI binary + criterion benchmarks.

**Tech Stack:** Rust, bitvec, criterion, uuid, rand

---

### Task 1: Add `available_slots` and `grade` to SchoolClass + ClassFact

**Files:**
- Modify: `scheduler/src/types.rs:44-51`
- Modify: `scheduler/src/planning.rs:112-116`

- [ ] **Step 1: Add fields to `SchoolClass` in `types.rs`**

```rust
#[derive(Debug, Clone)]
pub struct SchoolClass {
    pub id: Uuid,
    pub name: String,
    pub grade_level: u8,
    pub student_count: Option<u32>,
    pub class_teacher_id: Option<Uuid>,
    pub available_slots: Vec<TimeSlot>,
    pub grade: Option<u8>,
}
```

- [ ] **Step 2: Add `available_slots` BitVec to `ClassFact` in `planning.rs`**

```rust
#[derive(Debug, Clone)]
pub struct ClassFact {
    pub student_count: Option<u32>,
    pub class_teacher_idx: Option<usize>,
    /// Bit i is set if class is available in timeslot i.
    pub available_slots: BitVec,
}
```

- [ ] **Step 3: Fix all compilation errors from new fields**

Every place that constructs `SchoolClass` needs `available_slots: vec![]` and `grade: None` added. Every place that constructs `ClassFact` needs `available_slots: bitvec![1; num_timeslots]`.

Files to update:
- `scheduler/src/mapper.rs` — `to_planning()` at line 92: map `available_slots` to BitVec (same pattern as teacher availability). Empty `available_slots` = all available.

In `to_planning()`, replace the class mapping block (lines 86-98) with:

```rust
    let mut class_uuid_to_idx = HashMap::new();
    let mut class_uuids = Vec::new();
    let mut classes = Vec::new();
    for (i, c) in input.classes.iter().enumerate() {
        class_uuid_to_idx.insert(c.id, i);
        class_uuids.push(c.id);

        // Empty available_slots means "all slots available"
        let available_slots = if c.available_slots.is_empty() {
            bitvec![1; num_timeslots]
        } else {
            let mut bits = bitvec![0; num_timeslots];
            for slot in &c.available_slots {
                if let Some(&idx) = timeslot_uuid_to_idx.get(&slot.id) {
                    bits.set(idx, true);
                }
            }
            bits
        };

        classes.push(ClassFact {
            student_count: c.student_count,
            class_teacher_idx: c
                .class_teacher_id
                .and_then(|tid| teacher_uuid_to_idx.get(&tid).copied()),
            available_slots,
        });
    }
```

- `scheduler/tests/*.rs` — every test that constructs `ClassFact` needs the new field. Add `available_slots: bitvec![1; num_timeslots]` where `num_timeslots` is the number of timeslots in that test.
- `scheduler/tests/proptest_scoring.rs` — in `arb_problem()`, add `available_slots: bitvec![1; num_slots]` to the ClassFact construction at line 67.
- `scheduler/benches/solver_bench.rs` — in `make_bench_facts()`, add `available_slots: bitvec![1; num_timeslots]` to the ClassFact construction at line 70.
- `scheduler/src/mapper.rs` tests — add `available_slots: vec![]` and `grade: None` to SchoolClass constructions.

- [ ] **Step 4: Run `cargo test --workspace` and `cargo bench --no-run` to verify compilation**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test --workspace`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/types.rs scheduler/src/planning.rs scheduler/src/mapper.rs scheduler/tests/ scheduler/benches/
git commit -m "feat(scheduler): add available_slots and grade to SchoolClass/ClassFact"
```

---

### Task 2: Add class availability hard constraint (#9)

**Files:**
- Modify: `scheduler/src/constraints.rs`
- Test: `scheduler/tests/constraints.rs`
- Test: `scheduler/tests/incremental.rs`
- Test: `scheduler/tests/proptest_scoring.rs`

- [ ] **Step 1: Write failing test for class availability in `constraints.rs` (full_evaluate)**

Add to `scheduler/tests/constraints.rs`:

```rust
#[test]
fn hard_class_unavailable_slot() {
    let num_slots = 4;
    let mut class_available = bitvec![1; num_slots];
    class_available.set(0, false); // class unavailable in slot 0

    let facts = ProblemFacts {
        timeslots: (0..num_slots)
            .map(|i| Timeslot {
                day: 0,
                period: i as u8,
            })
            .collect(),
        teachers: vec![TeacherFact {
            max_hours: 10,
            available_slots: bitvec![1; num_slots],
            qualified_subjects: bitvec![1; 1],
            preferred_slots: bitvec![1; num_slots],
        }],
        classes: vec![ClassFact {
            student_count: Some(25),
            class_teacher_idx: None,
            available_slots: class_available,
        }],
        rooms: vec![],
        subjects: vec![SubjectFact {
            needs_special_room: false,
        }],
    };

    let lessons = vec![PlanningLesson {
        id: 0,
        subject_idx: 0,
        teacher_idx: 0,
        class_idx: 0,
        timeslot: Some(0), // unavailable slot
        room: None,
    }];

    let score = full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, -1, "class in unavailable slot should get -1 hard");

    // Lesson in available slot should be fine
    let lessons_ok = vec![PlanningLesson {
        id: 0,
        subject_idx: 0,
        teacher_idx: 0,
        class_idx: 0,
        timeslot: Some(1), // available slot
        room: None,
    }];
    let score_ok = full_evaluate(&lessons_ok, &facts);
    assert_eq!(score_ok.hard, 0);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test constraints hard_class_unavailable_slot`
Expected: FAIL (class availability not checked yet)

- [ ] **Step 3: Add class availability to `full_evaluate` in `constraints.rs`**

In `full_evaluate()`, in the per-lesson loop (after the teacher availability check at line 83), add:

```rust
        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[ts] {
            score += HardSoftScore::hard(-1);
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test constraints hard_class_unavailable_slot`
Expected: PASS

- [ ] **Step 5: Write failing test for incremental class availability**

Add to `scheduler/tests/incremental.rs`:

```rust
#[test]
fn incremental_class_availability() {
    let num_slots = 4;
    let mut class_available = bitvec![1; num_slots];
    class_available.set(0, false);

    let facts = ProblemFacts {
        timeslots: (0..num_slots)
            .map(|i| Timeslot {
                day: 0,
                period: i as u8,
            })
            .collect(),
        teachers: vec![TeacherFact {
            max_hours: 10,
            available_slots: bitvec![1; num_slots],
            qualified_subjects: bitvec![1; 1],
            preferred_slots: bitvec![1; num_slots],
        }],
        classes: vec![ClassFact {
            student_count: Some(25),
            class_teacher_idx: None,
            available_slots: class_available,
        }],
        rooms: vec![],
        subjects: vec![SubjectFact {
            needs_special_room: false,
        }],
    };

    let mut lesson = PlanningLesson {
        id: 0,
        subject_idx: 0,
        teacher_idx: 0,
        class_idx: 0,
        timeslot: None,
        room: None,
    };

    let mut state = IncrementalState::new(&facts);

    // Assign to unavailable slot
    let delta = state.evaluate_assign(&lesson, 0, None, &facts);
    assert_eq!(delta.hard, -1, "evaluate_assign should detect unavailable class slot");

    state.assign(&mut lesson, 0, None, &facts);
    assert_eq!(state.score().hard, -1);

    let full = full_evaluate(&[lesson.clone()], &facts);
    assert_eq!(state.score(), full, "incremental must match full_evaluate");

    // Unassign and reassign to available slot
    state.unassign(&mut lesson, &facts);
    assert_eq!(state.score(), HardSoftScore::ZERO);

    state.assign(&mut lesson, 1, None, &facts);
    assert_eq!(state.score().hard, 0);
}
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test incremental incremental_class_availability`
Expected: FAIL

- [ ] **Step 7: Add class availability to `evaluate_assign` in `IncrementalState`**

In `evaluate_assign()`, after the teacher availability check (line 304-306), add:

```rust
        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[timeslot] {
            delta += HardSoftScore::hard(-1);
        }
```

- [ ] **Step 8: Add class availability to `unassign` in `IncrementalState`**

In `unassign()`, after the teacher availability reversal (line 467-469), add:

```rust
        // 9. Class availability
        if !facts.classes[lesson.class_idx].available_slots[timeslot] {
            delta += HardSoftScore::hard(1);
        }
```

- [ ] **Step 9: Run incremental test to verify it passes**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test incremental incremental_class_availability`
Expected: PASS

- [ ] **Step 10: Update proptest to include class availability**

In `scheduler/tests/proptest_scoring.rs`, modify `arb_problem()` to generate random class availability. Add a new bit vector to the strategy. In the `prop_flat_map` input tuple, add:

```rust
proptest::collection::vec(prop::bool::ANY, num_slots * num_classes), // class availability
```

Then in the ClassFact construction, use:

```rust
                        classes: (0..num_classes)
                            .enumerate()
                            .map(|(c, _)| {
                                let mut available_slots = bitvec![0; num_slots];
                                for s in 0..num_slots {
                                    available_slots.set(s, class_avail_bits[c * num_slots + s]);
                                }
                                ClassFact {
                                    student_count: Some(25),
                                    class_teacher_idx: ct_idxs[c],
                                    available_slots,
                                }
                            })
                            .collect(),
```

Make sure to add `class_avail_bits` to the destructured tuple and the `prop_map` closure capture.

- [ ] **Step 11: Run all tests**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler`
Expected: All tests pass, including property tests.

- [ ] **Step 12: Commit**

```bash
git add scheduler/src/constraints.rs scheduler/tests/constraints.rs scheduler/tests/incremental.rs scheduler/tests/proptest_scoring.rs
git commit -m "feat(scheduler): add class availability hard constraint (#9)"
```

---

### Task 3: Add Stundentafel types and expansion in mapper

**Files:**
- Modify: `scheduler/src/types.rs`
- Modify: `scheduler/src/mapper.rs`
- Test: `scheduler/src/mapper.rs` (inline tests)

- [ ] **Step 1: Add Stundentafel types to `types.rs`**

Add after `LessonRequirement`:

```rust
#[derive(Debug, Clone)]
pub struct Stundentafel {
    pub grade: u8,
    pub entries: Vec<StundentafelEntry>,
}

#[derive(Debug, Clone)]
pub struct StundentafelEntry {
    pub subject_id: Uuid,
    pub hours_per_week: u32,
    pub teacher_id: Option<Uuid>,
}
```

Add `stundentafeln` field to `ScheduleInput`:

```rust
#[derive(Debug, Clone, Default)]
pub struct ScheduleInput {
    pub teachers: Vec<Teacher>,
    pub classes: Vec<SchoolClass>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub timeslots: Vec<TimeSlot>,
    pub requirements: Vec<LessonRequirement>,
    pub stundentafeln: Vec<Stundentafel>,
}
```

- [ ] **Step 2: Write failing test for Stundentafel expansion**

Add to `scheduler/src/mapper.rs` tests:

```rust
    #[test]
    fn stundentafel_expands_to_requirements() {
        let slots = vec![ts(0, 1), ts(0, 2), ts(0, 3)];
        let math_id = Uuid::new_v4();
        let deutsch_id = Uuid::new_v4();
        let teacher_id = Uuid::new_v4();
        let class_id = Uuid::new_v4();

        let input = ScheduleInput {
            teachers: vec![Teacher {
                id: teacher_id,
                name: "Alice".into(),
                max_hours_per_week: 28,
                is_part_time: false,
                available_slots: slots.clone(),
                qualified_subjects: vec![math_id, deutsch_id],
                preferred_slots: vec![],
            }],
            classes: vec![SchoolClass {
                id: class_id,
                name: "1A".into(),
                grade_level: 1,
                student_count: Some(25),
                class_teacher_id: None,
                available_slots: vec![],
                grade: Some(1),
            }],
            rooms: vec![],
            subjects: vec![
                Subject { id: math_id, name: "Math".into(), needs_special_room: false },
                Subject { id: deutsch_id, name: "Deutsch".into(), needs_special_room: false },
            ],
            timeslots: slots,
            requirements: vec![], // no explicit requirements
            stundentafeln: vec![Stundentafel {
                grade: 1,
                entries: vec![
                    StundentafelEntry { subject_id: math_id, hours_per_week: 2, teacher_id: None },
                    StundentafelEntry { subject_id: deutsch_id, hours_per_week: 1, teacher_id: Some(teacher_id) },
                ],
            }],
        };

        let (solution, _maps) = to_planning(&input);
        // 2 math lessons + 1 deutsch lesson = 3 total
        assert_eq!(solution.lessons.len(), 3);
    }

    #[test]
    fn stundentafel_explicit_requirement_wins() {
        let slots = vec![ts(0, 1), ts(0, 2)];
        let math_id = Uuid::new_v4();
        let teacher_a = Uuid::new_v4();
        let teacher_b = Uuid::new_v4();
        let class_id = Uuid::new_v4();

        let input = ScheduleInput {
            teachers: vec![
                Teacher {
                    id: teacher_a, name: "Alice".into(), max_hours_per_week: 28,
                    is_part_time: false, available_slots: slots.clone(),
                    qualified_subjects: vec![math_id], preferred_slots: vec![],
                },
                Teacher {
                    id: teacher_b, name: "Bob".into(), max_hours_per_week: 28,
                    is_part_time: false, available_slots: slots.clone(),
                    qualified_subjects: vec![math_id], preferred_slots: vec![],
                },
            ],
            classes: vec![SchoolClass {
                id: class_id, name: "1A".into(), grade_level: 1,
                student_count: Some(25), class_teacher_id: None,
                available_slots: vec![], grade: Some(1),
            }],
            rooms: vec![],
            subjects: vec![Subject { id: math_id, name: "Math".into(), needs_special_room: false }],
            timeslots: slots,
            // Explicit: 1 hour math with teacher_b
            requirements: vec![LessonRequirement {
                class_id, subject_id: math_id, teacher_id: Some(teacher_b), hours_per_week: 1,
            }],
            // Stundentafel says 2 hours math
            stundentafeln: vec![Stundentafel {
                grade: 1,
                entries: vec![
                    StundentafelEntry { subject_id: math_id, hours_per_week: 2, teacher_id: None },
                ],
            }],
        };

        let (solution, _maps) = to_planning(&input);
        // Explicit requirement wins → only the 1 explicit math lesson, stundentafel skipped for math
        assert_eq!(solution.lessons.len(), 1);
    }
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler mapper::tests::stundentafel`
Expected: FAIL (Stundentafel not expanded yet)

- [ ] **Step 4: Implement Stundentafel expansion in `mapper.rs`**

Add a function to expand Stundentafeln and call it at the start of `to_planning()`. Add this function before `to_planning`:

```rust
/// Expand Stundentafeln into LessonRequirements, skipping subjects that
/// already have explicit requirements for a given class.
fn expand_stundentafeln(input: &ScheduleInput) -> Vec<LessonRequirement> {
    use std::collections::HashSet;

    // Collect (class_id, subject_id) pairs from explicit requirements
    let explicit: HashSet<(Uuid, Uuid)> = input
        .requirements
        .iter()
        .map(|r| (r.class_id, r.subject_id))
        .collect();

    let mut expanded = Vec::new();

    for class in &input.classes {
        let grade = match class.grade {
            Some(g) => g,
            None => continue,
        };

        for st in &input.stundentafeln {
            if st.grade != grade {
                continue;
            }
            for entry in &st.entries {
                if explicit.contains(&(class.id, entry.subject_id)) {
                    continue;
                }
                expanded.push(LessonRequirement {
                    class_id: class.id,
                    subject_id: entry.subject_id,
                    teacher_id: entry.teacher_id,
                    hours_per_week: entry.hours_per_week,
                });
            }
        }
    }

    expanded
}
```

Then at the top of `to_planning()`, after `let num_timeslots = input.timeslots.len();`, add:

```rust
    // Merge explicit requirements with Stundentafel expansions
    let stundentafel_reqs = expand_stundentafeln(input);
    let all_requirements: Vec<&LessonRequirement> = input
        .requirements
        .iter()
        .chain(stundentafel_reqs.iter())
        .collect();
```

Then change the lesson expansion loop to iterate over `all_requirements` instead of `input.requirements`:

```rust
    for req in &all_requirements {
        // ... (same body as before)
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler mapper::tests::stundentafel`
Expected: PASS

- [ ] **Step 6: Run all tests to check nothing broke**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add scheduler/src/types.rs scheduler/src/mapper.rs
git commit -m "feat(scheduler): add Stundentafel types and expansion in mapper"
```

---

### Task 4: Update construction heuristic for class availability

**Files:**
- Modify: `scheduler/src/construction.rs:92-108`
- Test: `scheduler/tests/construction.rs`

- [ ] **Step 1: Write failing test**

Add to `scheduler/tests/construction.rs`:

```rust
#[test]
fn respects_class_availability() {
    let num_slots = 4;
    // Class available only in slots 2 and 3
    let mut class_available = bitvec![0; num_slots];
    class_available.set(2, true);
    class_available.set(3, true);

    let facts = ProblemFacts {
        timeslots: (0..num_slots)
            .map(|i| Timeslot {
                day: 0,
                period: i as u8,
            })
            .collect(),
        teachers: vec![TeacherFact {
            max_hours: 10,
            available_slots: bitvec![1; num_slots],
            qualified_subjects: bitvec![1; 1],
            preferred_slots: bitvec![1; num_slots],
        }],
        classes: vec![ClassFact {
            student_count: Some(25),
            class_teacher_idx: None,
            available_slots: class_available,
        }],
        rooms: vec![],
        subjects: vec![SubjectFact {
            needs_special_room: false,
        }],
    };

    let mut lessons = vec![PlanningLesson {
        id: 0,
        subject_idx: 0,
        teacher_idx: 0,
        class_idx: 0,
        timeslot: None,
        room: None,
    }];

    let score = construct(&mut lessons, &facts);
    assert!(score.is_feasible(), "construction should find a feasible slot");
    let assigned_slot = lessons[0].timeslot.unwrap();
    assert!(
        assigned_slot == 2 || assigned_slot == 3,
        "lesson should be in available slot (2 or 3), got {}",
        assigned_slot
    );
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test construction respects_class_availability`
Expected: FAIL (construction places in slot 0 since it doesn't check class availability)

- [ ] **Step 3: Add class availability to `constraint_tightness`**

In `construction.rs`, update `constraint_tightness()`:

```rust
fn constraint_tightness(lesson: &PlanningLesson, facts: &ProblemFacts) -> (usize, usize) {
    let teacher = &facts.teachers[lesson.teacher_idx];
    let class = &facts.classes[lesson.class_idx];

    // Primary: number of timeslots where BOTH teacher and class are available
    let eligible_slots = teacher
        .available_slots
        .iter()
        .zip(class.available_slots.iter())
        .filter(|(t, c)| **t && **c)
        .count();

    // Secondary: number of suitable rooms (0 if no special room needed)
    let eligible_rooms = if facts.subjects[lesson.subject_idx].needs_special_room {
        (0..facts.rooms.len())
            .filter(|&r| facts.rooms[r].suitable_subjects[lesson.subject_idx])
            .count()
    } else {
        usize::MAX
    };

    (eligible_slots, eligible_rooms)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test construction respects_class_availability`
Expected: PASS (the construction now avoids unavailable class slots because `evaluate_assign` penalizes them, and `constraint_tightness` correctly counts eligible slots)

- [ ] **Step 5: Run all construction tests**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test construction`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add scheduler/src/construction.rs scheduler/tests/construction.rs
git commit -m "feat(scheduler): respect class availability in construction heuristic"
```

---

### Task 5: Build test instance builders

**Files:**
- Create: `scheduler/src/instances.rs`
- Modify: `scheduler/src/lib.rs`

- [ ] **Step 1: Add `instances` module to `lib.rs`**

Add to `scheduler/src/lib.rs` after the other module declarations:

```rust
pub mod instances;
```

- [ ] **Step 2: Create `scheduler/src/instances.rs` with helper functions**

```rust
use uuid::Uuid;

use crate::types::*;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn make_timeslots(days: u8, periods_per_day: u8) -> Vec<TimeSlot> {
    let mut slots = Vec::new();
    for day in 0..days {
        for period in 0..periods_per_day {
            slots.push(TimeSlot {
                id: Uuid::new_v4(),
                day,
                period,
            });
        }
    }
    slots
}

fn slots_for_periods(timeslots: &[TimeSlot], days: u8, periods: &[u8]) -> Vec<TimeSlot> {
    timeslots
        .iter()
        .filter(|ts| ts.day < days && periods.contains(&ts.period))
        .cloned()
        .collect()
}

fn make_stundentafeln(subjects: &SubjectSet) -> Vec<Stundentafel> {
    vec![
        Stundentafel {
            grade: 1,
            entries: vec![
                StundentafelEntry { subject_id: subjects.deutsch, hours_per_week: 6, teacher_id: None },
                StundentafelEntry { subject_id: subjects.mathe, hours_per_week: 5, teacher_id: None },
                StundentafelEntry { subject_id: subjects.sachunterricht, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.religion, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.kunst, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.musik, hours_per_week: 1, teacher_id: None },
                StundentafelEntry { subject_id: subjects.sport, hours_per_week: 3, teacher_id: None },
            ],
        },
        Stundentafel {
            grade: 2,
            entries: vec![
                StundentafelEntry { subject_id: subjects.deutsch, hours_per_week: 7, teacher_id: None },
                StundentafelEntry { subject_id: subjects.mathe, hours_per_week: 5, teacher_id: None },
                StundentafelEntry { subject_id: subjects.sachunterricht, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.religion, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.kunst, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.musik, hours_per_week: 1, teacher_id: None },
                StundentafelEntry { subject_id: subjects.sport, hours_per_week: 3, teacher_id: None },
            ],
        },
        Stundentafel {
            grade: 3,
            entries: vec![
                StundentafelEntry { subject_id: subjects.deutsch, hours_per_week: 6, teacher_id: None },
                StundentafelEntry { subject_id: subjects.mathe, hours_per_week: 5, teacher_id: None },
                StundentafelEntry { subject_id: subjects.sachunterricht, hours_per_week: 4, teacher_id: None },
                StundentafelEntry { subject_id: subjects.religion, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.kunst, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.musik, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.sport, hours_per_week: 3, teacher_id: None },
                StundentafelEntry { subject_id: subjects.englisch, hours_per_week: 2, teacher_id: None },
            ],
        },
        Stundentafel {
            grade: 4,
            entries: vec![
                StundentafelEntry { subject_id: subjects.deutsch, hours_per_week: 6, teacher_id: None },
                StundentafelEntry { subject_id: subjects.mathe, hours_per_week: 5, teacher_id: None },
                StundentafelEntry { subject_id: subjects.sachunterricht, hours_per_week: 4, teacher_id: None },
                StundentafelEntry { subject_id: subjects.religion, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.kunst, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.musik, hours_per_week: 2, teacher_id: None },
                StundentafelEntry { subject_id: subjects.sport, hours_per_week: 3, teacher_id: None },
                StundentafelEntry { subject_id: subjects.englisch, hours_per_week: 2, teacher_id: None },
            ],
        },
    ]
}

struct SubjectSet {
    deutsch: Uuid,
    mathe: Uuid,
    sachunterricht: Uuid,
    religion: Uuid,
    kunst: Uuid,
    musik: Uuid,
    sport: Uuid,
    englisch: Uuid,
}

fn make_subjects() -> (Vec<Subject>, SubjectSet) {
    let set = SubjectSet {
        deutsch: Uuid::new_v4(),
        mathe: Uuid::new_v4(),
        sachunterricht: Uuid::new_v4(),
        religion: Uuid::new_v4(),
        kunst: Uuid::new_v4(),
        musik: Uuid::new_v4(),
        sport: Uuid::new_v4(),
        englisch: Uuid::new_v4(),
    };
    let subjects = vec![
        Subject { id: set.deutsch, name: "Deutsch".into(), needs_special_room: false },
        Subject { id: set.mathe, name: "Mathematik".into(), needs_special_room: false },
        Subject { id: set.sachunterricht, name: "Sachunterricht".into(), needs_special_room: false },
        Subject { id: set.religion, name: "Religion".into(), needs_special_room: false },
        Subject { id: set.kunst, name: "Kunst".into(), needs_special_room: false },
        Subject { id: set.musik, name: "Musik".into(), needs_special_room: false },
        Subject { id: set.sport, name: "Sport".into(), needs_special_room: true },
        Subject { id: set.englisch, name: "Englisch".into(), needs_special_room: false },
    ];
    (subjects, set)
}

/// Create a Klassenlehrer qualified for core subjects (Deutsch, Mathe, Sachunterricht, Kunst).
fn make_klassenlehrer(
    name: &str,
    subjects: &SubjectSet,
    available_slots: Vec<TimeSlot>,
    preferred_slots: Vec<TimeSlot>,
    max_hours: u32,
) -> Teacher {
    Teacher {
        id: Uuid::new_v4(),
        name: name.into(),
        max_hours_per_week: max_hours,
        is_part_time: false,
        available_slots,
        qualified_subjects: vec![
            subjects.deutsch,
            subjects.mathe,
            subjects.sachunterricht,
            subjects.kunst,
        ],
        preferred_slots,
    }
}

// ---------------------------------------------------------------------------
// Public instance builders
// ---------------------------------------------------------------------------

/// Small instance: 1-Züge Grundschule (4 classes, ~95 lessons)
pub fn small_4_classes() -> ScheduleInput {
    let (subjects, subj) = make_subjects();
    let timeslots = make_timeslots(5, 6);
    let early_slots = slots_for_periods(&timeslots, 5, &[0, 1, 2, 3]); // periods 0-3
    let all_slots = timeslots.clone();

    // 4 Klassenlehrer (one per class)
    let kl1 = make_klassenlehrer("Frau Müller", &subj, all_slots.clone(), early_slots.clone(), 28);
    let kl2 = make_klassenlehrer("Frau Schmidt", &subj, all_slots.clone(), early_slots.clone(), 28);
    let kl3 = make_klassenlehrer("Herr Weber", &subj, all_slots.clone(), vec![], 28);
    let kl4 = make_klassenlehrer("Frau Fischer", &subj, all_slots.clone(), vec![], 28);

    // 2 Fachlehrer
    let sport_musik = Teacher {
        id: Uuid::new_v4(),
        name: "Herr Becker".into(),
        max_hours_per_week: 20,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![subj.sport, subj.musik],
        preferred_slots: vec![],
    };
    let religion_englisch = Teacher {
        id: Uuid::new_v4(),
        name: "Frau Klein".into(),
        max_hours_per_week: 14,
        is_part_time: true,
        // Available Mon-Thu only
        available_slots: slots_for_periods(&timeslots, 4, &[0, 1, 2, 3, 4, 5]),
        qualified_subjects: vec![subj.religion, subj.englisch],
        preferred_slots: vec![],
    };

    let classes = vec![
        SchoolClass {
            id: Uuid::new_v4(), name: "1a".into(), grade_level: 1,
            student_count: Some(22), class_teacher_id: Some(kl1.id),
            available_slots: early_slots.clone(), grade: Some(1),
        },
        SchoolClass {
            id: Uuid::new_v4(), name: "2a".into(), grade_level: 2,
            student_count: Some(24), class_teacher_id: Some(kl2.id),
            available_slots: early_slots.clone(), grade: Some(2),
        },
        SchoolClass {
            id: Uuid::new_v4(), name: "3a".into(), grade_level: 3,
            student_count: Some(23), class_teacher_id: Some(kl3.id),
            available_slots: slots_for_periods(&timeslots, 5, &[0, 1, 2, 3, 4]),
            grade: Some(3),
        },
        SchoolClass {
            id: Uuid::new_v4(), name: "4a".into(), grade_level: 4,
            student_count: Some(25), class_teacher_id: Some(kl4.id),
            available_slots: slots_for_periods(&timeslots, 5, &[0, 1, 2, 3, 4]),
            grade: Some(4),
        },
    ];

    let rooms = vec![
        Room { id: Uuid::new_v4(), name: "Raum 1a".into(), capacity: Some(30), suitable_subjects: vec![] },
        Room { id: Uuid::new_v4(), name: "Raum 2a".into(), capacity: Some(30), suitable_subjects: vec![] },
        Room { id: Uuid::new_v4(), name: "Raum 3a".into(), capacity: Some(30), suitable_subjects: vec![] },
        Room { id: Uuid::new_v4(), name: "Raum 4a".into(), capacity: Some(30), suitable_subjects: vec![] },
        Room { id: Uuid::new_v4(), name: "Sporthalle".into(), capacity: Some(30), suitable_subjects: vec![subj.sport] },
    ];

    let teachers = vec![kl1, kl2, kl3, kl4, sport_musik, religion_englisch];

    // Use Stundentafel-based requirements via teacher_id overrides in entries
    // Klassenlehrer teach Deutsch, Mathe, Sachunterricht, Kunst for their class
    // Fachlehrer teach Sport, Musik, Religion, Englisch
    let mut requirements = Vec::new();
    for (i, class) in classes.iter().enumerate() {
        let kl_id = teachers[i].id;
        let grade = class.grade.unwrap();

        // Klassenlehrer subjects
        let deutsch_h: u32 = if grade == 2 { 7 } else { 6 };
        let su_h: u32 = if grade >= 3 { 4 } else { 2 };
        requirements.extend([
            LessonRequirement { class_id: class.id, subject_id: subj.deutsch, teacher_id: Some(kl_id), hours_per_week: deutsch_h },
            LessonRequirement { class_id: class.id, subject_id: subj.mathe, teacher_id: Some(kl_id), hours_per_week: 5 },
            LessonRequirement { class_id: class.id, subject_id: subj.sachunterricht, teacher_id: Some(kl_id), hours_per_week: su_h },
            LessonRequirement { class_id: class.id, subject_id: subj.kunst, teacher_id: Some(kl_id), hours_per_week: 2 },
        ]);

        // Fachlehrer subjects
        let musik_h: u32 = if grade >= 3 { 2 } else { 1 };
        requirements.extend([
            LessonRequirement { class_id: class.id, subject_id: subj.sport, teacher_id: Some(teachers[4].id), hours_per_week: 3 },
            LessonRequirement { class_id: class.id, subject_id: subj.musik, teacher_id: Some(teachers[4].id), hours_per_week: musik_h },
            LessonRequirement { class_id: class.id, subject_id: subj.religion, teacher_id: Some(teachers[5].id), hours_per_week: 2 },
        ]);

        // Englisch only for grades 3-4
        if grade >= 3 {
            requirements.push(LessonRequirement {
                class_id: class.id, subject_id: subj.englisch,
                teacher_id: Some(teachers[5].id), hours_per_week: 2,
            });
        }
    }

    ScheduleInput {
        teachers,
        classes,
        rooms,
        subjects,
        timeslots,
        requirements,
        stundentafeln: vec![], // Using explicit requirements for teacher assignment control
    }
}

/// Realistic instance: 2-Züge Grundschule (8 classes, ~190 lessons)
pub fn realistic_8_classes() -> ScheduleInput {
    let (subjects, subj) = make_subjects();
    let timeslots = make_timeslots(5, 6);
    let early_slots = slots_for_periods(&timeslots, 5, &[0, 1, 2, 3]);
    let all_slots = timeslots.clone();

    // 8 Klassenlehrer
    let kl_names = [
        "Frau Müller", "Frau Schmidt", "Herr Weber", "Frau Fischer",
        "Frau Bauer", "Herr Hoffmann", "Frau Wagner", "Herr Koch",
    ];
    let mut teachers: Vec<Teacher> = Vec::new();
    for (i, name) in kl_names.iter().enumerate() {
        let preferred = if i < 4 { early_slots.clone() } else { vec![] };
        // Some teachers blocked on specific mornings
        let mut avail = all_slots.clone();
        if i == 2 {
            // Herr Weber unavailable Monday period 0
            avail.retain(|ts| !(ts.day == 0 && ts.period == 0));
        }
        if i == 5 {
            // Herr Hoffmann unavailable Friday afternoon
            avail.retain(|ts| !(ts.day == 4 && ts.period >= 4));
        }
        teachers.push(make_klassenlehrer(name, &subj, avail, preferred, 28));
    }

    // 3 Fachlehrer
    let sport_teacher = Teacher {
        id: Uuid::new_v4(),
        name: "Herr Becker".into(),
        max_hours_per_week: 22,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![subj.sport],
        preferred_slots: vec![],
    };
    let musik_teacher = Teacher {
        id: Uuid::new_v4(),
        name: "Frau Richter".into(),
        max_hours_per_week: 14,
        is_part_time: true,
        // Available Mon-Wed only
        available_slots: slots_for_periods(&timeslots, 3, &[0, 1, 2, 3, 4, 5]),
        qualified_subjects: vec![subj.musik],
        preferred_slots: vec![],
    };
    let religion_englisch = Teacher {
        id: Uuid::new_v4(),
        name: "Frau Klein".into(),
        max_hours_per_week: 18,
        is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![subj.religion, subj.englisch],
        preferred_slots: vec![],
    };
    let sport_id = sport_teacher.id;
    let musik_id = musik_teacher.id;
    let rel_eng_id = religion_englisch.id;
    teachers.push(sport_teacher);
    teachers.push(musik_teacher);
    teachers.push(religion_englisch);

    // 8 classes: 1a,1b, 2a,2b, 3a,3b, 4a,4b
    let grades = [1, 1, 2, 2, 3, 3, 4, 4];
    let class_names = ["1a", "1b", "2a", "2b", "3a", "3b", "4a", "4b"];
    let student_counts = [22, 24, 23, 25, 24, 22, 25, 23];

    let mut classes = Vec::new();
    for i in 0..8 {
        let avail = if grades[i] <= 2 {
            early_slots.clone()
        } else {
            slots_for_periods(&timeslots, 5, &[0, 1, 2, 3, 4])
        };
        classes.push(SchoolClass {
            id: Uuid::new_v4(),
            name: class_names[i].into(),
            grade_level: grades[i],
            student_count: Some(student_counts[i]),
            class_teacher_id: Some(teachers[i].id),
            available_slots: avail,
            grade: Some(grades[i]),
        });
    }

    let rooms: Vec<Room> = (0..8)
        .map(|i| Room {
            id: Uuid::new_v4(),
            name: format!("Raum {}", class_names[i]),
            capacity: Some(30),
            suitable_subjects: vec![],
        })
        .chain(std::iter::once(Room {
            id: Uuid::new_v4(),
            name: "Sporthalle".into(),
            capacity: Some(30),
            suitable_subjects: vec![subj.sport],
        }))
        .collect();

    let mut requirements = Vec::new();
    for (i, class) in classes.iter().enumerate() {
        let kl_id = teachers[i].id;
        let grade = grades[i];

        let deutsch_h: u32 = if grade == 2 { 7 } else { 6 };
        let su_h: u32 = if grade >= 3 { 4 } else { 2 };
        requirements.extend([
            LessonRequirement { class_id: class.id, subject_id: subj.deutsch, teacher_id: Some(kl_id), hours_per_week: deutsch_h },
            LessonRequirement { class_id: class.id, subject_id: subj.mathe, teacher_id: Some(kl_id), hours_per_week: 5 },
            LessonRequirement { class_id: class.id, subject_id: subj.sachunterricht, teacher_id: Some(kl_id), hours_per_week: su_h },
            LessonRequirement { class_id: class.id, subject_id: subj.kunst, teacher_id: Some(kl_id), hours_per_week: 2 },
        ]);

        let musik_h: u32 = if grade >= 3 { 2 } else { 1 };
        requirements.extend([
            LessonRequirement { class_id: class.id, subject_id: subj.sport, teacher_id: Some(sport_id), hours_per_week: 3 },
            LessonRequirement { class_id: class.id, subject_id: subj.musik, teacher_id: Some(musik_id), hours_per_week: musik_h },
            LessonRequirement { class_id: class.id, subject_id: subj.religion, teacher_id: Some(rel_eng_id), hours_per_week: 2 },
        ]);

        if grade >= 3 {
            requirements.push(LessonRequirement {
                class_id: class.id, subject_id: subj.englisch,
                teacher_id: Some(rel_eng_id), hours_per_week: 2,
            });
        }
    }

    ScheduleInput {
        teachers,
        classes,
        rooms,
        subjects,
        timeslots,
        requirements,
        stundentafeln: vec![],
    }
}

/// Stress instance: 4-Züge Grundschule (16 classes, ~380 lessons)
/// Sporthalle is over-subscribed (48 Sport lessons, 30 slots) — infeasibility expected.
pub fn stress_16_classes() -> ScheduleInput {
    let (subjects, subj) = make_subjects();
    let timeslots = make_timeslots(5, 6);
    let early_slots = slots_for_periods(&timeslots, 5, &[0, 1, 2, 3]);
    let all_slots = timeslots.clone();

    // 16 Klassenlehrer
    let kl_names = [
        "Frau Müller", "Frau Schmidt", "Herr Weber", "Frau Fischer",
        "Frau Bauer", "Herr Hoffmann", "Frau Wagner", "Herr Koch",
        "Frau Schäfer", "Herr Wolf", "Frau Braun", "Frau Zimmermann",
        "Herr Krüger", "Frau Lange", "Herr Hartmann", "Frau Werner",
    ];
    let mut teachers: Vec<Teacher> = Vec::new();
    for (i, name) in kl_names.iter().enumerate() {
        let preferred = if i < 8 { early_slots.clone() } else { vec![] };
        let mut avail = all_slots.clone();
        // A few teachers with reduced availability
        if i % 5 == 2 {
            avail.retain(|ts| !(ts.day == 0 && ts.period == 0));
        }
        if i % 7 == 3 {
            avail.retain(|ts| !(ts.day == 4 && ts.period >= 4));
        }
        teachers.push(make_klassenlehrer(name, &subj, avail, preferred, 28));
    }

    // 5 Fachlehrer
    let sport1 = Teacher {
        id: Uuid::new_v4(), name: "Herr Becker".into(),
        max_hours_per_week: 28, is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![subj.sport], preferred_slots: vec![],
    };
    let sport2 = Teacher {
        id: Uuid::new_v4(), name: "Frau Schulz".into(),
        max_hours_per_week: 22, is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![subj.sport], preferred_slots: vec![],
    };
    let musik_teacher = Teacher {
        id: Uuid::new_v4(), name: "Frau Richter".into(),
        max_hours_per_week: 22, is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![subj.musik], preferred_slots: vec![],
    };
    let rel_eng1 = Teacher {
        id: Uuid::new_v4(), name: "Frau Klein".into(),
        max_hours_per_week: 22, is_part_time: false,
        available_slots: all_slots.clone(),
        qualified_subjects: vec![subj.religion, subj.englisch], preferred_slots: vec![],
    };
    let rel_eng2 = Teacher {
        id: Uuid::new_v4(), name: "Herr Meyer".into(),
        max_hours_per_week: 14, is_part_time: true,
        available_slots: slots_for_periods(&timeslots, 4, &[0, 1, 2, 3, 4, 5]),
        qualified_subjects: vec![subj.religion, subj.englisch], preferred_slots: vec![],
    };

    let sport1_id = sport1.id;
    let sport2_id = sport2.id;
    let musik_id = musik_teacher.id;
    let rel1_id = rel_eng1.id;
    let rel2_id = rel_eng2.id;
    teachers.extend([sport1, sport2, musik_teacher, rel_eng1, rel_eng2]);

    // 16 classes
    let grades = [1,1,1,1, 2,2,2,2, 3,3,3,3, 4,4,4,4];
    let mut classes = Vec::new();
    for i in 0..16 {
        let grade = grades[i];
        let suffix = ['a', 'b', 'c', 'd'][i % 4];
        let name = format!("{}{}", grade, suffix);
        let avail = if grade <= 2 {
            early_slots.clone()
        } else {
            slots_for_periods(&timeslots, 5, &[0, 1, 2, 3, 4])
        };
        classes.push(SchoolClass {
            id: Uuid::new_v4(),
            name,
            grade_level: grade,
            student_count: Some(24),
            class_teacher_id: Some(teachers[i].id),
            available_slots: avail,
            grade: Some(grade),
        });
    }

    let rooms: Vec<Room> = (0..16)
        .map(|i| Room {
            id: Uuid::new_v4(),
            name: format!("Raum {}", classes[i].name),
            capacity: Some(30),
            suitable_subjects: vec![],
        })
        .chain(std::iter::once(Room {
            id: Uuid::new_v4(),
            name: "Sporthalle".into(),
            capacity: Some(30),
            suitable_subjects: vec![subj.sport],
        }))
        .collect();

    let mut requirements = Vec::new();
    for (i, class) in classes.iter().enumerate() {
        let kl_id = teachers[i].id;
        let grade = grades[i];

        let deutsch_h: u32 = if grade == 2 { 7 } else { 6 };
        let su_h: u32 = if grade >= 3 { 4 } else { 2 };
        requirements.extend([
            LessonRequirement { class_id: class.id, subject_id: subj.deutsch, teacher_id: Some(kl_id), hours_per_week: deutsch_h },
            LessonRequirement { class_id: class.id, subject_id: subj.mathe, teacher_id: Some(kl_id), hours_per_week: 5 },
            LessonRequirement { class_id: class.id, subject_id: subj.sachunterricht, teacher_id: Some(kl_id), hours_per_week: su_h },
            LessonRequirement { class_id: class.id, subject_id: subj.kunst, teacher_id: Some(kl_id), hours_per_week: 2 },
        ]);

        // Alternate sport teachers to spread load
        let sport_tid = if i % 2 == 0 { sport1_id } else { sport2_id };
        let musik_h: u32 = if grade >= 3 { 2 } else { 1 };
        // Alternate religion/englisch teachers
        let rel_tid = if i % 2 == 0 { rel1_id } else { rel2_id };
        requirements.extend([
            LessonRequirement { class_id: class.id, subject_id: subj.sport, teacher_id: Some(sport_tid), hours_per_week: 3 },
            LessonRequirement { class_id: class.id, subject_id: subj.musik, teacher_id: Some(musik_id), hours_per_week: musik_h },
            LessonRequirement { class_id: class.id, subject_id: subj.religion, teacher_id: Some(rel_tid), hours_per_week: 2 },
        ]);

        if grade >= 3 {
            requirements.push(LessonRequirement {
                class_id: class.id, subject_id: subj.englisch,
                teacher_id: Some(rel_tid), hours_per_week: 2,
            });
        }
    }

    ScheduleInput {
        teachers,
        classes,
        rooms,
        subjects,
        timeslots,
        requirements,
        stundentafeln: vec![],
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/pascal/Code/Klassenzeit && cargo check -p klassenzeit-scheduler`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add scheduler/src/instances.rs scheduler/src/lib.rs
git commit -m "feat(scheduler): add Hessen Grundschule test instance builders"
```

---

### Task 6: Add integration tests for instances

**Files:**
- Create: `scheduler/tests/instances.rs`

- [ ] **Step 1: Create instance integration tests**

```rust
use klassenzeit_scheduler::instances;
use klassenzeit_scheduler::local_search::LahcConfig;
use klassenzeit_scheduler::solve_with_config;

fn config_with_seed(seed: u64) -> LahcConfig {
    LahcConfig {
        max_seconds: 15,
        max_idle_ms: 10_000,
        seed: Some(seed),
        ..Default::default()
    }
}

#[test]
fn small_instance_is_feasible() {
    let input = instances::small_4_classes();
    let output = solve_with_config(input, config_with_seed(42));
    assert_eq!(
        output.score.hard_violations, 0,
        "small instance should be feasible, got {} hard violations. Violations: {:?}",
        output.score.hard_violations, output.violations
    );
}

#[test]
fn realistic_instance_is_feasible() {
    let input = instances::realistic_8_classes();
    let output = solve_with_config(input, config_with_seed(42));
    assert_eq!(
        output.score.hard_violations, 0,
        "realistic instance should be feasible, got {} hard violations. Violations: {:?}",
        output.score.hard_violations, output.violations
    );
}

#[test]
fn stress_instance_produces_output() {
    let input = instances::stress_16_classes();
    let output = solve_with_config(input, config_with_seed(42));
    // No feasibility assertion — stress instance may legitimately be infeasible
    // Just verify it produces a result without panicking
    assert!(!output.timetable.is_empty(), "stress instance should produce some timetable entries");
    let stats = output.stats.unwrap();
    assert!(stats.iterations > 0, "solver should run some iterations");
}

#[test]
fn small_instance_lesson_count() {
    // 1a(Kl.1): 21h, 2a(Kl.2): 22h, 3a(Kl.3): 26h, 4a(Kl.4): 26h = 95
    let input = instances::small_4_classes();
    let total_hours: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
    assert_eq!(total_hours, 95, "small instance should have 95 total lesson hours");
}

#[test]
fn realistic_instance_lesson_count() {
    // 8 classes: 2*(21+22+26+26) = 190
    let input = instances::realistic_8_classes();
    let total_hours: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
    assert_eq!(total_hours, 190, "realistic instance should have 190 total lesson hours");
}

#[test]
fn stress_instance_lesson_count() {
    // 16 classes: 4*(21+22+26+26) = 380
    let input = instances::stress_16_classes();
    let total_hours: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
    assert_eq!(total_hours, 380, "stress instance should have 380 total lesson hours");
}
```

- [ ] **Step 2: Run to verify lesson counts pass (or fix instance builders if counts are off)**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test instances -- lesson_count`
Expected: PASS (or fix builder if counts don't match)

- [ ] **Step 3: Run feasibility tests**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler --test instances -- --nocapture`
Expected: Small and realistic should pass. Stress may or may not — that's diagnostic data, not a bug.

- [ ] **Step 4: Commit**

```bash
git add scheduler/tests/instances.rs
git commit -m "test(scheduler): add integration tests for Grundschule instances"
```

---

### Task 7: Add diagnostic benchmark binary

**Files:**
- Create: `scheduler/src/bin/benchmark.rs`
- Modify: `scheduler/Cargo.toml`

- [ ] **Step 1: Add `clap` dependency to `Cargo.toml`**

Add under `[dependencies]`:

```toml
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Create `scheduler/src/bin/benchmark.rs`**

```rust
use std::time::Instant;

use clap::Parser;
use klassenzeit_scheduler::instances;
use klassenzeit_scheduler::local_search::LahcConfig;
use klassenzeit_scheduler::solve_with_config;
use klassenzeit_scheduler::types::ScheduleInput;

#[derive(Parser)]
#[command(name = "benchmark", about = "Solver benchmark tool")]
struct Args {
    /// Number of seeds to run per instance
    #[arg(long, default_value = "10")]
    seeds: u64,

    /// Max seconds per solve
    #[arg(long, default_value = "30")]
    max_seconds: u64,

    /// Output JSON to stdout
    #[arg(long)]
    json: bool,
}

struct InstanceDef {
    name: &'static str,
    input: ScheduleInput,
}

#[derive(serde::Serialize)]
struct RunResult {
    seed: u64,
    hard: i64,
    soft: f64,
    feasible: bool,
    construction_ms: u64,
    local_search_ms: u64,
    iterations: u64,
    iterations_per_sec: f64,
    best_found_at_iteration: u64,
    score_history: Vec<(u64, i64, i64)>,
}

#[derive(serde::Serialize)]
struct InstanceResult {
    name: String,
    seeds: u64,
    feasible_count: u64,
    hard_avg: f64,
    soft_avg: f64,
    soft_best: f64,
    soft_worst: f64,
    time_to_best_avg_ms: f64,
    iterations_per_sec_avg: f64,
    runs: Vec<RunResult>,
}

fn main() {
    let args = Args::parse();

    let instances = vec![
        InstanceDef { name: "small-4cls", input: instances::small_4_classes() },
        InstanceDef { name: "realistic-8cls", input: instances::realistic_8_classes() },
        InstanceDef { name: "stress-16cls", input: instances::stress_16_classes() },
    ];

    let mut all_results = Vec::new();

    for instance in &instances {
        if !args.json {
            eprint!("Running {}...", instance.name);
        }

        let mut runs = Vec::new();

        for seed in 0..args.seeds {
            let config = LahcConfig {
                max_seconds: args.max_seconds,
                max_idle_ms: args.max_seconds * 1000, // no idle timeout for benchmarks
                seed: Some(seed),
                history_sample_interval: 100,
                ..Default::default()
            };

            let start = Instant::now();
            let output = solve_with_config(instance.input.clone(), config);
            let _total_ms = start.elapsed().as_millis() as u64;

            let stats = output.stats.unwrap_or_default();
            let hard = -(output.score.hard_violations as i64);
            let soft = output.score.soft_score;

            // Estimate time-to-best from score_history
            let best_iter = stats.best_found_at_iteration;
            let time_to_best_ms = if stats.iterations_per_sec > 0.0 {
                (best_iter as f64 / stats.iterations_per_sec) * 1000.0
            } else {
                0.0
            };

            runs.push(RunResult {
                seed,
                hard,
                soft,
                feasible: output.score.hard_violations == 0,
                construction_ms: stats.construction_ms,
                local_search_ms: stats.local_search_ms,
                iterations: stats.iterations,
                iterations_per_sec: stats.iterations_per_sec,
                best_found_at_iteration: best_iter,
                score_history: stats.score_history,
            });

            if !args.json {
                eprint!(".");
            }
        }

        let feasible_count = runs.iter().filter(|r| r.feasible).count() as u64;
        let hard_avg = runs.iter().map(|r| r.hard as f64).sum::<f64>() / runs.len() as f64;
        let soft_avg = runs.iter().map(|r| r.soft).sum::<f64>() / runs.len() as f64;
        let soft_best = runs.iter().map(|r| r.soft).fold(f64::NEG_INFINITY, f64::max);
        let soft_worst = runs.iter().map(|r| r.soft).fold(f64::INFINITY, f64::min);
        let time_to_best_avg_ms = {
            let times: Vec<f64> = runs.iter().map(|r| {
                if r.iterations_per_sec > 0.0 {
                    (r.best_found_at_iteration as f64 / r.iterations_per_sec) * 1000.0
                } else {
                    0.0
                }
            }).collect();
            times.iter().sum::<f64>() / times.len() as f64
        };
        let iterations_per_sec_avg = runs.iter().map(|r| r.iterations_per_sec).sum::<f64>() / runs.len() as f64;

        if !args.json {
            eprintln!(" done");
        }

        all_results.push(InstanceResult {
            name: instance.name.to_string(),
            seeds: args.seeds,
            feasible_count,
            hard_avg,
            soft_avg,
            soft_best,
            soft_worst,
            time_to_best_avg_ms,
            iterations_per_sec_avg,
            runs,
        });
    }

    if args.json {
        println!("{}", serde_json::to_string_pretty(&all_results).unwrap());
    } else {
        // Print summary table to stderr
        eprintln!();
        eprintln!(
            "{:<20} {:>5} {:>10} {:>10} {:>10} {:>10} {:>12} {:>12}",
            "Instance", "Seeds", "Feasible", "Hard(avg)", "Soft(avg)", "Soft(best)", "Soft(worst)", "TTB(avg)"
        );
        eprintln!("{}", "-".repeat(99));
        for r in &all_results {
            eprintln!(
                "{:<20} {:>5} {:>7}/{:<2} {:>10.1} {:>10.1} {:>10.1} {:>10.1} {:>10.0}ms",
                r.name, r.seeds, r.feasible_count, r.seeds,
                r.hard_avg, r.soft_avg, r.soft_best, r.soft_worst,
                r.time_to_best_avg_ms,
            );
        }
        eprintln!();
        for r in &all_results {
            eprintln!(
                "{}: {:.0} iterations/sec avg",
                r.name, r.iterations_per_sec_avg
            );
        }
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/pascal/Code/Klassenzeit && cargo build -p klassenzeit-scheduler --bin benchmark`
Expected: Compiles

- [ ] **Step 4: Quick smoke test**

Run: `cd /home/pascal/Code/Klassenzeit && cargo run -p klassenzeit-scheduler --bin benchmark -- --seeds 1 --max-seconds 5`
Expected: Prints table with results for all three instances

- [ ] **Step 5: Test JSON output**

Run: `cd /home/pascal/Code/Klassenzeit && cargo run -p klassenzeit-scheduler --bin benchmark -- --seeds 1 --max-seconds 5 --json | head -20`
Expected: Valid JSON output

- [ ] **Step 6: Commit**

```bash
git add scheduler/src/bin/benchmark.rs scheduler/Cargo.toml
git commit -m "feat(scheduler): add diagnostic benchmark binary"
```

---

### Task 8: Extend criterion benchmarks

**Files:**
- Modify: `scheduler/benches/solver_bench.rs`

- [ ] **Step 1: Replace synthetic instances with realistic ones in criterion**

Replace the entire content of `scheduler/benches/solver_bench.rs`:

```rust
use criterion::{criterion_group, criterion_main, Criterion};
use klassenzeit_scheduler::constraints::IncrementalState;
use klassenzeit_scheduler::construction::construct_with_state;
use klassenzeit_scheduler::instances;
use klassenzeit_scheduler::local_search::{self, LahcConfig};
use klassenzeit_scheduler::mapper;

fn bench_construct_small(c: &mut Criterion) {
    let input = instances::small_4_classes();
    let (solution, _) = mapper::to_planning(&input);
    c.bench_function("construct_small_4cls", |b| {
        b.iter(|| {
            let mut lessons = solution.lessons.clone();
            let mut state = IncrementalState::new(&solution.facts);
            construct_with_state(&mut lessons, &solution.facts, &mut state);
        })
    });
}

fn bench_construct_realistic(c: &mut Criterion) {
    let input = instances::realistic_8_classes();
    let (solution, _) = mapper::to_planning(&input);
    c.bench_function("construct_realistic_8cls", |b| {
        b.iter(|| {
            let mut lessons = solution.lessons.clone();
            let mut state = IncrementalState::new(&solution.facts);
            construct_with_state(&mut lessons, &solution.facts, &mut state);
        })
    });
}

fn bench_construct_stress(c: &mut Criterion) {
    let input = instances::stress_16_classes();
    let (solution, _) = mapper::to_planning(&input);
    c.bench_function("construct_stress_16cls", |b| {
        b.iter(|| {
            let mut lessons = solution.lessons.clone();
            let mut state = IncrementalState::new(&solution.facts);
            construct_with_state(&mut lessons, &solution.facts, &mut state);
        })
    });
}

fn bench_solve_small(c: &mut Criterion) {
    let input = instances::small_4_classes();
    let config = LahcConfig {
        max_seconds: 10,
        max_idle_ms: 5_000,
        seed: Some(42),
        ..Default::default()
    };
    let (base_solution, _) = mapper::to_planning(&input);

    c.bench_function("solve_small_4cls_10s", |b| {
        b.iter(|| {
            let mut lessons = base_solution.lessons.clone();
            let mut state = IncrementalState::new(&base_solution.facts);
            construct_with_state(&mut lessons, &base_solution.facts, &mut state);
            local_search::optimize(&mut lessons, &base_solution.facts, &mut state, &config);
        })
    });
}

fn bench_solve_realistic(c: &mut Criterion) {
    let input = instances::realistic_8_classes();
    let config = LahcConfig {
        max_seconds: 10,
        max_idle_ms: 5_000,
        seed: Some(42),
        ..Default::default()
    };
    let (base_solution, _) = mapper::to_planning(&input);

    c.bench_function("solve_realistic_8cls_10s", |b| {
        b.iter(|| {
            let mut lessons = base_solution.lessons.clone();
            let mut state = IncrementalState::new(&base_solution.facts);
            construct_with_state(&mut lessons, &base_solution.facts, &mut state);
            local_search::optimize(&mut lessons, &base_solution.facts, &mut state, &config);
        })
    });
}

fn bench_evaluate_assign(c: &mut Criterion) {
    let input = instances::realistic_8_classes();
    let (mut solution, _) = mapper::to_planning(&input);
    let mut state = IncrementalState::new(&solution.facts);

    // Assign most lessons to create realistic state
    for i in 0..solution.lessons.len().saturating_sub(1) {
        let slot = i % solution.facts.timeslots.len();
        state.assign(&mut solution.lessons[i], slot, None, &solution.facts);
    }
    let last = &solution.lessons[solution.lessons.len() - 1];

    c.bench_function("evaluate_assign_delta_realistic", |b| {
        b.iter(|| {
            state.evaluate_assign(last, 5, None, &solution.facts);
        })
    });
}

criterion_group!(
    benches,
    bench_construct_small,
    bench_construct_realistic,
    bench_construct_stress,
    bench_solve_small,
    bench_solve_realistic,
    bench_evaluate_assign,
);
criterion_main!(benches);
```

- [ ] **Step 2: Verify benchmarks compile**

Run: `cd /home/pascal/Code/Klassenzeit && cargo bench --no-run -p klassenzeit-scheduler`
Expected: Compiles

- [ ] **Step 3: Commit**

```bash
git add scheduler/benches/solver_bench.rs
git commit -m "refactor(scheduler): replace synthetic benchmarks with realistic Grundschule instances"
```

---

### Task 9: Run full benchmark and record results

- [ ] **Step 1: Run all tests**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-scheduler`
Expected: All pass

- [ ] **Step 2: Run diagnostic benchmark**

Run: `cd /home/pascal/Code/Klassenzeit && cargo run --release -p klassenzeit-scheduler --bin benchmark -- --seeds 10 --max-seconds 30`
Expected: Prints summary table. Record the results.

- [ ] **Step 3: Run JSON benchmark and save**

Run: `cd /home/pascal/Code/Klassenzeit && cargo run --release -p klassenzeit-scheduler --bin benchmark -- --seeds 5 --max-seconds 30 --json > /tmp/benchmark-results.json`

- [ ] **Step 4: Check if follow-up tuning item exists in next-steps.md**

Read `docs/superpowers/next-steps.md` and verify item 1d mentions the follow-up for Tabu/parameter tuning based on benchmark results. If the existing description is sufficient, no change needed. If it needs a new sub-item, add:

```markdown
| 1d-follow | **Solver tuning based on benchmarks** | idea | 1d | S-M |
| | Based on benchmark results: add Tabu (tenure ~7-10) if soft scores plateau. Ruin-and-recreate if feasibility fails on large instances. Parameter sweep for LAHC list_length. | | | |
```

- [ ] **Step 5: Final commit with any doc updates**

```bash
git add -A
git commit -m "docs: update next-steps with solver tuning follow-up"
```
