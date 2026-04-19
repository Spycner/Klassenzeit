# Frontend SchoolClass CRUD page

Spec date: 2026-04-19
Status: accepted
Owner: pgoell

## Motivation

`docs/superpowers/OPEN_THINGS.md` lists the SchoolClass, Stundentafel, and Lesson CRUD
pages as the next product-capability items. Each has distinct UX (Stundentafel needs a
nested-row editor; SchoolClass and Lesson need foreign-key dropdowns), and the roadmap
memory explicitly says not to bundle them. This spec covers SchoolClass alone. It is
the simplest of the three remaining entities (two FKs vs Lesson's three) and establishes
the FK dropdown pattern that the Lesson page will reuse verbatim.

The dashboard already has a "Klassen" stat tile pinned at `0` with a "Coming soon" hint
and a disabled sidebar entry. Both are explicitly waiting on this PR.

## Goals

- New `/school-classes` page with table, create / edit dialog, and delete confirmation
  under the `_authed` layout.
- Foreign-key dropdowns for `stundentafel_id` and `week_scheme_id` populated from list
  endpoints, with name-based display in the table.
- Empty-FK guard: when no Stundentafel or WeekScheme exists, the create dialog shows a
  translated alert linking to the prerequisite pages and disables submit.
- Sidebar: flip the existing disabled `sidebar.schoolClasses` entry to a real link.
- Dashboard: wire the StatGrid "Klassen" tile to live counts and add a SchoolClasses
  card to QuickAdd.
- Top-bar crumb: extend `currentCrumbKey` to map `/school-classes`.
- Tests match the batch-1 pattern: list-render assertion plus create-flow assertion.
- i18n: every visible string keyed under `schoolClasses.*` with EN and DE entries.
- Coverage ratchet passes; baseline bumped only if it dips.

## Non-goals

- No Lesson CRUD page (separate spec, reuses the FK pattern from this one).
- No Stundentafel CRUD page (separate spec; needs nested-row editor).
- No backend changes. The spec relies on existing `/classes`, `/stundentafeln`, and
  `/week-schemes` GET endpoints exactly as they ship today.
- No new shadcn primitives. `Select`, `Input`, `Form`, `Dialog`, `Table`, `Button`,
  `Textarea` already cover the surface.
- No Zod `t()` errorMap work. Error literals stay in English to match Subjects /
  Rooms / Teachers / WeekSchemes.
- No deletion pre-flight check ("is this class used?"). The generic 409 toast handler
  surfaces the backend message; cross-entity typed-409 work is its own follow-up.
- No `Combobox` or async-search picker. Flat `Select` is sufficient at current data
  scale.
- No bulk-select or bulk-delete UI on the table.
- No "active school year" filter; defer until a real workflow surfaces it.

## Stack (unchanged)

- Vite 7 + React 19, TanStack Router file-based routes, TanStack Query.
- shadcn/ui primitives under `frontend/src/components/ui/` (Select, Input, Form, Dialog,
  Table, Button, Textarea).
- React Hook Form + Zod with the shadcn `Form` wrapper.
- `react-i18next` with `en.json` + `de.json` in `frontend/src/i18n/locales/`.
- `openapi-fetch` typed `client` from `@/lib/api-client`, regenerated from the backend
  OpenAPI schema via `mise run fe:types`.
- Vitest + Testing Library + MSW, ratchet against `.coverage-baseline-frontend`.

## Architecture

### Directory layout

```
frontend/src/
  features/
    school-classes/
      hooks.ts                # useSchoolClasses, useCreateSchoolClass,
                              # useUpdateSchoolClass, useDeleteSchoolClass
      schema.ts               # SchoolClassFormSchema (Zod)
      school-classes-page.tsx # SchoolClassesPage component
      school-classes-dialogs.tsx
                              # SchoolClassFormDialog, DeleteSchoolClassDialog
    stundentafeln/
      hooks.ts                # useStundentafeln (read-only for now)
  routes/
    _authed.school-classes.tsx
  components/
    layout/app-shell.tsx      # extend currentCrumbKey
  components/
    app-sidebar.tsx           # flip disabled entry to /school-classes
  features/dashboard/
    stat-grid.tsx             # wire schoolClasses count
    quick-add.tsx             # add SchoolClasses card
  i18n/locales/
    en.json                   # + schoolClasses.*, dashboard.hint.noClasses,
                              #   dashboard.hint.noClassesSub
    de.json                   # same keys translated
frontend/tests/
  school-classes-page.test.tsx
  msw-handlers.ts             # + GET/POST /classes, GET /stundentafeln, seed data
```

### Data flow

- `routes/_authed.school-classes.tsx` is thin: exports a TanStack route that renders
  `SchoolClassesPage` from `features/school-classes/`. It also accepts an optional
  `?create=1` search param (mirrors the rooms pattern) so QuickAdd can deep-link straight
  into the open dialog.
- `features/school-classes/hooks.ts` exports typed `useSchoolClasses`,
  `useCreateSchoolClass`, `useUpdateSchoolClass`, `useDeleteSchoolClass` wrappers over
  the `openapi-fetch` client, invalidating `queryKey: ["school-classes"]` on mutation
  success.
- `features/stundentafeln/hooks.ts` exports `useStundentafeln` only (no mutations
  in this PR; the Stundentafel page lives in a later spec).
- `features/school-classes/schema.ts` exports `SchoolClassFormSchema` whose output maps
  directly to `SchoolClassCreate` / `SchoolClassUpdate` Pydantic shapes.
- `features/school-classes/school-classes-page.tsx` exports the page component.
- `features/school-classes/school-classes-dialogs.tsx` exports
  `SchoolClassFormDialog` and `DeleteSchoolClassDialog`.

### FK dropdown plumbing

`SchoolClassFormDialog` renders two `<Select>` fields:

- `stundentafel_id` — populated from `useStundentafeln().data ?? []` with each option
  showing `stundentafel.name`.
- `week_scheme_id` — populated from `useWeekSchemes().data ?? []` with each option
  showing `weekScheme.name`.

When either list is empty (`stundentafeln.data?.length === 0` or
`weekSchemes.data?.length === 0`), an `<Alert>`-style notice renders above the form
with two `<Link>` calls: "Add a Stundentafel" → `/stundentafeln` (placeholder until that
page lands; clicking is fine, the route 404s with a helpful message), "Add a Week
scheme" → `/week-schemes`. Submit button is `disabled` while either list is empty.

(Note: there is no `<Alert>` shadcn primitive yet; the notice is a div with token
classes, not a new component. Adding `Alert` proper is a follow-up if more pages need
it.)

### FK display in the table

`useStundentafeln` and `useWeekSchemes` are queried at page render. The page builds two
`Map<string, string>` lookups (`id → name`) once per render and renders the lookup name
in the table cell. If a referenced FK is missing from the map (race condition or
deleted), fall back to "—".

This avoids a backend response shape change. When (if) the backend ever embeds the
related entity name in `SchoolClassResponse`, this can be simplified.

### Route + crumb wiring

- `_authed.school-classes.tsx` mirrors `_authed.rooms.tsx` exactly:
  ```tsx
  const schoolClassesSearchSchema = z.object({
    create: z.literal("1").optional(),
  });
  export const Route = createFileRoute("/_authed/school-classes")({
    component: SchoolClassesPage,
    validateSearch: schoolClassesSearchSchema,
  });
  ```
- `app-sidebar.tsx`: change the disabled SchoolClass entry to
  `{ to: "/school-classes", labelKey: "sidebar.schoolClasses", icon: Users }` (no
  `disabled` flag).
- `app-shell.tsx`: extend `currentCrumbKey` with
  `if (pathname.startsWith("/school-classes")) return "sidebar.schoolClasses";`.

### Dashboard integration

- `features/dashboard/stat-grid.tsx`: import `useSchoolClasses`, replace the hardcoded
  classes tile with a live count using the same `formatCount` + `statHint` helpers as
  the other tiles. Add `dashboard.hint.noClasses` (label) and
  `dashboard.hint.noClassesSub` (sub-hint).
- `features/dashboard/quick-add.tsx`: extend the `ITEMS` array with
  `{ to: "/school-classes", icon: Users, labelKey: "sidebar.schoolClasses" }`. Type
  unions widen accordingly.

### i18n keys

New top-level `schoolClasses.*` namespace, plus two dashboard hint keys.

EN:

```json
{
  "schoolClasses": {
    "title": "School classes",
    "subtitle": "Cohorts that share a curriculum and a weekly time grid.",
    "new": "New school class",
    "loadError": "Could not load school classes.",
    "columns": {
      "name": "Name",
      "gradeLevel": "Grade",
      "stundentafel": "Curriculum",
      "weekScheme": "Week scheme",
      "actions": "Actions"
    },
    "empty": {
      "title": "No school classes yet",
      "body": "Create the cohorts at your school. Each class needs a curriculum (Stundentafel) and a weekly time grid (Week scheme).",
      "step1": "Add the curriculum",
      "step2": "Add the week scheme",
      "step3": "Create the class"
    },
    "fields": {
      "gradeLevelLabel": "Grade",
      "stundentafelLabel": "Curriculum",
      "stundentafelPlaceholder": "Select a curriculum",
      "weekSchemeLabel": "Week scheme",
      "weekSchemePlaceholder": "Select a week scheme"
    },
    "dialog": {
      "createTitle": "New school class",
      "createDescription": "Create a new school class.",
      "editTitle": "Edit school class",
      "editDescription": "Update {{name}}.",
      "deleteTitle": "Delete school class",
      "deleteDescription": "This will permanently delete \"{{name}}\".",
      "missingPrereqs": "Add at least one curriculum and one week scheme before creating a class.",
      "addStundentafel": "Add a curriculum",
      "addWeekScheme": "Add a week scheme"
    }
  },
  "dashboard": {
    "hint": {
      "noClasses": "No school classes yet",
      "noClassesSub": "Add cohorts so the solver knows who to plan for."
    }
  }
}
```

DE keys mirror the same shape with translated copy. `sidebar.schoolClasses` already
exists in both catalogs and is reused.

### Testing

`frontend/tests/school-classes-page.test.tsx`:

- Renders the page through `renderWithProviders` from `tests/render-helpers.tsx`.
- Asserts: a seeded SchoolClass row renders with its mapped Stundentafel + WeekScheme
  names in the relevant columns.
- Clicks "New school class", fills the dialog (name, grade, both Selects), submits,
  asserts the dialog closes (which proves the POST handler was hit).

`frontend/tests/msw-handlers.ts` extensions:

- `initialStundentafeln` seed (one entry).
- `initialSchoolClasses` seed (one entry referencing the seed Stundentafel and the
  existing seed WeekScheme).
- `GET /stundentafeln` returns the seed.
- `GET /classes` returns the seed.
- `POST /classes` echoes back with a fresh UUID and timestamps.

(No PATCH / DELETE handlers because no test exercises them. If batch-1 patterns are
ever expanded to test edit + delete, those handlers land in the same pass.)

### OpenAPI types

`mise run fe:types` regenerates `frontend/src/lib/api-types.ts`. The plan's first task
runs the regeneration to make sure the SchoolClass schemas resolve at type-check time.

## Key decisions

- **One entity per spec, not three.** Roadmap memory and OPEN_THINGS both call for it
  (Q1).
- **shadcn `Select`, not `Combobox`.** Sufficient for current data scale; consistent
  with the rooms enum picker (Q2).
- **Client-side FK lookup for table display.** No backend response shape change needed
  (Q3).
- **Empty-prereq dialog with disabled submit.** Discoverable, surfaces the gap, lets
  the user fix it inline (Q4).
- **Free integer grade input, not a fixed Select.** Schools have heterogeneous grade
  schemes (Q5).
- **Best-effort delete; rely on backend 409.** Cross-entity typed-409 handling is its
  own follow-up (Q6).
- **Flip the existing disabled sidebar entry, don't add a new one** (Q7).
- **Wire StatGrid + QuickAdd in the same PR.** Both are blocked on this PR's existence;
  shipping a useful feature without surfacing it on the dashboard would be incomplete
  (Q8, Q9).
- **Tests match batch 1: list + create only.** Avoid asymmetry with Rooms / Teachers
  / WeekSchemes (Q11).
- **MSW handlers for `/classes` and `/stundentafeln`.** Required by the
  `onUnhandledRequest: "error"` config (Q12).

## Acceptance criteria

1. `/school-classes` renders under the authed layout; unauthenticated visitors redirect
   to `/login`.
2. The page lists existing classes from the backend, shows a loading state, an error
   state, and an empty-list state with onboarding copy that matches the batch-1 pages.
3. The table shows Name, Grade, Curriculum (mapped name), Week scheme (mapped name),
   and Actions columns.
4. "New school class" opens a dialog with name, grade, Stundentafel select, and
   WeekScheme select. Submit creates the class; the list refreshes without a hard
   reload.
5. When either Stundentafel or WeekScheme is empty, the dialog shows a translated
   alert with two `<Link>` actions and disables submit.
6. Each list row has Edit (opens prefilled dialog, save patches) and Delete (opens
   confirm dialog; backend 409 surfaces inline as the existing `ApiError` toast does).
7. Sidebar: the SchoolClasses entry is no longer disabled; clicking it navigates;
   active styling applies on `/school-classes`.
8. Dashboard StatGrid shows the live SchoolClasses count; QuickAdd has a SchoolClasses
   card; top-bar crumb shows "School classes" / "Klassen" on `/school-classes`.
9. Switching language between EN and DE flips every visible string on the new page,
   including dialog titles, column headers, alert copy, and link labels.
10. `mise run lint` and `mise run test` both pass locally; CI is green.
11. Coverage ratchet passes. Baseline bumped only if needed.
12. The Subjects / Rooms / Teachers / WeekSchemes pages still pass their existing tests
    and are otherwise untouched.

## Risks and mitigations

- **`mise run fe:types` drift.** Generated client types may not match the backend if
  the OpenAPI schema has moved since the last frontend change. Mitigation: regenerate
  types as the first plan task; surface unexpected breakage in the PR description.
- **Sidebar crowding.** Six entries (was five). Acceptable; revisit grouping once eight
  or more entries appear.
- **Empty-FK alert copy could disappear if both lists fill silently.** Mitigation:
  the disabled-submit + alert are derived from `data?.length`, not from a one-time
  check; they re-render on each query update.
- **i18n key drift.** The cross-catalog `i18n.test.tsx` test walks both catalogs and
  asserts key parity; it covers the new `schoolClasses.*` namespace by virtue of the
  walk.
- **Stundentafel hook now has no test coverage of its own.** The
  `useStundentafeln` hook is exercised indirectly by the SchoolClass page test (the
  page mounts and the hook fires); coverage will land properly when the Stundentafel
  page ships.

## Rollback plan

Revert the feature branch commits. The shared edits are: `app-sidebar.tsx`,
`app-shell.tsx`, `stat-grid.tsx`, `quick-add.tsx`, both locale JSON files, and
`tests/msw-handlers.ts`. All are additive or one-line replacements; reverting leaves
the prior behavior intact (sidebar entry returns to disabled, stat-grid returns to
the placeholder, dashboard QuickAdd loses one card). No migrations, no API surface
changes.

## Open questions (deferred)

Tracked in `OPEN_THINGS.md` updates:

- Stundentafel CRUD page (entry exists; this PR removes the read-only-hook caveat
  once Stundentafel ships its own UI).
- Lesson CRUD page (entry exists; reuses the FK pattern).
- Typed deletion errors for in-use entities (entry exists; covers SchoolClass too).
- Multi-tenancy / per-school filtering (not in scope; no signal yet).
- Active SchoolClass filter for current school year vs archived (defer until a real
  workflow surfaces it).
