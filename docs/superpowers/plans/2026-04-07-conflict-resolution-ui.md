# Conflict Resolution UI (2d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat string-list of solver violations with structured per-constraint diagnostics, surfaced in a grouped, click-to-highlight UI panel that deep-links into settings.

**Architecture:** Add a one-shot `diagnose()` pass in the scheduler that mirrors `full_evaluate` but emits structured `Violation { kind, severity, lesson_refs, resources, message }` items. Backend serializes them as DTOs; frontend renders a `<ViolationsPanel>` that groups by kind, click-selects a violation to highlight matching cells in the existing `<TimetableGrid>`, and offers per-kind "how to fix" deep links into the settings tabs.

**Tech Stack:** Rust (scheduler crate, Loco backend), Next.js + React + TypeScript + Tailwind + i18n, Vitest/RTL for frontend tests.

**Spec:** `docs/superpowers/specs/2026-04-07-conflict-resolution-ui-design.md`

---

## File map

**Scheduler crate (`scheduler/src/`):**
- `types.rs` — replace `Violation`, add `ViolationKind`, `Severity`, `LessonRef`, `ResourceRef`.
- `constraints.rs` — new `diagnose()` function + tests.
- `lib.rs` — call `diagnose()` after local search.
- `mapper.rs` — index→UUID resolution into the public `Violation` type.

**Backend (`backend/src/`, `backend/tests/`):**
- `services/scheduler.rs` — new `ViolationDto`, `LessonRefDto`, `ResourceRefDto`; update `SolveResult.violations` and `to_solve_result`.
- `tests/scheduler/*` — extend assertions, add infeasible-instance test asserting structured shape.

**Frontend (`frontend/src/`):**
- `lib/types.ts` — new `ViolationDto`, `Severity`, `ViolationKind`, `LessonRef`, `ResourceRef`; update `SolveResult.violations` typing.
- `components/timetable/violations-panel.tsx` — new.
- `components/timetable/timetable-grid.tsx` — `highlightedCells`, `highlightTone` props.
- `app/[locale]/schools/[id]/schedule/page.tsx` — state lift, replace inline list.
- `app/[locale]/schools/[id]/settings/components/{teachers,rooms,subjects}-tab.tsx` — read `?focus=<id>` query and scroll/highlight.
- `messages/{de,en}.json` — i18n keys.
- `__tests__/violations-panel.test.tsx` — new.
- `__tests__/schedule-page.test.tsx` — extend.

**Docs:**
- `docs/STATUS.md`, `docs/superpowers/next-steps.md` — mark 2d done after merge.

---

## Task 1: Scheduler — new violation types

**Files:**
- Modify: `scheduler/src/types.rs`

- [ ] **Step 1: Replace `Violation` and add new types**

In `scheduler/src/types.rs`, replace the existing `Violation` struct with the following block (keep the rest of the file intact):

```rust
use smallvec::SmallVec;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Hard,
    Soft,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ViolationKind {
    // Hard / softenable
    TeacherConflict,
    ClassConflict,
    RoomCapacity,
    TeacherUnavailable,
    ClassUnavailable,
    TeacherOverCapacity,
    TeacherUnqualified,
    RoomUnsuitable,
    RoomTooSmall,
    UnplacedLesson,
    NoQualifiedTeacher,
    // Soft
    TeacherGap,
    SubjectClustered,
    NotPreferredSlot,
    ClassTeacherFirstPeriod,
}

impl ViolationKind {
    pub fn as_snake_case(self) -> &'static str {
        match self {
            ViolationKind::TeacherConflict => "teacher_conflict",
            ViolationKind::ClassConflict => "class_conflict",
            ViolationKind::RoomCapacity => "room_capacity",
            ViolationKind::TeacherUnavailable => "teacher_unavailable",
            ViolationKind::ClassUnavailable => "class_unavailable",
            ViolationKind::TeacherOverCapacity => "teacher_over_capacity",
            ViolationKind::TeacherUnqualified => "teacher_unqualified",
            ViolationKind::RoomUnsuitable => "room_unsuitable",
            ViolationKind::RoomTooSmall => "room_too_small",
            ViolationKind::UnplacedLesson => "unplaced_lesson",
            ViolationKind::NoQualifiedTeacher => "no_qualified_teacher",
            ViolationKind::TeacherGap => "teacher_gap",
            ViolationKind::SubjectClustered => "subject_clustered",
            ViolationKind::NotPreferredSlot => "not_preferred_slot",
            ViolationKind::ClassTeacherFirstPeriod => "class_teacher_first_period",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LessonRef {
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot_id: Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResourceRef {
    Teacher(Uuid),
    Class(Uuid),
    Room(Uuid),
    Subject(Uuid),
    Timeslot(Uuid),
}

#[derive(Debug, Clone)]
pub struct Violation {
    pub kind: ViolationKind,
    pub severity: Severity,
    pub message: String,
    pub lesson_refs: SmallVec<[LessonRef; 4]>,
    pub resources: SmallVec<[ResourceRef; 4]>,
}
```

Also add `smallvec` to `[dependencies]` in `scheduler/Cargo.toml` if it isn't already there (it is — it's used in `constraints.rs`). Remove the `use smallvec::SmallVec;` line from the top if `Uuid` import already exists; make sure both imports are present at the top of the file.

- [ ] **Step 2: Build & verify nothing else compiles yet**

Run: `cargo check -p klassenzeit-scheduler`
Expected: Errors in `lib.rs`, `mapper.rs`, `constraints.rs` referencing the old `Violation { description: String }` shape. This is fine — the next tasks fix them.

- [ ] **Step 3: Commit**

```bash
git add scheduler/src/types.rs
git commit -m "scheduler: introduce structured Violation type"
```

---

## Task 2: Scheduler — pre-validation & unplaced lessons emit structured violations

**Files:**
- Modify: `scheduler/src/lib.rs`
- Modify: `scheduler/src/mapper.rs`

- [ ] **Step 1: Update `pre_validate` in `lib.rs` to emit `NoQualifiedTeacher`**

Replace the body of `pre_validate` with:

```rust
fn pre_validate(input: &ScheduleInput, violations: &mut Vec<types::Violation>) -> ScheduleInput {
    use smallvec::smallvec;
    use types::{ResourceRef, Severity, Violation, ViolationKind};

    let mut valid_requirements = Vec::new();

    for req in &input.requirements {
        let has_teacher = if let Some(tid) = req.teacher_id {
            input.teachers.iter().any(|t| t.id == tid)
        } else {
            input
                .teachers
                .iter()
                .any(|t| t.qualified_subjects.contains(&req.subject_id))
        };

        if has_teacher {
            valid_requirements.push(req.clone());
        } else {
            for _ in 0..req.hours_per_week {
                violations.push(Violation {
                    kind: ViolationKind::NoQualifiedTeacher,
                    severity: Severity::Hard,
                    message: format!(
                        "No qualified teacher for subject {} in class {}",
                        req.subject_id, req.class_id
                    ),
                    lesson_refs: smallvec![],
                    resources: smallvec![
                        ResourceRef::Class(req.class_id),
                        ResourceRef::Subject(req.subject_id),
                    ],
                });
            }
        }
    }

    ScheduleInput {
        teachers: input.teachers.clone(),
        classes: input.classes.clone(),
        rooms: input.rooms.clone(),
        subjects: input.subjects.clone(),
        timeslots: input.timeslots.clone(),
        requirements: valid_requirements,
        stundentafeln: input.stundentafeln.clone(),
        weights: input.weights.clone(),
    }
}
```

- [ ] **Step 2: Update `to_output` in `mapper.rs` to emit structured `UnplacedLesson` violations**

Replace the for-loop body in `to_output` (the block that builds `timetable` and `violations`) with:

```rust
use smallvec::smallvec;

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
        let class_id = maps.class_uuids[lesson.class_idx];
        let subject_id = maps.subject_uuids[lesson.subject_idx];
        let teacher_id = maps.teacher_uuids[lesson.teacher_idx];
        violations.push(Violation {
            kind: ViolationKind::UnplacedLesson,
            severity: Severity::Hard,
            message: format!(
                "Could not place lesson: subject {} for class {}",
                subject_id, class_id
            ),
            lesson_refs: smallvec![],
            resources: smallvec![
                ResourceRef::Class(class_id),
                ResourceRef::Subject(subject_id),
                ResourceRef::Teacher(teacher_id),
            ],
        });
    }
}
```

Add the imports at the top of `mapper.rs`:
```rust
use crate::types::{Severity, ViolationKind, ResourceRef};
```
(merge into the existing `use crate::types::*;` or add alongside).

- [ ] **Step 3: Build**

Run: `cargo check -p klassenzeit-scheduler`
Expected: Compiles cleanly (warnings are OK, but no errors). The mapper test that checks violations may still pass — it doesn't inspect the description.

- [ ] **Step 4: Run scheduler tests**

Run: `cargo test -p klassenzeit-scheduler`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/lib.rs scheduler/src/mapper.rs
git commit -m "scheduler: emit structured violations for pre-validate and unplaced lessons"
```

---

## Task 3: Scheduler — write the diagnose() failing tests first

**Files:**
- Modify: `scheduler/src/constraints.rs` (test module at the bottom)

- [ ] **Step 1: Identify the test module location**

Run: `grep -n '#\[cfg(test)\]' scheduler/src/constraints.rs`
Expected: One match. Tests will go inside that module.

- [ ] **Step 2: Add a helper at the top of the test module**

In `scheduler/src/constraints.rs`, inside the `#[cfg(test)] mod tests { ... }` block, add (near the top of the module):

```rust
use crate::types::{ViolationKind, Severity};

fn count_kind(violations: &[crate::types::DiagnosedViolation], k: ViolationKind) -> usize {
    violations.iter().filter(|v| v.kind == k).count()
}
```

(Note: `DiagnosedViolation` is the index-based intermediate type; we'll define it in Task 4. The code won't compile until then — that's intentional TDD-style.)

- [ ] **Step 3: Add one test per ViolationKind that diagnose() must report**

Append the following tests to the test module. They use the existing test helpers (`make_*`) when possible — search for them with `grep -n 'fn make_' scheduler/src/constraints.rs` first; if no helpers exist, build minimal `ProblemFacts` inline as the existing tests in this file already do.

```rust
#[test]
fn diagnose_reports_teacher_conflict() {
    // Two lessons sharing the same teacher_idx and timeslot.
    let facts = mini_facts(/* see existing constructor patterns */);
    let mut lessons = vec![
        PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: Some(0), room: None },
        PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 0, class_idx: 1, timeslot: Some(0), room: None },
    ];
    let violations = crate::constraints::diagnose(&lessons, &facts);
    assert_eq!(count_kind(&violations, ViolationKind::TeacherConflict), 1);
    let v = violations.iter().find(|v| v.kind == ViolationKind::TeacherConflict).unwrap();
    assert_eq!(v.severity, Severity::Hard);
    assert_eq!(v.lesson_refs.len(), 2);
}

#[test]
fn diagnose_reports_class_conflict() {
    // Two lessons sharing same class_idx and timeslot but different teachers.
    // ...same pattern as above...
}

#[test]
fn diagnose_reports_room_capacity() {
    // 3 lessons in a room with max_concurrent_at_slot = 2 in the same slot.
}

#[test]
fn diagnose_reports_teacher_unavailable() {
    // Teacher not available at slot, lesson assigned there. Default weights → Hard.
}

#[test]
fn diagnose_reports_class_unavailable() { /* analogous */ }

#[test]
fn diagnose_reports_teacher_over_capacity() {
    // Teacher max_hours = 1, two lessons assigned to that teacher.
}

#[test]
fn diagnose_reports_teacher_unqualified() { /* unqualified subject */ }

#[test]
fn diagnose_reports_room_unsuitable() { /* room.suitable_subjects[s] = false */ }

#[test]
fn diagnose_reports_room_too_small() { /* room.capacity < class.student_count */ }

#[test]
fn diagnose_reports_teacher_gap() {
    // Same teacher, day 0, periods 1 and 3 → 1 gap → Soft.
}

#[test]
fn diagnose_reports_subject_clustered() { /* 2 lessons same class+subject same day */ }

#[test]
fn diagnose_reports_not_preferred_slot() { /* lesson in a non-preferred slot */ }

#[test]
fn diagnose_reports_class_teacher_first_period() {
    // Class has class_teacher_idx=Some(0); first-period lesson assigned to teacher_idx=1.
}

#[test]
fn diagnose_softening_changes_severity() {
    // With soften_teacher_qualification = Some(1), the same instance produces a Soft TeacherUnqualified.
}

#[test]
fn diagnose_hard_count_matches_full_evaluate() {
    // Build a small instance; assert that
    // diagnose(lessons, facts).iter().filter(|v| v.severity == Severity::Hard).count() as i64
    //   == -full_evaluate(lessons, facts).hard
    // when all soften_* are None.
}
```

For each test, **fill in concrete construction code** modeled on the existing tests in this file (search for `ProblemFacts {` and copy the smallest example, then mutate). Each test must compile and assert the kind, severity, and at least one resource ref. Do not leave `// ...` placeholders — write the full body.

- [ ] **Step 4: Run tests to confirm they fail with "no function `diagnose`"**

Run: `cargo test -p klassenzeit-scheduler diagnose_`
Expected: Compile error referencing `diagnose` and `DiagnosedViolation` not found.

- [ ] **Step 5: Do not commit yet** — these are the failing tests that drive Task 4.

---

## Task 4: Scheduler — implement diagnose()

**Files:**
- Modify: `scheduler/src/types.rs` (add `DiagnosedViolation`)
- Modify: `scheduler/src/constraints.rs` (add `diagnose` function)

- [ ] **Step 1: Add `DiagnosedViolation` to `types.rs`**

Append after the `Violation` struct in `scheduler/src/types.rs`:

```rust
/// Index-based intermediate produced by `constraints::diagnose`. The mapper
/// translates these to public `Violation`s with UUIDs.
#[derive(Debug, Clone)]
pub struct DiagnosedViolation {
    pub kind: ViolationKind,
    pub severity: Severity,
    pub message: String,
    /// Indices into the `lessons` slice passed to `diagnose`.
    pub lesson_indices: smallvec::SmallVec<[usize; 4]>,
    /// Indices into the corresponding `ProblemFacts` vectors. The interpretation
    /// is determined by the variant.
    pub resources: smallvec::SmallVec<[DiagnosedResourceRef; 4]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosedResourceRef {
    Teacher(usize),
    Class(usize),
    Room(usize),
    Subject(usize),
    Timeslot(usize),
}
```

- [ ] **Step 2: Implement `diagnose()` in `constraints.rs`**

Add at the bottom of `constraints.rs` (above the `#[cfg(test)]` module). This function mirrors `full_evaluate` but emits structured items instead of summing score. Follow the same control flow exactly so the invariant test in Task 3 holds.

```rust
use crate::types::{DiagnosedResourceRef, DiagnosedViolation, Severity, ViolationKind};

#[inline]
fn severity_for(soften: Option<i64>) -> Severity {
    if soften.is_some() { Severity::Soft } else { Severity::Hard }
}

/// Walk every constraint defined in `full_evaluate` and emit a structured
/// item for each violation. The Hard count must equal `-full_evaluate(...).hard`
/// when no `soften_*` is set; covered by `diagnose_hard_count_matches_full_evaluate`.
pub fn diagnose(lessons: &[PlanningLesson], facts: &ProblemFacts) -> Vec<DiagnosedViolation> {
    use smallvec::smallvec;
    let mut out: Vec<DiagnosedViolation> = Vec::new();

    let assigned: Vec<(usize, &PlanningLesson)> = lessons
        .iter()
        .enumerate()
        .filter(|(_, l)| l.timeslot.is_some())
        .collect();

    // 1 & 2 — pairwise teacher/class conflicts
    for i in 0..assigned.len() {
        for j in (i + 1)..assigned.len() {
            let (ai, a) = assigned[i];
            let (bj, b) = assigned[j];
            if a.timeslot != b.timeslot {
                continue;
            }
            if a.teacher_idx == b.teacher_idx {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::TeacherConflict,
                    severity: Severity::Hard,
                    message: format!("Teacher double-booked at timeslot {}", a.timeslot.unwrap()),
                    lesson_indices: smallvec![ai, bj],
                    resources: smallvec![
                        DiagnosedResourceRef::Teacher(a.teacher_idx),
                        DiagnosedResourceRef::Timeslot(a.timeslot.unwrap()),
                    ],
                });
            }
            if a.class_idx == b.class_idx {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::ClassConflict,
                    severity: Severity::Hard,
                    message: format!("Class double-booked at timeslot {}", a.timeslot.unwrap()),
                    lesson_indices: smallvec![ai, bj],
                    resources: smallvec![
                        DiagnosedResourceRef::Class(a.class_idx),
                        DiagnosedResourceRef::Timeslot(a.timeslot.unwrap()),
                    ],
                });
            }
        }
    }

    // 3 — room over-capacity (count-based, mirrors full_evaluate)
    {
        let num_rooms = facts.rooms.len();
        let num_ts = facts.timeslots.len();
        let mut room_at_slot: Vec<Vec<smallvec::SmallVec<[usize; 4]>>> =
            vec![vec![smallvec::SmallVec::new(); num_ts]; num_rooms];
        for (idx, l) in &assigned {
            if let (Some(r), Some(ts)) = (l.room, l.timeslot) {
                room_at_slot[r][ts].push(*idx);
            }
        }
        for (room_idx, slots) in room_at_slot.iter().enumerate() {
            for (ts_idx, indices) in slots.iter().enumerate() {
                let cap = facts.rooms[room_idx].max_concurrent_at_slot[ts_idx] as usize;
                if indices.len() > cap {
                    let excess = indices.len() - cap;
                    for _ in 0..excess {
                        out.push(DiagnosedViolation {
                            kind: ViolationKind::RoomCapacity,
                            severity: Severity::Hard,
                            message: format!(
                                "Room over capacity at timeslot {} ({} > {})",
                                ts_idx,
                                indices.len(),
                                cap
                            ),
                            lesson_indices: indices.iter().copied().collect(),
                            resources: smallvec![
                                DiagnosedResourceRef::Room(room_idx),
                                DiagnosedResourceRef::Timeslot(ts_idx),
                            ],
                        });
                    }
                }
            }
        }
    }

    // Day computation (same as full_evaluate)
    let num_days = facts
        .timeslots
        .iter()
        .map(|t| t.day as usize + 1)
        .max()
        .unwrap_or(0);
    let mut first_period_per_day = vec![u8::MAX; num_days];
    for ts in &facts.timeslots {
        let d = ts.day as usize;
        if ts.period < first_period_per_day[d] {
            first_period_per_day[d] = ts.period;
        }
    }

    let num_teachers = facts.teachers.len();
    let num_classes = facts.classes.len();
    let num_subjects = facts.subjects.len();
    let mut teacher_hours: std::collections::HashMap<usize, u32> = std::collections::HashMap::new();
    let mut teacher_day_periods: Vec<Vec<Vec<(u8, usize)>>> =
        vec![vec![Vec::new(); num_days]; num_teachers];
    let mut class_subject_day: Vec<Vec<Vec<smallvec::SmallVec<[usize; 4]>>>> = (0..num_classes)
        .map(|_| (0..num_subjects).map(|_| vec![smallvec::SmallVec::new(); num_days]).collect())
        .collect();
    let mut class_day_first_period: Vec<Vec<(bool, bool, smallvec::SmallVec<[usize; 4]>)>> =
        vec![vec![(false, false, smallvec::SmallVec::new()); num_days]; num_classes];

    for (idx, l) in &assigned {
        let ts = l.timeslot.unwrap();
        let teacher = &facts.teachers[l.teacher_idx];
        let timeslot = &facts.timeslots[ts];
        let day = timeslot.day as usize;
        let period = timeslot.period;

        // 4
        if !teacher.available_slots[ts] {
            out.push(DiagnosedViolation {
                kind: ViolationKind::TeacherUnavailable,
                severity: severity_for(facts.weights.soften_teacher_availability),
                message: format!("Teacher unavailable at timeslot {}", ts),
                lesson_indices: smallvec![*idx],
                resources: smallvec![
                    DiagnosedResourceRef::Teacher(l.teacher_idx),
                    DiagnosedResourceRef::Timeslot(ts),
                ],
            });
        }
        // 9
        if !facts.classes[l.class_idx].available_slots[ts] {
            out.push(DiagnosedViolation {
                kind: ViolationKind::ClassUnavailable,
                severity: severity_for(facts.weights.soften_class_availability),
                message: format!("Class unavailable at timeslot {}", ts),
                lesson_indices: smallvec![*idx],
                resources: smallvec![
                    DiagnosedResourceRef::Class(l.class_idx),
                    DiagnosedResourceRef::Timeslot(ts),
                ],
            });
        }
        // 6
        if !teacher.qualified_subjects[l.subject_idx] {
            out.push(DiagnosedViolation {
                kind: ViolationKind::TeacherUnqualified,
                severity: severity_for(facts.weights.soften_teacher_qualification),
                message: format!(
                    "Teacher not qualified for subject {}",
                    l.subject_idx
                ),
                lesson_indices: smallvec![*idx],
                resources: smallvec![
                    DiagnosedResourceRef::Teacher(l.teacher_idx),
                    DiagnosedResourceRef::Subject(l.subject_idx),
                ],
            });
        }
        *teacher_hours.entry(l.teacher_idx).or_insert(0) += 1;

        if let Some(room_idx) = l.room {
            let room = &facts.rooms[room_idx];
            // 7
            if !room.suitable_subjects[l.subject_idx] {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::RoomUnsuitable,
                    severity: severity_for(facts.weights.soften_room_suitability),
                    message: format!(
                        "Room not suitable for subject {}",
                        l.subject_idx
                    ),
                    lesson_indices: smallvec![*idx],
                    resources: smallvec![
                        DiagnosedResourceRef::Room(room_idx),
                        DiagnosedResourceRef::Subject(l.subject_idx),
                    ],
                });
            }
            // 8
            if let (Some(cap), Some(count)) =
                (room.capacity, facts.classes[l.class_idx].student_count)
            {
                if cap < count {
                    out.push(DiagnosedViolation {
                        kind: ViolationKind::RoomTooSmall,
                        severity: severity_for(facts.weights.soften_room_capacity),
                        message: format!("Room too small ({} < {})", cap, count),
                        lesson_indices: smallvec![*idx],
                        resources: smallvec![
                            DiagnosedResourceRef::Room(room_idx),
                            DiagnosedResourceRef::Class(l.class_idx),
                        ],
                    });
                }
            }
        }

        // Soft tracking
        teacher_day_periods[l.teacher_idx][day].push((period, *idx));
        class_subject_day[l.class_idx][l.subject_idx][day].push(*idx);

        if !teacher.preferred_slots[ts] {
            // Always soft
            out.push(DiagnosedViolation {
                kind: ViolationKind::NotPreferredSlot,
                severity: Severity::Soft,
                message: format!("Lesson in non-preferred slot for teacher"),
                lesson_indices: smallvec![*idx],
                resources: smallvec![
                    DiagnosedResourceRef::Teacher(l.teacher_idx),
                    DiagnosedResourceRef::Timeslot(ts),
                ],
            });
        }

        if period == first_period_per_day[day] {
            let class_teacher = facts.classes[l.class_idx].class_teacher_idx;
            let entry = &mut class_day_first_period[l.class_idx][day];
            entry.1 = true;
            entry.2.push(*idx);
            if class_teacher == Some(l.teacher_idx) {
                entry.0 = true;
            }
        }
    }

    // 5 — teacher over-capacity
    for (&teacher_idx, &hours) in &teacher_hours {
        let max = facts.teachers[teacher_idx].max_hours;
        if hours > max {
            let excess = hours - max;
            for _ in 0..excess {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::TeacherOverCapacity,
                    severity: severity_for(facts.weights.soften_teacher_max_hours),
                    message: format!(
                        "Teacher {} over capacity ({} > {})",
                        teacher_idx, hours, max
                    ),
                    lesson_indices: smallvec![],
                    resources: smallvec![DiagnosedResourceRef::Teacher(teacher_idx)],
                });
            }
        }
    }

    // Soft: teacher gaps — emit one violation per (teacher, day) with gaps>0
    for (t_idx, days) in teacher_day_periods.iter().enumerate() {
        for (d_idx, periods) in days.iter().enumerate() {
            if periods.len() < 2 {
                continue;
            }
            let min_p = periods.iter().map(|(p, _)| *p).min().unwrap() as i64;
            let max_p = periods.iter().map(|(p, _)| *p).max().unwrap() as i64;
            let span = max_p - min_p;
            let gaps = span - (periods.len() as i64 - 1);
            if gaps > 0 {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::TeacherGap,
                    severity: Severity::Soft,
                    message: format!(
                        "Teacher {} has {} idle period(s) on day {}",
                        t_idx, gaps, d_idx
                    ),
                    lesson_indices: periods.iter().map(|(_, i)| *i).collect(),
                    resources: smallvec![DiagnosedResourceRef::Teacher(t_idx)],
                });
            }
        }
    }

    // Soft: subject clustering — emit one per (class, subject, day) with count>1
    for (c_idx, subjects) in class_subject_day.iter().enumerate() {
        for (s_idx, days) in subjects.iter().enumerate() {
            for (d_idx, idxs) in days.iter().enumerate() {
                if idxs.len() > 1 {
                    out.push(DiagnosedViolation {
                        kind: ViolationKind::SubjectClustered,
                        severity: Severity::Soft,
                        message: format!(
                            "Subject {} clustered on day {} for class {}",
                            s_idx, d_idx, c_idx
                        ),
                        lesson_indices: idxs.iter().copied().collect(),
                        resources: smallvec![
                            DiagnosedResourceRef::Class(c_idx),
                            DiagnosedResourceRef::Subject(s_idx),
                        ],
                    });
                }
            }
        }
    }

    // Soft: class teacher first period
    for (c_idx, days) in class_day_first_period.iter().enumerate() {
        if facts.classes[c_idx].class_teacher_idx.is_none() {
            continue;
        }
        for (d_idx, (ct_teaches, has_lesson, idxs)) in days.iter().enumerate() {
            if *has_lesson && !ct_teaches {
                out.push(DiagnosedViolation {
                    kind: ViolationKind::ClassTeacherFirstPeriod,
                    severity: Severity::Soft,
                    message: format!(
                        "Class teacher does not teach first period on day {} for class {}",
                        d_idx, c_idx
                    ),
                    lesson_indices: idxs.iter().copied().collect(),
                    resources: smallvec![DiagnosedResourceRef::Class(c_idx)],
                });
            }
        }
    }

    out
}
```

- [ ] **Step 3: Run the diagnose tests**

Run: `cargo test -p klassenzeit-scheduler diagnose_`
Expected: All tests added in Task 3 pass.

- [ ] **Step 4: Run the full scheduler test suite**

Run: `cargo test -p klassenzeit-scheduler`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/types.rs scheduler/src/constraints.rs
git commit -m "scheduler: add diagnose() emitting structured violations per kind"
```

---

## Task 5: Scheduler — wire diagnose() into solve(), translate to public Violation

**Files:**
- Modify: `scheduler/src/lib.rs`
- Modify: `scheduler/src/mapper.rs`

- [ ] **Step 1: Add a translator in `mapper.rs`**

Append to `scheduler/src/mapper.rs`:

```rust
use crate::types::{
    DiagnosedResourceRef, DiagnosedViolation, LessonRef, ResourceRef, Severity, Violation,
    ViolationKind,
};
use smallvec::SmallVec;

pub fn translate_diagnosed(
    diagnosed: Vec<DiagnosedViolation>,
    solution: &PlanningSolution,
    maps: &IndexMaps,
    input: &ScheduleInput,
) -> Vec<Violation> {
    diagnosed
        .into_iter()
        .map(|d| {
            let lesson_refs: SmallVec<[LessonRef; 4]> = d
                .lesson_indices
                .iter()
                .filter_map(|&i| {
                    let l = solution.lessons.get(i)?;
                    let ts_idx = l.timeslot?;
                    Some(LessonRef {
                        class_id: maps.class_uuids[l.class_idx],
                        subject_id: maps.subject_uuids[l.subject_idx],
                        teacher_id: maps.teacher_uuids[l.teacher_idx],
                        room_id: l.room.map(|r| maps.room_uuids[r]),
                        timeslot_id: input.timeslots[ts_idx].id,
                    })
                })
                .collect();

            let resources: SmallVec<[ResourceRef; 4]> = d
                .resources
                .iter()
                .map(|r| match *r {
                    DiagnosedResourceRef::Teacher(i) => ResourceRef::Teacher(maps.teacher_uuids[i]),
                    DiagnosedResourceRef::Class(i) => ResourceRef::Class(maps.class_uuids[i]),
                    DiagnosedResourceRef::Room(i) => ResourceRef::Room(maps.room_uuids[i]),
                    DiagnosedResourceRef::Subject(i) => ResourceRef::Subject(maps.subject_uuids[i]),
                    DiagnosedResourceRef::Timeslot(i) => {
                        ResourceRef::Timeslot(input.timeslots[i].id)
                    }
                })
                .collect();

            Violation {
                kind: d.kind,
                severity: d.severity,
                message: d.message,
                lesson_refs,
                resources,
            }
        })
        .collect()
}
```

- [ ] **Step 2: Call diagnose() from `lib.rs`**

In `scheduler/src/lib.rs`, replace the tail of `solve_with_config` (the block starting `solution.score = state.score();`) with:

```rust
    solution.score = state.score();

    let diagnosed = constraints::diagnose(&solution.lessons, &solution.facts);
    let translated = mapper::translate_diagnosed(diagnosed, &solution, &maps, &filterable_input);

    let mut output = mapper::to_output(&solution, &maps, &filterable_input);

    // Append diagnose() violations after the unplaced-lesson ones
    output.violations.extend(translated);

    // Merge pre-validation violations
    output.score.hard_violations += pre_violations.len() as u32;
    output.violations.extend(pre_violations);
    output.stats = Some(stats);
    output
```

- [ ] **Step 3: Run tests**

Run: `cargo test -p klassenzeit-scheduler`
Expected: All tests pass. (`to_output_maps_back_to_uuids` and friends should still pass because they assert `hard_violations == 0` on a known-good solution.)

- [ ] **Step 4: Run benchmark sanity check (optional but recommended)**

Run: `cargo bench -p klassenzeit-scheduler --bench scoring -- --quick 2>&1 | tail -20`
Expected: No regression vs. baseline (diagnose runs once per solve, not per move).

If the bench command name differs, run `ls scheduler/benches/` first and use whatever benchmark file exists.

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/lib.rs scheduler/src/mapper.rs
git commit -m "scheduler: run diagnose() once after local search and merge into output"
```

---

## Task 6: Backend — DTOs for structured violations

**Files:**
- Modify: `backend/src/services/scheduler.rs`

- [ ] **Step 1: Add DTO types**

In `backend/src/services/scheduler.rs`, just below the existing `SolveLesson` struct, add:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct ViolationDto {
    pub kind: String,
    pub severity: String,
    pub message: String,
    pub lesson_refs: Vec<LessonRefDto>,
    pub resources: Vec<ResourceRefDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LessonRefDto {
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot_id: Uuid,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "id", rename_all = "snake_case")]
pub enum ResourceRefDto {
    Teacher(Uuid),
    Class(Uuid),
    Room(Uuid),
    Subject(Uuid),
    Timeslot(Uuid),
}
```

- [ ] **Step 2: Change `SolveResult.violations` to `Vec<ViolationDto>`**

In the same file, change:

```rust
    pub violations: Vec<String>,
```
to:
```rust
    pub violations: Vec<ViolationDto>,
```

- [ ] **Step 3: Update `to_solve_result`**

Replace the `violations:` field initialization in `to_solve_result` with:

```rust
        violations: output
            .violations
            .into_iter()
            .map(|v| ViolationDto {
                kind: v.kind.as_snake_case().to_string(),
                severity: match v.severity {
                    sched::Severity::Hard => "hard".to_string(),
                    sched::Severity::Soft => "soft".to_string(),
                },
                message: v.message,
                lesson_refs: v
                    .lesson_refs
                    .into_iter()
                    .map(|r| LessonRefDto {
                        class_id: r.class_id,
                        subject_id: r.subject_id,
                        teacher_id: r.teacher_id,
                        room_id: r.room_id,
                        timeslot_id: r.timeslot_id,
                    })
                    .collect(),
                resources: v
                    .resources
                    .into_iter()
                    .map(|r| match r {
                        sched::ResourceRef::Teacher(id) => ResourceRefDto::Teacher(id),
                        sched::ResourceRef::Class(id) => ResourceRefDto::Class(id),
                        sched::ResourceRef::Room(id) => ResourceRefDto::Room(id),
                        sched::ResourceRef::Subject(id) => ResourceRefDto::Subject(id),
                        sched::ResourceRef::Timeslot(id) => ResourceRefDto::Timeslot(id),
                    })
                    .collect(),
            })
            .collect(),
```

- [ ] **Step 4: Build**

Run: `cargo check -p klassenzeit-backend`
Expected: Clean compile.

- [ ] **Step 5: Run backend unit tests**

Run: `cargo test -p klassenzeit-backend --lib`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/scheduler.rs
git commit -m "backend: serialize structured violation DTOs"
```

---

## Task 7: Backend — integration test for structured violations

**Files:**
- Modify: an existing scheduler integration test under `backend/tests/`

- [ ] **Step 1: Locate the relevant integration test file**

Run: `ls backend/tests/scheduler/ 2>/dev/null && grep -rl 'violations' backend/tests/`
Expected: One or more test files. Pick the one that posts to `/api/schools/{id}/terms/{term_id}/scheduler/solve` and reads back the result. If unsure, list `backend/tests/` and read the most recently modified scheduler test.

- [ ] **Step 2: Update existing assertions**

Anywhere a test asserts that `violations` is a JSON array of strings, change the deserialized type to a Vec of structs matching `ViolationDto` (or use untyped `serde_json::Value` and assert on `["kind"]`/`["severity"]`).

- [ ] **Step 3: Add an infeasible-instance test**

Add a new `#[tokio::test]` (or whatever attribute pattern the file uses) named `solve_returns_structured_violation_for_unqualified_teacher`. The test must:

1. Set up a school with one teacher (no qualifications), one subject, one class, one curriculum entry requiring 1 hour of that subject for that class, one timeslot.
2. POST to the solve endpoint, poll status until `solved`.
3. GET the solution and assert:
   ```rust
   let v: serde_json::Value = response.json().await?;
   let violations = v["violations"].as_array().unwrap();
   assert!(!violations.is_empty(), "expected at least one violation");
   let first = &violations[0];
   assert_eq!(first["kind"], "no_qualified_teacher");
   assert_eq!(first["severity"], "hard");
   let resources = first["resources"].as_array().unwrap();
   assert!(resources.iter().any(|r| r["type"] == "subject"));
   ```

(Adjust to match the file's existing helpers — look for an existing `setup_school_with_*` helper to reuse.)

- [ ] **Step 4: Run the test**

Run: `just backend-test` (or `cargo test -p klassenzeit-backend --test mod -- solve_returns_structured_violation_for_unqualified_teacher`)
Expected: Passes. If the helper signatures don't fit a no-qualification setup, build the data inline using the same SeaORM models the existing tests use.

- [ ] **Step 5: Commit**

```bash
git add backend/tests
git commit -m "backend: integration test for structured violation payload"
```

---

## Task 8: Frontend — type definitions

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add violation types**

Append to `frontend/src/lib/types.ts`:

```ts
export type Severity = "hard" | "soft";

export type ViolationKind =
  | "teacher_conflict"
  | "class_conflict"
  | "room_capacity"
  | "teacher_unavailable"
  | "class_unavailable"
  | "teacher_over_capacity"
  | "teacher_unqualified"
  | "room_unsuitable"
  | "room_too_small"
  | "unplaced_lesson"
  | "no_qualified_teacher"
  | "teacher_gap"
  | "subject_clustered"
  | "not_preferred_slot"
  | "class_teacher_first_period";

export interface ViolationLessonRef {
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string | null;
  timeslot_id: string;
}

export type ResourceRefDto =
  | { type: "teacher"; id: string }
  | { type: "class"; id: string }
  | { type: "room"; id: string }
  | { type: "subject"; id: string }
  | { type: "timeslot"; id: string };

export interface ViolationDto {
  kind: ViolationKind;
  severity: Severity;
  message: string;
  lesson_refs: ViolationLessonRef[];
  resources: ResourceRefDto[];
}
```

- [ ] **Step 2: Update `SolveResult.violations`**

Change:
```ts
export interface SolveResult {
  timetable: SolveLesson[];
  score: { hard_violations: number; soft_score: number };
  violations: string[];
}
```
to:
```ts
export interface SolveResult {
  timetable: SolveLesson[];
  score: { hard_violations: number; soft_score: number };
  violations: ViolationDto[];
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && bun run typecheck`
Expected: One or more errors in `schedule/page.tsx` referencing `v` (currently a string). These will be fixed in Task 11. Other files should be clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "frontend(types): structured ViolationDto"
```

---

## Task 9: Frontend — i18n keys for violation kinds

**Files:**
- Modify: `frontend/src/messages/en.json`
- Modify: `frontend/src/messages/de.json`

- [ ] **Step 1: Add keys to `en.json`**

Inside the `"scheduler"` object in `frontend/src/messages/en.json`, add (next to the existing `violations` key):

```json
"violationsPanel": {
  "tabs": { "hard": "Hard ({count})", "soft": "Soft ({count})" },
  "empty": "No violations of this type.",
  "fixCta": "How to fix",
  "kind": {
    "teacher_conflict":         { "title": "Teacher double-booked",    "fix": "Two lessons assigned to the same teacher in the same slot. Reassign one to a different teacher or move it to another slot." },
    "class_conflict":           { "title": "Class double-booked",      "fix": "Two lessons assigned to the same class in the same slot. Move one to another slot." },
    "room_capacity":            { "title": "Room over capacity",       "fix": "More lessons share this room/slot than its max concurrent setting allows. Increase capacity in Rooms or move a lesson elsewhere." },
    "teacher_unavailable":      { "title": "Teacher unavailable",      "fix": "Lesson placed in a slot the teacher marked as blocked. Update the teacher's availability or move the lesson." },
    "class_unavailable":        { "title": "Class unavailable",        "fix": "Lesson placed in a slot the class is unavailable. Adjust class availability or move the lesson." },
    "teacher_over_capacity":    { "title": "Teacher over weekly hours","fix": "Teacher is scheduled for more hours than max_hours_per_week. Increase max hours or remove a lesson." },
    "teacher_unqualified":      { "title": "Teacher not qualified",    "fix": "Add this subject to the teacher's qualifications, or assign a qualified teacher." },
    "room_unsuitable":          { "title": "Room not suitable",        "fix": "Add this subject to the room's suitable subjects, or pick a different room." },
    "room_too_small":           { "title": "Room too small",           "fix": "Room capacity is below the class's student count. Increase capacity or pick a larger room." },
    "unplaced_lesson":          { "title": "Lesson could not be placed","fix": "No feasible slot/teacher/room combination was found. Loosen constraints or add more slots." },
    "no_qualified_teacher":     { "title": "No qualified teacher",     "fix": "No teacher is qualified for this subject. Add a qualification on an existing teacher or create a new one." },
    "teacher_gap":              { "title": "Teacher idle period",      "fix": "Teacher has gaps between lessons on this day. Reorder lessons to remove the gap." },
    "subject_clustered":        { "title": "Subject clustered",        "fix": "Same subject scheduled multiple times for this class on one day. Spread it across different days." },
    "not_preferred_slot":       { "title": "Non-preferred slot",       "fix": "Lesson is in a slot the teacher did not prefer. Move it to a preferred slot." },
    "class_teacher_first_period": { "title": "Class teacher missing in first period", "fix": "First-period lessons should be taught by the class teacher. Reassign the first-period lesson." }
  }
}
```

- [ ] **Step 2: Add the same keys to `de.json` with German translations**

```json
"violationsPanel": {
  "tabs": { "hard": "Hart ({count})", "soft": "Weich ({count})" },
  "empty": "Keine Verletzungen dieser Art.",
  "fixCta": "So beheben",
  "kind": {
    "teacher_conflict":         { "title": "Lehrkraft doppelt belegt",       "fix": "Zwei Stunden derselben Lehrkraft im gleichen Slot. Eine umverteilen oder verschieben." },
    "class_conflict":           { "title": "Klasse doppelt belegt",          "fix": "Zwei Stunden derselben Klasse im gleichen Slot. Eine verschieben." },
    "room_capacity":            { "title": "Raum überfüllt",                 "fix": "Mehr Stunden in diesem Raum/Slot als die maximale Belegung erlaubt. Belegung erhöhen oder Stunde verschieben." },
    "teacher_unavailable":      { "title": "Lehrkraft nicht verfügbar",      "fix": "Stunde liegt in einem geblockten Slot der Lehrkraft. Verfügbarkeit anpassen oder Stunde verschieben." },
    "class_unavailable":        { "title": "Klasse nicht verfügbar",         "fix": "Stunde liegt in einem nicht verfügbaren Klassenslot. Verfügbarkeit anpassen oder verschieben." },
    "teacher_over_capacity":    { "title": "Lehrkraft über Stundenzahl",     "fix": "Lehrkraft ist über max_hours_per_week eingeplant. Max-Stunden erhöhen oder Stunde entfernen." },
    "teacher_unqualified":      { "title": "Lehrkraft nicht qualifiziert",   "fix": "Fach zu den Qualifikationen der Lehrkraft hinzufügen oder andere Lehrkraft zuweisen." },
    "room_unsuitable":          { "title": "Raum nicht geeignet",            "fix": "Fach zu den geeigneten Fächern des Raums hinzufügen oder anderen Raum wählen." },
    "room_too_small":           { "title": "Raum zu klein",                  "fix": "Raumkapazität ist kleiner als Klassengröße. Kapazität erhöhen oder größeren Raum wählen." },
    "unplaced_lesson":          { "title": "Stunde nicht platzierbar",       "fix": "Keine machbare Kombination gefunden. Constraints lockern oder mehr Slots anlegen." },
    "no_qualified_teacher":     { "title": "Keine qualifizierte Lehrkraft",  "fix": "Niemand ist für dieses Fach qualifiziert. Qualifikation hinzufügen oder Lehrkraft anlegen." },
    "teacher_gap":              { "title": "Freistunde der Lehrkraft",       "fix": "Lehrkraft hat Lücken zwischen Stunden. Reihenfolge anpassen." },
    "subject_clustered":        { "title": "Fach gehäuft",                   "fix": "Gleiches Fach mehrfach am selben Tag für die Klasse. Auf andere Tage verteilen." },
    "not_preferred_slot":       { "title": "Kein bevorzugter Slot",          "fix": "Stunde liegt in einem nicht bevorzugten Slot. In bevorzugten Slot verschieben." },
    "class_teacher_first_period": { "title": "Klassenlehrkraft fehlt in erster Stunde", "fix": "Erste Stunde sollte von der Klassenlehrkraft unterrichtet werden. Umverteilen." }
  }
}
```

- [ ] **Step 3: Verify both files parse**

Run: `cd frontend && bun run typecheck && bunx biome check src/messages/`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/messages/en.json frontend/src/messages/de.json
git commit -m "frontend(i18n): violation kind titles and fix hints"
```

---

## Task 10: Frontend — `<TimetableGrid>` highlightedCells prop

**Files:**
- Modify: `frontend/src/components/timetable/timetable-grid.tsx`

- [ ] **Step 1: Add props**

In `frontend/src/components/timetable/timetable-grid.tsx`:

Update `TimetableGridProps`:
```ts
interface TimetableGridProps {
  lessons: TimetableLesson[];
  viewMode: TimetableViewMode;
  selectedEntityId: string | null;
  timeslots: TimeSlotResponse[];
  subjects: SubjectResponse[];
  teachers: TeacherResponse[];
  rooms: RoomResponse[];
  classes: SchoolClassResponse[];
  locale: string;
  highlightedCells?: Set<string>; // keys: `${day_of_week}-${period}`
  highlightTone?: "error" | "warn";
}
```

Update the function signature destructuring to include the two new fields with defaults `undefined` and `"error"`.

- [ ] **Step 2: Decorate cells**

Inside the `{[0, 1, 2, 3, 4].map((day) => { ... })}` block, replace the `<td>` rendering for the lesson cell with:

```tsx
const cellKey = `${day}-${period}`;
const isHighlighted = highlightedCells?.has(cellKey) ?? false;
const ringClass = isHighlighted
  ? highlightTone === "warn"
    ? "ring-2 ring-amber-500 ring-offset-1 animate-[pulse_600ms_ease-out_1]"
    : "ring-2 ring-red-500 ring-offset-1 animate-[pulse_600ms_ease-out_1]"
  : "";
return (
  <td
    key={`cell-${day}-${period}`}
    className={`border-l p-2 ${ringClass}`}
    style={color ? { backgroundColor: `${color}20` } : undefined}
  >
    {renderCellContent(lesson)}
  </td>
);
```

For the empty-cell branch (no lesson), also apply the ring class so an unplaced-lesson highlight is still visible:

```tsx
if (!lesson) {
  const cellKey = `${day}-${period}`;
  const isHighlighted = highlightedCells?.has(cellKey) ?? false;
  const ringClass = isHighlighted
    ? "ring-2 ring-red-500 ring-offset-1 animate-[pulse_600ms_ease-out_1]"
    : "";
  return (
    <td
      key={`cell-${day}-${period}`}
      className={`border-l p-2 ${ringClass}`}
    />
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && bun run typecheck`
Expected: `timetable-grid.tsx` clean. (Other call sites that don't pass `highlightedCells` are still valid because the prop is optional.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/timetable/timetable-grid.tsx
git commit -m "frontend(timetable-grid): optional highlightedCells prop"
```

---

## Task 11: Frontend — `<ViolationsPanel>` component (TDD)

**Files:**
- Create: `frontend/src/components/timetable/violations-panel.tsx`
- Create: `frontend/src/__tests__/violations-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/violations-panel.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ViolationsPanel } from "@/components/timetable/violations-panel";
import en from "@/messages/en.json";
import type {
  ViolationDto,
  TeacherResponse,
  SchoolClassResponse,
  RoomResponse,
  SubjectResponse,
  TimeSlotResponse,
} from "@/lib/types";

const teacher: TeacherResponse = {
  id: "t1", first_name: "Anna", last_name: "Schmidt", email: null,
  abbreviation: "AS", max_hours_per_week: 28, is_part_time: false, is_active: true,
};
const cls: SchoolClassResponse = {
  id: "c1", name: "1A", grade_level: 1, student_count: 22,
  class_teacher_id: null, is_active: true,
};
const subject: SubjectResponse = {
  id: "s1", name: "Math", abbreviation: "Ma", color: null, needs_special_room: false,
};
const room: RoomResponse = {
  id: "r1", name: "Room 12", building: null, capacity: 30, max_concurrent: 1, is_active: true,
};
const ts: TimeSlotResponse = {
  id: "ts1", day_of_week: 0, period: 1, start_time: "08:00", end_time: "08:45",
  is_break: false, label: null,
};

const hardViolation: ViolationDto = {
  kind: "teacher_conflict",
  severity: "hard",
  message: "Teacher double-booked",
  lesson_refs: [
    { class_id: "c1", subject_id: "s1", teacher_id: "t1", room_id: "r1", timeslot_id: "ts1" },
  ],
  resources: [
    { type: "teacher", id: "t1" },
    { type: "timeslot", id: "ts1" },
  ],
};

const softViolation: ViolationDto = {
  kind: "teacher_gap",
  severity: "soft",
  message: "Teacher idle period",
  lesson_refs: [],
  resources: [{ type: "teacher", id: "t1" }],
};

function renderPanel(onHighlight = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ViolationsPanel
        violations={[hardViolation, softViolation]}
        highlightedId={null}
        onHighlight={onHighlight}
        refs={{
          teachers: [teacher],
          classes: [cls],
          rooms: [room],
          subjects: [subject],
          timeslots: [ts],
          locale: "en",
        }}
      />
    </NextIntlClientProvider>,
  );
  return { onHighlight };
}

describe("ViolationsPanel", () => {
  it("groups violations by severity into tabs", () => {
    renderPanel();
    expect(screen.getByText(/Hard \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Soft \(1\)/)).toBeInTheDocument();
  });

  it("renders the violation row with the i18n title for the kind", () => {
    renderPanel();
    expect(screen.getByText(/Teacher double-booked/i)).toBeInTheDocument();
  });

  it("calls onHighlight when a row is clicked", () => {
    const { onHighlight } = renderPanel();
    fireEvent.click(screen.getByText(/Teacher double-booked/i).closest("button")!);
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onHighlight.mock.calls[0][0].kind).toBe("teacher_conflict");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun test src/__tests__/violations-panel.test.tsx`
Expected: Failure — module `@/components/timetable/violations-panel` not found.

- [ ] **Step 3: Implement `<ViolationsPanel>`**

Create `frontend/src/components/timetable/violations-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  ViolationDto,
  ViolationKind,
  Severity,
  ResourceRefDto,
  TeacherResponse,
  SchoolClassResponse,
  RoomResponse,
  SubjectResponse,
  TimeSlotResponse,
} from "@/lib/types";

interface Refs {
  teachers: TeacherResponse[];
  classes: SchoolClassResponse[];
  rooms: RoomResponse[];
  subjects: SubjectResponse[];
  timeslots: TimeSlotResponse[];
  locale: string;
}

interface ViolationsPanelProps {
  violations: ViolationDto[];
  highlightedId: string | null;
  onHighlight: (v: ViolationDto | null) => void;
  refs: Refs;
}

export function violationId(v: ViolationDto, i: number): string {
  return `${v.kind}-${i}`;
}

function resolveResourceLabel(r: ResourceRefDto, refs: Refs): string {
  switch (r.type) {
    case "teacher": {
      const t = refs.teachers.find((x) => x.id === r.id);
      return t ? `${t.first_name} ${t.last_name}` : r.id;
    }
    case "class":
      return refs.classes.find((x) => x.id === r.id)?.name ?? r.id;
    case "room":
      return refs.rooms.find((x) => x.id === r.id)?.name ?? r.id;
    case "subject":
      return refs.subjects.find((x) => x.id === r.id)?.name ?? r.id;
    case "timeslot": {
      const ts = refs.timeslots.find((x) => x.id === r.id);
      return ts ? `Day ${ts.day_of_week + 1} P${ts.period}` : r.id;
    }
  }
}

const ALL_HARD: ViolationKind[] = [
  "teacher_conflict","class_conflict","room_capacity","teacher_unavailable",
  "class_unavailable","teacher_over_capacity","teacher_unqualified",
  "room_unsuitable","room_too_small","unplaced_lesson","no_qualified_teacher",
];
const ALL_SOFT: ViolationKind[] = [
  "teacher_gap","subject_clustered","not_preferred_slot","class_teacher_first_period",
];

export function ViolationsPanel({
  violations,
  highlightedId,
  onHighlight,
  refs,
}: ViolationsPanelProps) {
  const t = useTranslations("scheduler.violationsPanel");
  const [tab, setTab] = useState<Severity>("hard");

  const indexed = violations.map((v, i) => ({ v, id: violationId(v, i) }));
  const hard = indexed.filter((x) => x.v.severity === "hard");
  const soft = indexed.filter((x) => x.v.severity === "soft");

  const groupByKind = (items: typeof indexed, allowed: ViolationKind[]) => {
    const groups = new Map<ViolationKind, typeof indexed>();
    for (const k of allowed) groups.set(k, []);
    for (const it of items) {
      const arr = groups.get(it.v.kind) ?? [];
      arr.push(it);
      groups.set(it.v.kind, arr);
    }
    return Array.from(groups.entries()).filter(([, v]) => v.length > 0);
  };

  const renderGroups = (
    items: typeof indexed,
    allowed: ViolationKind[],
  ) => {
    const groups = groupByKind(items, allowed);
    if (groups.length === 0) {
      return <p className="p-3 text-sm text-muted-foreground">{t("empty")}</p>;
    }
    return (
      <div className="flex flex-col gap-3 p-3">
        {groups.map(([kind, list]) => (
          <section key={kind} className="rounded-md border">
            <header className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
              <span className="text-sm font-medium">
                {t(`kind.${kind}.title`)}
              </span>
              <Badge variant="secondary">{list.length}</Badge>
            </header>
            <ul>
              {list.map(({ v, id }) => {
                const isSelected = highlightedId === id;
                return (
                  <li key={id} className="border-b last:border-b-0">
                    <div className="flex items-center justify-between px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onHighlight({ ...v })}
                        className={`flex flex-1 flex-col items-start gap-1 text-left text-sm ${
                          isSelected ? "font-semibold" : ""
                        }`}
                      >
                        <span>{t(`kind.${v.kind}.title`)}</span>
                        <div className="flex flex-wrap gap-1">
                          {v.resources.map((r, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {resolveResourceLabel(r, refs)}
                            </Badge>
                          ))}
                        </div>
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {t("fixCta")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm">
                          {t(`kind.${v.kind}.fix`)}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Severity)}>
      <TabsList>
        <TabsTrigger value="hard">
          {t("tabs.hard", { count: hard.length })}
        </TabsTrigger>
        <TabsTrigger value="soft">
          {t("tabs.soft", { count: soft.length })}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="hard">{renderGroups(hard, ALL_HARD)}</TabsContent>
      <TabsContent value="soft">{renderGroups(soft, ALL_SOFT)}</TabsContent>
    </Tabs>
  );
}
```

If `@/components/ui/tabs`, `popover`, or `badge` doesn't exist, run `grep -l 'shadcn' frontend/src/components/ui/*.tsx | head` to confirm — these are standard shadcn/ui primitives. If missing, add them via `bunx shadcn@latest add tabs popover badge` (or whatever invocation the repo already uses; check `frontend/components.json`).

- [ ] **Step 4: Run test**

Run: `cd frontend && bun test src/__tests__/violations-panel.test.tsx`
Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/timetable/violations-panel.tsx \
        frontend/src/__tests__/violations-panel.test.tsx \
        frontend/components.json frontend/src/components/ui/
git commit -m "frontend: ViolationsPanel with grouped tabs and fix popover"
```

(If no shadcn primitives were added, omit the last two paths.)

---

## Task 12: Frontend — wire panel into schedule page

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx`

- [ ] **Step 1: Replace inline list with `<ViolationsPanel>` and lift highlight state**

In `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx`:

Add import:
```tsx
import { ViolationsPanel, violationId } from "@/components/timetable/violations-panel";
import type { ViolationDto } from "@/lib/types";
```

Remove the `violationsOpen` state. Add:

```tsx
const [highlighted, setHighlighted] = useState<{ v: ViolationDto; id: string } | null>(null);
```

When `selectedTermId` changes or a new solution is fetched, reset: `setHighlighted(null);` (add to the existing reset paths in `handleGenerate` and the term-change handler).

Add a derived helper near the top of the component body:
```tsx
const highlightedCells = (() => {
  if (!highlighted) return undefined;
  const set = new Set<string>();
  for (const ref of highlighted.v.lesson_refs) {
    const ts = timeslots.find((t) => t.id === ref.timeslot_id);
    if (ts) set.add(`${ts.day_of_week}-${ts.period}`);
  }
  return set;
})();
```

Replace the entire collapsible-violations block (the `solution.violations.length > 0 ? ( ... ) : (...)` JSX) with:

```tsx
{solution.violations.length > 0 ? (
  <ViolationsPanel
    violations={solution.violations}
    highlightedId={highlighted?.id ?? null}
    onHighlight={(v) => {
      if (!v) {
        setHighlighted(null);
        return;
      }
      const idx = solution.violations.indexOf(v);
      const id = violationId(v, idx);
      setHighlighted({ v, id });
      // Pivot view mode based on the kind
      const teacherKinds = new Set([
        "teacher_conflict","teacher_unavailable","teacher_over_capacity",
        "teacher_unqualified","teacher_gap","not_preferred_slot",
      ]);
      const roomKinds = new Set(["room_capacity","room_unsuitable","room_too_small"]);
      const ref = v.lesson_refs[0];
      if (teacherKinds.has(v.kind) && ref) {
        setViewMode("teacher");
        setSelectedEntityId(ref.teacher_id);
      } else if (roomKinds.has(v.kind) && ref?.room_id) {
        setViewMode("room");
        setSelectedEntityId(ref.room_id);
      } else if (ref) {
        setViewMode("class");
        setSelectedEntityId(ref.class_id);
      }
    }}
    refs={{
      teachers, classes, rooms, subjects, timeslots, locale,
    }}
  />
) : (
  <p className="text-sm text-green-600">{t("noViolations")}</p>
)}
```

Update the `<TimetableGrid>` invocation to pass the highlight props:

```tsx
<TimetableGrid
  lessons={solution.timetable}
  viewMode={viewMode}
  selectedEntityId={selectedEntityId}
  timeslots={timeslots}
  subjects={subjects}
  teachers={teachers}
  rooms={rooms}
  classes={classes}
  locale={locale}
  highlightedCells={highlightedCells}
  highlightTone={highlighted?.v.severity === "soft" ? "warn" : "error"}
/>
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && bun run typecheck`
Expected: Clean.

- [ ] **Step 3: Update existing schedule page test**

Open `frontend/src/__tests__/schedule-page.test.tsx`. Anywhere a fixture solution sets `violations: ["..."]`, change to `violations: []` for the happy-path tests (or use a structured `ViolationDto` for the test that asserts violation rendering).

Add one new test that asserts: when a fixture solution containing a `teacher_conflict` violation loads, clicking its row switches `viewMode` to teacher and the previously rendered conflicting cell now has the `ring-red-500` class.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && bun test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/schedule/page.tsx \
        frontend/src/__tests__/schedule-page.test.tsx
git commit -m "frontend(schedule): wire ViolationsPanel + cell highlighting"
```

---

## Task 13: Frontend — settings tab `?focus=<id>` deep links

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx`

- [ ] **Step 1: Add focus handling to teachers-tab.tsx**

In `teachers-tab.tsx`, add:

```tsx
import { useSearchParams } from "next/navigation";
```

Inside the component, after the existing data-loading effect, add:

```tsx
const searchParams = useSearchParams();
const focusId = searchParams.get("focus");
const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

useEffect(() => {
  if (!focusId || teachers.length === 0) return;
  const el = rowRefs.current.get(focusId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("bg-yellow-100", "transition-colors");
    const timer = setTimeout(() => {
      el.classList.remove("bg-yellow-100");
    }, 1500);
    return () => clearTimeout(timer);
  }
}, [focusId, teachers]);
```

For each row in the rendered list, attach the ref:

```tsx
<tr
  key={teacher.id}
  ref={(el) => {
    if (el) rowRefs.current.set(teacher.id, el);
    else rowRefs.current.delete(teacher.id);
  }}
>
```

Add `useEffect, useRef` to the React import if missing.

- [ ] **Step 2: Repeat for rooms-tab.tsx and subjects-tab.tsx**

Apply the same pattern. The `teachers` state name will differ — use the actual state variable from each file.

- [ ] **Step 3: Wire deep links from `<ViolationsPanel>` fix popover**

In `violations-panel.tsx`, extend the `PopoverContent` to include conditional links based on the resources. Replace the simple text with:

```tsx
<PopoverContent className="w-72 text-sm">
  <p className="mb-2">{t(`kind.${v.kind}.fix`)}</p>
  <FixLinks violation={v} schoolId={schoolId} />
</PopoverContent>
```

Add a `schoolId` prop to `ViolationsPanelProps` and a small subcomponent:

```tsx
function FixLinks({ violation, schoolId }: { violation: ViolationDto; schoolId: string }) {
  const links: { label: string; href: string }[] = [];
  for (const r of violation.resources) {
    if (r.type === "teacher") {
      links.push({
        label: "Open teacher",
        href: `/schools/${schoolId}/settings?tab=teachers&focus=${r.id}`,
      });
    } else if (r.type === "room") {
      links.push({
        label: "Open room",
        href: `/schools/${schoolId}/settings?tab=rooms&focus=${r.id}`,
      });
    } else if (r.type === "subject") {
      links.push({
        label: "Open subject",
        href: `/schools/${schoolId}/settings?tab=subjects&focus=${r.id}`,
      });
    }
  }
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {links.map((l, i) => (
        <li key={i}>
          <a className="text-primary underline" href={l.href}>{l.label}</a>
        </li>
      ))}
    </ul>
  );
}
```

Pass `schoolId={schoolId}` from `schedule/page.tsx` (the page already has `schoolId` in scope).

- [ ] **Step 4: Update the violations-panel test fixture and `schedule-page.test.tsx`**

Add a `schoolId="abc"` prop in the test render. Add a test that asserts the popover renders an "Open teacher" link with `href` containing `focus=t1` for the teacher_conflict fixture.

- [ ] **Step 5: Run all frontend tests**

Run: `cd frontend && bun test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx \
        frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx \
        frontend/src/app/[locale]/schools/[id]/settings/components/subjects-tab.tsx \
        frontend/src/components/timetable/violations-panel.tsx \
        frontend/src/__tests__/violations-panel.test.tsx \
        frontend/src/app/[locale]/schools/[id]/schedule/page.tsx
git commit -m "frontend: deep-link violation fix popover into settings tabs"
```

---

## Task 14: Final verification and docs

- [ ] **Step 1: Run the entire test suite**

Run: `just check && just test`
Expected: Clean. If `just test` requires Postgres, ensure `docker compose up -d postgres-dev` first.

- [ ] **Step 2: Manual smoke test**

Run `just dev`. Log in, generate a schedule on an instance you know is infeasible (e.g. remove all qualifications from one teacher). Confirm:
- Violations panel shows tabs with counts.
- Clicking a teacher_conflict row switches to teacher view and rings the conflicting cell.
- "How to fix" popover deep-links into the teachers tab and the row scrolls into view + flashes.

- [ ] **Step 3: Update STATUS and next-steps**

In `docs/STATUS.md`, append under "Completed Steps":
```markdown
### Conflict Resolution UI (2d)
- Spec: `superpowers/specs/2026-04-07-conflict-resolution-ui-design.md`
- Plan: `superpowers/plans/2026-04-07-conflict-resolution-ui.md`
- New `diagnose()` pass in scheduler emits structured `Violation { kind, severity, lesson_refs, resources }` for all 12 hard + 4 soft constraint kinds. Runs once after local search; no perf regression.
- Backend `ViolationDto`/`LessonRefDto`/`ResourceRefDto` serialized as part of `SolveResult`.
- New `<ViolationsPanel>` with hard/soft tabs, per-kind grouping, click-to-highlight, and fix popovers that deep-link into settings (`?focus=<id>`).
- `<TimetableGrid>` gains optional `highlightedCells`/`highlightTone` props.
- Settings tabs (teachers/rooms/subjects) scroll/flash the focused row.
```

In `docs/superpowers/next-steps.md`, change row 2d from `idea` to `done` and add `~~strikethrough~~` formatting like the other completed items, with PR # placeholder (filled after merge).

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md docs/superpowers/next-steps.md
git commit -m "docs: mark 2d (conflict resolution UI) complete"
```

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(ui): conflict resolution panel (2d)" --body "$(cat <<'EOF'
## Summary
- Scheduler now emits structured `Violation { kind, severity, lesson_refs, resources }` via a one-shot `diagnose()` pass after local search.
- New `<ViolationsPanel>` groups violations by kind and severity, click-to-highlight conflicting cells in `<TimetableGrid>`, with per-kind "How to fix" popovers that deep-link into the settings tabs (teachers / rooms / subjects).
- All 12 hard + 4 soft constraint kinds covered, with i18n in DE/EN.

## Test plan
- [x] `cargo test -p klassenzeit-scheduler`
- [x] `cargo test -p klassenzeit-backend`
- [x] `cd frontend && bun test`
- [x] Manual smoke on infeasible instance: panel groups, cell rings light up, fix-link scrolls focused row
- [ ] Staging deploy + manual end-to-end
EOF
)"
```

- [ ] **Step 6: Watch CI; fix until green; merge**

Per project workflow, fix all CI failures and review issues until the PR is mergeable, then merge it. After merge, ping the user on the PR.

---

## Self-review notes

- **Spec coverage:** every section of the spec maps to at least one task — types (1), pre-validate/unplaced (2), diagnose tests (3) and impl (4), wiring (5), backend DTOs (6) and tests (7), frontend types (8), i18n (9), grid (10), panel (11), wiring (12), deep links (13), docs (14).
- **Open question 1** (focus deep-links): resolved by Task 13 — only teachers/rooms/subjects tabs get focus handling, matching the spec recommendation.
- **Open question 2** (pulse animation): one-shot 600ms pulse implemented in Task 10 via `animate-[pulse_600ms_ease-out_1]`, no looping.
- **Type consistency:** `DiagnosedViolation` (Task 4) → translated by `translate_diagnosed` (Task 5) → `Violation` (Task 1) → `ViolationDto` (Task 6) → frontend `ViolationDto` (Task 8). Field names match across boundaries (`lesson_refs`, `resources`, `kind`, `severity`).
- **Performance:** `diagnose()` called once per solve in `solve_with_config`, never inside the LAHC loop. Task 5 step 4 verifies with `cargo bench`.
