# Room Capacity / Gym Splitting — Design Spec

**Date**: 2026-04-05
**Status**: Draft
**Backlog item**: 1g

## Problem

The stress benchmark instance (16 classes) is infeasible because 48 Sport lessons compete for 30 Sporthalle timeslots. Real schools also share gyms with other schools, meaning a room may only be available during certain periods, or may host multiple classes concurrently during others.

The current room conflict constraint treats every room as capacity 1 — any double-booking is a hard violation.

## Solution

Add per-timeslot capacity to rooms. Each room has a `max_concurrent` default (how many classes can use it simultaneously) plus optional per-timeslot overrides.

### Examples

| Scenario | `max_concurrent` | Overrides |
|----------|-------------------|-----------|
| Normal classroom | 1 | None |
| Sporthalle (own gym, fits 2 classes) | 2 | None |
| Shared gym (school gets specific slots) | 0 | Mon P1-P3: 2, Wed P1-P3: 1 |
| Classroom under renovation Tue/Thu | 1 | Tue P1-P6: 0, Thu P1-P6: 0 |

## Scheduler Domain Model

### `Room` (`scheduler/src/types.rs`)

Add two fields:

```rust
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub capacity: Option<u32>,          // student count capacity (unchanged)
    pub suitable_subjects: Vec<Uuid>,
    pub max_concurrent: u8,             // NEW: default concurrent class limit
    pub timeslot_capacity_overrides: HashMap<TimeSlot, u8>,  // NEW: sparse overrides
}
```

- `max_concurrent` defaults to `1`.
- `timeslot_capacity_overrides` is empty by default. Only slots that differ from `max_concurrent` appear here.

### `RoomFact` (`scheduler/src/planning.rs`)

Add a dense array built by the mapper:

```rust
pub struct RoomFact {
    pub capacity: Option<u32>,
    pub suitable_subjects: BitVec,
    pub max_concurrent_at_slot: Vec<u8>,  // NEW: indexed by timeslot index
}
```

**Mapper logic** (`scheduler/src/mapper.rs`): For each room, initialize `max_concurrent_at_slot` as `vec![room.max_concurrent; num_timeslots]`, then apply overrides by looking up each override's timeslot in the timeslot-to-index map.

## Constraint Changes

### Brute-force scoring (`constraints.rs` — `evaluate_score`)

Replace the current pairwise room conflict check. Instead, build a `room_at_slot` count matrix (like the incremental state does) and penalize each (room, slot) pair where `count > max_concurrent_at_slot[slot]`. Penalty: `-(count - max_concurrent_at_slot[slot])` hard per excess occupant.

### Incremental scoring (`constraints.rs` — `IncrementalState`)

**`evaluate_assign`** (line ~301): Change from:

```rust
let k_room = self.room_at_slot[r][timeslot] as i64;
delta += HardSoftScore::hard(-k_room);
```

To:

```rust
let k_room = self.room_at_slot[r][timeslot];
let cap = facts.rooms[r].max_concurrent_at_slot[timeslot] as u16;
if k_room >= cap {
    delta += HardSoftScore::hard(-1);
}
```

Only penalize when the new assignment would push occupancy above the per-slot capacity.

**`apply_assign` / `apply_unassign`**: Mirror logic — add/remove penalty when crossing the capacity threshold.

### Unchanged constraints

- Room suitability (subject → room mapping) — orthogonal
- Room capacity (student count) — orthogonal, `capacity` field unchanged

## Benchmark Instances

- **`stress_16_classes()`**: Set Sporthalle `max_concurrent: 2`. With 48 lessons and 60 available lesson-slots, the instance becomes feasible.
- **`small_4_classes()` and `realistic_8_classes()`**: Keep Sporthalle at `max_concurrent: 1` (unchanged behavior).
- **New test case**: Add a focused test with a room at `max_concurrent: 2`, verifying that 2 lessons in the same slot = 0 violations, 3 lessons = 1 violation. Also test `max_concurrent: 0` blocks all assignments and per-slot overrides work correctly.

## Backend

### Migration

1. Add column to `rooms`:
   ```sql
   ALTER TABLE rooms ADD COLUMN max_concurrent SMALLINT NOT NULL DEFAULT 1;
   ```

2. New table `room_timeslot_capacities`:
   ```sql
   CREATE TABLE room_timeslot_capacities (
       id UUID PRIMARY KEY,
       room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
       timeslot_id UUID NOT NULL REFERENCES timeslots(id) ON DELETE CASCADE,
       capacity SMALLINT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL,
       UNIQUE (room_id, timeslot_id)
   );
   ```

### API Changes

**Room endpoints** (`/api/schools/{id}/rooms`):
- Create and update accept `max_concurrent` field (default 1 if omitted).
- Response includes `max_concurrent`.

**New endpoint** — timeslot capacity overrides:
- `GET /api/schools/{id}/rooms/{room_id}/timeslot-capacities` → `[{timeslot_id, capacity}]`
- `PUT /api/schools/{id}/rooms/{room_id}/timeslot-capacities` — accepts full override list `[{timeslot_id, capacity}]`, replaces all existing overrides for this room (delete + insert in transaction).

**Scheduler input builder**: Join `room_timeslot_capacities` when constructing `Room` structs for the solver. Map `timeslot_id` to `TimeSlot` and build the `timeslot_capacity_overrides` HashMap.

### Validation

- `max_concurrent >= 0` (u8 in Rust, SMALLINT with CHECK in DB)
- `capacity >= 0` on overrides
- `timeslot_id` must belong to the same school

## Frontend

### Room Form Changes

Add `max_concurrent` number input (min 0) to the room create/edit form, labeled "Max. gleichzeitige Klassen" / "Max concurrent classes".

### Timeslot Capacity Grid

Always visible on the room edit form, below the basic fields. A grid showing effective capacity per timeslot:

**Layout**: Days as columns, periods as rows (matching the timetable grid).

**Cell behavior**:
- Each cell shows the effective capacity for that (day, period).
- Default cells (matching `max_concurrent`) shown in muted/neutral style.
- Override cells (differing from `max_concurrent`) shown in accent style.
- Cells with capacity 0 shown greyed out / crossed to indicate "unavailable".
- Click a cell to edit its value (inline number input).
- Setting a cell back to `max_concurrent` removes the override.

**Interaction with `max_concurrent`**: Changing `max_concurrent` updates all non-override cells immediately. Override cells keep their values.

**Save**: Sends `max_concurrent` via room update endpoint + override list via the timeslot-capacities endpoint.

## Testing

- **Scheduler unit tests**: Brute-force vs incremental scoring agreement with `max_concurrent > 1` and per-slot overrides.
- **Property tests**: Extend existing proptest to include rooms with varying `max_concurrent`.
- **Constraint-specific tests**: Verify 0-capacity blocks assignments, capacity 2 allows 2, capacity transitions at threshold.
- **Backend integration tests**: CRUD for room with `max_concurrent`, CRUD for timeslot capacity overrides, solver input construction includes overrides.
- **Frontend**: Component test for the capacity grid rendering and override behavior.
