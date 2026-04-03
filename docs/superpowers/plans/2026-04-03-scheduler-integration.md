# Scheduler Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the scheduler crate into the backend with a greedy solver, curriculum CRUD, API endpoints for solve/preview/apply, and a frontend generation UI.

**Architecture:** Loco `BackgroundWorker` dispatches solve jobs. Solutions cached in `Arc<DashMap>` shared state. Frontend polls status, previews timetable, then applies. Curriculum entries table provides solver input (what classes need which subjects).

**Tech Stack:** Rust (scheduler crate, Loco/Axum backend, SeaORM), Next.js 16 frontend, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-04-03-scheduler-integration-design.md`

---

## File Map

### Scheduler Crate
- Modify: `scheduler/src/types.rs` — Replace all types with spec-aligned versions
- Modify: `scheduler/src/lib.rs` — Greedy solver implementation
- Modify: `scheduler/tests/basic.rs` — Comprehensive solver tests

### Backend — Migration
- Create: `backend/migration/src/m20250403_000003_curriculum_entries.rs` — New table
- Modify: `backend/migration/src/lib.rs` — Register migration

### Backend — Entity
- Create: `backend/src/models/_entities/curriculum_entries.rs` — SeaORM entity
- Modify: `backend/src/models/_entities/mod.rs` — Add module
- Modify: `backend/src/models/_entities/prelude.rs` — Add prelude
- Create: `backend/src/models/curriculum_entries.rs` — Model helpers
- Modify: `backend/src/models/mod.rs` — Add module

### Backend — Curriculum CRUD
- Create: `backend/src/controllers/curriculum.rs` — CRUD endpoints
- Modify: `backend/src/controllers/mod.rs` — Add module
- Modify: `backend/src/app.rs` — Register routes

### Backend — Scheduler Integration
- Create: `backend/src/services/mod.rs` — Services module
- Create: `backend/src/services/scheduler.rs` — DB→scheduler mapping + shared state
- Modify: `backend/src/lib.rs` — Add services module
- Create: `backend/src/workers/scheduler.rs` — Background worker
- Modify: `backend/src/workers/mod.rs` — Add module
- Modify: `backend/src/app.rs` — Register worker + add shared state layer
- Create: `backend/src/controllers/scheduler.rs` — API endpoints (solve/status/solution/apply)
- Modify: `backend/src/controllers/mod.rs` — Add module

### Backend — Dependencies
- Modify: `backend/Cargo.toml` — Add `dashmap`

### Frontend
- Modify: `frontend/src/lib/types.ts` — Add curriculum + scheduler types
- Modify: `frontend/src/messages/en.json` — Add translations
- Modify: `frontend/src/messages/de.json` — Add translations
- Create: `frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx` — Curriculum CRUD page
- Create: `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx` — Schedule generation page
- Modify: `frontend/src/app/[locale]/schools/[id]/layout.tsx` — Add nav items

---

## Task 1: Update Scheduler Crate Types

**Files:**
- Modify: `scheduler/src/types.rs`
- Modify: `scheduler/tests/basic.rs`

**Parallelizable:** Yes (no backend dependencies)

- [ ] **Step 1: Replace types.rs with spec-aligned types**

```rust
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
pub struct ScheduleInput {
    pub teachers: Vec<Teacher>,
    pub classes: Vec<SchoolClass>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub timeslots: Vec<TimeSlot>,
    pub requirements: Vec<LessonRequirement>,
}

#[derive(Debug, Clone, Default)]
pub struct ScheduleOutput {
    pub timetable: Vec<Lesson>,
    pub score: Score,
    pub violations: Vec<Violation>,
}

#[derive(Debug, Clone)]
pub struct Teacher {
    pub id: Uuid,
    pub name: String,
    pub max_hours_per_week: u32,
    pub is_part_time: bool,
    pub available_slots: Vec<TimeSlot>,
    pub qualified_subjects: Vec<Uuid>,
}

#[derive(Debug, Clone)]
pub struct SchoolClass {
    pub id: Uuid,
    pub name: String,
    pub grade_level: u8,
    pub student_count: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub capacity: Option<u32>,
    pub suitable_subjects: Vec<Uuid>,
}

#[derive(Debug, Clone)]
pub struct Subject {
    pub id: Uuid,
    pub name: String,
    pub needs_special_room: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TimeSlot {
    pub id: Uuid,
    pub day: u8,
    pub period: u8,
}

#[derive(Debug, Clone)]
pub struct LessonRequirement {
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Option<Uuid>,
    pub hours_per_week: u32,
}

#[derive(Debug, Clone)]
pub struct Lesson {
    pub teacher_id: Uuid,
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot: TimeSlot,
}

#[derive(Debug, Clone, Default)]
pub struct Score {
    pub hard_violations: u32,
    pub soft_score: f64,
}

#[derive(Debug, Clone)]
pub struct Violation {
    pub description: String,
}
```

- [ ] **Step 2: Update test to compile with new types**

Replace `scheduler/tests/basic.rs`:

```rust
use klassenzeit_scheduler::solve;
use klassenzeit_scheduler::types::ScheduleInput;

#[test]
fn empty_input_returns_empty_timetable() {
    let input = ScheduleInput::default();
    let output = solve(input);
    assert!(output.timetable.is_empty());
    assert!(output.violations.is_empty());
}
```

- [ ] **Step 3: Run tests to verify compilation**

Run: `cargo test -p klassenzeit-scheduler`
Expected: PASS — 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add scheduler/
git commit -m "refactor(scheduler): update types to match spec — add timeslots, requirements, teacher availability"
```

---

## Task 2: Implement Greedy Solver

**Files:**
- Modify: `scheduler/src/lib.rs`
- Modify: `scheduler/tests/basic.rs`

**Depends on:** Task 1

- [ ] **Step 1: Write failing tests for core solver scenarios**

Append to `scheduler/tests/basic.rs`:

```rust
use klassenzeit_scheduler::types::*;
use uuid::Uuid;

fn ts(day: u8, period: u8) -> TimeSlot {
    TimeSlot { id: Uuid::new_v4(), day, period }
}

fn teacher(name: &str, slots: Vec<TimeSlot>, subjects: Vec<Uuid>) -> Teacher {
    Teacher {
        id: Uuid::new_v4(),
        name: name.to_string(),
        max_hours_per_week: 28,
        is_part_time: false,
        available_slots: slots,
        qualified_subjects: subjects,
    }
}

fn class(name: &str, grade: u8) -> SchoolClass {
    SchoolClass {
        id: Uuid::new_v4(),
        name: name.to_string(),
        grade_level: grade,
        student_count: None,
    }
}

fn subject(name: &str, special_room: bool) -> Subject {
    Subject {
        id: Uuid::new_v4(),
        name: name.to_string(),
        needs_special_room: special_room,
    }
}

fn room(name: &str, capacity: Option<u32>, suitable: Vec<Uuid>) -> Room {
    Room {
        id: Uuid::new_v4(),
        name: name.to_string(),
        capacity,
        suitable_subjects: suitable,
    }
}

#[test]
fn single_requirement_single_slot_assigns_one_lesson() {
    let slots = vec![ts(0, 1)];
    let math = subject("Math", false);
    let t = teacher("Alice", slots.clone(), vec![math.id]);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: slots,
        requirements: vec![LessonRequirement {
            class_id: c.id,
            subject_id: math.id,
            teacher_id: Some(t.id),
            hours_per_week: 1,
        }],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.score.hard_violations, 0);
    assert_eq!(output.timetable[0].teacher_id, t.id);
    assert_eq!(output.timetable[0].class_id, c.id);
    assert_eq!(output.timetable[0].subject_id, math.id);
}

#[test]
fn teacher_conflict_produces_violation() {
    let slot = ts(0, 1);
    let math = subject("Math", false);
    let t = teacher("Alice", vec![slot.clone()], vec![math.id]);
    let c1 = class("1A", 1);
    let c2 = class("1B", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c1.clone(), c2.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: vec![slot],
        requirements: vec![
            LessonRequirement { class_id: c1.id, subject_id: math.id, teacher_id: Some(t.id), hours_per_week: 1 },
            LessonRequirement { class_id: c2.id, subject_id: math.id, teacher_id: Some(t.id), hours_per_week: 1 },
        ],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.score.hard_violations, 1);
    assert_eq!(output.violations.len(), 1);
}

#[test]
fn class_conflict_avoids_double_booking() {
    let slot1 = ts(0, 1);
    let slot2 = ts(0, 2);
    let math = subject("Math", false);
    let english = subject("English", false);
    let t1 = teacher("Alice", vec![slot1.clone(), slot2.clone()], vec![math.id]);
    let t2 = teacher("Bob", vec![slot1.clone(), slot2.clone()], vec![english.id]);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t1.clone(), t2.clone()],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone(), english.clone()],
        timeslots: vec![slot1, slot2],
        requirements: vec![
            LessonRequirement { class_id: c.id, subject_id: math.id, teacher_id: Some(t1.id), hours_per_week: 1 },
            LessonRequirement { class_id: c.id, subject_id: english.id, teacher_id: Some(t2.id), hours_per_week: 1 },
        ],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 2);
    assert_eq!(output.score.hard_violations, 0);
    // Two lessons for same class must be in different slots
    assert_ne!(output.timetable[0].timeslot, output.timetable[1].timeslot);
}

#[test]
fn teacher_availability_respected() {
    // Teacher only available in slot 2, not slot 1
    let slot1 = ts(0, 1);
    let slot2 = ts(0, 2);
    let math = subject("Math", false);
    let t = teacher("Alice", vec![slot2.clone()], vec![math.id]); // only slot2
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: vec![slot1, slot2.clone()],
        requirements: vec![LessonRequirement {
            class_id: c.id, subject_id: math.id, teacher_id: Some(t.id), hours_per_week: 1,
        }],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.timetable[0].timeslot, slot2);
}

#[test]
fn room_assigned_for_special_subject() {
    let slot = ts(0, 1);
    let science = subject("Science", true);
    let lab = room("Lab", Some(30), vec![science.id]);
    let t = teacher("Alice", vec![slot.clone()], vec![science.id]);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c.clone()],
        rooms: vec![lab.clone()],
        subjects: vec![science.clone()],
        timeslots: vec![slot],
        requirements: vec![LessonRequirement {
            class_id: c.id, subject_id: science.id, teacher_id: Some(t.id), hours_per_week: 1,
        }],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.timetable[0].room_id, Some(lab.id));
}

#[test]
fn room_conflict_assigns_different_rooms() {
    let slot = ts(0, 1);
    let science = subject("Science", true);
    let lab1 = room("Lab1", Some(30), vec![science.id]);
    let lab2 = room("Lab2", Some(30), vec![science.id]);
    let t1 = teacher("Alice", vec![slot.clone()], vec![science.id]);
    let t2 = teacher("Bob", vec![slot.clone()], vec![science.id]);
    let c1 = class("1A", 1);
    let c2 = class("1B", 1);

    let input = ScheduleInput {
        teachers: vec![t1.clone(), t2.clone()],
        classes: vec![c1.clone(), c2.clone()],
        rooms: vec![lab1.clone(), lab2.clone()],
        subjects: vec![science.clone()],
        timeslots: vec![slot],
        requirements: vec![
            LessonRequirement { class_id: c1.id, subject_id: science.id, teacher_id: Some(t1.id), hours_per_week: 1 },
            LessonRequirement { class_id: c2.id, subject_id: science.id, teacher_id: Some(t2.id), hours_per_week: 1 },
        ],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 2);
    // Both should have rooms, but different ones
    let r1 = output.timetable[0].room_id.unwrap();
    let r2 = output.timetable[1].room_id.unwrap();
    assert_ne!(r1, r2);
}

#[test]
fn auto_assigns_teacher_from_qualified() {
    let slot = ts(0, 1);
    let math = subject("Math", false);
    let t = teacher("Alice", vec![slot.clone()], vec![math.id]);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![t.clone()],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: vec![slot],
        requirements: vec![LessonRequirement {
            class_id: c.id, subject_id: math.id, teacher_id: None, // auto-assign
            hours_per_week: 1,
        }],
    };

    let output = solve(input);
    assert_eq!(output.timetable.len(), 1);
    assert_eq!(output.timetable[0].teacher_id, t.id);
}

#[test]
fn unplaceable_requirement_produces_violation() {
    // No teachers qualified, no slots — everything fails
    let math = subject("Math", false);
    let c = class("1A", 1);

    let input = ScheduleInput {
        teachers: vec![],
        classes: vec![c.clone()],
        rooms: vec![],
        subjects: vec![math.clone()],
        timeslots: vec![ts(0, 1)],
        requirements: vec![LessonRequirement {
            class_id: c.id, subject_id: math.id, teacher_id: None, hours_per_week: 1,
        }],
    };

    let output = solve(input);
    assert!(output.timetable.is_empty());
    assert_eq!(output.score.hard_violations, 1);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-scheduler`
Expected: FAIL — new tests fail because `solve()` returns empty output.

- [ ] **Step 3: Implement greedy solver in lib.rs**

Replace `scheduler/src/lib.rs`:

```rust
pub mod types;

use std::collections::{HashMap, HashSet};
use types::*;
use uuid::Uuid;

pub fn solve(input: ScheduleInput) -> ScheduleOutput {
    let mut timetable = Vec::new();
    let mut violations = Vec::new();

    // Track bookings: slot_id -> set of booked teacher/class/room ids
    let mut teacher_booked: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();
    let mut class_booked: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();
    let mut room_booked: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();

    // Track hours assigned per teacher
    let mut teacher_hours: HashMap<Uuid, u32> = HashMap::new();

    // Build teacher lookup: subject_id -> vec of teachers qualified for it
    let mut teachers_by_subject: HashMap<Uuid, Vec<&Teacher>> = HashMap::new();
    for teacher in &input.teachers {
        for &subj_id in &teacher.qualified_subjects {
            teachers_by_subject.entry(subj_id).or_default().push(teacher);
        }
    }

    // Build teacher availability lookup: teacher_id -> set of slot_ids they're available in
    let mut teacher_available_slots: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();
    for teacher in &input.teachers {
        let slots: HashSet<Uuid> = teacher.available_slots.iter().map(|s| s.id).collect();
        teacher_available_slots.insert(teacher.id, slots);
    }

    // Sort timeslots by day then period for even distribution
    let mut sorted_slots = input.timeslots.clone();
    sorted_slots.sort_by_key(|s| (s.day, s.period));

    // Expand requirements into individual lesson requests and sort most-constrained-first
    let mut lesson_requests: Vec<LessonRequest> = Vec::new();
    for req in &input.requirements {
        for _ in 0..req.hours_per_week {
            let eligible_teacher_count = if req.teacher_id.is_some() {
                1
            } else {
                teachers_by_subject.get(&req.subject_id).map_or(0, |v| v.len())
            };
            lesson_requests.push(LessonRequest {
                class_id: req.class_id,
                subject_id: req.subject_id,
                teacher_id: req.teacher_id,
                eligible_teacher_count,
            });
        }
    }
    // Most constrained first: fewer eligible teachers = higher priority
    lesson_requests.sort_by_key(|r| r.eligible_teacher_count);

    // Build room lookup: subject_id -> vec of suitable rooms
    let mut rooms_by_subject: HashMap<Uuid, Vec<&Room>> = HashMap::new();
    for room in &input.rooms {
        for &subj_id in &room.suitable_subjects {
            rooms_by_subject.entry(subj_id).or_default().push(room);
        }
    }

    // Build subject lookup
    let subjects: HashMap<Uuid, &Subject> = input.subjects.iter().map(|s| (s.id, s)).collect();

    for request in &lesson_requests {
        let needs_room = subjects.get(&request.subject_id).map_or(false, |s| s.needs_special_room);

        // Determine candidate teachers
        let candidate_teachers: Vec<&Teacher> = if let Some(tid) = request.teacher_id {
            input.teachers.iter().filter(|t| t.id == tid).collect()
        } else {
            teachers_by_subject.get(&request.subject_id).cloned().unwrap_or_default()
        };

        if candidate_teachers.is_empty() {
            violations.push(Violation {
                description: format!(
                    "No qualified teacher for subject {} in class {}",
                    request.subject_id, request.class_id
                ),
            });
            continue;
        }

        let mut placed = false;

        for slot in &sorted_slots {
            // Check class not booked
            if class_booked.get(&slot.id).map_or(false, |s| s.contains(&request.class_id)) {
                continue;
            }

            // Try each candidate teacher, prefer most remaining capacity
            let mut sorted_teachers: Vec<&&Teacher> = candidate_teachers.iter().collect();
            sorted_teachers.sort_by_key(|t| {
                let used = teacher_hours.get(&t.id).copied().unwrap_or(0);
                std::cmp::Reverse(t.max_hours_per_week.saturating_sub(used))
            });

            for teacher in sorted_teachers {
                // Check teacher not booked in this slot
                if teacher_booked.get(&slot.id).map_or(false, |s| s.contains(&teacher.id)) {
                    continue;
                }

                // Check teacher available in this slot
                if !teacher_available_slots.get(&teacher.id).map_or(false, |s| s.contains(&slot.id)) {
                    continue;
                }

                // Check teacher hasn't exceeded max hours
                let used = teacher_hours.get(&teacher.id).copied().unwrap_or(0);
                if used >= teacher.max_hours_per_week {
                    continue;
                }

                // Find room if needed
                let room_id = if needs_room {
                    let suitable = rooms_by_subject.get(&request.subject_id).cloned().unwrap_or_default();
                    let mut found = None;
                    for room in &suitable {
                        if room_booked.get(&slot.id).map_or(false, |s| s.contains(&room.id)) {
                            continue;
                        }
                        // Check capacity if class has student_count
                        if let Some(cap) = room.capacity {
                            let student_count = input.classes.iter()
                                .find(|c| c.id == request.class_id)
                                .and_then(|c| c.student_count);
                            if let Some(count) = student_count {
                                if cap < count {
                                    continue;
                                }
                            }
                        }
                        found = Some(room.id);
                        break;
                    }
                    if found.is_none() {
                        continue; // no room available in this slot, try next slot
                    }
                    found
                } else {
                    None
                };

                // Place the lesson
                timetable.push(Lesson {
                    teacher_id: teacher.id,
                    class_id: request.class_id,
                    subject_id: request.subject_id,
                    room_id,
                    timeslot: slot.clone(),
                });

                teacher_booked.entry(slot.id).or_default().insert(teacher.id);
                class_booked.entry(slot.id).or_default().insert(request.class_id);
                if let Some(rid) = room_id {
                    room_booked.entry(slot.id).or_default().insert(rid);
                }
                *teacher_hours.entry(teacher.id).or_insert(0) += 1;

                placed = true;
                break; // teacher found, stop trying teachers
            }

            if placed {
                break; // slot found, stop trying slots
            }
        }

        if !placed {
            violations.push(Violation {
                description: format!(
                    "Could not place lesson: subject {} for class {}",
                    request.subject_id, request.class_id
                ),
            });
        }
    }

    ScheduleOutput {
        timetable,
        score: Score {
            hard_violations: violations.len() as u32,
            soft_score: 0.0,
        },
        violations,
    }
}

/// Internal struct for expanded lesson requests
struct LessonRequest {
    class_id: Uuid,
    subject_id: Uuid,
    teacher_id: Option<Uuid>,
    eligible_teacher_count: usize,
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test -p klassenzeit-scheduler`
Expected: PASS — all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scheduler/
git commit -m "feat(scheduler): implement greedy most-constrained-first solver"
```

---

## Task 3: Add curriculum_entries Migration and Entity

**Files:**
- Create: `backend/migration/src/m20250403_000003_curriculum_entries.rs`
- Modify: `backend/migration/src/lib.rs`
- Create: `backend/src/models/_entities/curriculum_entries.rs`
- Modify: `backend/src/models/_entities/mod.rs`
- Modify: `backend/src/models/_entities/prelude.rs`
- Create: `backend/src/models/curriculum_entries.rs`
- Modify: `backend/src/models/mod.rs`

**Parallelizable:** Yes (independent of scheduler crate tasks)

- [ ] **Step 1: Create migration file**

Create `backend/migration/src/m20250403_000003_curriculum_entries.rs`:

```rust
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(CurriculumEntries::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(CurriculumEntries::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(CurriculumEntries::SchoolId).uuid().not_null())
                    .col(ColumnDef::new(CurriculumEntries::TermId).uuid().not_null())
                    .col(ColumnDef::new(CurriculumEntries::SchoolClassId).uuid().not_null())
                    .col(ColumnDef::new(CurriculumEntries::SubjectId).uuid().not_null())
                    .col(ColumnDef::new(CurriculumEntries::TeacherId).uuid().null())
                    .col(ColumnDef::new(CurriculumEntries::HoursPerWeek).integer().not_null())
                    .col(
                        ColumnDef::new(CurriculumEntries::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(CurriculumEntries::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CurriculumEntries::Table, CurriculumEntries::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CurriculumEntries::Table, CurriculumEntries::TermId)
                            .to(Terms::Table, Terms::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CurriculumEntries::Table, CurriculumEntries::SchoolClassId)
                            .to(SchoolClasses::Table, SchoolClasses::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CurriculumEntries::Table, CurriculumEntries::SubjectId)
                            .to(Subjects::Table, Subjects::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(CurriculumEntries::Table, CurriculumEntries::TeacherId)
                            .to(Teachers::Table, Teachers::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        // Unique: one entry per class per subject per term
        manager
            .create_index(
                Index::create()
                    .name("uq_curriculum_term_class_subject")
                    .table(CurriculumEntries::Table)
                    .col(CurriculumEntries::TermId)
                    .col(CurriculumEntries::SchoolClassId)
                    .col(CurriculumEntries::SubjectId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(CurriculumEntries::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum CurriculumEntries {
    Table,
    Id,
    SchoolId,
    TermId,
    SchoolClassId,
    SubjectId,
    TeacherId,
    HoursPerWeek,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Schools {
    Table,
    Id,
}

#[derive(Iden)]
enum Terms {
    Table,
    Id,
}

#[derive(Iden)]
enum SchoolClasses {
    Table,
    Id,
}

#[derive(Iden)]
enum Subjects {
    Table,
    Id,
}

#[derive(Iden)]
enum Teachers {
    Table,
    Id,
}
```

- [ ] **Step 2: Register migration in lib.rs**

Add to `backend/migration/src/lib.rs`:

```rust
mod m20250403_000003_curriculum_entries;
```

And add to the `vec![]` in `MigratorTrait`:

```rust
Box::new(m20250403_000003_curriculum_entries::Migration),
```

- [ ] **Step 3: Create SeaORM entity file**

Create `backend/src/models/_entities/curriculum_entries.rs`:

```rust
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "curriculum_entries")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub school_id: Uuid,
    pub term_id: Uuid,
    pub school_class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Option<Uuid>,
    pub hours_per_week: i32,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::schools::Entity",
        from = "Column::SchoolId",
        to = "super::schools::Column::Id"
    )]
    School,
    #[sea_orm(
        belongs_to = "super::terms::Entity",
        from = "Column::TermId",
        to = "super::terms::Column::Id"
    )]
    Term,
    #[sea_orm(
        belongs_to = "super::school_classes::Entity",
        from = "Column::SchoolClassId",
        to = "super::school_classes::Column::Id"
    )]
    SchoolClass,
    #[sea_orm(
        belongs_to = "super::subjects::Entity",
        from = "Column::SubjectId",
        to = "super::subjects::Column::Id"
    )]
    Subject,
    #[sea_orm(
        belongs_to = "super::teachers::Entity",
        from = "Column::TeacherId",
        to = "super::teachers::Column::Id"
    )]
    Teacher,
}

impl Related<super::schools::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::School.def()
    }
}

impl Related<super::terms::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Term.def()
    }
}

impl Related<super::school_classes::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolClass.def()
    }
}

impl Related<super::subjects::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Subject.def()
    }
}

impl Related<super::teachers::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Teacher.def()
    }
}
```

- [ ] **Step 4: Register entity in mod.rs and prelude.rs**

Add to `backend/src/models/_entities/mod.rs`:
```rust
pub mod curriculum_entries;
```

Add to `backend/src/models/_entities/prelude.rs`:
```rust
pub use super::curriculum_entries::Entity as CurriculumEntries;
```

- [ ] **Step 5: Create model helpers file**

Create `backend/src/models/curriculum_entries.rs`:

```rust
use sea_orm::entity::prelude::*;

pub use super::_entities::curriculum_entries::{ActiveModel, Column, Entity, Model, Relation};
```

Add to `backend/src/models/mod.rs`:
```rust
pub mod curriculum_entries;
```

- [ ] **Step 6: Verify compilation**

Run: `cargo check -p klassenzeit-backend`
Expected: compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add backend/migration/ backend/src/models/
git commit -m "feat: add curriculum_entries table — maps class+subject+term to hours_per_week"
```

---

## Task 4: Curriculum CRUD Controller

**Files:**
- Create: `backend/src/controllers/curriculum.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

**Depends on:** Task 3

- [ ] **Step 1: Create the curriculum controller**

Create `backend/src/controllers/curriculum.rs`:

```rust
use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::curriculum_entries;

#[derive(Debug, Deserialize)]
pub struct CreateRequest {
    pub term_id: Uuid,
    pub school_class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Option<Uuid>,
    pub hours_per_week: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRequest {
    pub teacher_id: Option<Uuid>,
    pub hours_per_week: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct CurriculumEntryResponse {
    pub id: Uuid,
    pub term_id: Uuid,
    pub school_class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Option<Uuid>,
    pub hours_per_week: i32,
    pub created_at: String,
    pub updated_at: String,
}

impl From<curriculum_entries::Model> for CurriculumEntryResponse {
    fn from(m: curriculum_entries::Model) -> Self {
        Self {
            id: m.id,
            term_id: m.term_id,
            school_class_id: m.school_class_id,
            subject_id: m.subject_id,
            teacher_id: m.teacher_id,
            hours_per_week: m.hours_per_week,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

async fn list(
    State(ctx): State<AppContext>,
    school: SchoolContext,
    Path(term_id): Path<Uuid>,
) -> impl IntoResponse {
    let entries = curriculum_entries::Entity::find()
        .filter(curriculum_entries::Column::SchoolId.eq(school.school.id))
        .filter(curriculum_entries::Column::TermId.eq(term_id))
        .all(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let responses: Vec<CurriculumEntryResponse> = entries.into_iter().map(Into::into).collect();
    Ok::<_, (StatusCode, String)>(Json(responses))
}

async fn create(
    State(ctx): State<AppContext>,
    school: SchoolContext,
    Path(term_id): Path<Uuid>,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin only".to_string()));
    }

    if body.term_id != term_id {
        return Err((StatusCode::BAD_REQUEST, "term_id in body must match URL".to_string()));
    }

    let entry = curriculum_entries::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school.school.id),
        term_id: Set(term_id),
        school_class_id: Set(body.school_class_id),
        subject_id: Set(body.subject_id),
        teacher_id: Set(body.teacher_id),
        hours_per_week: Set(body.hours_per_week),
        ..Default::default()
    };

    let result = entry
        .insert(&ctx.db)
        .await
        .map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;

    Ok::<_, (StatusCode, String)>((StatusCode::CREATED, Json(CurriculumEntryResponse::from(result))))
}

async fn update(
    State(ctx): State<AppContext>,
    school: SchoolContext,
    Path((_term_id, entry_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin only".to_string()));
    }

    let entry = curriculum_entries::Entity::find_by_id(entry_id)
        .filter(curriculum_entries::Column::SchoolId.eq(school.school.id))
        .one(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Entry not found".to_string()))?;

    let mut active: curriculum_entries::ActiveModel = entry.into();
    if let Some(teacher_id) = body.teacher_id {
        active.teacher_id = Set(Some(teacher_id));
    }
    if let Some(hours) = body.hours_per_week {
        active.hours_per_week = Set(hours);
    }

    let updated = active
        .update(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok::<_, (StatusCode, String)>(Json(CurriculumEntryResponse::from(updated)))
}

async fn delete(
    State(ctx): State<AppContext>,
    school: SchoolContext,
    Path((_term_id, entry_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if school.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin only".to_string()));
    }

    let entry = curriculum_entries::Entity::find_by_id(entry_id)
        .filter(curriculum_entries::Column::SchoolId.eq(school.school.id))
        .one(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Entry not found".to_string()))?;

    curriculum_entries::Entity::delete_by_id(entry.id)
        .exec(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok::<_, (StatusCode, String)>(StatusCode::NO_CONTENT)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}/terms")
        .add("/{term_id}/curriculum", get(list).post(create))
        .add("/{term_id}/curriculum/{entry_id}", put(update).delete(delete))
}
```

- [ ] **Step 2: Register in controllers/mod.rs and app.rs**

Add to `backend/src/controllers/mod.rs`:
```rust
pub mod curriculum;
```

Add to `app.rs` `routes()`:
```rust
.add_route(controllers::curriculum::routes())
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p klassenzeit-backend`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/ backend/src/app.rs
git commit -m "feat: add curriculum_entries CRUD endpoints"
```

---

## Task 5: Add DashMap Dependency and Scheduler Shared State

**Files:**
- Modify: `backend/Cargo.toml`
- Create: `backend/src/services/mod.rs`
- Create: `backend/src/services/scheduler.rs`
- Modify: `backend/src/lib.rs`

**Depends on:** Task 3 (needs curriculum_entries entity)

- [ ] **Step 1: Add dashmap and serde to Cargo.toml**

Add to `backend/Cargo.toml` `[dependencies]`:
```toml
dashmap = "6"
```

- [ ] **Step 2: Create services module with scheduler service**

Create `backend/src/services/mod.rs`:
```rust
pub mod scheduler;
```

Create `backend/src/services/scheduler.rs`:

```rust
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use klassenzeit_scheduler::types as sched;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::models::_entities::{
    curriculum_entries, rooms, room_subject_suitabilities, school_classes, subjects,
    teacher_availabilities, teacher_subject_qualifications, teachers, time_slots,
};

// --- Shared state types ---

#[derive(Debug, Clone, Serialize)]
pub struct SolveJob {
    pub status: SolveStatus,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<SolveResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SolveStatus {
    Solving,
    Solved,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct SolveResult {
    pub timetable: Vec<SolveLesson>,
    pub score: SolveScore,
    pub violations: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SolveLesson {
    pub teacher_id: Uuid,
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot_id: Uuid,
}

#[derive(Debug, Clone, Serialize)]
pub struct SolveScore {
    pub hard_violations: u32,
    pub soft_score: f64,
}

pub type SchedulerState = Arc<DashMap<Uuid, SolveJob>>;

pub fn new_scheduler_state() -> SchedulerState {
    Arc::new(DashMap::new())
}

// --- DB to scheduler mapping ---

pub async fn load_schedule_input(
    db: &DatabaseConnection,
    school_id: Uuid,
    term_id: Uuid,
) -> Result<sched::ScheduleInput, sea_orm::DbErr> {
    // Load all teachers for this school (active only)
    let db_teachers = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(db)
        .await?;

    // Load qualifications for these teachers
    let teacher_ids: Vec<Uuid> = db_teachers.iter().map(|t| t.id).collect();
    let qualifications = teacher_subject_qualifications::Entity::find()
        .filter(teacher_subject_qualifications::Column::TeacherId.is_in(teacher_ids.clone()))
        .all(db)
        .await?;

    // Load availabilities (for this term or default)
    let availabilities = teacher_availabilities::Entity::find()
        .filter(teacher_availabilities::Column::TeacherId.is_in(teacher_ids.clone()))
        .filter(
            teacher_availabilities::Column::TermId.eq(term_id)
                .or(teacher_availabilities::Column::TermId.is_null()),
        )
        .all(db)
        .await?;

    // Load timeslots for this school (non-break only)
    let db_timeslots = time_slots::Entity::find()
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .filter(time_slots::Column::IsBreak.eq(false))
        .all(db)
        .await?;

    let sched_timeslots: Vec<sched::TimeSlot> = db_timeslots
        .iter()
        .map(|ts| sched::TimeSlot {
            id: ts.id,
            day: ts.day_of_week as u8,
            period: ts.period as u8,
        })
        .collect();

    // Build teacher structs with availability and qualifications
    let sched_teachers: Vec<sched::Teacher> = db_teachers
        .iter()
        .map(|t| {
            let qualified_subjects: Vec<Uuid> = qualifications
                .iter()
                .filter(|q| q.teacher_id == t.id)
                .map(|q| q.subject_id)
                .collect();

            // Blocked slots for this teacher
            let blocked: std::collections::HashSet<(i16, i16)> = availabilities
                .iter()
                .filter(|a| a.teacher_id == t.id && a.availability_type == "blocked")
                .map(|a| (a.day_of_week, a.period))
                .collect();

            // Available = all timeslots minus blocked
            let available_slots: Vec<sched::TimeSlot> = sched_timeslots
                .iter()
                .filter(|ts| !blocked.contains(&(ts.day as i16, ts.period as i16)))
                .cloned()
                .collect();

            sched::Teacher {
                id: t.id,
                name: format!("{} {}", t.first_name, t.last_name),
                max_hours_per_week: t.max_hours_per_week as u32,
                is_part_time: t.is_part_time,
                available_slots,
                qualified_subjects,
            }
        })
        .collect();

    // Load classes
    let db_classes = school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .filter(school_classes::Column::IsActive.eq(true))
        .all(db)
        .await?;

    let sched_classes: Vec<sched::SchoolClass> = db_classes
        .iter()
        .map(|c| sched::SchoolClass {
            id: c.id,
            name: c.name.clone(),
            grade_level: c.grade_level as u8,
            student_count: c.student_count.map(|s| s as u32),
        })
        .collect();

    // Load subjects
    let db_subjects = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_id))
        .all(db)
        .await?;

    let sched_subjects: Vec<sched::Subject> = db_subjects
        .iter()
        .map(|s| sched::Subject {
            id: s.id,
            name: s.name.clone(),
            needs_special_room: s.needs_special_room,
        })
        .collect();

    // Load rooms (active only)
    let db_rooms = rooms::Entity::find()
        .filter(rooms::Column::SchoolId.eq(school_id))
        .filter(rooms::Column::IsActive.eq(true))
        .all(db)
        .await?;

    let room_ids: Vec<Uuid> = db_rooms.iter().map(|r| r.id).collect();
    let suitabilities = room_subject_suitabilities::Entity::find()
        .filter(room_subject_suitabilities::Column::RoomId.is_in(room_ids))
        .all(db)
        .await?;

    let sched_rooms: Vec<sched::Room> = db_rooms
        .iter()
        .map(|r| {
            let suitable_subjects: Vec<Uuid> = suitabilities
                .iter()
                .filter(|s| s.room_id == r.id)
                .map(|s| s.subject_id)
                .collect();

            sched::Room {
                id: r.id,
                name: r.name.clone(),
                capacity: r.capacity.map(|c| c as u32),
                suitable_subjects,
            }
        })
        .collect();

    // Load curriculum entries for this term
    let db_curriculum = curriculum_entries::Entity::find()
        .filter(curriculum_entries::Column::SchoolId.eq(school_id))
        .filter(curriculum_entries::Column::TermId.eq(term_id))
        .all(db)
        .await?;

    let requirements: Vec<sched::LessonRequirement> = db_curriculum
        .iter()
        .map(|c| sched::LessonRequirement {
            class_id: c.school_class_id,
            subject_id: c.subject_id,
            teacher_id: c.teacher_id,
            hours_per_week: c.hours_per_week as u32,
        })
        .collect();

    Ok(sched::ScheduleInput {
        teachers: sched_teachers,
        classes: sched_classes,
        rooms: sched_rooms,
        subjects: sched_subjects,
        timeslots: sched_timeslots,
        requirements,
    })
}

/// Convert scheduler output to serializable result
pub fn to_solve_result(output: klassenzeit_scheduler::types::ScheduleOutput) -> SolveResult {
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
        violations: output.violations.into_iter().map(|v| v.description).collect(),
    }
}
```

- [ ] **Step 3: Add services module to lib.rs**

Add to `backend/src/lib.rs`:
```rust
pub mod services;
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p klassenzeit-backend`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add backend/Cargo.toml backend/src/services/ backend/src/lib.rs
git commit -m "feat: add scheduler service — shared state and DB-to-scheduler mapping layer"
```

---

## Task 6: Scheduler Worker

**Files:**
- Create: `backend/src/workers/scheduler.rs`
- Modify: `backend/src/workers/mod.rs`
- Modify: `backend/src/app.rs`

**Depends on:** Task 5

- [ ] **Step 1: Create the scheduler worker**

Create `backend/src/workers/scheduler.rs`:

```rust
use chrono::Utc;
use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::services::scheduler::{self, SchedulerState, SolveJob, SolveStatus};

pub struct SchedulerWorker {
    pub ctx: AppContext,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct SchedulerWorkerArgs {
    pub term_id: Uuid,
    pub school_id: Uuid,
}

#[async_trait]
impl BackgroundWorker<SchedulerWorkerArgs> for SchedulerWorker {
    fn build(ctx: &AppContext) -> Self {
        Self { ctx: ctx.clone() }
    }

    async fn perform(&self, args: SchedulerWorkerArgs) -> Result<()> {
        let state: SchedulerState = self
            .ctx
            .extensions
            .get::<SchedulerState>()
            .ok_or_else(|| loco_rs::Error::string("Scheduler state not found in extensions"))?
            .clone();

        // Mark as solving
        state.insert(
            args.term_id,
            SolveJob {
                status: SolveStatus::Solving,
                started_at: Utc::now(),
                completed_at: None,
                result: None,
                error: None,
            },
        );

        // Load data and solve
        match scheduler::load_schedule_input(&self.ctx.db, args.school_id, args.term_id).await {
            Ok(input) => {
                let output = klassenzeit_scheduler::solve(input);
                let result = scheduler::to_solve_result(output);

                state.alter(&args.term_id, |_, mut job| {
                    job.status = SolveStatus::Solved;
                    job.completed_at = Some(Utc::now());
                    job.result = Some(result);
                    job
                });
            }
            Err(e) => {
                state.alter(&args.term_id, |_, mut job| {
                    job.status = SolveStatus::Failed;
                    job.completed_at = Some(Utc::now());
                    job.error = Some(e.to_string());
                    job
                });
            }
        }

        Ok(())
    }
}
```

- [ ] **Step 2: Register worker in mod.rs**

Add to `backend/src/workers/mod.rs`:
```rust
pub mod scheduler;
```

- [ ] **Step 3: Register worker and add shared state in app.rs**

In `app.rs`, add the import:
```rust
use crate::workers::scheduler::SchedulerWorker;
use crate::services::scheduler::{self as scheduler_service};
```

Update `boot()` to add shared state extension after creating the app. This requires modifying the boot method. Check the Loco docs pattern — the extensions need to be added via `after_context` or the initializer pattern.

Actually, in Loco 0.16, you add extensions to AppContext via the `after_context` hook:

```rust
async fn after_context(ctx: &mut AppContext) -> Result<()> {
    ctx.extensions.insert(scheduler_service::new_scheduler_state());
    Ok(())
}
```

Update `connect_workers()`:
```rust
async fn connect_workers(ctx: &AppContext, queue: &Queue) -> Result<()> {
    queue.register(DownloadWorker::build(ctx)).await?;
    queue.register(SchedulerWorker::build(ctx)).await?;
    Ok(())
}
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p klassenzeit-backend`
Expected: compiles. (Note: the `extensions` API on AppContext may need verification — check Loco 0.16 docs. If `extensions` is not available, use Axum's `Extension` layer instead, adding it in the `routes()` method.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/workers/ backend/src/app.rs
git commit -m "feat: add scheduler background worker with solve job state management"
```

---

## Task 7: Scheduler API Endpoints

**Files:**
- Create: `backend/src/controllers/scheduler.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

**Depends on:** Task 6

- [ ] **Step 1: Create the scheduler controller**

Create `backend/src/controllers/scheduler.rs`:

```rust
use axum::{extract::Path, http::StatusCode, response::IntoResponse, Extension, Json};
use chrono::Utc;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::Serialize;
use uuid::Uuid;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::lessons;
use crate::services::scheduler::{SchedulerState, SolveStatus};
use crate::workers::scheduler::{SchedulerWorker, SchedulerWorkerArgs};

#[derive(Debug, Serialize)]
struct StatusResponse {
    status: SolveStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    hard_violations: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    soft_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

async fn trigger_solve(
    State(ctx): State<AppContext>,
    school: SchoolContext,
    Path(term_id): Path<Uuid>,
) -> impl IntoResponse {
    if school.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin only".to_string()));
    }

    let state: SchedulerState = ctx
        .extensions
        .get::<SchedulerState>()
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Scheduler state not available".to_string()))?
        .clone();

    // Check if already solving
    if let Some(job) = state.get(&term_id) {
        if job.status == SolveStatus::Solving {
            return Err((StatusCode::CONFLICT, "Already solving for this term".to_string()));
        }
    }

    // Enqueue the worker
    SchedulerWorker::perform_later(
        &ctx,
        SchedulerWorkerArgs {
            term_id,
            school_id: school.school.id,
        },
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Pre-set status to solving so immediate status polls see it
    state.insert(
        term_id,
        crate::services::scheduler::SolveJob {
            status: SolveStatus::Solving,
            started_at: Utc::now(),
            completed_at: None,
            result: None,
            error: None,
        },
    );

    Ok::<_, (StatusCode, String)>(StatusCode::ACCEPTED)
}

async fn get_status(
    State(ctx): State<AppContext>,
    _school: SchoolContext,
    Path(term_id): Path<Uuid>,
) -> impl IntoResponse {
    let state: SchedulerState = ctx
        .extensions
        .get::<SchedulerState>()
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Scheduler state not available".to_string()))?
        .clone();

    let job = state
        .get(&term_id)
        .ok_or((StatusCode::NOT_FOUND, "No solve job for this term".to_string()))?;

    let resp = StatusResponse {
        status: job.status.clone(),
        hard_violations: job.result.as_ref().map(|r| r.score.hard_violations),
        soft_score: job.result.as_ref().map(|r| r.score.soft_score),
        error: job.error.clone(),
    };

    Ok::<_, (StatusCode, String)>(Json(resp))
}

async fn get_solution(
    State(ctx): State<AppContext>,
    _school: SchoolContext,
    Path(term_id): Path<Uuid>,
) -> impl IntoResponse {
    let state: SchedulerState = ctx
        .extensions
        .get::<SchedulerState>()
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Scheduler state not available".to_string()))?
        .clone();

    let job = state
        .get(&term_id)
        .ok_or((StatusCode::NOT_FOUND, "No solve job for this term".to_string()))?;

    if job.status != SolveStatus::Solved {
        return Err((StatusCode::NOT_FOUND, "No solution available yet".to_string()));
    }

    let result = job.result.clone().unwrap();
    Ok::<_, (StatusCode, String)>(Json(result))
}

async fn apply_solution(
    State(ctx): State<AppContext>,
    school: SchoolContext,
    Path(term_id): Path<Uuid>,
) -> impl IntoResponse {
    if school.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin only".to_string()));
    }

    let state: SchedulerState = ctx
        .extensions
        .get::<SchedulerState>()
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Scheduler state not available".to_string()))?
        .clone();

    let job = state
        .get(&term_id)
        .ok_or((StatusCode::NOT_FOUND, "No solve job for this term".to_string()))?;

    if job.status != SolveStatus::Solved {
        return Err((StatusCode::BAD_REQUEST, "No solved result to apply".to_string()));
    }

    let result = job.result.clone().unwrap();

    // Delete existing lessons for this term (replace with new schedule)
    lessons::Entity::delete_many()
        .filter(lessons::Column::TermId.eq(term_id))
        .exec(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Insert new lessons
    for lesson in &result.timetable {
        let active = lessons::ActiveModel {
            id: Set(Uuid::new_v4()),
            term_id: Set(term_id),
            school_class_id: Set(lesson.class_id),
            teacher_id: Set(lesson.teacher_id),
            subject_id: Set(lesson.subject_id),
            room_id: Set(lesson.room_id),
            timeslot_id: Set(lesson.timeslot_id),
            week_pattern: Set("every".to_string()),
            ..Default::default()
        };
        active
            .insert(&ctx.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // Clear cached solution
    state.remove(&term_id);

    Ok::<_, (StatusCode, String)>((
        StatusCode::OK,
        Json(serde_json::json!({ "lessons_created": result.timetable.len() })),
    ))
}

async fn discard_solution(
    State(ctx): State<AppContext>,
    school: SchoolContext,
    Path(term_id): Path<Uuid>,
) -> impl IntoResponse {
    if school.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin only".to_string()));
    }

    let state: SchedulerState = ctx
        .extensions
        .get::<SchedulerState>()
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "Scheduler state not available".to_string()))?
        .clone();

    state.remove(&term_id);

    Ok::<_, (StatusCode, String)>(StatusCode::NO_CONTENT)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}/terms/{term_id}/scheduler")
        .add("/solve", post(trigger_solve))
        .add("/status", get(get_status))
        .add("/solution", get(get_solution).delete(discard_solution))
        .add("/apply", post(apply_solution))
}
```

- [ ] **Step 2: Register in controllers/mod.rs and app.rs**

Add to `backend/src/controllers/mod.rs`:
```rust
pub mod scheduler;
```

Add to `app.rs` `routes()`:
```rust
.add_route(controllers::scheduler::routes())
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p klassenzeit-backend`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/ backend/src/app.rs
git commit -m "feat: add scheduler API endpoints — solve, status, solution, apply, discard"
```

---

## Task 8: Frontend Types and i18n

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/messages/en.json`
- Modify: `frontend/src/messages/de.json`

**Parallelizable:** Yes (independent of backend tasks, but best done after Task 7 is planned)

- [ ] **Step 1: Add types to types.ts**

Append to `frontend/src/lib/types.ts`:

```typescript
export interface CurriculumEntryResponse {
  id: string;
  term_id: string;
  school_class_id: string;
  subject_id: string;
  teacher_id: string | null;
  hours_per_week: number;
  created_at: string;
  updated_at: string;
}

export interface SchedulerStatusResponse {
  status: "solving" | "solved" | "failed";
  hard_violations?: number;
  soft_score?: number;
  error?: string;
}

export interface SolveResult {
  timetable: SolveLesson[];
  score: { hard_violations: number; soft_score: number };
  violations: string[];
}

export interface SolveLesson {
  teacher_id: string;
  class_id: string;
  subject_id: string;
  room_id: string | null;
  timeslot_id: string;
}

export interface SubjectResponse {
  id: string;
  name: string;
  abbreviation: string;
  color: string | null;
  needs_special_room: boolean;
}

export interface TeacherResponse {
  id: string;
  first_name: string;
  last_name: string;
  abbreviation: string;
}

export interface SchoolClassResponse {
  id: string;
  name: string;
  grade_level: number;
  student_count: number | null;
}

export interface RoomResponse {
  id: string;
  name: string;
  building: string | null;
  capacity: number | null;
}

export interface TimeSlotResponse {
  id: string;
  day_of_week: number;
  period: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  label: string | null;
}

export interface TermResponse {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}
```

- [ ] **Step 2: Add i18n translations**

Add to `frontend/src/messages/en.json` (new namespaces `curriculum` and `scheduler`):

```json
"curriculum": {
  "title": "Curriculum",
  "description": "Define weekly hours per class and subject",
  "addClass": "Add Entry",
  "class": "Class",
  "subject": "Subject",
  "teacher": "Teacher",
  "hoursPerWeek": "Hours/Week",
  "noEntries": "No curriculum entries yet. Add entries to define what needs to be scheduled.",
  "selectClass": "Select class",
  "selectSubject": "Select subject",
  "selectTeacher": "Select teacher (optional)",
  "autoAssign": "Auto-assign",
  "deleteConfirm": "Delete this curriculum entry?",
  "saved": "Curriculum entry saved",
  "deleted": "Curriculum entry deleted"
},
"scheduler": {
  "title": "Generate Schedule",
  "description": "Generate a timetable for the selected term",
  "generate": "Generate Schedule",
  "generating": "Generating schedule...",
  "solved": "Schedule generated",
  "failed": "Schedule generation failed",
  "violations": "Violations",
  "noViolations": "No violations — all lessons placed successfully",
  "apply": "Apply Schedule",
  "applyConfirm": "Apply this schedule? This will replace any existing timetable for this term.",
  "applied": "Schedule applied successfully",
  "discard": "Discard",
  "discarded": "Schedule discarded",
  "preview": "Preview",
  "selectClass": "Select class to view",
  "lessonsCreated": "lessons created",
  "noSchedule": "No schedule generated yet. Click \"Generate Schedule\" to start.",
  "hardViolations": "Unplaced lessons",
  "alreadySolving": "A schedule is already being generated"
}
```

Add equivalent German translations to `frontend/src/messages/de.json`:

```json
"curriculum": {
  "title": "Stundentafel",
  "description": "Wochenstunden pro Klasse und Fach festlegen",
  "addClass": "Eintrag hinzufügen",
  "class": "Klasse",
  "subject": "Fach",
  "teacher": "Lehrkraft",
  "hoursPerWeek": "Stunden/Woche",
  "noEntries": "Noch keine Einträge. Fügen Sie Einträge hinzu, um festzulegen, was geplant werden soll.",
  "selectClass": "Klasse auswählen",
  "selectSubject": "Fach auswählen",
  "selectTeacher": "Lehrkraft auswählen (optional)",
  "autoAssign": "Automatisch zuweisen",
  "deleteConfirm": "Diesen Eintrag löschen?",
  "saved": "Eintrag gespeichert",
  "deleted": "Eintrag gelöscht"
},
"scheduler": {
  "title": "Stundenplan erstellen",
  "description": "Erstellen Sie einen Stundenplan für das ausgewählte Halbjahr",
  "generate": "Stundenplan erstellen",
  "generating": "Stundenplan wird erstellt...",
  "solved": "Stundenplan erstellt",
  "failed": "Stundenplanerstellung fehlgeschlagen",
  "violations": "Konflikte",
  "noViolations": "Keine Konflikte — alle Stunden wurden erfolgreich platziert",
  "apply": "Stundenplan übernehmen",
  "applyConfirm": "Diesen Stundenplan übernehmen? Der bestehende Stundenplan für dieses Halbjahr wird ersetzt.",
  "applied": "Stundenplan erfolgreich übernommen",
  "discard": "Verwerfen",
  "discarded": "Stundenplan verworfen",
  "preview": "Vorschau",
  "selectClass": "Klasse auswählen",
  "lessonsCreated": "Stunden erstellt",
  "noSchedule": "Noch kein Stundenplan erstellt. Klicken Sie auf \"Stundenplan erstellen\".",
  "hardViolations": "Nicht platzierte Stunden",
  "alreadySolving": "Ein Stundenplan wird bereits erstellt"
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/messages/
git commit -m "feat(frontend): add types and i18n for curriculum and scheduler"
```

---

## Task 9: Frontend Curriculum Page

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/layout.tsx`

**Depends on:** Task 8

- [ ] **Step 1: Create the curriculum page**

Create `frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx`:

```tsx
"use client";

import { useApiClient } from "@/hooks/use-api-client";
import type {
  CurriculumEntryResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TermResponse,
} from "@/lib/types";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function CurriculumPage() {
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");
  const apiClient = useApiClient();
  const params = useParams();
  const schoolId = params.id as string;

  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CurriculumEntryResponse[]>([]);
  const [classes, setClasses] = useState<SchoolClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formClassId, setFormClassId] = useState("");
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formHours, setFormHours] = useState("1");
  const [creating, setCreating] = useState(false);

  // Load reference data
  useEffect(() => {
    Promise.all([
      apiClient.get<TermResponse[]>(`/api/schools/${schoolId}/terms`),
      apiClient.get<SchoolClassResponse[]>(`/api/schools/${schoolId}/classes`),
      apiClient.get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`),
      apiClient.get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`),
    ])
      .then(([termsData, classesData, subjectsData, teachersData]) => {
        setTerms(termsData);
        setClasses(classesData);
        setSubjects(subjectsData);
        setTeachers(teachersData);
        const current = termsData.find((t) => t.is_current);
        if (current) setSelectedTermId(current.id);
        else if (termsData.length > 0) setSelectedTermId(termsData[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiClient, schoolId]);

  const loadEntries = useCallback(() => {
    if (!selectedTermId) return;
    apiClient
      .get<CurriculumEntryResponse[]>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/curriculum`
      )
      .then(setEntries)
      .catch(() => {});
  }, [apiClient, schoolId, selectedTermId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleCreate = async () => {
    if (!selectedTermId || !formClassId || !formSubjectId || creating) return;
    setCreating(true);
    try {
      await apiClient.post(
        `/api/schools/${schoolId}/terms/${selectedTermId}/curriculum`,
        {
          term_id: selectedTermId,
          school_class_id: formClassId,
          subject_id: formSubjectId,
          teacher_id: formTeacherId || null,
          hours_per_week: parseInt(formHours, 10),
        }
      );
      toast.success(t("saved"));
      setDialogOpen(false);
      setFormClassId("");
      setFormSubjectId("");
      setFormTeacherId("");
      setFormHours("1");
      loadEntries();
    } catch {
      toast.error(tc("errors.generic"));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!selectedTermId) return;
    try {
      await apiClient.delete(
        `/api/schools/${schoolId}/terms/${selectedTermId}/curriculum/${entryId}`
      );
      toast.success(t("deleted"));
      loadEntries();
    } catch {
      toast.error(tc("errors.generic"));
    }
  };

  const className = (id: string) =>
    classes.find((c) => c.id === id)?.name ?? id;
  const subjectName = (id: string) =>
    subjects.find((s) => s.id === id)?.name ?? id;
  const teacherName = (id: string | null) => {
    if (!id) return t("autoAssign");
    const teacher = teachers.find((t) => t.id === id);
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : id;
  };

  if (loading) return <div>{tc("loading")}</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-4">
          {terms.length > 0 && (
            <Select
              value={selectedTermId ?? ""}
              onValueChange={setSelectedTermId}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addClass")}
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">{t("noEntries")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("class")}</TableHead>
              <TableHead>{t("subject")}</TableHead>
              <TableHead>{t("teacher")}</TableHead>
              <TableHead>{t("hoursPerWeek")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{className(entry.school_class_id)}</TableCell>
                <TableCell>{subjectName(entry.subject_id)}</TableCell>
                <TableCell>{teacherName(entry.teacher_id)}</TableCell>
                <TableCell>{entry.hours_per_week}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addClass")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("class")}</Label>
              <Select value={formClassId} onValueChange={setFormClassId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectClass")} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("subject")}</Label>
              <Select value={formSubjectId} onValueChange={setFormSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectSubject")} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("teacher")}</Label>
              <Select value={formTeacherId} onValueChange={setFormTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectTeacher")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("autoAssign")}</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.first_name} {teacher.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("hoursPerWeek")}</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={formHours}
                onChange={(e) => setFormHours(e.target.value)}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={!formClassId || !formSubjectId || creating}
              className="w-full"
            >
              {creating ? tc("loading") : tc("save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Add navigation link in school layout**

In `frontend/src/app/[locale]/schools/[id]/layout.tsx`, add a sidebar menu item for Curriculum. Add it alongside the existing Dashboard and Members links:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton asChild isActive={pathname.endsWith("/curriculum")}>
    <Link href={`/${locale}/schools/${schoolId}/curriculum`}>
      <BookOpen className="h-4 w-4" />
      {t("curriculum.title")}
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Import `BookOpen` from `lucide-react` and add `"curriculum.title"` key to the layout's translation namespace (or use the curriculum namespace directly).

- [ ] **Step 3: Verify it renders**

Run: `cd frontend && bun run build`
Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\[locale\]/schools/\[id\]/curriculum/ frontend/src/app/\[locale\]/schools/\[id\]/layout.tsx
git commit -m "feat(frontend): add curriculum management page"
```

---

## Task 10: Frontend Schedule Generation Page

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/layout.tsx`

**Depends on:** Task 8

- [ ] **Step 1: Create the schedule generation page**

Create `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx`:

```tsx
"use client";

import { useApiClient } from "@/hooks/use-api-client";
import type {
  SchedulerStatusResponse,
  SolveResult,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  RoomResponse,
  TimeSlotResponse,
  TermResponse,
} from "@/lib/types";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Check, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr"];

export default function SchedulePage() {
  const t = useTranslations("scheduler");
  const tc = useTranslations("common");
  const apiClient = useApiClient();
  const params = useParams();
  const locale = params.locale as string;
  const schoolId = params.id as string;

  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [status, setStatus] = useState<SchedulerStatusResponse | null>(null);
  const [solution, setSolution] = useState<SolveResult | null>(null);
  const [classes, setClasses] = useState<SchoolClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const dayLabels = locale === "de" ? DAYS_DE : DAYS;

  // Load reference data
  useEffect(() => {
    Promise.all([
      apiClient.get<TermResponse[]>(`/api/schools/${schoolId}/terms`),
      apiClient.get<SchoolClassResponse[]>(`/api/schools/${schoolId}/classes`),
      apiClient.get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`),
      apiClient.get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`),
      apiClient.get<RoomResponse[]>(`/api/schools/${schoolId}/rooms`),
      apiClient.get<TimeSlotResponse[]>(`/api/schools/${schoolId}/timeslots`),
    ])
      .then(([termsData, classesData, subjectsData, teachersData, roomsData, tsData]) => {
        setTerms(termsData);
        setClasses(classesData);
        setSubjects(subjectsData);
        setTeachers(teachersData);
        setRooms(roomsData);
        setTimeslots(tsData.filter((ts) => !ts.is_break));
        const current = termsData.find((t) => t.is_current);
        if (current) setSelectedTermId(current.id);
        else if (termsData.length > 0) setSelectedTermId(termsData[0].id);
        if (classesData.length > 0) setSelectedClassId(classesData[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiClient, schoolId]);

  // Poll for status
  const pollStatus = useCallback(() => {
    if (!selectedTermId) return;
    apiClient
      .get<SchedulerStatusResponse>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/status`
      )
      .then((s) => {
        setStatus(s);
        if (s.status === "solved") {
          apiClient
            .get<SolveResult>(
              `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/solution`
            )
            .then(setSolution);
        }
        if (s.status !== "solving" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      })
      .catch(() => {
        setStatus(null);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      });
  }, [apiClient, schoolId, selectedTermId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (!selectedTermId) return;
    try {
      await apiClient.post(
        `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/solve`
      );
      setStatus({ status: "solving" });
      setSolution(null);
      // Start polling
      pollRef.current = setInterval(pollStatus, 2000);
    } catch {
      toast.error(t("alreadySolving"));
    }
  };

  const handleApply = async () => {
    if (!selectedTermId) return;
    try {
      const result = await apiClient.post<{ lessons_created: number }>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/apply`
      );
      toast.success(`${t("applied")} — ${result.lessons_created} ${t("lessonsCreated")}`);
      setStatus(null);
      setSolution(null);
      setApplyDialogOpen(false);
    } catch {
      toast.error(tc("errors.generic"));
    }
  };

  const handleDiscard = async () => {
    if (!selectedTermId) return;
    try {
      await apiClient.delete(
        `/api/schools/${schoolId}/terms/${selectedTermId}/scheduler/solution`
      );
      toast.success(t("discarded"));
      setStatus(null);
      setSolution(null);
    } catch {
      toast.error(tc("errors.generic"));
    }
  };

  // Build timetable grid for selected class
  const periods = [...new Set(timeslots.map((ts) => ts.period))].sort(
    (a, b) => a - b
  );

  const getLesson = (day: number, period: number) => {
    if (!solution) return null;
    const ts = timeslots.find(
      (t) => t.day_of_week === day && t.period === period
    );
    if (!ts) return null;
    return solution.timetable.find(
      (l) => l.timeslot_id === ts.id && l.class_id === selectedClassId
    );
  };

  const subjectInfo = (id: string) => subjects.find((s) => s.id === id);
  const teacherAbbr = (id: string) =>
    teachers.find((t) => t.id === id)?.abbreviation ?? "";
  const roomName = (id: string | null) =>
    id ? (rooms.find((r) => r.id === id)?.name ?? "") : "";

  if (loading) return <div className="p-6">{tc("loading")}</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-4">
          {terms.length > 0 && (
            <Select
              value={selectedTermId ?? ""}
              onValueChange={(v) => {
                setSelectedTermId(v);
                setStatus(null);
                setSolution(null);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={handleGenerate}
            disabled={status?.status === "solving"}
          >
            {status?.status === "solving" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {status?.status === "solving" ? t("generating") : t("generate")}
          </Button>
        </div>
      </div>

      {/* Status banner */}
      {status?.status === "failed" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {t("failed")}: {status.error}
        </div>
      )}

      {/* Solution preview */}
      {solution && (
        <>
          {/* Score + violations */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              {solution.score.hard_violations === 0 ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              <span>
                {t("hardViolations")}: {solution.score.hard_violations}
              </span>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setApplyDialogOpen(true)}>
                <Check className="mr-2 h-4 w-4" />
                {t("apply")}
              </Button>
              <Button variant="outline" onClick={handleDiscard}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("discard")}
              </Button>
            </div>
          </div>

          {/* Violations list */}
          {solution.violations.length > 0 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <h3 className="mb-2 font-semibold">{t("violations")}</h3>
              <ul className="list-disc pl-4 text-sm">
                {solution.violations.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Class selector */}
          <div className="flex items-center gap-4">
            <span className="font-medium">{t("selectClass")}:</span>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Timetable grid */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr>
                  <th className="border p-2" />
                  {[0, 1, 2, 3, 4].map((day) => (
                    <th key={day} className="border p-2 text-center">
                      {dayLabels[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period}>
                    <td className="border p-2 text-center font-medium">
                      {period}
                    </td>
                    {[0, 1, 2, 3, 4].map((day) => {
                      const lesson = getLesson(day, period);
                      const subj = lesson ? subjectInfo(lesson.subject_id) : null;
                      return (
                        <td
                          key={day}
                          className="border p-2 text-center text-sm"
                          style={
                            subj?.color
                              ? { backgroundColor: `${subj.color}20` }
                              : undefined
                          }
                        >
                          {lesson && subj ? (
                            <div>
                              <div className="font-semibold">
                                {subj.abbreviation}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {teacherAbbr(lesson.teacher_id)}
                                {lesson.room_id
                                  ? ` / ${roomName(lesson.room_id)}`
                                  : ""}
                              </div>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!solution && status?.status !== "solving" && (
        <p className="text-muted-foreground">{t("noSchedule")}</p>
      )}

      {/* Apply confirmation dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apply")}</DialogTitle>
          </DialogHeader>
          <p>{t("applyConfirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleApply}>{t("apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Add navigation link in school layout**

In the same layout file updated in Task 9, add another sidebar menu item for Schedule:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton asChild isActive={pathname.endsWith("/schedule")}>
    <Link href={`/${locale}/schools/${schoolId}/schedule`}>
      <Calendar className="h-4 w-4" />
      {t("scheduler.title")}
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Import `Calendar` from `lucide-react`.

- [ ] **Step 3: Verify it renders**

Run: `cd frontend && bun run build`
Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\[locale\]/schools/\[id\]/schedule/ frontend/src/app/\[locale\]/schools/\[id\]/layout.tsx
git commit -m "feat(frontend): add schedule generation page with timetable preview"
```

---

## Task 11: Final Integration Verification

**Files:** None (verification only)

**Depends on:** All previous tasks

- [ ] **Step 1: Run all backend tests**

Run: `cargo test --workspace`
Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && bun run build`
Expected: builds without errors.

- [ ] **Step 3: Run linters**

Run: `just check` (or the equivalent lint commands)
Expected: no lint errors.

- [ ] **Step 4: Final commit if any fixes needed**

Fix any issues found in steps 1-3, then commit.

---

## Dependency Graph

```
Task 1 (scheduler types) ──→ Task 2 (greedy solver)
                                    ↓
Task 3 (curriculum migration) ──→ Task 4 (curriculum CRUD)
         ↓                              ↓
Task 5 (scheduler service) ──→ Task 6 (worker) ──→ Task 7 (scheduler API)
                                                           ↓
Task 8 (frontend types+i18n) ──→ Task 9 (curriculum page)
                                  Task 10 (schedule page)
                                           ↓
                                  Task 11 (integration verify)
```

**Parallel groups:**
- Group A: Task 1 → Task 2 (scheduler crate)
- Group B: Task 3 → Task 4 (curriculum migration + CRUD)
- Group C: Task 8 (frontend types) — can start after Tasks 4+7 are designed

Tasks 5-7 depend on both Groups A and B completing.
Tasks 9-10 depend on Task 8 and the backend tasks.

---

## Notes for Implementers

**Loco `AppContext.extensions`:** Loco 0.16 uses `Extensions` on `AppContext`. If this API isn't available, use Axum's `Extension` layer instead — add `.layer(Extension(scheduler_state))` in the `routes()` method and extract with `Extension(state): Extension<SchedulerState>` in handlers. Check `loco-rs` 0.16 docs/source to confirm which pattern to use.

**Backend integration tests:** The spec calls for API endpoint integration tests. These require a running Postgres and are complex to set up. The scheduler crate has comprehensive unit tests (Task 2). Backend API integration tests should be added as a follow-up once the endpoints are working end-to-end.

**Frontend API endpoints for reference data:** Tasks 9 and 10 assume GET endpoints exist for `/api/schools/{id}/terms`, `/api/schools/{id}/classes`, `/api/schools/{id}/subjects`, `/api/schools/{id}/teachers`, `/api/schools/{id}/rooms`, `/api/schools/{id}/timeslots`. If these don't exist yet, they need to be created as simple list endpoints following the existing schools/members controller pattern. Check existing controllers before implementing the frontend.
