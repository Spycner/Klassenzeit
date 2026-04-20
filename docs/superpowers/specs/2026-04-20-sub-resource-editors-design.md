# Sub-resource editors for base entities

**Date:** 2026-04-20
**Status:** Design approved, plan pending.

## Problem

Four sub-resource relations are exposed by the backend but have no UI, and one bulk endpoint ships without a button. Taken together they block the admin from ever marking the data complete:

1. **Room availability** (`PUT /api/rooms/{id}/availability`) whitelists the time blocks in which a room may be scheduled. Without it, the solver either has no data or has to assume always-available.
2. **Teacher qualifications** (`PUT /api/teachers/{id}/qualifications`) lists the subjects a teacher can teach. No UI, so every teacher looks unqualified.
3. **Teacher availability** (`PUT /api/teachers/{id}/availability`) records per-time-block status (`available` / `preferred` / `unavailable`). Same gap.
4. **WeekScheme time blocks** (`POST/PATCH/DELETE /api/week-schemes/{id}/time-blocks/...`) define the days-and-periods grid. Items 1 and 3 depend on rows here existing. The WeekScheme dialog currently shows only name and description.
5. **`POST /api/classes/{id}/generate-lessons`** seeds a class's lessons from its Stundentafel. No UI trigger, so the endpoint is unreachable without a raw API call.

All five tie off under the roadmap bullet "Sub-resource editors for base entities" in `docs/superpowers/OPEN_THINGS.md`, which bundles the generate-lessons button explicitly ("the shared pattern is 'manage related rows across class / stundentafel / lessons'").

## Goals

- Every base entity has inline editors for its related rows, inside the existing parent edit dialog.
- Availability grids render as a per-scheme `days × periods` layout with accessible cell controls.
- Qualifications editor reuses the existing chip picker pattern verbatim.
- Week-scheme time blocks follow the Stundentafel-entries nested-dialog pattern.
- One row-level "Generate lessons" action on the SchoolClasses page calls the bulk endpoint and reports the result.

## Non-goals

- Solver enforcement of the new availability / qualification data.
- Dedicated detail routes for any parent entity (kept list-only).
- Room-side "allowed subjects" editing from the Subject page (done reverse-only through rooms).
- Backend schema changes. All endpoints and shapes already exist.
- Typed deletion errors (tracked separately under "Typed deletion errors for in-use entities").
- Playwright coverage for the new flows; per-entity E2E remains deferred.

## Information architecture recap

| Entity    | Existing editor surface                        | Added in this PR                                                                            |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Room      | Edit dialog: name, short_name, capacity, suitability (shipped PR #103) | **Availability grid** section below the suitability picker.                                 |
| Teacher   | Edit dialog: first/last name, short_code, max_hours_per_week  | **Qualifications picker** section, **Availability grid** section, stacked below the form.    |
| WeekScheme| Edit dialog: name, description                 | **Time blocks table** (Add / Edit / Delete) nested Dialog pattern.                          |
| SchoolClass| List row actions: Edit, Delete                | **Generate lessons** row action with confirm + toast.                                        |

## Availability grids

### Cell semantics

Room availability is a **binary** whitelist. A cell is either selected (row exists for this room+time_block) or not. No empty-list special case: an empty list means "nothing is allowed" (strict), matching the backend's literal interpretation where `_build_room_detail` returns whatever rows are stored. Users who leave a brand-new room untouched get zero rows, and the solver sees "this room is never available." The create-room flow defaults to **all time blocks in the default scheme selected**; edit flow starts from the persisted set.

Teacher availability is **tri-state**:

- `available` (default; no DB row)
- `preferred` (row with `status="preferred"`)
- `unavailable` (row with `status="unavailable"`)

Cells render three side-by-side mini-buttons labelled `A` / `P` / `U` with matching background tokens (`bg-muted`, `bg-accent`, `bg-destructive`). The active state uses `aria-pressed="true"`. Cycling (one-button cycle through three states) was rejected: mini-buttons keep all three options visible and keyboard-reachable without an `aria-live` announcement on each press.

Color-only avoidance: cells render the initial letter regardless of the background.

### Layout

Both grids render as a `<table>`:

- First column: period number from `time_block.position`, unique across days inside a scheme.
- Remaining columns: Mon through Fri (`day_of_week ∈ {0..4}`), translated via `common.daysShort.{N}` / `common.daysLong.{N}`.
- Each body cell corresponds to a `TimeBlock` looked up by `(day_of_week, position)`.

Non-existent blocks (e.g., some day has no period 6) render as an empty `<td>` with no button. Keyboard tabbing skips over them naturally.

### Per-scheme sections

Each grid renders one section per `WeekScheme`. If the DB holds multiple schemes, each gets its own subheading (`Scheme name`), its own grid, and its own "Save availability" button. In practice most installs run with a single scheme; multiple-scheme installs see all schemes stacked.

Empty states:

- Zero schemes in DB: a single notice "Create a week scheme first" with no grid. The Save button is hidden.
- Scheme exists but has zero time blocks: "No time blocks yet in this scheme" inside the scheme's section. Save stays disabled until blocks are added elsewhere.

### Draft and save path

Each grid's draft state is a **single** union across all schemes, held in React state above the grid:

- Room: `selected: Set<string>` of `time_block_id`.
- Teacher: `statuses: Record<string, "preferred" | "unavailable">`. Absence means `available`.

Draft is seeded from the parent detail response. Each per-scheme grid reads and writes the subset that matches its time blocks; on save, the component submits the **full union** to the backend. Submitting only a slice would drop the persisted cells that belong to other schemes (full-replace semantics on `PUT`).

A Save button sits directly beneath the grid (inside the Teacher / Room section, not the parent dialog footer). Pending label `common.saving`. Success invalidates the parent detail query. Failure surfaces a generic `ApiError` toast and preserves the draft.

## Teacher qualifications editor

Reuses the existing `SubjectMultiPicker` component. Today it lives in `frontend/src/features/rooms/subject-multi-picker.tsx`; moving it to `frontend/src/features/subjects/subject-multi-picker.tsx` lets both Rooms (suitability, shipped) and Teachers (qualifications, new) import the same file without cross-feature coupling.

Write path: local draft state + explicit "Save qualifications" button calling `PUT /api/teachers/{id}/qualifications`. Identical pattern to room suitability.

## WeekScheme time blocks

Mirrors the Stundentafel entries pattern exactly.

- Inside the WeekScheme edit dialog, below the form, render a table:
  - Columns: Day, Position, Start, End, Actions.
  - Day-of-week rendered via `common.daysLong.{N}`.
- "Add time block" button opens a nested Dialog with a Zod form:
  - Day: `Select` with entries `0..4`.
  - Position: `Input type="number"` with `min={1}`.
  - Start / End: `Input type="time"`, stored as `HH:MM:SS`.
- Per-row Edit opens the same dialog in edit mode (pre-populates, PATCH on submit).
- Per-row Delete opens a confirm dialog; DELETE on confirm.
- Backend uniqueness `(week_scheme_id, day_of_week, position)` returns 409 → `form.setError("root", { message: t("weekSchemes.timeBlocks.errors.duplicate") })`.

Empty state: "No time blocks yet. Add one to start planning the week."

Deleting a time block that is referenced by a room or teacher availability returns 409 with the generic message. No typed handler in this pass; the generic toast surfaces it.

## Generate-lessons action

Added as a third row action on the SchoolClasses page, next to Edit and Delete:

- Button label: `schoolClasses.generateLessons.action`.
- Opens a confirm Dialog:
  - Title: `schoolClasses.generateLessons.confirmTitle`.
  - Description: `schoolClasses.generateLessons.confirmDescription` ("Generate remaining lessons for {name} from its curriculum?").
  - Cancel / Confirm.
- On confirm, POST `/api/classes/{id}/generate-lessons`. Response is `list[LessonResponse]`.
- Toast on success:
  - Non-empty response: `schoolClasses.generateLessons.created_one` / `_other` via i18next plural, interpolating `count`.
  - Empty response: `schoolClasses.generateLessons.noneCreated`.
- Invalidations: `["lessons"]` and `["classes"]`.

No pre-flight "count how many would be created" step. The confirmation copy is written to not promise a number.

## Component layout

```
frontend/src/features/subjects/
  subject-multi-picker.tsx          # moved from features/rooms/
  subject-multi-picker.test.tsx     # moved from features/rooms/

frontend/src/features/rooms/
  rooms-dialogs.tsx                 # edited: import moved; add AvailabilityGrid section
  room-availability-grid.tsx        # new
  room-availability-grid.test.tsx   # new
  hooks.ts                          # edited: useSaveRoomAvailability mutation

frontend/src/features/teachers/
  teachers-dialogs.tsx              # edited: add qualifications + availability sections
  teacher-availability-grid.tsx     # new
  teacher-availability-grid.test.tsx# new
  teacher-qualifications-editor.tsx # new
  teacher-qualifications-editor.test.tsx # new
  hooks.ts                          # edited: useSaveTeacherAvailability,
                                    #         useSaveTeacherQualifications,
                                    #         useTeacher (detail)

frontend/src/features/week-schemes/
  week-schemes-dialogs.tsx          # edited: add TimeBlocksTable section + nested dialogs
  time-blocks-table.tsx             # new
  time-blocks-table.test.tsx        # new
  hooks.ts                          # edited: useWeekScheme (detail) + block CRUD mutations
  schema.ts                         # edited: TimeBlockFormSchema

frontend/src/features/school-classes/
  school-classes-page.tsx           # edited: row action
  generate-lessons-dialog.tsx       # new
  generate-lessons-dialog.test.tsx  # new
  hooks.ts                          # edited: useGenerateLessons mutation

frontend/src/components/
  availability-cell.tsx             # optional: shared binary/tri-state cell renderer
                                    # decide during implementation; inline if cleaner
```

Helper names are feature-prefixed to keep `scripts/check_unique_fns.py` happy:

- `RoomAvailabilityGrid`, `handleRoomAvailabilitySave`, `useSaveRoomAvailability`
- `TeacherAvailabilityGrid`, `handleTeacherAvailabilitySave`, `useSaveTeacherAvailability`
- `TeacherQualificationsEditor`, `handleTeacherQualificationsSave`, `useSaveTeacherQualifications`
- `TimeBlocksTable`, `TimeBlockFormDialog`, `DeleteTimeBlockDialog`, `handleTimeBlockSubmit`
- `GenerateLessonsButton`, `GenerateLessonsConfirmDialog`, `handleGenerateLessonsConfirm`

## Data flow

### Room edit dialog

1. Open dialog → `useRoom(id)` detail fetch (already in `features/rooms/hooks.ts`).
2. Detail returns `availability: [{ time_block_id, day_of_week, position }, ...]`.
3. Dialog seeds:
   - `selectedSubjects` (existing suitability picker state).
   - `selectedTimeBlocks: Set<string>` from `availability.map(a => a.time_block_id)`.
4. `useWeekSchemes()` list + one `useWeekScheme(schemeId)` detail per scheme ID returned.
5. For each scheme, render `<RoomAvailabilityGrid>` with `value`, `onChange`, and the scheme's time blocks.
6. User toggles cells; `onChange` patches `selectedTimeBlocks`.
7. Click Save-availability → `useSaveRoomAvailability().mutateAsync(roomId, Array.from(selectedTimeBlocks))`.
8. On success, invalidate `["rooms", roomId]`. Close is up to the user; dialog stays open (consistent with suitability save).

### Teacher edit dialog

Parallel to Room. Two separate sections (qualifications + availability). Each has its own Save button. Availability section submits tri-state entries:

```ts
entries: Array<{ time_block_id: string; status: "preferred" | "unavailable" | "available" }>;
```

`available` cells are **omitted** from the request body (absence = default). The backend discards duplicates and accepts the minimal list.

### WeekScheme edit dialog

`useWeekScheme(schemeId)` returns the scheme plus time blocks. The TimeBlocksTable renders rows sorted by `(day_of_week, position)`.

- Add / Edit / Delete each fire their respective REST call and invalidate `["weekSchemes", schemeId]`.

### SchoolClass row

`useGenerateLessons().mutateAsync(classId)` → POST, then toast + invalidate.

## Hooks additions

```ts
// rooms/hooks.ts
export function useSaveRoomAvailability() { /* POST-free PUT; mutate on {roomId, timeBlockIds} */ }

// teachers/hooks.ts
export function useTeacher(id: string) { /* queryKey ["teachers", id], GET /api/teachers/{id} */ }
export function useSaveTeacherQualifications() { /* PUT /api/teachers/{id}/qualifications */ }
export function useSaveTeacherAvailability() { /* PUT /api/teachers/{id}/availability */ }

// week-schemes/hooks.ts
export function useWeekScheme(id: string) { /* already exists as queryKey or add if missing */ }
export function useCreateTimeBlock(schemeId: string) { /* POST */ }
export function useUpdateTimeBlock(schemeId: string) { /* PATCH */ }
export function useDeleteTimeBlock(schemeId: string) { /* DELETE */ }

// school-classes/hooks.ts
export function useGenerateLessons() { /* POST /api/classes/{id}/generate-lessons, invalidates lessons + classes */ }
```

Each mutation invalidates the corresponding query keys and uses the typed `client` from `@/lib/api-client`.

## Zod schemas

```ts
// features/week-schemes/schema.ts (addition)
export const TimeBlockFormSchema = z.object({
  day_of_week: z.number().int().min(0).max(4),
  position: z.number().int().min(1),
  start_time: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/), // HH:MM
  end_time: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/),
});
```

Flat per the root CLAUDE.md rule (no `z.coerce`, no `.default`, no `.transform`). The `HH:MM` regex is loose; the backend accepts ISO `time` format so the client sends `"08:00:00"` by appending `:00` during submit. No end-after-start validation client-side; the backend accepts any pair and the solver treats `start > end` as the empty range.

## i18n

Add to both `en.json` and `de.json`:

```
common.daysShort.0..4           # "Mon".."Fri" / "Mo".."Fr"
common.daysLong.0..4            # "Monday".."Friday" / "Montag".."Freitag"
common.start                    # "Start" / "Start"
common.end                      # "End" / "Ende"
common.position                 # "Period" / "Stunde"

rooms.availability.sectionTitle
rooms.availability.noSchemes
rooms.availability.noBlocks
rooms.availability.cellAvailable
rooms.availability.cellUnavailable
rooms.availability.save
rooms.availability.saved

teachers.qualifications.sectionTitle
teachers.qualifications.save
teachers.qualifications.saved
teachers.qualifications.empty

teachers.availability.sectionTitle
teachers.availability.noSchemes
teachers.availability.noBlocks
teachers.availability.status.available
teachers.availability.status.preferred
teachers.availability.status.unavailable
teachers.availability.save
teachers.availability.saved

weekSchemes.timeBlocks.sectionTitle
weekSchemes.timeBlocks.add
weekSchemes.timeBlocks.empty
weekSchemes.timeBlocks.columns.day
weekSchemes.timeBlocks.columns.position
weekSchemes.timeBlocks.columns.start
weekSchemes.timeBlocks.columns.end
weekSchemes.timeBlocks.columns.actions
weekSchemes.timeBlocks.createTitle
weekSchemes.timeBlocks.editTitle
weekSchemes.timeBlocks.deleteTitle
weekSchemes.timeBlocks.deleteDescription
weekSchemes.timeBlocks.errors.duplicate

schoolClasses.generateLessons.action
schoolClasses.generateLessons.confirmTitle
schoolClasses.generateLessons.confirmDescription
schoolClasses.generateLessons.confirm
schoolClasses.generateLessons.created_one
schoolClasses.generateLessons.created_other
schoolClasses.generateLessons.noneCreated
```

No removals.

## MSW handlers (`frontend/tests/msw-handlers.ts`)

Mutable state, each reset in `beforeEach`:

```ts
roomAvailabilityByRoomId: Record<string, string[]>
teacherQualsByTeacherId: Record<string, string[]>
teacherAvailabilityByTeacherId: Record<string, Array<{ time_block_id: string; status: string }>>
timeBlocksBySchemeId: Record<string, Array<TimeBlock>>
```

New handlers:

- `PUT /api/rooms/:roomId/availability` — replaces the stored list, returns updated `RoomDetailResponse`.
- `PUT /api/teachers/:teacherId/qualifications` — stores subject IDs, returns updated `TeacherDetailResponse`.
- `PUT /api/teachers/:teacherId/availability` — stores entries, returns updated `TeacherDetailResponse`.
- `POST /api/week-schemes/:schemeId/time-blocks` — appends to the seeded list, returns the new `TimeBlockResponse`; 409 on duplicate `(day, position)`.
- `PATCH /api/week-schemes/:schemeId/time-blocks/:blockId` — patches in place, 404 on mismatch.
- `DELETE /api/week-schemes/:schemeId/time-blocks/:blockId` — removes, returns 204.
- `POST /api/classes/:classId/generate-lessons` — returns two fixed lessons from the seed (stable, not dependent on class).

Reset loop in `tests/setup.ts` mirrors the existing `stundentafelEntriesByTafelId` block.

## Testing

### Vitest (new)

- `features/rooms/room-availability-grid.test.tsx`: cell toggle updates state, Save calls PUT with union across schemes, empty-schemes notice renders.
- `features/teachers/teacher-qualifications-editor.test.tsx`: picker add/remove, Save calls PUT with selected subject IDs.
- `features/teachers/teacher-availability-grid.test.tsx`: mini-buttons set status, `available` cells omitted from request body, Save calls PUT.
- `features/week-schemes/time-blocks-table.test.tsx`: add time block via nested Dialog, edit existing, delete, 409 duplicate surfaces form root error.
- `features/school-classes/generate-lessons-dialog.test.tsx`: confirm button calls POST, toast shows created count, empty response shows noneCreated.

### Vitest (edits)

- `features/rooms/rooms-dialogs.test.tsx`: extend to cover that availability section renders and saves without interfering with the existing suitability save.
- `features/teachers/teachers-dialogs.test.tsx`: extend to cover the two new sections.
- `features/week-schemes/week-schemes-dialogs.test.tsx`: extend to cover the time blocks table within the edit dialog.
- `features/school-classes/school-classes-page.test.tsx`: add a row-action interaction asserting the confirm opens.

### Coverage

Run `mise run fe:cov:update-baseline` after the suite passes. Expect baseline to rise; the new components are well-covered.

### Playwright

Defer. Per-entity E2E remains under the existing OPEN_THINGS item.

## Accessibility checklist

- Every grid cell is `<button type="button">` with a full `aria-label` (day + position + current state).
- Day / period headers use `<th>` inside `<table>`.
- Tri-state cells use `aria-pressed` to announce the active mini-button.
- Section Save buttons carry their own labels, not reused `common.save`, so screen readers announce what is being saved (`rooms.availability.save`, etc.).
- Nested Dialogs use `DialogTitle` and `DialogDescription`.

## Risks and caveats

- **Empty availability = strict "no time." This is the backend's literal model and the spec accepts it. A fresh room defaults to all blocks selected in the create flow to avoid a user accidentally locking a room out.
- **Cross-scheme union.** The draft state is a union across schemes. Save always submits the union; otherwise a scheme-B edit would drop scheme-A's cells. Tests cover this.
- **Tri-state submission mapping.** `available` cells do not submit rows. If a cell was previously `preferred` or `unavailable` and is now toggled to `available`, the row's absence in the PUT body deletes it. Tests cover the explicit "toggle to available removes the row" path.
- **Missing time blocks after a scheme edit.** If a time block is deleted elsewhere, the room / teacher draft still references it. The backend validates FKs on PUT and returns 409; the user sees a generic toast. Acceptable; refreshing the dialog reloads the detail and drops the stale reference. Not something this pass engineers around.
- **Generate-lessons idempotency.** The endpoint skips subjects already assigned; double-clicking the confirm is safe. The toast wording ("No new lessons generated") makes the no-op case obvious.
- **WeekScheme deletion with in-use time blocks.** Deleting a time block referenced by availability returns generic 409. Tracked under the existing typed-deletion-errors item; not fixed here.

## Scope boundaries

In scope:

- The five editors above, with tests, i18n, MSW, coverage bump.

Out of scope:

- Solver enforcement of the new fields.
- Typed deletion errors for in-use entities (separate pass).
- Bulk import or export.
- `updated_at`-based dashboard tile.
- `active` flag on WeekScheme.

## ADR

No ADR needed. This spec decomposes into implementation of existing endpoints; no new dependency, no new subsystem, no load-bearing architectural decision. If the grid component is later promoted to a shared primitive (e.g., used for solver output visualisation), a `grid-primitive` ADR can land with that work.

## Commit sequence (suggested)

1. `refactor(frontend): move SubjectMultiPicker from rooms to subjects feature`.
2. `feat(frontend): add week-scheme time blocks editor`.
3. `feat(frontend): add teacher qualifications editor`.
4. `feat(frontend): add room availability editor`.
5. `feat(frontend): add teacher availability editor with tri-state cells`.
6. `feat(frontend): generate-lessons row action on school-classes page`.
7. `chore(frontend): ratchet coverage baseline after sub-resource editors`.
8. `docs: update OPEN_THINGS and roadmap after sub-resource editors`.

Steps 2–6 share `en.json` / `de.json` and `tests/msw-handlers.ts`, so execution runs sequentially (not in parallel).

## OPEN_THINGS updates

- Remove "Sub-resource editors for base entities." (all shipped)
- Remove "Bulk 'Generate lessons from Stundentafel' UI." (shipped)
- Remove "Multi-select chip editors for sub-resources." (pattern validated; no further work).
- Keep "Typed deletion errors for in-use entities."
- Keep the remaining polish / prod items.
