# Teacher Availability + Room Suitability Editors — Design

**Backlog items:** 4a (Teacher availability UI) and 4b (Room suitability UI). This is PR2 of the solver-constraints-ui work; PR1 (1e) landed in #55.
**Date:** 2026-04-06
**Status:** Approved, ready for planning

## Goal

Let school admins edit two datasets that the solver already consumes but that today can only be set via seed data:

1. **Teacher preferred/blocked slots** — weekly grid per teacher. Marks each (day, period) as `available`, `preferred`, or `blocked`. Feeds `teacher_availabilities` which the solver reads via `load_schedule_input`.
2. **Room subject suitability** — checkbox matrix per room of which subjects may use it. Feeds `room_subject_suitabilities`, likewise consumed by the solver.

Both tables and the solver-side wiring already exist. This spec adds the HTTP endpoints and the UI dialogs that let admins maintain them.

## Non-goals

- **Per-term availability overrides.** `teacher_availabilities.term_id` is nullable and the scheduler reads both term-specific and default rows, but the UI only edits the default scope (`term_id IS NULL`). Term overrides are a future power feature.
- **Bulk edit / drag selection.** Single-click cell cycling is sufficient for a 5×10 grid.
- **Notes on suitabilities.** `room_subject_suitabilities.notes` is ignored — plain boolean matrix only.
- **Reason text on availability slots.** `teacher_availabilities.reason` is ignored.
- **Changing the solver.** PR1 already wired weights and softening. No scheduler changes here.
- **Editing teacher `max_hours`, subject qualifications, etc.** Those belong to the main teacher edit dialog and stay out of scope.

## Constraint inventory (informational)

The solver already consumes both datasets:

| Scheduler field | Source | PR2 UI |
|---|---|---|
| `Teacher.available_slots` | `teacher_availabilities` rows with `type = 'blocked'` exclude the slot | Availability dialog |
| `Teacher.preferred_slots` | rows with `type = 'preferred'` mark the slot | Availability dialog |
| `Room.suitable_subjects` | `room_subject_suitabilities` rows | Suitability dialog |

No data migration is required. Existing rows are preserved as-is.

## Backend — Teacher availabilities endpoints

### Routes

Prefix: `api/schools/{id}/teachers/{teacher_id}/availabilities`

| Method | Auth | Body | Response |
|---|---|---|---|
| GET | member | — | `[{ day_of_week, period, availability_type, reason? }]` |
| PUT | **admin** | `[{ day_of_week, period, availability_type }]` | 204 No Content |

Both accept an optional `?term_id=<uuid>` query parameter. Default (omitted) edits the `term_id IS NULL` scope. The UI in this PR always omits it; the API surface exposes it anyway so a future per-term editor can reuse the endpoint without migration.

### Semantics

- **Replace-all.** On `PUT`, delete existing rows for the `(teacher_id, term_id)` scope and insert the new set in a single transaction (mirrors `room_timeslot_capacities::replace`).
- **Only non-`available` entries are persisted.** If the client sends `availability_type = "available"` for a slot, the server drops it — `available` is the absence of a row.
- **Tenant scoping.** Before any read or write, verify the target teacher belongs to `school_ctx.school.id` by filtering the teachers query. 404 on mismatch.

### Validation

- `day_of_week ∈ 0..=4`
- `period ∈ 1..=10`
- `availability_type ∈ {"available", "blocked", "preferred"}` (but only blocked/preferred are persisted)
- No duplicate `(day_of_week, period)` pairs in the PUT body — reject with 422.

Validation errors return 422 with a short message.

### Error handling

- Teacher not found or belongs to another school → 404
- Non-admin PUT → 403 via `AuthError::Forbidden`
- DB error → 500

## Backend — Room suitability endpoints

### Routes

Prefix: `api/schools/{id}/rooms/{room_id}/suitabilities`

| Method | Auth | Body | Response |
|---|---|---|---|
| GET | member | — | `[{ subject_id }]` |
| PUT | **admin** | `{ "subject_ids": [uuid, ...] }` | 204 No Content |

### Semantics

- Replace-all inside a transaction — delete existing `room_id` rows, insert the new set.
- **Tenant scoping.** Verify room belongs to `school_ctx.school.id` (404 on mismatch). For each submitted `subject_id`, verify it belongs to the same school (422 on mismatch — admin must not be able to attach another school's subjects).
- Duplicate IDs in the body → deduped silently.

### Validation

- Every `subject_id` must exist in `subjects` and have `school_id = school_ctx.school.id`. Otherwise 422 with `{ "errors": { "subject_ids": "unknown or cross-tenant" } }`.

## Frontend — Teacher availability dialog

### Location

New component `frontend/src/app/[locale]/schools/[id]/settings/components/teacher-availability-dialog.tsx`. Invoked from a new icon button in the existing `teachers-tab.tsx` action column.

### Layout

- Dialog with header ("Availability for {teacher name}"), legend, grid, footer.
- **Legend:** three swatches — Available (muted), Preferred (green), Blocked (red).
- **Grid:** columns = Mon–Fri (labels from i18n `settings.timeslots.days.*` which already exists). Rows = periods derived from the school's non-break `time_slots` (so we respect whatever period range is configured). Period range computed once from the current school's timeslots on dialog open.
- **Cell interaction:** single click cycles state in order Available → Preferred → Blocked → Available. Cell shows state label in small text + background color.
- **Footer:** Save (primary) + Cancel. Save sends PUT, shows toast, closes dialog. Cancel closes without saving.

### State

- Plain React state. `useState` for the 2D cell-state map keyed by `${day}-${period}`. On mount, GET the availabilities; populate state. Unmentioned cells default to `available`.
- `useApiClient` for GET/PUT. Same `TestKeyPair` + real middleware pattern on the backend-tests side.
- Sonner toasts for success/error.
- Loading spinner while GET is in flight, then render the grid.

### i18n

New keys under `settings.teachers.availability.*`:
- `button_label`, `dialog_title`, `legend.available`, `legend.preferred`, `legend.blocked`
- `save`, `cancel`, `saved_toast`, `error_toast`

Day/period labels reuse existing keys (`settings.timeslots.days.*`).

## Frontend — Room suitability dialog

### Location

`frontend/src/app/[locale]/schools/[id]/settings/components/room-suitability-dialog.tsx`, invoked from a new icon button in `rooms-tab.tsx`.

### Layout

- Dialog: header ("Suitable subjects for {room name}"), subject list, footer.
- **List:** all subjects for the current school, sorted by name. Each row is a checkbox + subject name. Scrollable container if long.
- **Footer:** Save + Cancel.

### State

- `useState<Set<string>>` holding the checked subject IDs.
- On mount, GET subjects (already available via existing subjects endpoint) and GET current suitabilities in parallel.
- On Save, PUT `{ subject_ids: Array.from(checked) }`. Toast + close.

### i18n

New keys under `settings.rooms.suitability.*`: `button_label`, `dialog_title`, `save`, `cancel`, `saved_toast`, `error_toast`, `empty_subjects_hint`.

## Data flow

```
User clicks Availability button → Dialog opens
  → GET /api/schools/{id}/teachers/{tid}/availabilities
  → Grid populated
  → User clicks cells to cycle states
  → User clicks Save
  → PUT /api/schools/{id}/teachers/{tid}/availabilities
  → Backend DELETE-then-INSERT in transaction
  → 204 → toast → dialog closes
```

Suitability dialog follows the analogous flow against `/rooms/{rid}/suitabilities`.

The scheduler picks up changes on the next solve trigger because `load_schedule_input` reads both tables fresh each time.

## Tests

### Backend (integration tests in `backend/tests/requests/`)

**`teacher_availabilities.rs`** (new):

- `get_returns_empty_when_no_rows` — GET with no rows returns `[]`.
- `put_as_admin_persists_blocked_and_preferred` — PUT body with one blocked + one preferred + one available; GET returns only the blocked + preferred (available dropped).
- `put_replaces_existing_state` — seed two rows, PUT a single different row, GET returns only the new row.
- `put_as_non_admin_returns_403` — same harness helper as PR1 uses.
- `put_with_invalid_day_returns_422` — `day_of_week = 9`.
- `put_with_unknown_teacher_returns_404`.
- `get_with_teacher_from_other_school_returns_404` — tenant isolation check.

**`room_suitabilities.rs`** (new):

- `get_returns_empty_when_no_rows`.
- `put_as_admin_persists_subject_list`.
- `put_replaces_existing_state`.
- `put_as_non_admin_returns_403`.
- `put_with_cross_tenant_subject_returns_422` — subject from another school.
- `put_with_unknown_room_returns_404`.

Both files register in `backend/tests/requests/mod.rs`. Use the existing `setup_admin_school` / `setup_teacher_school` helpers and `valid_claims` / `TestKeyPair` JWT harness from `helpers::jwt` (same pattern PR1 used).

### Frontend (vitest component tests in `frontend/src/__tests__/`)

**`teacher-availability-dialog.test.tsx`**:

- Renders all cells as "available" when GET returns `[]`.
- Renders existing blocked/preferred cells with the right state after GET resolves.
- Clicking a cell cycles Available → Preferred → Blocked → Available.
- Clicking Save issues PUT with only non-available cells in the body.
- Cancel button closes the dialog without calling PUT.

**`room-suitability-dialog.test.tsx`**:

- Renders subject list after parallel GET resolves.
- Initially-checked rows match the fetched suitabilities.
- Toggling a checkbox updates UI state.
- Save issues PUT with current set of checked IDs.

Mock `useApiClient`, `useParams`, `next-intl`, `sonner` using the same pattern as `scheduler-tab.test.tsx` from PR1.

## Open questions

None blocking. Deferred for later:

- Per-term availability overrides (add term picker + `term_id` query param wiring in a future PR).
- Reason strings on blocked slots (useful for audit but not required for the solver).
- Bulk selection on the availability grid (drag-to-paint, shift-click ranges).
- Undo/redo within the dialog (Cancel is sufficient for now since state is local until Save).
