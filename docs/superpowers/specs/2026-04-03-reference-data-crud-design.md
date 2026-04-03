# Reference Data CRUD Endpoints

## Goal

Add create, update, and delete endpoints for all 6 reference data entities: terms, classes, subjects, teachers, rooms, and timeslots. List endpoints already exist (PR #28). This completes the backend API surface so users can set up a school through the API.

Frontend management pages are out of scope — they will be a separate step.

## Entities & Endpoints

Each entity gets three new endpoints added to its existing controller file. All write endpoints require admin role.

| Entity | POST (create) | PUT (update) | DELETE |
|--------|--------------|-------------|--------|
| Terms | `POST /api/schools/{id}/terms` | `PUT /api/schools/{id}/terms/{term_id}` | `DELETE /api/schools/{id}/terms/{term_id}` |
| Classes | `POST /api/schools/{id}/classes` | `PUT /api/schools/{id}/classes/{class_id}` | `DELETE /api/schools/{id}/classes/{class_id}` |
| Subjects | `POST /api/schools/{id}/subjects` | `PUT /api/schools/{id}/subjects/{subject_id}` | `DELETE /api/schools/{id}/subjects/{subject_id}` |
| Teachers | `POST /api/schools/{id}/teachers` | `PUT /api/schools/{id}/teachers/{teacher_id}` | `DELETE /api/schools/{id}/teachers/{teacher_id}` |
| Rooms | `POST /api/schools/{id}/rooms` | `PUT /api/schools/{id}/rooms/{room_id}` | `DELETE /api/schools/{id}/rooms/{room_id}` |
| Timeslots | `POST /api/schools/{id}/timeslots` | `PUT /api/schools/{id}/timeslots/{slot_id}` | `DELETE /api/schools/{id}/timeslots/{slot_id}` |

## Request DTOs

Each entity has a `CreateRequest` (required fields) and `UpdateRequest` (all fields optional for partial updates).

### Terms

```rust
struct CreateRequest {
    school_year_id: Uuid,
    name: String,
    start_date: NaiveDate,
    end_date: NaiveDate,
    is_current: Option<bool>,       // default false
}

struct UpdateRequest {
    name: Option<String>,
    start_date: Option<NaiveDate>,
    end_date: Option<NaiveDate>,
    is_current: Option<bool>,
}
```

### Classes (school_classes)

```rust
struct CreateRequest {
    name: String,
    grade_level: i32,
    student_count: Option<i32>,     // default 0
    class_teacher_id: Option<Uuid>,
    is_active: Option<bool>,        // default true
}

struct UpdateRequest {
    name: Option<String>,
    grade_level: Option<i32>,
    student_count: Option<i32>,
    class_teacher_id: Option<Uuid>,
    is_active: Option<bool>,
}
```

### Subjects

```rust
struct CreateRequest {
    name: String,
    abbreviation: String,
    color: Option<String>,
    needs_special_room: Option<bool>,  // default false
}

struct UpdateRequest {
    name: Option<String>,
    abbreviation: Option<String>,
    color: Option<String>,
    needs_special_room: Option<bool>,
}
```

### Teachers

```rust
struct CreateRequest {
    first_name: String,
    last_name: String,
    email: Option<String>,
    abbreviation: String,
    max_hours_per_week: Option<i32>,   // default 28
    is_part_time: Option<bool>,        // default false
}

struct UpdateRequest {
    first_name: Option<String>,
    last_name: Option<String>,
    email: Option<String>,
    abbreviation: Option<String>,
    max_hours_per_week: Option<i32>,
    is_part_time: Option<bool>,
}
```

### Rooms

```rust
struct CreateRequest {
    name: String,
    building: Option<String>,
    capacity: Option<i32>,           // default 30
    is_active: Option<bool>,         // default true
}

struct UpdateRequest {
    name: Option<String>,
    building: Option<String>,
    capacity: Option<i32>,
    is_active: Option<bool>,
}
```

### Timeslots

```rust
struct CreateRequest {
    day_of_week: i32,                // 0=Monday..4=Friday
    period: i32,
    start_time: NaiveTime,
    end_time: NaiveTime,
    is_break: Option<bool>,          // default false
    label: Option<String>,
}

struct UpdateRequest {
    day_of_week: Option<i32>,
    period: Option<i32>,
    start_time: Option<NaiveTime>,
    end_time: Option<NaiveTime>,
    is_break: Option<bool>,
    label: Option<String>,
}
```

## Response DTOs

Reuse existing `*Response` structs from the list endpoints. Create and update return the full entity response. Delete returns 204 No Content.

## Deletion Strategy

- **Soft delete** for entities with `is_active` column: classes, subjects, teachers, rooms, timeslots. Sets `is_active = false` and `updated_at = now()`.
- **Hard delete** for terms (no `is_active` column). FK constraints prevent deletion if curriculum entries reference the term.
- List endpoints filter to `is_active = true` by default. Admins can pass `?include_inactive=true` to see all.

## Validation & Error Handling

| Check | Response |
|-------|----------|
| Non-admin role | 403 Forbidden |
| Missing required field | 400 Bad Request (serde deserialization error) |
| Duplicate unique key (e.g., teacher abbreviation per school) | 409 Conflict |
| Referenced FK doesn't exist or wrong school | 400 Bad Request |
| Entity not found or wrong school on update/delete | 404 Not Found |

### Unique Constraints (per school)

- **Teachers:** `(school_id, abbreviation)`
- **Subjects:** `(school_id, abbreviation)` — `uq_subjects_school_abbreviation`
- **Rooms:** `(school_id, name)` — `uq_rooms_school_name`
- **Timeslots:** `(school_id, day_of_week, period)`

### FK Verification

- **Terms:** `school_year_id` must belong to the school (join through `school_years.school_id`)
- **Classes:** `class_teacher_id` (if provided) must be an active teacher in the same school

## Handler Pattern

All handlers follow the curriculum controller pattern:

```rust
async fn create(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(req): Json<CreateRequest>,
) -> Result<Response> {
    // 1. Admin check
    // 2. Validate FKs / unique constraints
    // 3. Build ActiveModel with Set() for each field
    // 4. Insert and return response
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(entity_id): Path<Uuid>,
    Json(req): Json<UpdateRequest>,
) -> Result<Response> {
    // 1. Admin check
    // 2. Find entity by id + school_id filter → 404 if missing
    // 3. Apply only Set() fields that are Some()
    // 4. Set updated_at
    // 5. Update and return response
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(entity_id): Path<Uuid>,
) -> Result<Response> {
    // 1. Admin check
    // 2. Find entity by id + school_id filter → 404 if missing
    // 3. Soft: set is_active=false, updated_at=now()
    //    Hard (terms): delete row
    // 4. Return 204
}
```

## Testing

TDD: write failing integration tests first, then implement. One test module per controller.

Test cases per entity:
- Create: happy path → 201 with response body
- Create: duplicate unique key → 409
- Create: invalid FK → 400
- Update: happy path → 200 with updated fields
- Update: not found → 404
- Update: partial update (only some fields) → 200
- Delete: happy path → 204, entity has `is_active = false`
- List: filters inactive by default
- List: `?include_inactive=true` returns all
- All write operations: non-admin → 403

## Out of Scope

- Frontend management pages (next backlog item)
- Bulk create/import endpoints
- Pagination on list endpoints (not needed yet — reference data sets are small)
