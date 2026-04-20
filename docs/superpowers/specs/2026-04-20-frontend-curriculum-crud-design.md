# Frontend Curriculum (Stundentafel) CRUD page

Spec date: 2026-04-20
Status: accepted
Owner: pgoell

## Motivation

`docs/superpowers/OPEN_THINGS.md` lists Stundentafel as the last entity CRUD
page missing from the product surface (Lessons shipped in PR #100 on
2026-04-20). The roadmap explicitly earmarks a dedicated spec for Stundentafel
because the page needs a nested-row editor: every Stundentafel holds a list of
`StundentafelEntry` rows referencing subjects plus weekly hours and block-size
preferences. That interaction pattern is new to the frontend; every other CRUD
page in the repo is a flat list + single-dialog form.

The backend already ships the parent and child endpoints under
`/api/stundentafeln`, so this spec is purely a frontend effort. A stub
`frontend/src/features/stundentafeln/hooks.ts` exists from earlier
SchoolClass-picker work and is rewritten here to match the lessons feature
layout.

## Goals

- New `/stundentafeln` page with a table listing every curriculum, plus
  create / edit / delete dialogs, under the `_authed` layout.
- The edit dialog shows both the Stundentafel metadata (name, grade level) and
  a nested, editable table of `StundentafelEntry` rows (subject, hours per
  week, preferred block size).
- Each entry row has its own Add / Edit / Delete controls that open a nested
  Dialog and call the per-row backend endpoints immediately (no client-side
  batching).
- Subject picker inside the entry form filters out subjects already present in
  the current Stundentafel; a typed 409 handler surfaces the backend duplicate
  error as a root-level form error in case of races.
- Sidebar: add a new `sidebar.stundentafeln` entry under the Data group between
  `/school-classes` and `/lessons`, using the `ClipboardList` lucide icon.
- Top-bar crumb: extend `currentCrumbKey` to map `/stundentafeln`.
- i18n: every visible string keyed under `stundentafeln.*` plus
  `sidebar.stundentafeln`, with EN and DE entries. EN label is "Curriculum",
  DE is "Stundentafel". Existing `schoolClasses.stundentafel*` keys stay as
  they are for the class-creation picker.
- Tests (`frontend/tests/stundentafeln-page.test.tsx`): list-render assertion,
  create-flow assertion, plus a nested-dialog entry-add flow that opens the
  edit dialog and submits the entry form.
- Coverage ratchet passes; baseline bumped only if the total organically
  rises above the current number.

## Non-goals

- No backend changes. The spec relies on existing `/api/stundentafeln`
  (GET, POST, PATCH, DELETE) and the nested entries endpoints
  (`POST /api/stundentafeln/{tafel_id}/entries`,
  `PATCH /api/stundentafeln/{tafel_id}/entries/{entry_id}`,
  `DELETE /api/stundentafeln/{tafel_id}/entries/{entry_id}`) exactly as they
  ship today.
- No change to the existing `schoolClasses.stundentafel*` i18n keys or to the
  SchoolClass creation flow that uses them.
- No bulk "Generate lessons from Stundentafel" UI. That belongs with the
  `OPEN_THINGS.md` "manage related rows" item, not here.
- No master-detail route. The entries editor lives inside the parent edit
  dialog.
- No URL-persisted filter state for the list. Reuses the shared `Toolbar`
  text search over Stundentafel names.
- No backend-extension to add an `entry_count` column on the list response.
  The list columns are Name, Grade level, Actions; entry count and total
  hours show only inside the edit dialog where the detail fetch runs.
- No `Combobox` or async-search picker. Flat `Select` is sufficient at current
  data scale.
- No bulk-select or bulk-delete UI on either the Stundentafel list or the
  entries table.
- No new shadcn primitives. `Select`, `Input`, `Form`, `Dialog`, `Table`,
  `Button` already cover the surface.
- No Zod `t()` errorMap work. Error literals stay in English, consistent with
  every previous CRUD page.
- No dashboard tile for Stundentafel. The "recently edited" tile work is
  tracked as a cross-entity `OPEN_THINGS` item and blocks on backend
  `updated_at`.
- No Playwright e2e flow. The open item "Entity coverage beyond Subjects"
  already covers every remaining entity in a bundled e2e-expansion pass.

## Stack (unchanged)

- Vite 7 + React 19, TanStack Router file-based routes, TanStack Query.
- shadcn/ui primitives under `frontend/src/components/ui/` (Select, Input,
  Form, Dialog, Table, Button).
- React Hook Form + Zod with the shadcn `Form` wrapper.
- `react-i18next` with `en.json` + `de.json` in `frontend/src/i18n/locales/`.
- `openapi-fetch` typed `client` from `@/lib/api-client`, regenerated from
  the backend OpenAPI schema via `mise run fe:types`.
- Vitest + Testing Library + MSW, ratchet against
  `.coverage-baseline-frontend`.

## Architecture

### Directory layout

```
frontend/src/
  features/
    stundentafeln/
      hooks.ts                    # useStundentafeln, useStundentafel (detail),
                                  # useCreateStundentafel, useUpdateStundentafel,
                                  # useDeleteStundentafel, useCreateEntry,
                                  # useUpdateEntry, useDeleteEntry
      schema.ts                   # StundentafelFormSchema, EntryFormSchema
      stundentafeln-page.tsx      # StundentafelnPage component
      stundentafeln-dialogs.tsx   # StundentafelFormDialog,
                                  # StundentafelEditDialog (with nested
                                  # entries table), EntryFormDialog,
                                  # DeleteStundentafelDialog
  routes/
    _authed.stundentafeln.tsx
  components/
    app-sidebar.tsx               # add new entry, import ClipboardList icon
    layout/app-shell.tsx          # extend currentCrumbKey
  i18n/locales/
    en.json                       # + stundentafeln.*, sidebar.stundentafeln
    de.json                       # same keys translated
frontend/tests/
  stundentafeln-page.test.tsx
  msw-handlers.ts                 # extend: POST/PATCH/DELETE stundentafeln,
                                  # GET/POST/PATCH/DELETE entries, seed data
```

### Data flow

- `routes/_authed.stundentafeln.tsx` is thin: exports a TanStack route that
  renders `StundentafelnPage` from `features/stundentafeln/`. It accepts an
  optional `?create=1` search param (mirrors other CRUD pages) for future
  QuickAdd deep-linking.
- `features/stundentafeln/hooks.ts` exports typed wrappers over the
  `openapi-fetch` client, covering the parent CRUD and the entry sub-CRUD:
  - `useStundentafeln()`: list query, key `["stundentafeln"]`.
  - `useStundentafel(id)`: detail query, key `["stundentafeln", id]`. The
    detail response includes entries with embedded subject info.
  - `useCreateStundentafel`, `useUpdateStundentafel`, `useDeleteStundentafel`:
    parent mutations; invalidate the list on success.
  - `useCreateEntry`, `useUpdateEntry`, `useDeleteEntry`: entry mutations.
    Each takes the parent `stundentafel_id` so it can invalidate the right
    detail query.
- `features/stundentafeln/schema.ts` exports two Zod schemas whose output
  maps directly onto the backend `StundentafelCreate` / `StundentafelUpdate`
  and `EntryCreate` / `EntryUpdate` shapes.
- `features/stundentafeln/stundentafeln-page.tsx` exports the page
  component.
- `features/stundentafeln/stundentafeln-dialogs.tsx` exports the four
  dialog components.

### Form schemas (Zod, flat)

```ts
import { z } from "zod";

export const StundentafelFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  grade_level: z.number().int().min(1, "Grade must be at least 1").max(13),
});

export const EntryFormSchema = z.object({
  subject_id: z.string().min(1, "Subject is required"),
  hours_per_week: z.number().int().min(1, "Hours must be at least 1"),
  preferred_block_size: z.number().int().min(1).max(2),
});

export type StundentafelFormValues = z.infer<typeof StundentafelFormSchema>;
export type EntryFormValues = z.infer<typeof EntryFormSchema>;
```

Parameter rationale (echoes the CLAUDE.md flat-Zod rule):

- No `z.coerce.number()` on `grade_level`, `hours_per_week`, or
  `preferred_block_size`. The `<Input type="number">` / `<Select>` `onChange`
  handlers coerce at the boundary (`field.onChange(Number(e.target.value))`).
- No `z.union([z.literal(1), z.literal(2)])` on `preferred_block_size`.
  Unions are on the CLAUDE.md forbidden list for the RHF resolver. A plain
  `z.number().int().min(1).max(2)` captures the same runtime constraint, and
  the `Select` keeps the user from entering a third value.
- No `.transform()` on `subject_id`. It stays as a plain string (UUID); the
  submit handler passes it through unchanged.
- No `.default(1)` on any numeric field. Defaults come from `defaultValues`
  on the RHF `useForm({ defaultValues })` call, not the schema.
- No `z.string().uuid()` on `subject_id`. Per the frontend CLAUDE.md, Zod v4
  `.uuid()` rejects pattern-UUIDs used as seed data.

### Page layout

`stundentafeln-page.tsx` mirrors `lessons-page.tsx`:

- Header `StundentafelnPageHead` with title, subtitle, disabled "Import"
  button, and a "New curriculum" primary button that opens
  `StundentafelFormDialog` in create mode.
- Loading / error / empty branches. Empty state uses `EmptyState` with three
  onboarding steps (create subjects, create a curriculum, add entries).
- `Toolbar` with client-side text search over `name`.
- Table with columns Name, Grade level, Actions (Edit / Delete). Actions
  open `StundentafelEditDialog` (edit) or `DeleteStundentafelDialog`.

### Dialogs

**`StundentafelFormDialog`** (create-only): a small dialog with the
Stundentafel `name` and `grade_level` fields and a single "Create" submit
button. On success, invalidates the list query and closes. Typed 409 on
duplicate name surfaces `stundentafeln.errors.duplicateName` as a root-level
form error.

**`StundentafelEditDialog`**: the workhorse. Opens prefilled from a list row.
Fetches the detail via `useStundentafel(id)` to get the entries. Renders:

1. A Form for `name` and `grade_level` with its own Save button. Submitting
   calls `useUpdateStundentafel`, stays open on success (so the user can
   continue editing entries), invalidates the list query.
2. A divider and section header "Entries".
3. An inline `Table` listing the current entries (subject, hours, block
   size, Edit / Delete per row), plus an "Add entry" button that opens
   `EntryFormDialog` as a nested dialog.
4. Footer: a single "Close" button that closes the dialog.

If the detail fetch is loading, show a loading line in place of the entries
table. If it errored, show an error line with a retry button. Empty entries
list shows an inline "No entries yet" placeholder.

**`EntryFormDialog`**: nested inside `StundentafelEditDialog`. Create or
edit one `StundentafelEntry`. Fields: subject (Select), hours_per_week
(Input number), preferred_block_size (Select with "Single period" / "Double
period" options).

- In create mode, the subject Select lists every subject NOT already in the
  current Stundentafel. If this filter leaves zero subjects, the dialog
  shows a message ("All subjects already assigned") and disables submit.
- In edit mode, the subject field is shown read-only (the backend
  `EntryUpdate` schema only accepts `hours_per_week` and
  `preferred_block_size`).
- Typed 409 on subject-already-in-tafel surfaces
  `stundentafeln.errors.duplicateSubject` as a root-level form error (race
  safety net).

**`DeleteStundentafelDialog`**: confirm dialog. On confirm, calls
`useDeleteStundentafel`, invalidates the list, closes. Generic `ApiError`
message bubbles up from the mutation's error state if the backend returns
409 for a referenced Stundentafel (consistent with every other CRUD page
until the cross-entity typed-deletion pass lands).

### Typed 409 handlers

Duplicates possible at two boundaries:

- `POST /api/stundentafeln`: duplicate `name` returns 409 with detail
  "stundentafel with this name already exists". Handler:
  `form.setError("root", { message: t("stundentafeln.errors.duplicateName") })`.
- `POST /api/stundentafeln/{id}/entries`: duplicate `subject_id` in this
  Stundentafel returns 409. Handler:
  `form.setError("root", { message: t("stundentafeln.errors.duplicateSubject") })`.

Pattern lifted from `LessonFormDialog`'s 409 branch.

### Route + crumb wiring

- `_authed.stundentafeln.tsx` mirrors `_authed.lessons.tsx` exactly:
  ```tsx
  const stundentafelnSearchSchema = z.object({
    create: z.literal("1").optional(),
  });
  export const Route = createFileRoute("/_authed/stundentafeln")({
    component: StundentafelnPage,
    validateSearch: stundentafelnSearchSchema,
  });
  ```
- `app-sidebar.tsx`: import `ClipboardList` from lucide-react, extend the
  `NavLabelKey` union with `"sidebar.stundentafeln"`, insert the new item
  in the `NAV_GROUPS` data list between `/school-classes` and `/lessons`.
- `app-shell.tsx`: extend `currentCrumbKey` with
  `if (pathname.startsWith("/stundentafeln")) return "sidebar.stundentafeln";`.

### i18n keys

New top-level `stundentafeln.*` namespace plus `sidebar.stundentafeln`.

EN (verbatim):

```json
{
  "sidebar": {
    "stundentafeln": "Curriculum"
  },
  "stundentafeln": {
    "title": "Curriculum",
    "subtitle": "Reusable weekly-hour templates assigned to school classes.",
    "new": "New curriculum",
    "loadError": "Could not load curricula.",
    "columns": {
      "name": "Name",
      "gradeLevel": "Grade",
      "actions": "Actions"
    },
    "empty": {
      "title": "No curricula yet",
      "body": "Create a curriculum to define the subjects and hours each class studies this year.",
      "step1": "Create at least one subject",
      "step2": "Create a curriculum",
      "step3": "Add entries for each subject"
    },
    "fields": {
      "nameLabel": "Name",
      "namePlaceholder": "e.g. Grundschule Klasse 1",
      "gradeLevelLabel": "Grade",
      "subjectLabel": "Subject",
      "subjectPlaceholder": "Select a subject",
      "hoursPerWeekLabel": "Hours / week",
      "blockSizeLabel": "Block size",
      "blockSizeSingle": "Single period",
      "blockSizeDouble": "Double period"
    },
    "dialog": {
      "createTitle": "New curriculum",
      "createDescription": "Create a new curriculum template.",
      "editTitle": "Edit curriculum",
      "editDescription": "Update {{name}} and manage its entries.",
      "deleteTitle": "Delete curriculum",
      "deleteDescription": "This will permanently delete {{name}} and all its entries.",
      "missingSubjects": "Add at least one subject before creating entries.",
      "addSubject": "Add a subject",
      "close": "Close"
    },
    "entries": {
      "sectionTitle": "Entries",
      "add": "Add entry",
      "empty": "No entries yet.",
      "loadError": "Could not load entries.",
      "columns": {
        "subject": "Subject",
        "hoursPerWeek": "Hours / week",
        "blockSize": "Block size",
        "actions": "Actions"
      },
      "createTitle": "New entry",
      "editTitle": "Edit entry",
      "deleteTitle": "Remove entry",
      "deleteDescription": "This will remove {{subjectName}} from this curriculum.",
      "allSubjectsAssigned": "Every subject is already assigned."
    },
    "errors": {
      "duplicateName": "A curriculum with this name already exists.",
      "duplicateSubject": "This subject is already in the curriculum."
    }
  }
}
```

DE keys mirror the same shape with translated copy. `sidebar.stundentafeln`
is "Stundentafel" in DE; every other DE string translates normally.

### Testing

`frontend/tests/stundentafeln-page.test.tsx`:

- Renders the page through `renderWithProviders` from
  `tests/render-helpers.tsx`.
- Asserts: a seeded Stundentafel row renders with its name and grade level.
- Clicks "New curriculum", fills name and grade, submits, asserts the
  dialog closes (proving the POST handler was hit).
- Clicks "Edit" on the seeded row, asserts the edit dialog opens with the
  entries list. Clicks "Add entry", fills the entry form (subject selected
  from the Select, hours, block size), submits the nested dialog, and
  asserts the nested dialog closes while the parent stays open.

`frontend/tests/msw-handlers.ts` extensions:

- Extend `initialStundentafeln` with a richer seed (one entry included for
  detail view) and add a parallel `initialStundentafelEntries` seed keyed
  by stundentafel id for the detail handler.
- Add `POST /api/stundentafeln` returning 201 with a fabricated id, name,
  grade_level, timestamps.
- Add `GET /api/stundentafeln/:tafel_id` returning the detail response
  shape (parent + embedded entries with embedded subject shape).
- Add `PATCH /api/stundentafeln/:tafel_id` and `DELETE /api/stundentafeln/:tafel_id`.
- Add `POST /api/stundentafeln/:tafel_id/entries` returning 201 with a
  fabricated entry id, resolving the subject from `initialSubjects`.
- Add `PATCH /api/stundentafeln/:tafel_id/entries/:entry_id` and
  `DELETE /api/stundentafeln/:tafel_id/entries/:entry_id`.

The 409 duplicate handlers are not exercised in this PR's tests; the
behaviour is narrow enough that integration-style coverage would be
ceremony. A future cross-entity "typed deletion errors" pass folds in
duplicate-create coverage at that point.

### OpenAPI types

`mise run fe:types` regenerates `frontend/src/lib/api-types.ts`. The plan's
first task runs the regeneration to confirm the schemas
(`StundentafelListResponse`, `StundentafelDetailResponse`,
`StundentafelCreate`, `StundentafelUpdate`, `StundentafelEntryResponse`,
`EntryCreate`, `EntryUpdate`) are present; exploration confirmed they
already are.

## Key decisions

- **German folder + URL `/stundentafeln`, English display via i18n.** Matches
  the existing `features/stundentafeln/` stub and the backend URL (Q1).
- **List page + edit dialog with nested entries table.** Matches every other
  CRUD page's interaction shape; entries are small enough to fit (Q2).
- **Per-row server calls for entry sub-CRUD.** Backend exposes per-row
  endpoints; batching would duplicate state that nothing else in the app
  has (Q3).
- **Two separate dialogs (create, edit) for the parent.** Matches lessons
  and other entities (Q4).
- **`Select` for block size with translated labels.** Mirrors lessons (Q5).
- **Filter + typed 409 fallback for subject picker.** Best UX plus race
  safety (Q6).
- **Grade level as `Input type="number"` clamped 1-13.** Simplest fit;
  matches SchoolClass (Q7).
- **Cascade-on-delete trust + generic `ApiError` for in-use conflicts.**
  Cross-entity typed-deletion is a separate OPEN_THINGS pass (Q8).
- **Sidebar entry under Data group between `/school-classes` and `/lessons`;
  `ClipboardList` icon.** Preserves sidebar ordering as data-entry flow
  (Q9).
- **New `stundentafeln.*` i18n namespace.** Keeps standalone-page copy
  separate from the picker keys under `schoolClasses.*` (Q10).
- **Two Zod schemas, parent and entry.** Different form lifecycles (Q11).
- **Nested Dialog for entry add/edit inside parent edit dialog.** Proper
  focus management via Radix; keeps user context (Q12).
- **Inline entries table inside parent edit dialog.** Single surface for
  the whole curriculum (Q13).
- **List columns Name / Grade / Actions; no entry count column.** Avoids
  backend schema change or N detail fetches on load (Q14).
- **Tests cover list render + create stundentafel + add one entry.** Novel
  nested-dialog path earns explicit coverage; single-dialog paths mirror
  lessons (Q15).
- **Sequential subagents.** Tasks share `en.json`, `de.json`, `app-sidebar.tsx`,
  `app-shell.tsx`, `msw-handlers.ts`; parallel edits would collide (Q17).
- **Full rewrite of `features/stundentafeln/hooks.ts`.** Mirrors the
  lessons hooks file for consistency (Q18).

## Acceptance criteria

1. `/stundentafeln` renders under the authed layout; unauthenticated
   visitors redirect to `/login`.
2. The page lists existing curricula from the backend, shows a loading
   state, an error state, and an empty-list state with onboarding copy that
   matches the other CRUD pages.
3. The table shows Name, Grade, and Actions (Edit / Delete) columns.
4. "New curriculum" opens a dialog with Name and Grade fields. Submit
   creates the curriculum; the list refreshes without a hard reload.
5. "Edit" on a row opens a dialog that shows the curriculum metadata form
   AND a nested entries table. Saving the metadata form patches the
   parent; the list refreshes. The dialog stays open for further entry
   edits.
6. "Add entry" inside the edit dialog opens a nested dialog with Subject,
   Hours, Block size fields. Submitting creates the entry via the
   `/entries` sub-endpoint; the entries table refreshes; the nested dialog
   closes while the parent dialog stays open.
7. "Edit" on an entry opens the entry dialog in edit mode with the subject
   field read-only and the numeric fields editable. Submit patches the
   entry.
8. "Delete" on an entry opens a confirm dialog; confirm calls DELETE on the
   sub-endpoint; the entries table refreshes.
9. "Delete" on a curriculum opens a confirm dialog; confirm calls DELETE on
   the parent endpoint; the list refreshes.
10. When every subject is already in the current curriculum, the "Add
    entry" dialog shows an "Every subject is already assigned" message and
    the submit button is disabled.
11. Creating a curriculum with a duplicate name surfaces a translated
    root-level form error; the dialog stays open.
12. Creating an entry with a subject that races to duplicate surfaces a
    translated root-level form error; the nested dialog stays open.
13. Sidebar: a new Curriculum / Stundentafel entry appears under the Data
    group between School Classes and Lessons; clicking it navigates;
    active styling applies on `/stundentafeln`.
14. Top-bar crumb shows "Curriculum" / "Stundentafel" on `/stundentafeln`.
15. Switching language between EN and DE flips every visible string on the
    new page, including dialog titles, column headers, the sidebar entry,
    and the block size labels.
16. `mise run lint` and `mise run test` both pass locally; CI is green.
17. Coverage ratchet passes. Baseline bumped only if needed.
18. The Subjects / Rooms / Teachers / WeekSchemes / SchoolClasses / Lessons
    pages still pass their existing tests and are otherwise untouched.

## Risks and mitigations

- **`mise run fe:types` drift.** Generated client types may not match the
  backend if the OpenAPI schema moved since the last frontend change.
  Mitigation: regenerate types as the first plan task; surface unexpected
  breakage in the PR description.
- **Sidebar crowding.** Seven entries in the Data group after this change
  (was six after the Lessons PR). OPEN_THINGS already flags revisiting
  grouping once the group grows past eight.
- **Nested Dialog focus trap in tests.** Radix `Dialog` handles stacked
  dialogs correctly, but jsdom's Pointer Events polyfills must be in
  place. They already are (see frontend CLAUDE.md). The parent-dialog-open
  assertion after nested-dialog submit needs `findBy*` to wait for the
  async invalidation, not `queryBy*`.
- **Detail query `useStundentafel(id)` key shape.** `["stundentafeln", id]`
  must match across the detail query and the entry mutations so entry
  mutations invalidate the right detail. Mitigation: export the key
  builder from `hooks.ts` and use it on both sides.
- **Subject filter vs edit mode.** The filter applies only to entry
  creation; in edit mode the entry's existing subject must remain
  selectable (it's read-only anyway, but the Select value must match). The
  edit dialog renders the subject as a static `<p>` rather than a disabled
  Select to avoid this entirely.
- **Typed 409 collision on duplicate name + duplicate subject.** Backend
  distinguishes at the URL level: duplicate name is on
  `POST /api/stundentafeln`, duplicate subject is on
  `POST /api/stundentafeln/{id}/entries`. The frontend surfaces the right
  translated message per dialog; no ambiguity.
- **Coverage ratchet dip from new test file.** Adding a new test file and
  new page code in one change can either bump or dip coverage depending
  on how much of the new code the test exercises. Plan accounts for the
  "dip" case by noting the rebaseline procedure only if coverage
  organically rises.

## Rollback plan

Revert the feature branch commits. Shared edits are: `app-sidebar.tsx`,
`app-shell.tsx`, both locale JSON files, and `tests/msw-handlers.ts`. All
are additive or one-line replacements; reverting leaves prior behaviour
intact (no sidebar entry for curriculum, class-creation picker untouched).
No migrations, no API surface changes.

## Open questions (deferred)

Tracked or to be added in `OPEN_THINGS.md`:

- Resolve the "Stundentafel CRUD page" entry after merge.
- Backend `entry_count` / `total_hours` on `StundentafelListResponse` (new
  entry; worth it only if users ask for the at-a-glance column).
- Bulk "Generate lessons from Stundentafel" UI (entry exists).
- Typed deletion errors for in-use entities (entry exists; covers
  Stundentafel too).
- Dashboard "recently edited" tile (entry exists; now encompasses
  Stundentafel).
- Shared `ConfirmDialog` component (entry exists; every per-entity delete
  dialog duplicates it).
