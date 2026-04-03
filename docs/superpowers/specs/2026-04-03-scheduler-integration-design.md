# Scheduler Integration — Design Spec

**Date:** 2026-04-03
**Status:** Approved
**Scope:** Wire the scheduler crate into the backend with a greedy solver, API endpoints, and frontend UI.

## Decisions

- **Solver scope:** Integration + basic greedy solver (hard constraints only, no optimization)
- **UX flow:** Solve → Preview → Apply (v1 pattern)
- **Solution caching:** In-memory (`DashMap`), lost on restart (acceptable — re-solving is fast)
- **Scheduler type updates:** Incremental — only fields the greedy solver needs
- **Architecture:** Loco `BackgroundWorker` with in-memory queue
- **Curriculum input:** New `curriculum_entries` DB table + CRUD endpoints

## 1. Scheduler Crate Type Updates

### Updated Types

**`Teacher`**: `id: Uuid`, `name: String`, `max_hours_per_week: u32`, `is_part_time: bool`, `available_slots: Vec<TimeSlot>` (slots where availability != "blocked"), `qualified_subjects: Vec<Uuid>` (from `teacher_subject_qualifications`).

**`Room`**: `id: Uuid`, `name: String`, `capacity: Option<u32>`, `suitable_subjects: Vec<Uuid>` (from `room_subject_suitabilities`).

**`SchoolClass`** (renamed from `Class`): `id: Uuid`, `name: String`, `grade_level: u8`, `student_count: Option<u32>`.

**`Subject`**: `id: Uuid`, `name: String`.

**`TimeSlot`**: `id: Uuid`, `day: u8`, `period: u8`.

**`LessonRequirement`** (new): `class_id: Uuid`, `subject_id: Uuid`, `teacher_id: Option<Uuid>` (solver picks from qualified teachers if None), `hours_per_week: u32`.

**`ScheduleInput`**: `teachers: Vec<Teacher>`, `classes: Vec<SchoolClass>`, `rooms: Vec<Room>`, `subjects: Vec<Subject>`, `timeslots: Vec<TimeSlot>`, `requirements: Vec<LessonRequirement>`.

**`Lesson`** (output): `teacher_id: Uuid`, `class_id: Uuid`, `subject_id: Uuid`, `room_id: Option<Uuid>`, `timeslot: TimeSlot`.

**`ScheduleOutput`**: `timetable: Vec<Lesson>`, `score: Score`, `violations: Vec<Violation>`.

**`Score`**: `hard_violations: u32`, `soft_score: f64`.

**`Violation`**: `description: String`.

### Removed

`Constraint`, `ConstraintKind`, `ConstraintWeight` — were placeholders. Hard constraints are enforced by the algorithm directly.

## 2. Greedy Solver Algorithm

The `solve()` function implements a most-constrained-first slot-filling algorithm:

1. **Sort requirements** by "most constrained first" — fewer eligible teachers × fewer available timeslots = higher priority. Fail-fast on hard problems.
2. **For each requirement**, for each hour needed:
   - Iterate available timeslots (ordered by day, then period for even distribution across the week).
   - For each candidate slot, check hard constraints:
     - Teacher not already booked in this slot
     - Class not already booked in this slot
     - Teacher is available in this slot (present in `available_slots`)
     - If subject needs special room: find a suitable, unbooked room with sufficient capacity
   - If valid slot found: assign it, record a `Lesson`.
   - If no valid slot found: record a `Violation` (unplaceable lesson).
3. **Return** `ScheduleOutput` with assigned lessons, score, and violations.

**Teacher selection** (when `teacher_id` is `None`): Pick from qualified teachers, preferring those with the most remaining capacity (`max_hours_per_week` minus already-assigned hours).

**Score**: `hard_violations` = count of unplaceable lessons. `soft_score` = 0.0 (no soft optimization in greedy solver).

**No backtracking** — intentionally simple. A future constraint solver replaces the algorithm without changing the API.

## 3. Backend Integration

### Shared State

`Arc<DashMap<Uuid, SolveJob>>` added to Axum state via extension layer.

```
SolveJob {
    status: SolveStatus,       // Solving | Solved | Failed
    started_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
    result: Option<ScheduleOutput>,
    error: Option<String>,
}
```

Key: `term_id` (one solve job per term at a time).

### Worker

`SchedulerWorker` implements `BackgroundWorker<SchedulerWorkerArgs>` where args = `{ term_id: Uuid, school_id: Uuid }`.

`perform()`:
1. Set job status to `Solving`
2. Load all data from DB for school/term (teachers, classes, rooms, subjects, timeslots, availabilities, qualifications, suitabilities, curriculum entries)
3. Map DB entities → `ScheduleInput`
4. Call `scheduler::solve(input)`
5. Store result, set status to `Solved` (or `Failed` on error)

### API Endpoints

Under `/api/schools/{school_id}/terms/{term_id}/scheduler`:

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `POST` | `/solve` | Enqueue solve job | 202 Accepted / 409 Conflict |
| `GET` | `/status` | Job status + score | 200 |
| `GET` | `/solution` | Full solution (lessons + violations) | 200 / 404 |
| `POST` | `/apply` | Persist to `lessons` table, clear cache | 200 |
| `DELETE` | `/solution` | Discard cached solution | 200 |

All endpoints require `SchoolContext` auth.

### DB Mapping Layer

New module `backend/src/services/scheduler.rs`:
- Load all entity data for a school/term from SeaORM
- Convert DB models → scheduler `ScheduleInput` types
- Convert scheduler output `Lesson`s → `lessons` table inserts (mapping UUIDs back to DB entities)

## 4. Curriculum Entries

### New Migration: `curriculum_entries` Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `school_id` | UUID | FK to schools |
| `term_id` | UUID | FK to terms |
| `school_class_id` | UUID | FK to school_classes |
| `subject_id` | UUID | FK to subjects |
| `teacher_id` | UUID | FK to teachers, nullable |
| `hours_per_week` | i32 | Required |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

Unique constraint: `(term_id, school_class_id, subject_id)` — one entry per class per subject per term.

Each `curriculum_entries` row maps 1:1 to a `LessonRequirement` in the scheduler input.

### CRUD Endpoints

Under `/api/schools/{school_id}/terms/{term_id}/curriculum`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List entries for term |
| `POST` | `/` | Create entry |
| `PUT` | `/{id}` | Update entry |
| `DELETE` | `/{id}` | Delete entry |

## 5. Frontend

### Schedule Generation Page

Route: `/[locale]/schedule/generate`

**Components:**
- **GenerateButton** — POST to `/solve`, disabled while `Solving`. Shows spinner.
- **StatusPoller** — TanStack Query, 2s refetch interval while `Solving`.
- **SolutionPreview** — Timetable grid (days × periods) for selected class. Shows violations as warnings. Color-coded by subject.
- **ApplyButton** — POST to `/apply` with confirmation dialog. Navigates to timetable view on success.
- **DiscardButton** — DELETE to `/solution`.

**Class selector:** Dropdown to switch between classes in the preview.

**Timetable grid:** Days as columns, periods as rows. Cells show subject abbreviation + teacher abbreviation + room name.

### Curriculum Page

Route: `/[locale]/curriculum`

Simple table editor for managing `curriculum_entries` — admin defines weekly hours per class per subject for a term.

### i18n

All strings in DE/EN using existing i18n setup.

## 6. Testing Strategy

### Scheduler Crate (`scheduler/tests/`)
- Empty input → empty output
- Single requirement, single timeslot → one lesson assigned
- Teacher conflict: two requirements same teacher, one timeslot → one violation
- Class conflict: same class, overlapping slots → correct assignment
- Room conflict: two lessons need same room at same time
- Teacher availability: blocked slot skipped
- Unplaceable lesson → violation recorded
- Most-constrained-first ordering verified

### Backend (`backend/tests/`)
- Mapping layer: DB entities → `ScheduleInput` correctness
- API endpoints: 202 on solve, status polling, solution retrieval, apply persists to `lessons`, discard clears cache
- Auth: reject unauthenticated/unauthorized
- Edge cases: 409 when already solving, 404 when no solution
- `curriculum_entries` CRUD

### Frontend
- Component tests deferred (manual testing for this PR)

### Approach
- TDD: failing tests first, then implementation
