# API Surface Design

**Date:** 2026-04-12
**Status:** Approved (design)
**Scope:** Product-level CRUD routes, database models, and request/response DTOs for the core scheduling domain — week schemes, subjects, rooms, teachers, Stundentafeln, school classes, and lessons. Admin-only. No solver integration; no frontend.

## Goals

1. Model the school timetabling domain: time grids, teachers, subjects, rooms, classes, curriculum templates, and lesson assignments.
2. Admin-defined week schemes with custom time blocks per day (no hardcoded school schedule assumptions).
3. Room suitability via M:N join — general-purpose rooms list exclusions, specialized rooms list inclusions.
4. Reusable Stundentafeln (curriculum templates) assigned to classes by profile/branch.
5. Lessons as concrete solver input: class + subject + teacher + weekly hours + grouping preferences.
6. Schema-ready placeholders for sub-groups and cross-class groups (no routes).
7. Consistent REST API: PATCH for partial updates, PUT for set-replacement, nested routes for child resources.
8. Integration tests against real Postgres, consistent with the db-layer spec's transaction-rollback isolation.

## Non-goals

- **Solver integration.** Job submission, polling, candidates, pinning — separate spec.
- **Timetable output.** Viewing, publishing, exporting generated schedules — separate spec.
- **Frontend.** Framework not yet chosen. API is JSON-only.
- **Sub-group and cross-class group routes.** Schema lands now; CRUD deferred.
- **Lesson auto-assignment of teachers.** `generate-lessons` scaffolds lessons from a Stundentafel but the admin assigns teachers manually per lesson.
- **API versioning prefix.** Not needed until there are breaking changes to manage.
- **Pagination.** School-scale data (dozens of teachers, rooms, classes) doesn't need cursor/offset pagination. Simple lists. Revisit if data volume grows.

## Data model

Twelve new tables across the scheduling domain. One Alembic migration.

### `week_schemes`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `name` | `VARCHAR(100)` | Required, unique |
| `description` | `TEXT` | Optional |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, updated on write |

### `time_blocks`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `week_scheme_id` | `UUID` | FK → `week_schemes.id`, indexed |
| `day_of_week` | `SMALLINT` | 0 = Monday, 4 = Friday |
| `position` | `SMALLINT` | Period number within the day (1, 2, 3…) |
| `start_time` | `TIME` | e.g. `08:00` |
| `end_time` | `TIME` | e.g. `08:45` |

Unique constraint: `(week_scheme_id, day_of_week, position)`.

### `subjects`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `name` | `VARCHAR(100)` | Required, unique |
| `short_name` | `VARCHAR(10)` | Required, unique (e.g. "Ma", "De", "Sp") |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, updated on write |

### `rooms`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `name` | `VARCHAR(100)` | Required, unique |
| `short_name` | `VARCHAR(20)` | Required, unique |
| `capacity` | `SMALLINT` | Optional (nullable) |
| `suitability_mode` | `VARCHAR(16)` | `'general'` or `'specialized'`, default `'general'` |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, updated on write |

### `room_subject_suitabilities`

| Column | Type | Notes |
|---|---|---|
| `room_id` | `UUID` | FK → `rooms.id`, part of composite PK |
| `subject_id` | `UUID` | FK → `subjects.id`, part of composite PK |

No additional columns. Semantics depend on the parent room's `suitability_mode`:
- **`general`**: entries are **exclusions** — room is suitable for all subjects *except* those listed.
- **`specialized`**: entries are **inclusions** — room is suitable *only* for listed subjects.

### `room_availabilities`

| Column | Type | Notes |
|---|---|---|
| `room_id` | `UUID` | FK → `rooms.id`, part of composite PK |
| `time_block_id` | `UUID` | FK → `time_blocks.id`, part of composite PK |

Whitelist model: if a room has *any* availability entries, it is available *only* during those time blocks. If it has *no* entries, it is available during all time blocks (default open).

### `teachers`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `first_name` | `VARCHAR(100)` | Required |
| `last_name` | `VARCHAR(100)` | Required |
| `short_code` | `VARCHAR(10)` | Required, unique (e.g. "MÜL") |
| `max_hours_per_week` | `SMALLINT` | Required |
| `is_active` | `BOOLEAN` | Default `true`, soft-delete semantics |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, updated on write |

### `teacher_qualifications`

| Column | Type | Notes |
|---|---|---|
| `teacher_id` | `UUID` | FK → `teachers.id`, part of composite PK |
| `subject_id` | `UUID` | FK → `subjects.id`, part of composite PK |

### `teacher_availabilities`

| Column | Type | Notes |
|---|---|---|
| `teacher_id` | `UUID` | FK → `teachers.id`, part of composite PK |
| `time_block_id` | `UUID` | FK → `time_blocks.id`, part of composite PK |
| `status` | `VARCHAR(16)` | `'available'`, `'preferred'`, or `'unavailable'` |

Three-state enum:
- **`available`** — teacher can be scheduled (hard constraint satisfied).
- **`preferred`** — teacher prefers this slot (soft constraint, solver favours it).
- **`unavailable`** — teacher cannot be scheduled (hard constraint).

Default (no entry for a time block): treated as `available`. Only explicit preferences and unavailabilities need entries.

### `stundentafeln`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `name` | `VARCHAR(100)` | Required, unique (e.g. "Gymnasium Klasse 5 Latein") |
| `grade_level` | `SMALLINT` | Required (e.g. 5, 6, 10) |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, updated on write |

### `stundentafel_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `stundentafel_id` | `UUID` | FK → `stundentafeln.id`, indexed |
| `subject_id` | `UUID` | FK → `subjects.id` |
| `hours_per_week` | `SMALLINT` | Required (e.g. 4) |
| `preferred_block_size` | `SMALLINT` | Default `1`. `1` = singles, `2` = prefer double periods |

Unique constraint: `(stundentafel_id, subject_id)` — one entry per subject per Stundentafel.

### `school_classes`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `name` | `VARCHAR(20)` | Required, unique (e.g. "5a", "10b") |
| `grade_level` | `SMALLINT` | Required |
| `stundentafel_id` | `UUID` | FK → `stundentafeln.id` |
| `week_scheme_id` | `UUID` | FK → `week_schemes.id` |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, updated on write |

### `lessons`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `school_class_id` | `UUID` | FK → `school_classes.id`, indexed |
| `subject_id` | `UUID` | FK → `subjects.id` |
| `teacher_id` | `UUID` | FK → `teachers.id`, nullable (unassigned initially) |
| `hours_per_week` | `SMALLINT` | Required |
| `preferred_block_size` | `SMALLINT` | Default `1` |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, updated on write |

Unique constraint: `(school_class_id, subject_id)` — one lesson per subject per class. If sub-groups need multiple lessons for the same subject (e.g. split Sport), this constraint relaxes when the ClassGroup feature lands.

### `class_groups` (schema only — no routes)

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `school_class_id` | `UUID` | FK → `school_classes.id`, indexed |
| `name` | `VARCHAR(50)` | Required (e.g. "Group A", "Wahlpflicht IT") |
| `group_type` | `VARCHAR(16)` | `'split'` or `'cross_class'` |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |

Deferred: no routes, no lesson FK. Schema lands now so the table exists for future work.

### Key decisions

- **UUID PKs** everywhere — consistent with auth models, non-guessable, safe in URLs.
- **`suitability_mode`** on Room flips the semantics of RoomSubjectSuitability entries (exclusion vs. inclusion). Minimises admin effort — most classrooms are general-purpose with a few exclusions.
- **Room availability is a whitelist with default-open.** No entries = always available. Entries = available only at those times. Handles shared facilities (pool available Tue periods 3–4 only).
- **Teacher availability defaults to available.** Only preferences and unavailabilities need explicit entries. Reduces data entry for full-time teachers.
- **Soft delete for teachers** (`is_active`) — keeps historical data intact if lessons reference them. Hard delete for other entities with FK protection (409 on conflict).
- **`preferred_block_size`** on both StundentafelEntry and Lesson — the Stundentafel sets a default, which can be overridden per concrete lesson.
- **`teacher_id` nullable on Lesson** — lessons can be created from a Stundentafel without a teacher assigned yet. The solver requires a teacher, so validation at solve-time, not at creation.
- **ClassGroup schema-only** — the table exists but has no FK from Lesson and no routes. This avoids a breaking migration when sub-groups land.

### Migration

Single Alembic migration creating all twelve tables. Depends on the existing `users` and `sessions` tables (no changes to those).

## API routes

All routes require admin authentication (`require_admin` dependency). All request/response bodies are JSON.

### WeekSchemes

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/week-schemes` | `{name, description?}` | `201` + body | Returns created scheme |
| `GET` | `/week-schemes` | — | `200` + list | All schemes (no time blocks) |
| `GET` | `/week-schemes/{id}` | — | `200` + body | Includes nested time blocks |
| `PATCH` | `/week-schemes/{id}` | `{name?, description?}` | `200` + body | Partial update |
| `DELETE` | `/week-schemes/{id}` | — | `204` | 409 if classes reference it |

### TimeBlocks (nested under WeekScheme)

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/week-schemes/{id}/time-blocks` | `{day_of_week, position, start_time, end_time}` | `201` + body | 409 on duplicate (day, position) |
| `PATCH` | `/week-schemes/{id}/time-blocks/{block_id}` | `{day_of_week?, position?, start_time?, end_time?}` | `200` + body | Partial update |
| `DELETE` | `/week-schemes/{id}/time-blocks/{block_id}` | — | `204` | 409 if availabilities reference it |

### Subjects

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/subjects` | `{name, short_name}` | `201` + body | |
| `GET` | `/subjects` | — | `200` + list | |
| `GET` | `/subjects/{id}` | — | `200` + body | |
| `PATCH` | `/subjects/{id}` | `{name?, short_name?}` | `200` + body | |
| `DELETE` | `/subjects/{id}` | — | `204` | 409 if referenced by qualifications, suitabilities, entries, or lessons |

### Rooms

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/rooms` | `{name, short_name, capacity?, suitability_mode?}` | `201` + body | |
| `GET` | `/rooms` | — | `200` + list | |
| `GET` | `/rooms/{id}` | — | `200` + body | Includes suitability entries and availability |
| `PATCH` | `/rooms/{id}` | `{name?, short_name?, capacity?, suitability_mode?}` | `200` + body | |
| `DELETE` | `/rooms/{id}` | — | `204` | Hard delete, cascades suitabilities and availabilities |
| `PUT` | `/rooms/{id}/suitability` | `{subject_ids: [uuid]}` | `200` + body | Replace entire suitability list |
| `PUT` | `/rooms/{id}/availability` | `{time_block_ids: [uuid]}` | `200` + body | Replace entire availability list |

### Teachers

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/teachers` | `{first_name, last_name, short_code, max_hours_per_week}` | `201` + body | |
| `GET` | `/teachers` | `?active=true\|false` | `200` + list | Optional filter by active status |
| `GET` | `/teachers/{id}` | — | `200` + body | Includes qualifications and availability |
| `PATCH` | `/teachers/{id}` | `{first_name?, last_name?, short_code?, max_hours_per_week?}` | `200` + body | |
| `DELETE` | `/teachers/{id}` | — | `204` | Sets `is_active = false` (soft delete) |
| `PUT` | `/teachers/{id}/qualifications` | `{subject_ids: [uuid]}` | `200` + body | Replace entire qualification list |
| `PUT` | `/teachers/{id}/availability` | `{entries: [{time_block_id, status}]}` | `200` + body | Replace entire availability set |

### Stundentafeln

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/stundentafeln` | `{name, grade_level}` | `201` + body | |
| `GET` | `/stundentafeln` | — | `200` + list | |
| `GET` | `/stundentafeln/{id}` | — | `200` + body | Includes nested entries |
| `PATCH` | `/stundentafeln/{id}` | `{name?, grade_level?}` | `200` + body | |
| `DELETE` | `/stundentafeln/{id}` | — | `204` | 409 if classes reference it |

### Stundentafel Entries (nested)

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/stundentafeln/{id}/entries` | `{subject_id, hours_per_week, preferred_block_size?}` | `201` + body | 409 on duplicate subject |
| `PATCH` | `/stundentafeln/{id}/entries/{entry_id}` | `{hours_per_week?, preferred_block_size?}` | `200` + body | |
| `DELETE` | `/stundentafeln/{id}/entries/{entry_id}` | — | `204` | |

### School Classes

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/classes` | `{name, grade_level, stundentafel_id, week_scheme_id}` | `201` + body | |
| `GET` | `/classes` | — | `200` + list | |
| `GET` | `/classes/{id}` | — | `200` + body | |
| `PATCH` | `/classes/{id}` | `{name?, grade_level?, stundentafel_id?, week_scheme_id?}` | `200` + body | |
| `DELETE` | `/classes/{id}` | — | `204` | 409 if lessons reference it |

### Lessons

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/lessons` | `{school_class_id, subject_id, teacher_id?, hours_per_week, preferred_block_size?}` | `201` + body | |
| `POST` | `/classes/{id}/generate-lessons` | — | `201` + list | Creates lessons from class's Stundentafel; skips subjects that already have a lesson for this class |
| `GET` | `/lessons` | `?class_id=&teacher_id=&subject_id=` | `200` + list | Filterable |
| `GET` | `/lessons/{id}` | — | `200` + body | |
| `PATCH` | `/lessons/{id}` | `{teacher_id?, hours_per_week?, preferred_block_size?}` | `200` + body | |
| `DELETE` | `/lessons/{id}` | — | `204` | Hard delete |

## Response DTOs

### WeekScheme

```json
{
  "id": "uuid",
  "name": "Standard 2026/27",
  "description": "Regular week grid",
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### WeekScheme (detail, includes time blocks)

```json
{
  "id": "uuid",
  "name": "Standard 2026/27",
  "description": "Regular week grid",
  "time_blocks": [
    {
      "id": "uuid",
      "day_of_week": 0,
      "position": 1,
      "start_time": "08:00",
      "end_time": "08:45"
    }
  ],
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### Subject

```json
{
  "id": "uuid",
  "name": "Mathematik",
  "short_name": "Ma",
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### Room (detail)

```json
{
  "id": "uuid",
  "name": "Physikraum 1",
  "short_name": "PH1",
  "capacity": 30,
  "suitability_mode": "specialized",
  "suitability_subjects": [
    {"id": "uuid", "name": "Physik", "short_name": "Ph"},
    {"id": "uuid", "name": "Chemie", "short_name": "Ch"}
  ],
  "availability": [
    {"time_block_id": "uuid", "day_of_week": 0, "position": 1}
  ],
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### Room (list item)

```json
{
  "id": "uuid",
  "name": "Physikraum 1",
  "short_name": "PH1",
  "capacity": 30,
  "suitability_mode": "specialized",
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### Teacher (detail)

```json
{
  "id": "uuid",
  "first_name": "Hans",
  "last_name": "Müller",
  "short_code": "MÜL",
  "max_hours_per_week": 24,
  "is_active": true,
  "qualifications": [
    {"id": "uuid", "name": "Mathematik", "short_name": "Ma"}
  ],
  "availability": [
    {"time_block_id": "uuid", "day_of_week": 0, "position": 1, "status": "preferred"}
  ],
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### Teacher (list item)

```json
{
  "id": "uuid",
  "first_name": "Hans",
  "last_name": "Müller",
  "short_code": "MÜL",
  "max_hours_per_week": 24,
  "is_active": true,
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### Stundentafel (detail)

```json
{
  "id": "uuid",
  "name": "Gymnasium Klasse 5 Latein",
  "grade_level": 5,
  "entries": [
    {
      "id": "uuid",
      "subject": {"id": "uuid", "name": "Mathematik", "short_name": "Ma"},
      "hours_per_week": 4,
      "preferred_block_size": 2
    }
  ],
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### SchoolClass

```json
{
  "id": "uuid",
  "name": "5a",
  "grade_level": 5,
  "stundentafel_id": "uuid",
  "week_scheme_id": "uuid",
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

### Lesson

```json
{
  "id": "uuid",
  "school_class": {"id": "uuid", "name": "5a"},
  "subject": {"id": "uuid", "name": "Mathematik", "short_name": "Ma"},
  "teacher": {"id": "uuid", "first_name": "Hans", "last_name": "Müller", "short_code": "MÜL"},
  "hours_per_week": 4,
  "preferred_block_size": 2,
  "created_at": "2026-04-12T10:00:00Z",
  "updated_at": "2026-04-12T10:00:00Z"
}
```

`teacher` is `null` when no teacher is assigned.

## Error handling

Standard FastAPI `HTTPException` responses, consistent with auth routes:

| Code | When |
|---|---|
| `400` | Invalid input (negative hours, invalid day_of_week, etc.) |
| `401` | Not authenticated |
| `403` | Not admin |
| `404` | Resource not found |
| `409` | Conflict: unique constraint violation (duplicate name/short_code), FK protection on delete, duplicate Stundentafel entry for same subject |
| `422` | Pydantic validation failure (missing required fields, wrong types) |

Error body follows FastAPI convention: `{"detail": "Human-readable message"}`.

## Code organisation

Pydantic request/response schemas live in dedicated `schemas/` subdirectories, separate from route handlers. This keeps route files focused on request handling and makes schemas reusable across routes.

As a prerequisite, the existing auth schemas (currently inline in route files) are refactored into `auth/schemas/` to establish the pattern project-wide.

```
backend/src/klassenzeit_backend/
├── auth/
│   ├── schemas/                    # Refactored from inline definitions
│   │   ├── __init__.py
│   │   ├── login.py               # LoginRequest
│   │   ├── me.py                  # MeResponse, ChangePasswordRequest
│   │   └── admin.py               # CreateUserRequest, UserResponse, UserListItem, ResetPasswordRequest
│   └── routes/                    # (existing, schemas removed from here)
├── db/
│   └── models/
│       ├── week_scheme.py         # WeekScheme, TimeBlock
│       ├── subject.py             # Subject
│       ├── room.py                # Room, RoomSubjectSuitability, RoomAvailability
│       ├── teacher.py             # Teacher, TeacherQualification, TeacherAvailability
│       ├── stundentafel.py        # Stundentafel, StundentafelEntry
│       ├── school_class.py        # SchoolClass
│       ├── lesson.py              # Lesson
│       └── class_group.py         # ClassGroup (model only, no routes)
├── scheduling/
│   ├── __init__.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── week_scheme.py         # Request/response Pydantic models
│   │   ├── subject.py
│   │   ├── room.py
│   │   ├── teacher.py
│   │   ├── stundentafel.py
│   │   ├── school_class.py
│   │   └── lesson.py
│   └── routes/
│       ├── __init__.py
│       ├── week_schemes.py        # WeekScheme + TimeBlock routes
│       ├── subjects.py
│       ├── rooms.py
│       ├── teachers.py
│       ├── stundentafeln.py
│       ├── school_classes.py
│       └── lessons.py
```

All route modules register an `APIRouter` that gets included in `main.py`. All routes use the existing `require_admin` dependency from `auth/dependencies.py`.

## Testing

Tests follow the existing pattern: async tests against real Postgres with transaction-rollback isolation.

```
backend/tests/scheduling/
├── conftest.py                 # Shared fixtures: create_subject, create_teacher, etc.
├── test_week_schemes.py
├── test_subjects.py
├── test_rooms.py
├── test_teachers.py
├── test_stundentafeln.py
├── test_school_classes.py
└── test_lessons.py
```

Each test file covers:
- Happy-path CRUD (create, read, update, delete).
- Unique constraint violations (409).
- FK protection on delete (409).
- Not-found (404).
- Nested resource operations where applicable.
- Filter/query parameter behaviour (lessons, teachers).

All test requests go through `httpx.AsyncClient` with admin authentication (reusing `login_as` fixture from auth tests).

## Open questions deferred

- **Bulk import/export.** CSV or JSON import for teachers, rooms, subjects. Useful but not needed for MVP.
- **Validation rules across entities.** E.g., "lesson's teacher must be qualified for the lesson's subject" — enforce in route handler or defer to solver? Start with route-level validation; the solver catches anything missed.
- **Stundentafel cloning.** Copy a Stundentafel to create a variant (e.g. "Kl.5 Latein" → "Kl.5 Französisch"). Convenience feature, defer.
- **Audit trail.** Who changed what, when. Deferred (consistent with auth spec).
