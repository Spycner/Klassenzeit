# Room Capacity / Gym Splitting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow rooms to host multiple classes simultaneously with per-timeslot capacity overrides, solving the Sporthalle bottleneck.

**Architecture:** Add `max_concurrent` field to Room + per-timeslot override map. Modify the room conflict constraint to penalize when occupant count exceeds per-slot capacity instead of > 1. Backend gets a new migration column + join table, API extensions, and frontend gets a capacity grid editor.

**Tech Stack:** Rust (scheduler crate), Loco/SeaORM (backend), Next.js/React (frontend), PostgreSQL

---

### Task 1: Scheduler — Extend Room types

**Files:**
- Modify: `scheduler/src/types.rs:56-62`
- Modify: `scheduler/src/planning.rs:94-99`

- [ ] **Step 1: Add fields to `Room` in types.rs**

```rust
use std::collections::HashMap;

// ... existing imports ...

#[derive(Debug, Clone)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub capacity: Option<u32>,
    pub suitable_subjects: Vec<Uuid>,
    pub max_concurrent: u8,
    pub timeslot_capacity_overrides: HashMap<TimeSlot, u8>,
}
```

- [ ] **Step 2: Add `max_concurrent_at_slot` to `RoomFact` in planning.rs**

```rust
#[derive(Debug, Clone)]
pub struct RoomFact {
    pub capacity: Option<u32>,
    /// Bit i is set if this room is suitable for subject i.
    pub suitable_subjects: BitVec,
    /// Per-timeslot max concurrent classes. Indexed by timeslot index.
    pub max_concurrent_at_slot: Vec<u8>,
}
```

- [ ] **Step 3: Fix all compilation errors from added fields**

Every `Room { .. }` construction site now needs `max_concurrent` and `timeslot_capacity_overrides`. Every `RoomFact { .. }` needs `max_concurrent_at_slot`. Find and fix them all:

In `scheduler/src/instances.rs`, update `make_klassenraum`:
```rust
fn make_klassenraum(name: &str) -> Room {
    Room {
        id: uuid(&format!("room-{name}")),
        name: name.into(),
        capacity: Some(30),
        suitable_subjects: vec![],
        max_concurrent: 1,
        timeslot_capacity_overrides: HashMap::new(),
    }
}
```

Update `make_sporthalle`:
```rust
fn make_sporthalle(sport_id: Uuid) -> Room {
    Room {
        id: uuid("room-sporthalle"),
        name: "Sporthalle".into(),
        capacity: Some(30),
        suitable_subjects: vec![sport_id],
        max_concurrent: 1,
        timeslot_capacity_overrides: HashMap::new(),
    }
}
```

Add `use std::collections::HashMap;` to the top of `instances.rs`.

In `scheduler/src/mapper.rs`, update the `to_planning` Room → RoomFact mapping (around line 166):
```rust
rooms.push(RoomFact {
    capacity: r.capacity,
    suitable_subjects,
    max_concurrent_at_slot: {
        let mut caps = vec![r.max_concurrent; num_timeslots];
        for (ts, &cap) in &r.timeslot_capacity_overrides {
            if let Some(&idx) = timeslot_uuid_to_idx.get(&ts.id) {
                caps[idx] = cap;
            }
        }
        caps
    },
});
```

In mapper.rs test `round_trip_single_lesson`, the `Room` vec is empty so no changes needed there.

In `scheduler/src/lib.rs` — no changes needed (Room structs come from callers).

- [ ] **Step 4: Run `cargo check -p klassenzeit-scheduler`**

Expected: compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/types.rs scheduler/src/planning.rs scheduler/src/mapper.rs scheduler/src/instances.rs
git commit -m "feat(scheduler): add max_concurrent and per-timeslot capacity to Room types"
```

---

### Task 2: Scheduler — Update brute-force constraint scoring

**Files:**
- Modify: `scheduler/src/constraints.rs:1-193` (the `full_evaluate` function)

- [ ] **Step 1: Write a failing test for room capacity > 1**

Add to `scheduler/src/constraints.rs` (or a new test module). This test creates a room with `max_concurrent_at_slot = [2, 2]` and verifies that 2 lessons in the same slot produce 0 hard violations, while 3 produce 1.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::planning::*;
    use bitvec::prelude::*;

    fn make_facts_with_room_capacity(cap: u8, num_timeslots: usize) -> ProblemFacts {
        ProblemFacts {
            timeslots: (0..num_timeslots)
                .map(|i| Timeslot { day: 0, period: i as u8 })
                .collect(),
            rooms: vec![RoomFact {
                capacity: None,
                suitable_subjects: bitvec![1; 1],
                max_concurrent_at_slot: vec![cap; num_timeslots],
            }],
            teachers: vec![
                TeacherFact {
                    max_hours: 28,
                    available_slots: bitvec![1; num_timeslots],
                    qualified_subjects: bitvec![1; 1],
                    preferred_slots: bitvec![1; num_timeslots],
                },
                TeacherFact {
                    max_hours: 28,
                    available_slots: bitvec![1; num_timeslots],
                    qualified_subjects: bitvec![1; 1],
                    preferred_slots: bitvec![1; num_timeslots],
                },
                TeacherFact {
                    max_hours: 28,
                    available_slots: bitvec![1; num_timeslots],
                    qualified_subjects: bitvec![1; 1],
                    preferred_slots: bitvec![1; num_timeslots],
                },
            ],
            classes: vec![
                ClassFact { student_count: None, class_teacher_idx: None, available_slots: bitvec![1; num_timeslots] },
                ClassFact { student_count: None, class_teacher_idx: None, available_slots: bitvec![1; num_timeslots] },
                ClassFact { student_count: None, class_teacher_idx: None, available_slots: bitvec![1; num_timeslots] },
            ],
            subjects: vec![SubjectFact { needs_special_room: true }],
        }
    }

    #[test]
    fn room_cap_2_allows_two_lessons_same_slot() {
        let facts = make_facts_with_room_capacity(2, 2);
        let lessons = vec![
            PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: Some(0), room: Some(0) },
            PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 1, class_idx: 1, timeslot: Some(0), room: Some(0) },
        ];
        let score = full_evaluate(&lessons, &facts);
        assert_eq!(score.hard, 0, "2 lessons in room with cap 2 should be 0 hard violations");
    }

    #[test]
    fn room_cap_2_penalizes_third_lesson() {
        let facts = make_facts_with_room_capacity(2, 2);
        let lessons = vec![
            PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: Some(0), room: Some(0) },
            PlanningLesson { id: 1, subject_idx: 0, teacher_idx: 1, class_idx: 1, timeslot: Some(0), room: Some(0) },
            PlanningLesson { id: 2, subject_idx: 0, teacher_idx: 2, class_idx: 2, timeslot: Some(0), room: Some(0) },
        ];
        let score = full_evaluate(&lessons, &facts);
        assert_eq!(score.hard, -1, "3 lessons in room with cap 2 should be -1 hard");
    }

    #[test]
    fn room_cap_0_penalizes_any_lesson() {
        let facts = make_facts_with_room_capacity(0, 2);
        let lessons = vec![
            PlanningLesson { id: 0, subject_idx: 0, teacher_idx: 0, class_idx: 0, timeslot: Some(0), room: Some(0) },
        ];
        let score = full_evaluate(&lessons, &facts);
        assert_eq!(score.hard, -1, "1 lesson in room with cap 0 should be -1 hard");
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-scheduler -- constraints::tests --nocapture`
Expected: FAIL — current brute-force penalizes any pair with same room, not capacity-aware.

- [ ] **Step 3: Update `full_evaluate` room conflict logic**

Replace the pairwise room conflict check (lines 33-38) with a count-based approach. After the pairwise loop, add a room occupancy count section. The new room conflict replaces the old one inside the pairwise loop:

Remove the old room conflict block (lines 33-38):
```rust
                // 3. Room conflict (skip if either room is None)
                if let (Some(ra), Some(rb)) = (a.room, b.room) {
                    if ra == rb {
                        score += HardSoftScore::hard(-1);
                    }
                }
```

And add a new post-loop section after the pairwise loop (before the per-lesson constraints), replacing the pairwise room conflict with a count-based approach:

```rust
    // 3. Room conflict — count-based with per-slot capacity
    {
        let num_rooms = facts.rooms.len();
        let num_ts = facts.timeslots.len();
        let mut room_at_slot = vec![vec![0u16; num_ts]; num_rooms];
        for lesson in &assigned {
            if let (Some(room), Some(ts)) = (lesson.room, lesson.timeslot) {
                room_at_slot[room][ts] += 1;
            }
        }
        for (room_idx, slots) in room_at_slot.iter().enumerate() {
            for (ts_idx, &count) in slots.iter().enumerate() {
                let cap = facts.rooms[room_idx].max_concurrent_at_slot[ts_idx] as u16;
                if count > cap {
                    // Each excess occupant beyond capacity is one violation
                    score += HardSoftScore::hard(-((count - cap) as i64));
                }
            }
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p klassenzeit-scheduler -- constraints::tests --nocapture`
Expected: all 3 new tests PASS.

- [ ] **Step 5: Run full scheduler test suite**

Run: `cargo test -p klassenzeit-scheduler`
Expected: All existing tests pass (proptest agreement between brute-force and incremental will fail — that's expected, fixed in Task 3).

- [ ] **Step 6: Commit**

```bash
git add scheduler/src/constraints.rs
git commit -m "feat(scheduler): update brute-force room conflict to use per-slot capacity"
```

---

### Task 3: Scheduler — Update incremental constraint scoring

**Files:**
- Modify: `scheduler/src/constraints.rs:285-573` (`IncrementalState` methods)

- [ ] **Step 1: Update `evaluate_assign` room conflict delta**

Replace lines 301-304:
```rust
        if let Some(r) = room {
            let k_room = self.room_at_slot[r][timeslot] as i64;
            delta += HardSoftScore::hard(-k_room);
        }
```

With:
```rust
        if let Some(r) = room {
            let k_room = self.room_at_slot[r][timeslot];
            let cap = facts.rooms[r].max_concurrent_at_slot[timeslot] as u16;
            if k_room >= cap {
                delta += HardSoftScore::hard(-1);
            }
        }
```

- [ ] **Step 2: Update `unassign` room conflict delta**

In the `unassign` method, replace the room conflict delta (around lines 469-472):
```rust
        if let Some(r) = room {
            let k_room = self.room_at_slot[r][timeslot] as i64;
            delta += HardSoftScore::hard(k_room);
        }
```

With:
```rust
        if let Some(r) = room {
            let k_room = self.room_at_slot[r][timeslot];
            let cap = facts.rooms[r].max_concurrent_at_slot[timeslot] as u16;
            if k_room >= cap {
                delta += HardSoftScore::hard(1);
            }
        }
```

Note: `unassign` decrements counters first (line 457), so `k_room` is the count AFTER removal. If `k_room >= cap`, the room was still over-capacity even after removing this lesson, so one violation is recovered. If `k_room < cap`, removing this lesson brought it below capacity, so the violation was already counted when it was the one that pushed it over.

Wait — the logic needs to match the brute-force. In the current code, `unassign` decrements counters first, then the remaining count represents "how many conflicts are removed." With capacity-based logic:

- Before removal: count was `k_room + 1`. Was it over capacity? `k_room + 1 > cap` ↔ `k_room >= cap`.
- So if `k_room >= cap`, removing this lesson removes one violation → `delta += hard(1)`.

That matches the code above. Correct.

- [ ] **Step 3: Run the proptest to verify brute-force/incremental agreement**

Run: `cargo test -p klassenzeit-scheduler -- proptest --nocapture`
Expected: PASS (brute-force and incremental now agree on capacity-aware scoring).

- [ ] **Step 4: Run full test suite**

Run: `cargo test -p klassenzeit-scheduler`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add scheduler/src/constraints.rs
git commit -m "feat(scheduler): update incremental room conflict scoring for per-slot capacity"
```

---

### Task 4: Scheduler — Update proptest to generate varied room capacities

**Files:**
- Modify: `scheduler/tests/proptest_scoring.rs` (or wherever the proptest lives)

- [ ] **Step 1: Find the proptest file**

Run: `find scheduler -name "*.rs" | xargs grep -l "proptest"` to locate it.

- [ ] **Step 2: Update room generation in proptest to use random max_concurrent**

In the proptest strategy that generates `RoomFact`, add `max_concurrent_at_slot` with random values between 0 and 3 per timeslot. This ensures the property test exercises capacity > 1 scenarios.

For the room fact generation, change from:
```rust
RoomFact {
    capacity: /* ... */,
    suitable_subjects: /* ... */,
}
```

To:
```rust
RoomFact {
    capacity: /* ... */,
    suitable_subjects: /* ... */,
    max_concurrent_at_slot: (0..num_timeslots).map(|_| rng.gen_range(0..=3)).collect(),
}
```

The exact change depends on the proptest structure — adapt as needed but ensure `max_concurrent_at_slot` is generated with varied values.

- [ ] **Step 3: Run proptest**

Run: `cargo test -p klassenzeit-scheduler -- proptest`
Expected: PASS with the new room capacity variations.

- [ ] **Step 4: Commit**

```bash
git add scheduler/tests/
git commit -m "test(scheduler): extend proptest to generate rooms with varied max_concurrent"
```

---

### Task 5: Scheduler — Update stress instance and construction heuristic

**Files:**
- Modify: `scheduler/src/instances.rs:158-165` (make_sporthalle)
- Modify: `scheduler/src/instances.rs:514-686` (stress_16_classes)
- Modify: `scheduler/src/construction.rs:92-114` (constraint_tightness)

- [ ] **Step 1: Write a test that the stress instance can reach 0 hard violations**

Add in `scheduler/src/instances.rs` tests module:
```rust
#[test]
fn stress_instance_is_feasible_with_gym_cap_2() {
    let mut input = stress_16_classes();
    // Set Sporthalle (last room) to max_concurrent: 2
    input.rooms.last_mut().unwrap().max_concurrent = 2;
    let output = crate::solve(input);
    assert_eq!(
        output.score.hard_violations, 0,
        "stress instance with gym capacity 2 should be feasible, got {} hard violations",
        output.score.hard_violations
    );
}
```

- [ ] **Step 2: Run test to verify it fails (with current max_concurrent=1)**

Run: `cargo test -p klassenzeit-scheduler -- stress_instance_is_feasible`
Expected: FAIL — currently infeasible.

- [ ] **Step 3: Set stress instance Sporthalle to max_concurrent: 2**

In `stress_16_classes()` (around line 636), after `rooms.push(make_sporthalle(ss.sport))`:
```rust
    rooms.push(make_sporthalle(ss.sport));
    // Sporthalle can host 2 classes simultaneously
    rooms.last_mut().unwrap().max_concurrent = 2;
```

- [ ] **Step 4: Update constraint_tightness to account for room capacity**

In `scheduler/src/construction.rs`, update `constraint_tightness` to weight rooms by their available capacity:

Replace the `eligible_rooms` calculation (lines 105-111):
```rust
    let eligible_rooms = if facts.subjects[lesson.subject_idx].needs_special_room {
        (0..facts.rooms.len())
            .filter(|&r| facts.rooms[r].suitable_subjects[lesson.subject_idx])
            .count()
    } else {
        usize::MAX
    };
```

With:
```rust
    let eligible_rooms = if facts.subjects[lesson.subject_idx].needs_special_room {
        // Sum of capacity across suitable rooms and all timeslots
        (0..facts.rooms.len())
            .filter(|&r| facts.rooms[r].suitable_subjects[lesson.subject_idx])
            .map(|r| facts.rooms[r].max_concurrent_at_slot.iter().map(|&c| c as usize).sum::<usize>())
            .sum()
    } else {
        usize::MAX
    };
```

This makes lessons needing rooms with higher capacity less constrained (higher tightness value), which is correct — they have more placement options.

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test -p klassenzeit-scheduler -- stress_instance_is_feasible`
Expected: PASS.

- [ ] **Step 6: Run full test suite**

Run: `cargo test -p klassenzeit-scheduler`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add scheduler/src/instances.rs scheduler/src/construction.rs
git commit -m "feat(scheduler): set stress Sporthalle to cap 2, update tightness heuristic"
```

---

### Task 6: Backend — Migration for room capacity

**Files:**
- Create: `backend/migration/src/m20250405_000001_room_capacity.rs`
- Modify: `backend/migration/src/lib.rs`

- [ ] **Step 1: Create the migration file**

```rust
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add max_concurrent column to rooms
        manager
            .alter_table(
                Table::alter()
                    .table(Rooms::Table)
                    .add_column(
                        ColumnDef::new(Rooms::MaxConcurrent)
                            .small_integer()
                            .not_null()
                            .default(1),
                    )
                    .to_owned(),
            )
            .await?;

        // Create room_timeslot_capacities table
        manager
            .create_table(
                Table::create()
                    .table(RoomTimeslotCapacities::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::RoomId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::TimeslotId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::Capacity)
                            .small_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_rtc_room")
                            .from(
                                RoomTimeslotCapacities::Table,
                                RoomTimeslotCapacities::RoomId,
                            )
                            .to(Rooms::Table, Rooms::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_rtc_timeslot")
                            .from(
                                RoomTimeslotCapacities::Table,
                                RoomTimeslotCapacities::TimeslotId,
                            )
                            .to(TimeSlots::Table, TimeSlots::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Unique constraint on (room_id, timeslot_id)
        manager
            .create_index(
                Index::create()
                    .name("uq_rtc_room_timeslot")
                    .table(RoomTimeslotCapacities::Table)
                    .col(RoomTimeslotCapacities::RoomId)
                    .col(RoomTimeslotCapacities::TimeslotId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(RoomTimeslotCapacities::Table).to_owned())
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Rooms::Table)
                    .drop_column(Rooms::MaxConcurrent)
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

#[derive(Iden)]
enum Rooms {
    Table,
    Id,
    MaxConcurrent,
}

#[derive(Iden)]
enum RoomTimeslotCapacities {
    Table,
    Id,
    RoomId,
    TimeslotId,
    Capacity,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum TimeSlots {
    Table,
    Id,
}
```

- [ ] **Step 2: Register migration in lib.rs**

Add `pub mod m20250405_000001_room_capacity;` and add `Box::new(m20250405_000001_room_capacity::Migration)` to the migration vec.

- [ ] **Step 3: Run migration check**

Run: `cargo check -p migration`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add backend/migration/src/m20250405_000001_room_capacity.rs backend/migration/src/lib.rs
git commit -m "feat(backend): add room capacity migration"
```

---

### Task 7: Backend — SeaORM entities and models

**Files:**
- Modify: `backend/src/models/_entities/rooms.rs` — add `max_concurrent` field
- Create: `backend/src/models/_entities/room_timeslot_capacities.rs`
- Modify: `backend/src/models/_entities/mod.rs` — register new entity
- Create: `backend/src/models/room_timeslot_capacities.rs`
- Modify: `backend/src/models/mod.rs` — register new model

- [ ] **Step 1: Add `max_concurrent` to rooms entity**

Add the field to the `rooms::Model` struct:
```rust
    pub max_concurrent: i16,
```

- [ ] **Step 2: Create the `room_timeslot_capacities` entity**

Create `backend/src/models/_entities/room_timeslot_capacities.rs`:
```rust
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "room_timeslot_capacities")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub room_id: Uuid,
    pub timeslot_id: Uuid,
    pub capacity: i16,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::rooms::Entity",
        from = "Column::RoomId",
        to = "super::rooms::Column::Id"
    )]
    Room,
    #[sea_orm(
        belongs_to = "super::time_slots::Entity",
        from = "Column::TimeslotId",
        to = "super::time_slots::Column::Id"
    )]
    TimeSlot,
}

impl Related<super::rooms::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Room.def()
    }
}

impl Related<super::time_slots::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TimeSlot.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
```

- [ ] **Step 3: Register in `_entities/mod.rs` and `models/mod.rs`**

Add `pub mod room_timeslot_capacities;` to both files.

- [ ] **Step 4: Create the model file**

Create `backend/src/models/room_timeslot_capacities.rs`:
```rust
pub use super::_entities::room_timeslot_capacities::*;
```

- [ ] **Step 5: Run `cargo check -p klassenzeit-backend`**

Expected: compiles.

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/
git commit -m "feat(backend): add room_timeslot_capacities entity and max_concurrent to rooms"
```

---

### Task 8: Backend — API for room capacity

**Files:**
- Modify: `backend/src/controllers/rooms.rs`
- Create: `backend/src/controllers/room_timeslot_capacities.rs`
- Modify: `backend/src/app.rs` (register routes)

- [ ] **Step 1: Update room create/update/response to include max_concurrent**

In `backend/src/controllers/rooms.rs`:

Update `CreateRequest`:
```rust
#[derive(Debug, Deserialize)]
struct CreateRequest {
    name: String,
    building: Option<String>,
    capacity: Option<i32>,
    max_concurrent: Option<i16>,
}
```

Update `UpdateRequest`:
```rust
#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    building: Option<String>,
    capacity: Option<i32>,
    max_concurrent: Option<i16>,
}
```

Update `RoomResponse`:
```rust
#[derive(Debug, Serialize)]
struct RoomResponse {
    id: String,
    name: String,
    building: Option<String>,
    capacity: Option<i32>,
    max_concurrent: i16,
    is_active: bool,
}
```

Update `RoomResponse::from_model`:
```rust
    fn from_model(m: &rooms::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            building: m.building.clone(),
            capacity: m.capacity,
            max_concurrent: m.max_concurrent,
            is_active: m.is_active,
        }
    }
```

In `create`, add `max_concurrent` to the ActiveModel:
```rust
        max_concurrent: Set(body.max_concurrent.unwrap_or(1)),
```

In `update`, handle `max_concurrent`:
```rust
    if let Some(max_concurrent) = body.max_concurrent {
        active.max_concurrent = Set(max_concurrent);
    }
```

- [ ] **Step 2: Create timeslot capacity overrides controller**

Create `backend/src/controllers/room_timeslot_capacities.rs`:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::room_timeslot_capacities;
use crate::models::_entities::rooms;

#[derive(Debug, Deserialize)]
struct CapacityOverride {
    timeslot_id: Uuid,
    capacity: i16,
}

#[derive(Debug, Serialize)]
struct CapacityOverrideResponse {
    timeslot_id: String,
    capacity: i16,
}

async fn list(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    // Verify room belongs to school
    let room = rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_ctx.school.id))
        .one(&ctx.db)
        .await;

    match room {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "room not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    match room_timeslot_capacities::Entity::find()
        .filter(room_timeslot_capacities::Column::RoomId.eq(room_id))
        .all(&ctx.db)
        .await
    {
        Ok(items) => {
            let resp: Vec<CapacityOverrideResponse> = items
                .iter()
                .map(|i| CapacityOverrideResponse {
                    timeslot_id: i.timeslot_id.to_string(),
                    capacity: i.capacity,
                })
                .collect();
            format::json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn replace(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Vec<CapacityOverride>>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    // Verify room belongs to school
    let room = rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_ctx.school.id))
        .one(&ctx.db)
        .await;

    match room {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "room not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    // Delete existing overrides
    if let Err(e) = room_timeslot_capacities::Entity::delete_many()
        .filter(room_timeslot_capacities::Column::RoomId.eq(room_id))
        .exec(&ctx.db)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Insert new overrides
    let now = chrono::Utc::now().into();
    for item in &body {
        let entry = room_timeslot_capacities::ActiveModel {
            id: Set(Uuid::new_v4()),
            room_id: Set(room_id),
            timeslot_id: Set(item.timeslot_id),
            capacity: Set(item.capacity),
            created_at: Set(now),
            updated_at: Set(now),
        };
        if let Err(e) = entry.insert(&ctx.db).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }

    StatusCode::NO_CONTENT.into_response()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/rooms/{room_id}/timeslot-capacities")
        .add("/", get(list).put(replace))
}
```

- [ ] **Step 3: Register routes in app.rs**

Add `use crate::controllers::room_timeslot_capacities;` and register the routes alongside the existing room routes.

- [ ] **Step 4: Run `cargo check -p klassenzeit-backend`**

Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/rooms.rs backend/src/controllers/room_timeslot_capacities.rs backend/src/app.rs
git commit -m "feat(backend): add room capacity API endpoints"
```

---

### Task 9: Backend — Update scheduler input builder

**Files:**
- Modify: `backend/src/services/scheduler.rs:210-238`

- [ ] **Step 1: Update `load_schedule_input` to include capacity overrides**

After loading `suitabilities` (around line 220), also load timeslot capacity overrides:

```rust
    let room_ids: Vec<Uuid> = db_rooms.iter().map(|r| r.id).collect();
    let suitabilities = room_subject_suitabilities::Entity::find()
        .filter(room_subject_suitabilities::Column::RoomId.is_in(room_ids.clone()))
        .all(db)
        .await?;

    let capacity_overrides = room_timeslot_capacities::Entity::find()
        .filter(room_timeslot_capacities::Column::RoomId.is_in(room_ids))
        .all(db)
        .await?;
```

Then update the room mapping (around line 223):
```rust
    let sched_rooms: Vec<sched::Room> = db_rooms
        .iter()
        .map(|r| {
            let suitable_subjects: Vec<Uuid> = suitabilities
                .iter()
                .filter(|s| s.room_id == r.id)
                .map(|s| s.subject_id)
                .collect();

            let timeslot_capacity_overrides: std::collections::HashMap<sched::TimeSlot, u8> =
                capacity_overrides
                    .iter()
                    .filter(|co| co.room_id == r.id)
                    .filter_map(|co| {
                        db_timeslots.iter().find(|ts| ts.id == co.timeslot_id).map(|ts| {
                            (
                                sched::TimeSlot {
                                    id: ts.id,
                                    day: ts.day_of_week as u8,
                                    period: ts.period as u8,
                                },
                                co.capacity as u8,
                            )
                        })
                    })
                    .collect();

            sched::Room {
                id: r.id,
                name: r.name.clone(),
                capacity: r.capacity.map(|c| c as u32),
                suitable_subjects,
                max_concurrent: r.max_concurrent as u8,
                timeslot_capacity_overrides,
            }
        })
        .collect();
```

Add `use crate::models::_entities::room_timeslot_capacities;` at the top of the file.

- [ ] **Step 2: Run `cargo check -p klassenzeit-backend`**

Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/scheduler.rs
git commit -m "feat(backend): load room capacity overrides for scheduler input"
```

---

### Task 10: Frontend — Types and room form update

**Files:**
- Modify: `frontend/src/lib/types.ts:78-84`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx`
- Modify: `frontend/src/messages/de.json`
- Modify: `frontend/src/messages/en.json`

- [ ] **Step 1: Update TypeScript types**

In `frontend/src/lib/types.ts`, update `RoomResponse`:
```typescript
export interface RoomResponse {
  id: string;
  name: string;
  building: string | null;
  capacity: number | null;
  max_concurrent: number;
  is_active: boolean;
}
```

- [ ] **Step 2: Add i18n strings**

In `de.json` under `settings.rooms`:
```json
"maxConcurrent": "Max. gleichzeitige Klassen",
"maxConcurrentHint": "Wie viele Klassen diesen Raum gleichzeitig nutzen können"
```

In `en.json` under `settings.rooms`:
```json
"maxConcurrent": "Max concurrent classes",
"maxConcurrentHint": "How many classes can use this room at the same time"
```

- [ ] **Step 3: Add max_concurrent to room form**

In `rooms-tab.tsx`, add state:
```typescript
const [maxConcurrent, setMaxConcurrent] = useState<number>(1);
```

Update `openAddDialog`:
```typescript
  function openAddDialog() {
    setEditingItem(null);
    setName("");
    setBuilding("");
    setCapacity("");
    setMaxConcurrent(1);
    setDialogOpen(true);
  }
```

Update `openEditDialog`:
```typescript
  function openEditDialog(item: RoomResponse) {
    setEditingItem(item);
    setName(item.name);
    setBuilding(item.building ?? "");
    setCapacity(item.capacity ?? "");
    setMaxConcurrent(item.max_concurrent);
    setDialogOpen(true);
  }
```

Update `handleSave` body:
```typescript
      const body = {
        name: name.trim(),
        building: building.trim() || null,
        capacity: capacity === "" ? null : Number(capacity),
        max_concurrent: maxConcurrent,
      };
```

Add the input field to the form, after the capacity field inside the grid:
```tsx
            <div className="grid gap-2">
              <Label>{t("maxConcurrent")}</Label>
              <Input
                type="number"
                min={0}
                value={maxConcurrent}
                onChange={(e) =>
                  setMaxConcurrent(Number(e.target.value) || 0)
                }
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                {t("maxConcurrentHint")}
              </p>
            </div>
```

Also display `max_concurrent` in the table. Add a table header:
```tsx
<TableHead>{t("maxConcurrent")}</TableHead>
```

And cell:
```tsx
<TableCell>{item.max_concurrent}</TableCell>
```

Update the empty row `colSpan` from 4 to 5.

- [ ] **Step 4: Run `bun check` in frontend**

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/app/\[locale\]/schools/\[id\]/settings/components/rooms-tab.tsx frontend/src/messages/de.json frontend/src/messages/en.json
git commit -m "feat(frontend): add max_concurrent to room form and table"
```

---

### Task 11: Frontend — Timeslot capacity grid component

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/timeslot-capacity-grid.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/messages/de.json`
- Modify: `frontend/src/messages/en.json`

- [ ] **Step 1: Add TimeslotCapacityOverride type**

In `frontend/src/lib/types.ts`:
```typescript
export interface TimeslotCapacityOverride {
  timeslot_id: string;
  capacity: number;
}
```

- [ ] **Step 2: Add i18n strings**

In `de.json` under `settings.rooms`:
```json
"capacityGrid": "Kapazität pro Zeitfenster",
"capacityGridHint": "Klicken Sie auf ein Feld, um die Kapazität für dieses Zeitfenster zu ändern. Felder mit dem Standardwert sind ausgegraut.",
"dayNames": ["Mo", "Di", "Mi", "Do", "Fr"],
"period": "Std."
```

In `en.json` under `settings.rooms`:
```json
"capacityGrid": "Capacity per timeslot",
"capacityGridHint": "Click a cell to change the capacity for that timeslot. Cells with the default value are muted.",
"dayNames": ["Mon", "Tue", "Wed", "Thu", "Fri"],
"period": "Period"
```

- [ ] **Step 3: Create TimeslotCapacityGrid component**

Create `frontend/src/app/[locale]/schools/[id]/settings/components/timeslot-capacity-grid.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TimeSlotResponse, TimeslotCapacityOverride } from "@/lib/types";

interface Props {
  timeslots: TimeSlotResponse[];
  maxConcurrent: number;
  overrides: TimeslotCapacityOverride[];
  onChange: (overrides: TimeslotCapacityOverride[]) => void;
  disabled?: boolean;
}

export function TimeslotCapacityGrid({
  timeslots,
  maxConcurrent,
  overrides,
  onChange,
  disabled,
}: Props) {
  const t = useTranslations("settings.rooms");
  const [editingCell, setEditingCell] = useState<string | null>(null);

  // Build grid structure: days × periods
  const { days, periods } = useMemo(() => {
    const daySet = new Set<number>();
    const periodSet = new Set<number>();
    for (const ts of timeslots) {
      daySet.add(ts.day_of_week);
      periodSet.add(ts.period);
    }
    return {
      days: [...daySet].sort((a, b) => a - b),
      periods: [...periodSet].sort((a, b) => a - b),
    };
  }, [timeslots]);

  const dayNames: string[] = t.raw("dayNames");

  // Build lookup: (day, period) → timeslot_id
  const slotLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of timeslots) {
      map.set(`${ts.day_of_week}-${ts.period}`, ts.id);
    }
    return map;
  }, [timeslots]);

  // Build override lookup: timeslot_id → capacity
  const overrideLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of overrides) {
      map.set(o.timeslot_id, o.capacity);
    }
    return map;
  }, [overrides]);

  const getEffectiveCapacity = useCallback(
    (timeslotId: string) => {
      return overrideLookup.get(timeslotId) ?? maxConcurrent;
    },
    [overrideLookup, maxConcurrent],
  );

  const handleCellChange = useCallback(
    (timeslotId: string, value: number) => {
      if (value === maxConcurrent) {
        // Remove override — matches default
        onChange(overrides.filter((o) => o.timeslot_id !== timeslotId));
      } else {
        const existing = overrides.filter((o) => o.timeslot_id !== timeslotId);
        onChange([...existing, { timeslot_id: timeslotId, capacity: value }]);
      }
      setEditingCell(null);
    },
    [maxConcurrent, overrides, onChange],
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("capacityGrid")}</p>
      <p className="text-xs text-muted-foreground">{t("capacityGridHint")}</p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-muted-foreground">{t("period")}</th>
              {days.map((day) => (
                <th key={day} className="p-2 text-center font-medium">
                  {dayNames[day] ?? `Day ${day}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period}>
                <td className="p-2 text-muted-foreground">{period + 1}</td>
                {days.map((day) => {
                  const key = `${day}-${period}`;
                  const timeslotId = slotLookup.get(key);
                  if (!timeslotId) {
                    return <td key={key} className="p-2" />;
                  }
                  const cap = getEffectiveCapacity(timeslotId);
                  const isOverride = overrideLookup.has(timeslotId);
                  const isEditing = editingCell === timeslotId;

                  return (
                    <td key={key} className="p-1">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-14 text-center"
                          defaultValue={cap}
                          autoFocus
                          disabled={disabled}
                          onBlur={(e) =>
                            handleCellChange(
                              timeslotId,
                              Number(e.target.value) || 0,
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleCellChange(
                                timeslotId,
                                Number((e.target as HTMLInputElement).value) || 0,
                              );
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            "flex h-8 w-14 items-center justify-center rounded border text-sm",
                            cap === 0
                              ? "border-destructive/30 bg-destructive/10 text-destructive line-through"
                              : isOverride
                                ? "border-primary/30 bg-primary/10 font-medium text-primary"
                                : "border-muted bg-muted/50 text-muted-foreground",
                          )}
                          onClick={() => !disabled && setEditingCell(timeslotId)}
                          disabled={disabled}
                        >
                          {cap}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrate grid into rooms-tab.tsx**

Add imports at top:
```typescript
import { TimeslotCapacityGrid } from "./timeslot-capacity-grid";
import type { TimeSlotResponse, TimeslotCapacityOverride } from "@/lib/types";
```

Add state:
```typescript
const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);
const [capacityOverrides, setCapacityOverrides] = useState<TimeslotCapacityOverride[]>([]);
```

Load timeslots in `useEffect` alongside rooms:
```typescript
useEffect(() => {
    apiClient
      .get<TimeSlotResponse[]>(`/api/schools/${schoolId}/timeslots`)
      .then(setTimeslots)
      .catch(() => {});
  }, [apiClient, schoolId]);
```

When editing a room, load its overrides:
```typescript
  async function openEditDialog(item: RoomResponse) {
    setEditingItem(item);
    setName(item.name);
    setBuilding(item.building ?? "");
    setCapacity(item.capacity ?? "");
    setMaxConcurrent(item.max_concurrent);
    try {
      const overrides = await apiClient.get<TimeslotCapacityOverride[]>(
        `/api/schools/${schoolId}/rooms/${item.id}/timeslot-capacities`,
      );
      setCapacityOverrides(overrides);
    } catch {
      setCapacityOverrides([]);
    }
    setDialogOpen(true);
  }
```

Reset overrides in `openAddDialog`:
```typescript
    setCapacityOverrides([]);
```

In `handleSave`, after room save succeeds, also save overrides if editing:
```typescript
      if (editingItem) {
        await apiClient.put(
          `/api/schools/${schoolId}/rooms/${editingItem.id}`,
          body,
        );
        await apiClient.put(
          `/api/schools/${schoolId}/rooms/${editingItem.id}/timeslot-capacities`,
          capacityOverrides,
        );
      } else {
        const created = await apiClient.post<RoomResponse>(
          `/api/schools/${schoolId}/rooms`,
          body,
        );
        if (capacityOverrides.length > 0) {
          await apiClient.put(
            `/api/schools/${schoolId}/rooms/${created.id}/timeslot-capacities`,
            capacityOverrides,
          );
        }
      }
```

Add the grid inside the dialog, after the existing form fields and before the `DialogFooter`:
```tsx
          <TimeslotCapacityGrid
            timeslots={timeslots}
            maxConcurrent={maxConcurrent}
            overrides={capacityOverrides}
            onChange={setCapacityOverrides}
            disabled={saving}
          />
```

- [ ] **Step 5: Run `bun check` in frontend**

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\[locale\]/schools/\[id\]/settings/components/timeslot-capacity-grid.tsx frontend/src/app/\[locale\]/schools/\[id\]/settings/components/rooms-tab.tsx frontend/src/lib/types.ts frontend/src/messages/de.json frontend/src/messages/en.json
git commit -m "feat(frontend): add timeslot capacity grid for room overrides"
```

---

### Task 12: Run full test suite and verify

**Files:** None (validation only)

- [ ] **Step 1: Run scheduler tests**

Run: `cargo test -p klassenzeit-scheduler`
Expected: All tests pass.

- [ ] **Step 2: Run backend check**

Run: `cargo check --workspace`
Expected: compiles.

- [ ] **Step 3: Run frontend check**

Run: `cd frontend && bun check`
Expected: no errors.

- [ ] **Step 4: Commit any remaining fixes**

If any tests or checks fail, fix and commit.
