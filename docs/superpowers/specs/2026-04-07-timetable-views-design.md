# Timetable Views (Per-Class, Per-Teacher, Per-Room) — Design

**Status:** Draft
**Date:** 2026-04-07
**Roadmap item:** 2b — Timetable views

## Problem

The schedule page (`/schools/[id]/schedule`) only shows a per-class grid, and only while a generated solution is held in memory. There is no way to:

1. View the timetable from a teacher's or room's perspective.
2. View the *applied* (persisted) timetable after a page refresh — once a solution is applied, it disappears from the UI until the next solve.

Real users (teachers, room owners, admins planning around resources) think in all three dimensions, and they need to revisit the published timetable any time without re-running the solver.

## Goals

- Display the same timetable filtered by class, teacher, or room.
- Provide a stable, read-only viewer for the *applied* timetable that loads from the database.
- Reuse a single grid component across the preview (post-solve) and the persisted view.
- Keep the existing generation workflow unchanged in flow.

## Non-goals

- Drag-and-drop editing (→ 2c).
- Conflict highlighting / suggested fixes (→ 2d).
- PDF/Excel export, printable layouts (→ 2e).
- Mobile / responsive polish (→ 2f).
- Day-only view, week navigation, term comparison.

## Architecture

### Backend

Add one read endpoint:

```
GET /api/schools/{school_id}/terms/{term_id}/lessons
```

- **Auth:** any active member of the school (no admin gate). Tenant-scoped via `SchoolContext`.
- **Response:** `LessonResponse[]` — flat list of all persisted `lessons` rows for that term, scoped to the school via the term's `school_id`.
- **Schema (`LessonResponse`):**
  ```json
  {
    "id": "uuid",
    "term_id": "uuid",
    "class_id": "uuid",
    "teacher_id": "uuid",
    "subject_id": "uuid",
    "room_id": "uuid | null",
    "timeslot_id": "uuid",
    "week_pattern": "string"
  }
  ```
  Field naming matches the existing `SolveResultLesson` shape used by `GET /scheduler/solution` so the frontend grid can consume both interchangeably.
- **404** if the term does not exist or does not belong to the school. Empty array (200) if the term exists but has no applied lessons yet.
- **Controller location:** new `backend/src/controllers/lessons.rs`, registered under the school router with the term-scoped prefix.

### Frontend

#### New shared grid component

Extract the existing inline `<table>` from `schedule/page.tsx` into a reusable component:

```
frontend/src/components/timetable/timetable-grid.tsx
```

Props:

```ts
type ViewMode = "class" | "teacher" | "room";

interface TimetableGridProps {
  lessons: LessonLike[]; // SolveResultLesson | LessonResponse — overlap on the fields the grid reads
  viewMode: ViewMode;
  selectedEntityId: string;
  timeslots: TimeSlotResponse[];
  subjects: SubjectResponse[];
  teachers: TeacherResponse[];
  rooms: RoomResponse[];
  classes: SchoolClassResponse[];
  locale: string;
}
```

Behaviour:

- Filters `lessons` by the field corresponding to `viewMode` (`class_id` / `teacher_id` / `room_id`).
- Renders a 5-day × N-period grid (weekdays only, periods derived from non-break timeslots).
- Cell content varies by view mode:

  | Mode    | Top line             | Bottom line                          |
  |---------|----------------------|--------------------------------------|
  | class   | subject abbreviation | teacher abbr — room name             |
  | teacher | subject abbreviation | class name — room name               |
  | room    | subject abbreviation | class name — teacher abbr            |

- Cell background: subject color at 12% opacity (current behavior).
- Empty cells render an empty `<td>`.
- A lesson with `room_id == null` is hidden in **room** view but shown in class/teacher views with no room suffix.

The grid is **purely presentational** — no fetching, no business logic.

#### View-mode toggle component

```
frontend/src/components/timetable/view-mode-selector.tsx
```

A small client component combining:

- A 3-way segmented toggle: Class / Teacher / Room (i18n: `timetable.viewMode.*`).
- An entity dropdown whose options come from the chosen mode's collection.
- Persists the selection to `localStorage` per-school under key `timetable:lastView:{schoolId}` so users return to their preferred view on subsequent visits.

#### New `/timetable` route

```
frontend/src/app/[locale]/schools/[id]/timetable/page.tsx
```

- Loads reference data (terms, classes, subjects, teachers, rooms, timeslots) — same set as the schedule page.
- Loads applied lessons via `GET /api/schools/{id}/terms/{term_id}/lessons`.
- Header: term selector + view-mode selector.
- Body: `<TimetableGrid>` with the chosen mode/entity.
- Empty state when the term has no applied lessons: short message and a link to `/schedule` (admins only) to generate one. Non-admins just see "no timetable published yet".
- Read-only — no generate / apply / discard controls.
- Add a sidebar nav entry "Timetable" pointing to `/timetable` (the existing "Schedule" entry stays for the generation workflow).

#### Existing `/schedule` page

- Replace the inline `<table>` with `<TimetableGrid>` (no behavior change for the class view).
- Add the `<ViewModeSelector>` above the grid so admins can preview the just-generated solution from any of the three perspectives before applying it.
- All existing generate / apply / discard / violations behavior unchanged.

### Type sharing

Add to `frontend/src/lib/types.ts`:

```ts
export interface LessonResponse {
  id: string;
  term_id: string;
  class_id: string;
  teacher_id: string;
  subject_id: string;
  room_id: string | null;
  timeslot_id: string;
  week_pattern: string;
}
```

`SolveResultLesson` already has the same field names; both can be passed into the grid as `LessonLike`.

## Data flow

```
/timetable page                              /schedule page
     │                                            │
     ▼                                            ▼
GET /lessons (applied)              POST /scheduler/solve
     │                                  │
     ▼                                  ▼
LessonResponse[]                  SolveResult.timetable
     │                                  │
     └────────┐               ┌─────────┘
              ▼               ▼
        <TimetableGrid lessons={…} viewMode={…} />
```

## Testing

### Backend

- Unit-style integration test in `backend/tests/requests/lessons.rs`:
  - GET returns 200 + empty array for a term with no lessons.
  - GET returns lessons for the requested term only (verify cross-term isolation).
  - GET returns 404 for a term belonging to another school (tenant isolation).
  - GET returns 401 without auth.
  - Non-admin members can read.

### Frontend

- Component test for `TimetableGrid`:
  - Renders the right cells for each view mode against a fixed lessons fixture.
  - Filters out lessons in room view when `room_id` is null.
  - Renders empty `<td>` for slots with no lesson.
- Component test for `ViewModeSelector`:
  - Switching mode resets the entity to the first option.
  - Selection persists to `localStorage` under the per-school key.
- Page-level smoke test for `/timetable` mocking the new endpoint: empty state → renders, populated state → grid visible.

### E2E (manual, no automated coverage in this PR)

- Generate a solution → switch view modes in the preview → apply → navigate to `/timetable` → verify the same lessons render in all three modes.

## Migration / rollout

- No DB migration. The endpoint reads from the existing `lessons` table populated by `apply_solution`.
- No new permissions; the read endpoint follows the same `SchoolContext` pattern as other read endpoints.
- Sidebar gets one new entry; no removal.

## Open questions

None — proceeding with the design above.
