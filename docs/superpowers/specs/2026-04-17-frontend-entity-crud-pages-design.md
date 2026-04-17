# Frontend entity CRUD pages, batch 1 (Rooms, Teachers, WeekSchemes)

Spec date: 2026-04-17
Status: accepted
Owner: pgoell

## Motivation

The frontend scaffold (PR #77) landed a single end-to-end CRUD page for Subjects, plus the theming/i18n infrastructure (PR #79). The scheduling backend exposes seven CRUD resource groups; six of them have no UI yet. `docs/superpowers/OPEN_THINGS.md` lists "Remaining entity CRUD pages" as the next product-capability item, and the memory's roadmap points the same way.

This spec covers the first batch of those pages: the three flat-scalar entities whose basic create / read / update / delete work does not depend on another entity. Splitting them out keeps the PR small, validates that the Subjects pattern generalizes, and clears the way for the harder follow-up (foreign-key pickers and nested-row editors for SchoolClass, Lesson, Stundentafel, and the various sub-resources).

## Goals

- Three new pages at `/rooms`, `/teachers`, `/week-schemes` with a table, create / edit dialog, and delete confirmation, all under the `_authed` layout.
- Each page loads via TanStack Query, mutations invalidate their list query on success, forms validated by Zod via `@hookform/resolvers/zod`, submit buttons disabled while the mutation is in flight.
- Every visible string goes through `react-i18next` with both EN and DE entries. Sidebar nav labels and icons match the existing pattern.
- A Vitest test per page covering the list-rendering happy path and at least one mutation flow (create or delete).
- Coverage ratchet passes; baseline is bumped if the ratchet demands it.
- Zero new abstractions, primitives, or cross-feature helpers. Each feature folder is self-contained.

## Non-goals

- No sub-resource management. Room availability and suitability, teacher availability and qualifications, week-scheme time blocks, stundentafel entries, all deferred to their own spec.
- No FK dropdowns, so no SchoolClass or Lesson pages in this PR.
- No Stundentafel page (nested-row editor).
- No refactor of the Subjects page, its Zod messages, or its `useQuery` mocking pattern.
- No MSW adoption. The new tests use the same module-mock pattern as `subjects-page.test.tsx`.
- No new shadcn primitives beyond what is already generated. If a primitive is missing (e.g. `Select`, `Textarea`), add it via the shadcn CLI with no styling changes.
- No Zod `t()` or `errorMap` work. Error literals stay in English for consistency with Subjects.
- No dependency additions. The stack is already complete for this work.

## Stack (unchanged)

- Vite 7 + React 19, TanStack Router file-based routes, TanStack Query.
- shadcn/ui primitives under `frontend/src/components/ui/` (generated; `Select` and `Textarea` added on demand).
- React Hook Form + Zod with the shadcn `Form` wrapper.
- `react-i18next` with `en.json` + `de.json` in `frontend/src/i18n/locales/`.
- `openapi-fetch` typed `client` from `@/lib/api-client`, regenerated from the backend OpenAPI schema via `mise run fe:types`.
- Vitest + Testing Library, v8 coverage, ratchet against `.coverage-baseline-frontend`.

## Architecture

### Directory layout

```
frontend/src/
  features/
    rooms/
      hooks.ts
      schema.ts
      rooms-page.tsx
    teachers/
      hooks.ts
      schema.ts
      teachers-page.tsx
    week-schemes/
      hooks.ts
      schema.ts
      week-schemes-page.tsx
  routes/
    _authed.rooms.tsx
    _authed.teachers.tsx
    _authed.week-schemes.tsx
  i18n/locales/
    en.json               # + rooms.*, teachers.*, weekSchemes.*, nav.rooms/teachers/weekSchemes
    de.json               # same keys, translated
  components/
    layout/app-shell.tsx  # add three navItems, swap Subjects icon to BookOpen
    ui/select.tsx         # shadcn primitive, if missing
    ui/textarea.tsx       # shadcn primitive, if missing
frontend/tests/
  rooms-page.test.tsx
  teachers-page.test.tsx
  week-schemes-page.test.tsx
```

### Data flow (all three pages follow the Subjects pattern)

- `routes/_authed.<entity>.tsx` is thin, it imports and renders the page component from `features/<entity>/`.
- `features/<entity>/hooks.ts` exports typed `useX`, `useCreateX`, `useUpdateX`, `useDeleteX` wrappers over the `openapi-fetch` client, invalidating `queryKey: [<entity>]` on mutation success.
- `features/<entity>/schema.ts` exports a Zod schema whose output maps directly to the backend `XCreate` / `XUpdate` Pydantic shape.
- `features/<entity>/<entity>-page.tsx` exports a default page component plus two internal dialog components (`<EntityFormDialog/>`, `<DeleteEntityDialog/>`).

### Per-entity differences

- **Rooms** — fields: `name` (string), `short_name` (string), `capacity` (optional int ≥ 1), `suitability_mode` (enum `general | specialized`). The capacity field uses `<Input type="number" min={1} />` with Zod `z.coerce.number().int().min(1).optional()`. The mode uses a `<Select />` whose options are translated via `t("rooms.suitabilityModes.general" | "specialized")`. List columns: Name, Short name, Capacity, Mode, Actions.
- **Teachers** — fields: `first_name`, `last_name`, `short_code` (strings), `max_hours_per_week` (int ≥ 1, required). No enum. List columns: Last name, First name, Short code, Max hours/week, Actions. Sort the table client-side by last name so the page is useful before server-side sorting exists.
- **WeekSchemes** — fields: `name` (string), `description` (optional string, multi-line). Uses `<Textarea rows={3} />` with Zod `z.string().trim().max(500).optional()`. List columns: Name, Description (truncated to 80 chars), Actions.

### i18n keys

Top-level namespaces per entity (`rooms.*`, `teachers.*`, `weekSchemes.*`). Each mirrors the `subjects.*` shape (title, new, empty, loadError, columns.*, dialog.createTitle/createDescription/editTitle/editDescription/deleteTitle/deleteDescription). Plus entity-specific keys:

- `rooms.suitabilityModes.{general,specialized}` for the Select labels.
- `rooms.columns.{capacity,mode}`, `teachers.columns.{lastName,firstName,shortCode,maxHoursPerWeek}`, `weekSchemes.columns.description`.

Add `nav.rooms`, `nav.teachers`, `nav.weekSchemes` entries.

### Navigation

`components/layout/app-shell.tsx` `navItems` extends to five entries in order: Dashboard, Subjects, Rooms, Teachers, WeekSchemes. Icons: `LayoutDashboard`, `BookOpen`, `DoorOpen`, `GraduationCap`, `CalendarDays`, all from `lucide-react` via named imports. Subjects switches from `CalendarClock` to `BookOpen` because `CalendarDays` on WeekSchemes is the semantically better fit.

### Testing

Each `frontend/tests/<entity>-page.test.tsx`:

- Renders the page inside a QueryClientProvider + MemoryRouter + I18nextProvider, matching `subjects-page.test.tsx`.
- Module-mocks `./hooks` to stub `useX`/`useCreateX`/`useUpdateX`/`useDeleteX` as simple resolved-promise objects.
- Asserts: (a) two seed rows render, (b) clicking "New <entity>" opens the dialog and clicking Create calls the create mutation once with the expected body, (c) clicking Delete and confirming calls the delete mutation once with the row id.

The test pattern is explicitly the same as Subjects today. The MSW migration is promoted to an OPEN_THINGS follow-up.

### OpenAPI types

Run `mise run fe:types` once before implementing the hooks. The generated `frontend/src/lib/api-types.ts` is gitignored; each run of the frontend CI step regenerates it, so there is nothing to commit. If the backend OpenAPI has drifted since the last frontend change, surface the diff in the PR description.

## Key decisions (with pointers into the brainstorm)

- **Copy the Subjects pattern per entity, no shared `<CrudListPage>`.** Three files is not enough duplication to justify generics (Q3).
- **Raw English literals in Zod schemas.** Match Subjects; cross-feature i18n of Zod is its own PR (Q5).
- **Flat routes at `/rooms`, `/teachers`, `/week-schemes`.** No `/admin/*` namespace until the UX actually bifurcates (Q6).
- **Match the Subjects test pattern (module-mock hooks), file an OPEN_THINGS item for MSW.** Partial migration would leave the codebase in a worse state than uniform tech-debt (Q11).
- **`Select` for the enum field, `Textarea` for the long-form field, `type="number"` for integer fields.** shadcn primitives are the right tool each time (Q4, Q8, Q9).

## Acceptance criteria

1. `/rooms`, `/teachers`, `/week-schemes` render under the authed layout; unauthenticated visitors redirect to `/login`.
2. Each page lists existing entities from the backend, shows a loading state, shows an error state, and an empty-list state with copy that matches the Subjects page.
3. "New <entity>" opens a dialog with the entity's fields. Submit creates the entity; the list refreshes without a hard reload.
4. Each list row has Edit (opens prefilled dialog, save patches) and Delete (opens confirm dialog, confirm deletes; the backend error path surfaces inline for a 409).
5. Switching language between EN and DE via the header switcher flips every string on each page, including the sidebar label, dialog titles, column headers, enum labels, and button copy.
6. Coverage ratchet passes. Baseline bumped if needed.
7. `mise run lint` and `mise run test` both pass locally.
8. The Subjects page still passes its existing test and is otherwise untouched.

## Risks and mitigations

- **`mise run fe:types` drift.** The generated client types may not match the backend if the OpenAPI schema has moved. Mitigation: regenerate types as the first implementation step; surface any unexpected breakage in the PR description before making changes.
- **Sidebar crowding.** Five entries is fine, but the Dashboard page is a placeholder. Risk that users mistake the crowded sidebar for "the product". Acceptable for v1, revisit grouping once ten+ entries appear.
- **Enum translation drift.** New `rooms.suitabilityModes` keys must stay in sync between EN and DE. Mitigation: the existing `i18n.test.tsx` test walks both catalogs and asserts key parity; extend it with the new namespaces so the diff catches missing keys.
- **Copy-paste bugs.** Copying the Subjects page risks leaving `"/subjects"` strings in Rooms code. Mitigation: name the feature folder and the query key the same, use a find-and-replace checklist per entity during implementation.

## Rollback plan

Revert the feature branch commits. The only shared edits are `app-shell.tsx` and the locale JSON files; both are additive. Routes are file-based so removing the route file removes the route. No migrations, no data shape changes, no breaking API calls.

## Open questions (deferred)

- Tracked in OPEN_THINGS updates (see brainstorm Q13).
- Sub-resource editors, SchoolClass / Lesson / Stundentafel pages, Zod i18n, MSW adoption, deletion pre-flight: each gets its own spec later.
