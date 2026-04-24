# Frontend schedule view: `/schedule` route with per-class week grid

**Date:** 2026-04-23
**Status:** Design approved, plan pending.

## Problem

The backend exposes `POST /api/classes/{class_id}/schedule` (runs the solver, persists placements, returns placements + violations) and `GET /api/classes/{class_id}/schedule` (persisted placements only). The frontend has no UI that consumes either endpoint. Sprint step 1 in `docs/superpowers/OPEN_THINGS.md` names the gap explicitly: "Schedule view in the frontend. New `/schedule` route (or a tab on the class detail) showing a week grid with class / teacher / room filters. Reuses the `kz-ws-grid` CSS that WeekSchemes already uses."

`frontend/src/lib/api-types.ts` is stale and does not yet know about the schedule endpoints (the file was regenerated before PR #119 / #120 landed). Any frontend code that calls them today would fail to typecheck.

## Goal

One frontend PR that:

1. Regenerates `api-types.ts` against the current backend OpenAPI so `/schedule` endpoints are typed.
2. Adds a `/schedule` route, a feature folder, and a new sidebar nav entry.
3. Renders a week grid populated from `GET /api/classes/{class_id}/schedule`, joined client-side against cached entity queries for labels (subject, time, room).
4. Provides a "Generate schedule" action that posts to the same endpoint, with an inline "replace N placements" banner when placements already exist.
5. Surfaces violations from the immediate POST response, and a derived "N hours unplaced" counter for GET-only loads.
6. Ships with Vitest hook and page tests and MSW handlers for both endpoints.

No backend changes. No new entity or endpoint work.

## Non-goals

- **Teacher- or room-centric schedule views.** Backend is per-class today; a cross-class aggregation needs either a new endpoint or N parallel fetches. Deferred (filed as follow-ups).
- **Persisted violations in `GET`.** Already tracked in `OPEN_THINGS.md` under "Acknowledged, not in scope this sprint".
- **Playwright E2E for generate → grid.** Sprint step 3 claims it; blocking this PR on step 2 (demo seed) contradicts sprint ordering.
- **Demo `Grundschule` seed.** Sprint step 2 owns the realistic data fixture; this PR renders whatever placements exist.
- **Class-detail-as-route refactor.** Class "detail" is a dialog today; promoting it to a route to host a tab would balloon scope.
- **Backend denormalisation of schedule response.** Client-side joins against already-cached entity queries are cheaper and keep the backend contract stable.
- **Day-boundary or multi-hour block rendering polish.** The grid treats every placement as a single-hour cell; `preferred_block_size > 1` solver support is filed under "Solver algorithm" in OPEN_THINGS, not a frontend concern.
- **`last_solved_at` freshness indicator.** No timestamp is persisted yet; adding one is a backend-scoped follow-up.

## Design

### Route and file layout

```
frontend/src/routes/_authed.schedule.tsx           # thin file-route
frontend/src/features/schedule/
├── schedule-page.tsx                              # page component
├── schedule-grid.tsx                              # grid render, reuses .kz-ws-grid
├── schedule-toolbar.tsx                           # class picker, generate button, derived stats
├── hooks.ts                                       # useClassSchedule, useGenerateClassSchedule
└── schedule-page.test.tsx, hooks.test.tsx, ...   # Vitest coverage
```

Route file is the standard ~10-line thin shell:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SchedulePage } from "@/features/schedule/schedule-page";

const scheduleSearchSchema = z.object({
  class: z.string().min(1).optional(),
});

export const Route = createFileRoute("/_authed/schedule")({
  component: SchedulePage,
  validateSearch: scheduleSearchSchema,
});
```

`z.string().min(1)` (not `z.string().uuid()`) mirrors the frontend CLAUDE.md rule about Zod v4's UUID RFC-4122 validation rejecting seed / test UUIDs like `11111111-…`.

### Search-param shape

`?class=<uuid>` drives the picker state. No class in the URL renders a "pick a class" empty state rather than auto-picking. This keeps the page deep-linkable without hidden default selection surprise.

### Data flow

The page mounts three layers of queries (all already cached by TanStack Query from other pages):

| Query | Hook | Used for |
|---|---|---|
| Classes list | `useSchoolClasses` | Class picker options |
| Active class's schedule | `useClassSchedule(classId)` (new) | Placements to plot |
| Subjects, rooms, lessons, week-scheme detail | `useSubjects`, `useRooms`, `useLessons`, `useWeekSchemeDetail(schemeId)` | Label joins |

The "any loading / any error" gate keeps the grid from flashing half-resolved labels. When one of the supporting queries is in flight, the grid renders the skeleton shape; when one errors, the page renders an inline error banner with a retry button that invalidates the schedule query.

### Client-side join

Each `PlacementResponse` is `{ lesson_id, time_block_id, room_id }`. The grid needs the following derived view for each cell:

```ts
interface ScheduleCell {
  subjectName: string;
  teacherName: string | undefined;   // from lesson.teacher_id when present
  roomName: string;
  day: number;                       // from time_block.day_of_week
  position: number;                  // from time_block.position
}
```

Build lookup maps once per render:

- `lessonById: Map<string, LessonResponse>` from the lessons list query.
- `subjectById: Map<string, SubjectResponse>` from subjects list.
- `roomById: Map<string, RoomResponse>` from rooms list.
- `timeBlockById: Map<string, TimeBlock>` from the active class's week-scheme detail.

The build happens inline in the page component's render, not `useMemo`. The frontend CLAUDE.md rule says no defensive memoisation; this is cheap work and profiling won't care.

### Grid rendering

Reuse the existing `.kz-ws-grid` CSS primitives from `frontend/src/styles/app.css`. The WeekSchemes page already proves the grid shape; extract the pure presentational bits into `schedule-grid.tsx` without tangling the WeekSchemes feature folder.

Grid layout:

```
gridTemplateColumns: `56px repeat(${daysPresent.length}, 1fr)`
Row 0:     [empty] [Mon] [Tue] ... [Fri]            data-variant="header"
Row 1..N:  [P1]    [cell] ...                        data-variant="time" / cell
```

`daysPresent` and `positions` come from the active class's week-scheme time blocks. A cell is populated iff a placement exists for that `(time_block_id)`; otherwise render an empty `.kz-ws-cell`. Cells render `subject name` on line 1, `teacher + room` abbreviated on line 2, matching the visual density of the WeekSchemes grid.

The `dayShortKey(day)` helper (introduced in PR #121) produces the column headers.

### Generate / regenerate UX

Primary button `Generate schedule` in the toolbar, disabled while the mutation is in flight (label becomes `common.saving`). After a successful POST, the button returns to its original label and the grid updates from the mutation's onSuccess cache write.

When `placements.length > 0` and the user clicks the button, the page enters a `confirming` local state (one `useState`, no new dialog) and renders an inline amber banner above the grid:

```
This will replace 18 placements. [Generate anyway] [Cancel]
```

The banner is a plain div with text, two buttons, and `aria-live="polite"`. No Radix Dialog; the interruption is small enough that a modal would be overreach (see brainstorm Q7 for the trade-off vs. `GenerateLessonsConfirmDialog`).

After POST, the mutation writes placements straight into the `useClassSchedule` cache via `queryClient.setQueryData`, so the grid doesn't need a second GET.

### Violations surfacing

Two paths:

1. **Post-POST:** the mutation result contains `violations`. The page holds the most recent `violations` array in local state, renders it under the grid as a warning block with the violation count and the list grouped by lesson. Cleared on navigation or on next POST.
2. **GET-only load (e.g. page refresh):** `GET /schedule` returns placements only. The page derives `expectedHours` by summing `lesson.hours_per_week` across the class's lessons, compares against `placements.length`, and renders "N hours unplaced" when positive. No per-lesson details, just the count.

Both paths use the same `ScheduleStatus` component. When both are present (POST happened, then extra lessons were added but no re-solve), the typed violations take precedence over the derived counter.

### Sidebar navigation

Add a new entry `{ to: "/schedule", labelKey: "nav.schedule", icon: CalendarRange }` to `NAV_GROUPS` in `frontend/src/components/app-sidebar.tsx`. Placement: under `sidebar.main` (alongside Dashboard), not `sidebar.data`. Rationale: schedule is an operational output, not an entity.

The `currentCrumbKey` function in `frontend/src/components/layout/app-shell.tsx` gains one line: `if (pathname.startsWith("/schedule")) return "nav.schedule";`.

### i18n

New keys under a `schedule.*` namespace, added to both `frontend/src/i18n/locales/en.json` and `de.json`:

```
schedule.title
schedule.subtitle
schedule.picker.label
schedule.picker.placeholder
schedule.picker.none                # "Select a class …"
schedule.generate.action
schedule.generate.replaceBanner     # interpolates {count}
schedule.generate.confirmReplace
schedule.generate.cancel
schedule.generate.successToast      # "Schedule generated ({count} placements)"
schedule.generate.errorToast
schedule.empty.title
schedule.empty.body
schedule.empty.step1
schedule.empty.step2
schedule.empty.step3
schedule.loadError
schedule.stats.placements           # "{count} placements"
schedule.stats.unplaced             # "{count} hours unplaced"
schedule.violations.title
schedule.violations.item            # interpolates {subject}, {hour}, {message}
nav.schedule                        # sidebar label
```

The nav entry reuses `nav.*` namespace for consistency with existing nav items. The `LabelKey` union type in `app-sidebar.tsx` gains `"nav.schedule"`.

### Hooks

```ts
// frontend/src/features/schedule/hooks.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Placement = components["schemas"]["PlacementResponse"];
export type Violation = components["schemas"]["ViolationResponse"];
export type SchedulePostResponse = components["schemas"]["ScheduleResponse"];
export type ScheduleGetResponse = components["schemas"]["ScheduleReadResponse"];

export const scheduleQueryKey = (classId: string) => ["schedule", classId] as const;

export function useClassSchedule(classId: string | undefined) {
  return useQuery({
    enabled: Boolean(classId),
    queryKey: classId ? scheduleQueryKey(classId) : ["schedule", "none"],
    queryFn: async (): Promise<ScheduleGetResponse> => {
      if (!classId) throw new ApiError(400, null, "no class id");
      const { data } = await client.GET("/api/classes/{class_id}/schedule", {
        params: { path: { class_id: classId } },
      });
      if (!data) throw new ApiError(500, null, "Empty response from GET /schedule");
      return data;
    },
  });
}

export function useGenerateClassSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (classId: string): Promise<SchedulePostResponse> => {
      const { data } = await client.POST("/api/classes/{class_id}/schedule", {
        params: { path: { class_id: classId } },
      });
      if (!data) throw new ApiError(500, null, "Empty response from POST /schedule");
      return data;
    },
    onSuccess: (result, classId) => {
      queryClient.setQueryData(scheduleQueryKey(classId), {
        placements: result.placements,
      } satisfies ScheduleGetResponse);
    },
  });
}
```

`useClassSchedule` is disabled while `classId` is undefined so the "pick a class" empty state never triggers a request. The query key is explicit per-class; invalidating one class's schedule never touches another's.

### Component decomposition

```
SchedulePage
├─ ScheduleToolbar
│    ├─ class picker (shadcn Select)
│    └─ Generate button + optional replace banner
├─ ScheduleStatus
│    ├─ placement count
│    ├─ derived "N hours unplaced" OR live violations list
├─ ScheduleGrid
│    └─ (grid of ScheduleCell)
```

Each component is pure (props in, JSX out), so tests can drive them independently without MSW. The page component owns queries, mutation orchestration, and the `confirming` state.

### Testing plan

#### Hook tests (`hooks.test.tsx`)

- `useClassSchedule` returns placements (MSW seed: one class with two placements).
- `useClassSchedule` with empty class returns `{ placements: [] }`.
- `useClassSchedule` surfaces 404 as `ApiError` (MSW seed: no matching class).
- `useGenerateClassSchedule` posts to POST endpoint, returns placements + violations.
- `useGenerateClassSchedule` writes placements into the GET cache on success (assert via `queryClient.getQueryData`).

#### Page / component tests (`schedule-page.test.tsx`, `schedule-grid.test.tsx`)

- Page renders "pick a class" empty state when no `?class=` param is set.
- Page renders skeleton grid while supporting queries are in flight.
- Page renders the populated grid with resolved subject + teacher + room labels.
- Page renders `EmptyState` ("Generate schedule" CTA) when the class exists but `placements` is empty.
- Page renders the "N hours unplaced" counter when `expectedHours > placements.length`.
- Page renders the inline replace banner when the user clicks Generate on an already-populated schedule.
- Page renders the violations block when the mutation returns a non-empty `violations` array.
- Grid handles `daysPresent.length === 0` (no time blocks) by rendering the empty state, not a 0-column grid.

#### MSW additions (`tests/msw-handlers.ts`)

- GET `/api/classes/:classId/schedule` handler seeded from a mutable `scheduleByClassId: Record<string, Placement[]>` map (mirrors existing mutable-state pattern for sub-resources). `beforeEach` resets the map.
- POST `/api/classes/:classId/schedule` handler returns placements + violations from a fixture and mutates the GET map so follow-up GETs in the same test see the placements.

Deferred: Playwright E2E (sprint step 3).

### Commit split

Four commits, all on one branch `feat/frontend-schedule-view`:

1. `chore(frontend): regenerate api-types for schedule endpoints`
   - `frontend/src/lib/api-types.ts` only (gitignored? no, it is checked in per `frontend/CLAUDE.md` layout guide).
2. `feat(frontend): add schedule feature hooks and MSW coverage`
   - `frontend/src/features/schedule/hooks.ts`, `hooks.test.tsx`.
   - `frontend/tests/msw-handlers.ts` additions.
3. `feat(frontend): add schedule view with class picker and grid`
   - `frontend/src/routes/_authed.schedule.tsx`.
   - `frontend/src/features/schedule/{schedule-page.tsx,schedule-toolbar.tsx,schedule-grid.tsx}` plus tests.
   - Sidebar nav entry + crumb key + i18n additions.
4. `docs: close sprint step 1 and log schedule follow-ups`
   - `docs/superpowers/OPEN_THINGS.md`: strike the schedule-view item, add deferred teacher/room-filter follow-ups and the derived-counter caveat.

## Error modes

| Condition | UI response |
|---|---|
| No `?class=` in URL | "Pick a class" empty state, not a skeleton grid |
| `useSchoolClasses` loading | skeleton on class picker, skeleton grid |
| `useSchoolClasses` error | full-page error banner, Retry button invalidates the query |
| `useClassSchedule` loading | skeleton grid |
| `useClassSchedule` 404 | error banner: "Class not found" (i18n key), no grid |
| `useClassSchedule` returns `{ placements: [] }` | `EmptyState` CTA: Generate schedule |
| `useGenerateClassSchedule` error (`ApiError` with `status` and `data`) | `toast.error(...)` (dedicated i18n `schedule.generate.errorToast`) |
| POST returns violations | render violations block below the grid |
| GET-only load, `placements.length < sum(lessons.hours_per_week)` | derived counter visible |

No dialogs surface for error cases. Toasts (sonner) handle transient failures; inline banners handle state that persists across renders.

## Performance

- Every query the page needs is already in the TanStack Query cache after a user has visited the entity pages. On a cold load, the five queries fan out in parallel; total latency is bounded by the slowest one.
- The grid renders O(placements × 1) cells; a Grundschule class has ~25 placements, well below any measurable render budget. No virtualisation.
- No new polling, no background refetch interval overrides; TanStack Query's defaults apply.

## Accessibility

- Grid cells are plain divs (presentational); placements render as `<div role="gridcell" aria-label={...}>` only if screen-reader announcement of "Monday P1: Mathematik with Frau Müller in Room 101" is important. For v1, rely on visible text inside each cell and keep the grid semantically plain.
- Generate button is a real `<Button>`, not a div click handler.
- The replace banner renders inside `<div role="alert" aria-live="polite">` so screen readers announce the warning when it appears.
- Class picker uses the shadcn `Select` primitive; the test file must install the Pointer Events polyfills per `frontend/CLAUDE.md`.

## Risks

- **Stale `api-types.ts`.** If the backend server is not running when someone regenerates types, `mise run fe:types` fails. The backend must be running against the current schema for this PR's codegen commit to produce the right output. Mitigation: plan step says "Start backend, then regenerate".
- **Client-side join fragility.** Deleting a lesson after a solve but before a re-solve leaves orphan placements invisible to the grid (the lookup returns undefined). The grid must render a placeholder cell "(deleted lesson)" rather than crashing. Covered by a test.
- **`kz-ws-grid` visual regression.** Reusing the CSS from WeekSchemes means any change to the grid's look-and-feel propagates to the schedule view. Accept the coupling; if the two views ever diverge visually, carve a second class name.
- **Query fan-out on first-load.** Five parallel GETs on the first `/schedule` visit. Acceptable at prototype scale; revisit when demo traffic warrants a combined endpoint.
- **`erasableSyntaxOnly` constraint.** The hooks file cannot use enums or parameter properties (per `tsconfig.json`); using `type` aliases everywhere keeps it compliant.
- **Frontend coverage ratchet.** Adding untested presentational code risks dropping `total.lines.pct` below the baseline. The unit and component tests planned above should keep coverage roughly flat.

## Follow-ups (to add to OPEN_THINGS)

- Teacher-centric schedule view (new endpoint or N-class aggregation).
- Room-centric schedule view (same shape).
- Replace the derived "N hours unplaced" counter with persisted violations once backend persistence lands.
- Promote `ScheduleGrid` + `WeekSchemeGrid` into a shared primitive if a third `kz-ws-grid` consumer appears.
- Deep-link to a class's schedule from the SchoolClasses row's action cell (follow-up, not this PR).
- Consider a `KeyboardShortcut` for Generate once demo users request it.

## References

- `docs/superpowers/OPEN_THINGS.md`: sprint step 1 (schedule view) and the deferred teacher / room follow-ups.
- `docs/superpowers/specs/2026-04-23-placement-persistence-design.md`: backend contract this UI reads from.
- `docs/superpowers/specs/2026-04-23-solver-schedule-endpoint-design.md`: `POST /schedule` design.
- `/tmp/kz-brainstorm/brainstorm.md`: self-answered Q&A that arrived at this design.
- `frontend/CLAUDE.md`: layout, hook, styling, i18n, and testing rules this PR follows.
- `frontend/src/features/week-schemes/week-schemes-page.tsx`: existing `kz-ws-grid` consumer; reference for cell rendering.
