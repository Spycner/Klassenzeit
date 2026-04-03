# Reference Data List Endpoints

## Problem

The frontend curriculum and schedule pages call 6 reference data endpoints that don't exist yet:
- `GET /api/schools/{id}/terms`
- `GET /api/schools/{id}/classes`
- `GET /api/schools/{id}/subjects`
- `GET /api/schools/{id}/teachers`
- `GET /api/schools/{id}/rooms`
- `GET /api/schools/{id}/timeslots`

All SeaORM models and frontend types already exist. Only the controllers and route registration are missing.

## Design

### Architecture

6 separate controller files (one per entity) to allow independent CRUD expansion later. Each starts with a `list` handler and a `routes()` function.

### Controller Pattern

Follow the established `members.rs` pattern:
- `SchoolContext` extractor for auth + school scoping
- Response struct with `from_model()` conversion
- `format::json()` for serialization
- Routes registered in `app.rs`

### Endpoints

| Endpoint | Controller | Query |
|----------|-----------|-------|
| `GET /api/schools/{id}/terms` | `terms.rs` | Join through `school_years` (terms have `school_year_id`, school_years have `school_id`) |
| `GET /api/schools/{id}/classes` | `classes.rs` | Filter `school_classes` by `school_id` |
| `GET /api/schools/{id}/subjects` | `subjects.rs` | Filter `subjects` by `school_id` |
| `GET /api/schools/{id}/teachers` | `teachers.rs` | Filter `teachers` by `school_id` |
| `GET /api/schools/{id}/rooms` | `rooms.rs` | Filter `rooms` by `school_id` |
| `GET /api/schools/{id}/timeslots` | `time_slots.rs` | Filter `time_slots` by `school_id` |

### Response Types

Match existing frontend types in `frontend/src/lib/types.ts`:

- `TermResponse`: id, name, start_date, end_date, is_current
- `SchoolClassResponse`: id, name, grade_level, student_count
- `SubjectResponse`: id, name, abbreviation, color, needs_special_room
- `TeacherResponse`: id, first_name, last_name, abbreviation
- `RoomResponse`: id, name, building, capacity
- `TimeSlotResponse`: id, day_of_week, period, start_time, end_time, is_break, label

### Terms Special Case

Terms don't have a direct `school_id` — they belong to `school_years` which belong to `schools`. The query joins through `school_years`:

```sql
SELECT t.* FROM terms t
JOIN school_years sy ON t.school_year_id = sy.id
WHERE sy.school_id = $1
```

### Auth

All endpoints require authenticated user with active school membership (enforced by `SchoolContext`). No role restriction — any member can read reference data.

## Files Changed

- `backend/src/controllers/mod.rs` — add 6 module declarations
- `backend/src/controllers/terms.rs` — new
- `backend/src/controllers/classes.rs` — new
- `backend/src/controllers/subjects.rs` — new
- `backend/src/controllers/teachers.rs` — new
- `backend/src/controllers/rooms.rs` — new
- `backend/src/controllers/time_slots.rs` — new
- `backend/src/app.rs` — register 6 new routes

## Testing

Unit tests per controller using `loco_rs::testing` and an in-memory or test database, following existing test patterns.
