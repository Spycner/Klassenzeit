# Manual Timetable Editing — Design

**Date:** 2026-04-07
**Backlog item:** 2c
**Status:** Approved

## Goal

Let admins fix the **applied** timetable by hand: move a lesson to a different timeslot, swap two lessons, reassign a lesson's room or teacher — and immediately see whether the change introduces violations.

This is the post-generation safety valve. Generation gives a feasible plan; manual editing handles the messy reality (sick teacher, broken room, parent meeting, last-minute swap).

## Non-goals

- Adding or removing lessons (changes per-subject hours — that's curriculum editing).
- Server-side edit history / audit log (covered separately by Tier 4f).
- Multi-select drag, lasso, bulk move.
- Mobile / touch drag polish (covered by 2f).
- Editing the unsolved `/schedule` preview — preview already gets discarded on apply; edits there would be wasted work.

## User stories

1. As an admin, I open `/timetable`, drag a lesson from Mon-1 to Mon-2 in class view, and the change is saved with one HTTP round-trip.
2. As an admin, I drop a lesson on an occupied cell and the two lessons swap timeslots (and rooms).
3. As an admin, I open a lesson's edit menu and reassign a different room or teacher.
4. After every edit, the violations panel updates automatically. If my edit *introduces* a hard violation, I see it immediately but the edit still goes through — overrides are allowed.
5. I can undo my last 10 edits via an Undo button (browser session only).
6. Non-admin school members see the timetable read-only — no drag affordance, no edit menu.

## Architecture

### Backend

Two new endpoints under the existing lessons controller (`backend/src/controllers/lessons.rs`).

#### `PATCH /api/schools/{school_id}/terms/{term_id}/lessons/{lesson_id}`

- **Auth:** admin role on the school (via `SchoolContext`).
- **Body** (all fields optional, at least one required):
  ```json
  { "timeslot_id": "...", "room_id": "..." | null, "teacher_id": "..." }
  ```
- **Validation:**
  - Lesson exists, belongs to a term whose `school_year.school_id` matches the caller's school.
  - Each provided id (timeslot, room, teacher) belongs to the same school.
  - `timeslot_id`, if given, refers to a non-break timeslot.
  - `room_id` may be `null` (clear assignment).
- **Effect:** updates the row in `lessons` table.
- **Response:**
  ```json
  {
    "lesson": LessonResponse,
    "violations": Violation[]   // freshly computed for the whole term
  }
  ```

#### `POST /api/schools/{school_id}/terms/{term_id}/lessons/swap`

- **Auth:** admin.
- **Body:** `{ "lesson_a_id": "...", "lesson_b_id": "..." }`.
- **Validation:** both lessons exist and belong to the same term.
- **Effect:** atomically swap `(timeslot_id, room_id)` between the two lessons inside one DB transaction.
- **Response:** `{ "lessons": [LessonResponse, LessonResponse], "violations": Violation[] }`.

#### Shared violation pipeline

Both endpoints reuse the existing `diagnose()` pass:

1. Load all lessons for the term from DB after the update.
2. Build `ProblemFacts` and `ScheduleInput` via the same builder used by the solver worker (`services::scheduler` — already exists).
3. Call `scheduler::constraints::diagnose(&input, &facts)`.
4. Map `Violation` → `ViolationDto` (already defined for the solve endpoint).

This keeps a single source of truth: the same code that scores solver output also scores hand edits. To avoid duplication, extract the "load term lessons → ProblemFacts → diagnose → DTOs" sequence into a helper in `services::scheduler` (e.g. `evaluate_term_violations(ctx, term_id) -> Result<Vec<ViolationDto>>`).

#### Tenancy

Tenant scoping mirrors the existing `list` handler in `lessons.rs`: look up the lesson's term, find its `school_year`, ensure `school_id == school_ctx.school.id`. Same for any referenced timeslot/room/teacher (each has `school_id`).

### Frontend

#### Drag library

Use **`@dnd-kit/core`** (and `@dnd-kit/utilities`). Small, accessible (keyboard support), works inside table cells, no HTML5-DnD quirks.

#### Component changes

`<TimetableGrid>` (`frontend/src/components/timetable/timetable-grid.tsx`) gains:

- `editable?: boolean` — when false (default), grid behaves as today.
- `onLessonMove?: (lessonId, targetTimeslotId) => void`
- `onLessonSwap?: (lessonAId, lessonBId) => void`
- `onLessonEdit?: (lessonId) => void` — opens the edit dialog.

When `editable` is true:

- The grid is wrapped in `<DndContext>`.
- Each filled, non-break cell renders `<DraggableLesson>` (uses `useDraggable`).
- Each non-break cell registers as a `<DropTarget>` (uses `useDroppable`) keyed by `(day, period)` → resolves to a `timeslot_id`.
- Drop on an empty cell → `onLessonMove(lessonId, targetTimeslotId)`.
- Drop on a cell already containing a lesson → `onLessonSwap(activeId, overId)`.
- Each lesson cell shows a small kebab button → `onLessonEdit(lessonId)`.
- Drag affordance: `cursor-grab`, slight opacity on the original cell while dragging, drop targets get a dashed outline on hover.

**Drag semantics across views:** drag always means "move this lesson to a different timeslot." Reassigning teacher/room is exclusively via the edit dialog. This keeps the drag model simple regardless of view mode (class/teacher/room).

#### New components

- `<LessonEditDialog>` — opens from the kebab. Two selects: room (school's rooms + a "no room" option, hinted by suitability) and teacher (school's teachers, hinted by qualification + availability). On submit issues `PATCH` with the changed fields.
- `<UndoToolbar>` (small) — "Undo" button, disabled when stack empty. Lives in the timetable page header.

#### Page wiring (`frontend/src/app/[locale]/schools/[id]/timetable/page.tsx`)

- Read `role` from existing school context hook; only pass `editable` when `role === "admin"`.
- Hold `lessons` and `violations` in state. On mount, fetch both: `GET .../lessons` plus a new `GET .../lessons/violations` (or piggyback on the first call). Simplest: extend `GET .../lessons` to optionally return violations behind a `?include_violations=true` query param. **Decision: extend the existing endpoint** with the query param — avoids a second round trip and keeps the endpoint count small.
- Edit handlers wrap the API calls:
  ```ts
  async function handleMove(lessonId, targetTimeslotId) {
    const prev = lessons;
    setLessons(optimisticallyMove(prev, lessonId, targetTimeslotId));
    try {
      const { lesson, violations } = await apiClient.patch(...);
      setLessons(replaceLesson(prev, lesson));
      setViolations(violations);
      pushUndo({ kind: "patch", lessonId, prev: extractPrev(prev, lessonId) });
    } catch (e) {
      setLessons(prev);
      toast.error(...);
    }
  }
  ```
- The existing `<ViolationsPanel>` is reused as-is. It already accepts a `violations` prop; we just feed it the freshest array after every edit.

#### Undo

In-memory stack capped at 10. Each entry is an inverse operation:

- Move → previous `(timeslot_id, room_id)` for that lesson → inverse is `PATCH` back.
- Swap → inverse is the same swap with arguments reversed (no-op delta).
- Edit (via dialog) → inverse `PATCH` with the previous field values.

Cleared on term change or page unmount. No persistence.

### Data flow diagram

```
[admin drags lesson]
        |
        v
   <DragEnd>
        |
   onLessonMove(id, target)
        |
        v
optimistic setLessons   ─────┐
        |                    │
        v                    │
PATCH /lessons/{id}          │  on error: rollback
        |                    │
        v                    │
{ lesson, violations }       │
        |                    │
        v                    │
setLessons(replaced)  setViolations(new)
        |
        v
<TimetableGrid> + <ViolationsPanel> rerender
```

## Error handling

- Network/validation error → rollback optimistic update, show toast with backend error message.
- 403 (non-admin somehow calling the endpoint) → toast "Admin access required".
- 409 / constraint-introduced → never returned. We do not refuse edits that introduce hard violations; the panel surfaces them. (Documented explicitly so reviewers know it's intentional.)
- Concurrent edits from another admin → not handled in v1. Last write wins. The next refresh of the page picks up reality. Audit + concurrency control belong to 4f.

## Testing

### Backend (Rust)

- **Unit (controllers/lessons.rs):**
  - PATCH happy path: move to a new timeslot, response includes updated lesson + violations.
  - PATCH with `room_id: null` clears the assignment.
  - PATCH rejected for non-admin (403).
  - PATCH rejected when the lesson belongs to a different school (404).
  - PATCH rejected when the target timeslot is a break (400).
  - PATCH rejected when the target room/teacher belongs to a different school (400).
  - Swap happy path: two lessons exchange timeslot+room, both returned.
  - Swap rejected when the two lessons belong to different terms (400).
- **Integration (in `backend/tests`):** end-to-end with seed data — create lessons, hit PATCH, assert DB row updated and violations array structurally correct.
- **Diagnose reuse:** add a focused test that introducing a teacher conflict via PATCH yields a `TeacherDoubleBooking` violation in the response.

### Frontend (Bun test)

- `<TimetableGrid>` smoke: with `editable={true}` and `role="admin"`, draggable handles render; with `editable={false}` they don't.
- `<LessonEditDialog>` submits only changed fields.
- Undo stack: push 12 entries → length stays 10, oldest dropped.
- Optimistic-update rollback on PATCH failure.

(No new E2E in this PR; Playwright work is tracked under 3b.)

## Security

- All write endpoints gated by `require_admin(school_ctx)` — pattern reused from `controllers/scheduler.rs`.
- Tenant scoping verified at every step (lesson → term → school_year → school).
- No new SQL — all access via SeaORM models. No injection surface.

## Open questions

None — both ambiguities (drag semantics in non-class views, swap behavior across classes) were resolved during brainstorm: drag always means "move timeslot," swap is allowed across classes in any view.

## Files touched (anticipated)

- `backend/src/controllers/lessons.rs` — new PATCH/swap handlers, query param on list.
- `backend/src/services/scheduler.rs` (or sibling) — extract `evaluate_term_violations` helper.
- `backend/tests/requests/lessons.rs` — new integration tests (create file if missing).
- `frontend/src/components/timetable/timetable-grid.tsx` — editable mode, drag/drop wiring.
- `frontend/src/components/timetable/lesson-edit-dialog.tsx` — new.
- `frontend/src/components/timetable/undo-toolbar.tsx` — new.
- `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx` — edit handlers, undo stack, role gate.
- `frontend/src/lib/types.ts` — `PatchLessonRequest`, `SwapLessonsRequest`, response type with `violations`.
- `frontend/messages/{en,de}.json` — strings for edit dialog, undo, error toasts.
- `frontend/package.json` — add `@dnd-kit/core`, `@dnd-kit/utilities`.
