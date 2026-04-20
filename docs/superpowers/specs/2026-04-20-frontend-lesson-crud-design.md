# Frontend Lesson CRUD page

Spec date: 2026-04-20
Status: accepted
Owner: pgoell

## Motivation

`docs/superpowers/OPEN_THINGS.md` lists Stundentafel and Lesson as the last two
entity CRUD pages missing from the product surface. The roadmap memory explicitly
says not to bundle them: Stundentafel needs a nested-row editor, Lesson needs
multiple FK dropdowns. This spec covers Lesson alone; Stundentafel gets its own
spec.

The Lesson page is the closest fit to the existing SchoolClass template (three FK
dropdowns instead of two, plus a numeric hours field and a single vs double-period
selector). The sidebar already has a disabled `sidebar.lessons` entry waiting for
this page; the dashboard has no Lesson tile yet, which is consistent with the
roadmap's "dashboard recently-edited tile" tech-debt item that will cover every
entity in one pass.

## Goals

- New `/lessons` page with table, create / edit dialog, and delete confirmation
  under the `_authed` layout.
- Three foreign-key dropdowns: `school_class_id`, `subject_id`, `teacher_id`.
  Teacher is optional (backend allows `NULL`); the dropdown exposes an
  "Unassigned" option alongside real teachers.
- A two-option `Select` for `preferred_block_size` mapping to the integer values
  `1` and `2` via translated labels ("Single period" / "Double period").
- Numeric `hours_per_week` input constrained to integers `>= 1`.
- Table columns: Class (name), Subject (name + short name), Teacher (short code;
  falls back to `—` when unassigned), Hours, Block size, Actions.
- Sidebar: flip the existing disabled `sidebar.lessons` entry to a real link
  at `/lessons`.
- Top-bar crumb: extend `currentCrumbKey` to map `/lessons`.
- Typed 409 handler on create and update: shows the translated
  `lessons.errors.duplicate` message as a root-level form error when the
  backend rejects a duplicate `(class, subject)` pair (the app has no toast
  library yet).
- Tests match the batch-1 + SchoolClass pattern: list-render assertion plus
  create-flow assertion using MSW.
- i18n: every visible string keyed under `lessons.*` with EN and DE entries.
- Coverage ratchet passes; baseline bumped only if it dips.

## Non-goals

- No Stundentafel CRUD page (separate spec; nested-row editor).
- No backend changes. The spec relies on existing `/api/lessons` and the three FK
  GET endpoints exactly as they ship today.
- No exposure of `POST /api/classes/{id}/generate-lessons` in the UI; that belongs
  with the "Sub-resource editors for base entities" item in `OPEN_THINGS.md`.
- No URL-persisted filter state. The page uses the existing `Toolbar` text
  search across Class / Subject / Teacher names, consistent with every other
  CRUD page.
- No `Combobox` or async-search picker. Flat `Select` is sufficient at current
  data scale. Teacher lists that grow past a few dozen can revisit this.
- No bulk-select or bulk-delete UI on the table.
- No new shadcn primitives. `Select`, `Input`, `Form`, `Dialog`, `Table`,
  `Button` already cover the surface.
- No Zod `t()` errorMap work. Error literals stay in English, matching
  Subjects / Rooms / Teachers / WeekSchemes / SchoolClasses.
- No dashboard tile for Lessons; the "recently edited" tile work is tracked as
  its own cross-entity `OPEN_THINGS` item.
- No Playwright e2e flow. The open item "Entity coverage beyond Subjects"
  already covers every remaining entity in a bundled e2e-expansion pass.

## Stack (unchanged)

- Vite 7 + React 19, TanStack Router file-based routes, TanStack Query.
- shadcn/ui primitives under `frontend/src/components/ui/` (Select, Input, Form,
  Dialog, Table, Button).
- React Hook Form + Zod with the shadcn `Form` wrapper.
- `react-i18next` with `en.json` + `de.json` in `frontend/src/i18n/locales/`.
- `openapi-fetch` typed `client` from `@/lib/api-client`, regenerated from the
  backend OpenAPI schema via `mise run fe:types`.
- Vitest + Testing Library + MSW, ratchet against `.coverage-baseline-frontend`.

## Architecture

### Directory layout

```
frontend/src/
  features/
    lessons/
      hooks.ts                # useLessons, useCreateLesson,
                              # useUpdateLesson, useDeleteLesson
      schema.ts               # LessonFormSchema (Zod)
      lessons-page.tsx        # LessonsPage component
      lessons-dialogs.tsx     # LessonFormDialog, DeleteLessonDialog
  routes/
    _authed.lessons.tsx
  components/
    app-sidebar.tsx           # flip disabled entry to /lessons
    layout/app-shell.tsx      # extend currentCrumbKey
  i18n/locales/
    en.json                   # + lessons.*
    de.json                   # same keys translated
frontend/tests/
  lessons-page.test.tsx
  msw-handlers.ts             # + GET/POST/PATCH/DELETE /api/lessons, seed data
```

### Data flow

- `routes/_authed.lessons.tsx` is thin: exports a TanStack route that renders
  `LessonsPage` from `features/lessons/`. It accepts an optional `?create=1`
  search param (mirrors other CRUD pages) for future QuickAdd deep-linking.
- `features/lessons/hooks.ts` exports typed `useLessons`, `useCreateLesson`,
  `useUpdateLesson`, `useDeleteLesson` wrappers over the `openapi-fetch` client,
  invalidating `queryKey: ["lessons"]` on mutation success.
- `features/lessons/schema.ts` exports `LessonFormSchema` whose output maps
  directly onto the `LessonCreate` / `LessonUpdate` shapes.
- `features/lessons/lessons-page.tsx` exports the page component.
- `features/lessons/lessons-dialogs.tsx` exports `LessonFormDialog` and
  `DeleteLessonDialog`.

### Form schema (Zod, flat)

```ts
import { z } from "zod";

export const UNASSIGNED = "__unassigned__";

export const LessonFormSchema = z.object({
  school_class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  teacher_id: z.string(), // UUID or literal UNASSIGNED
  hours_per_week: z.number().int().min(1),
  preferred_block_size: z.number().int().min(1).max(2),
});
```

Parameter rationale (echoes the CLAUDE.md flat-Zod rule):

- No `z.coerce.number()` on `hours_per_week` or `preferred_block_size`. The
  `<Input type="number">` / `<Select>` `onChange` handlers coerce at the
  boundary: `field.onChange(Number(event.target.value))` for the hours input,
  and `field.onChange(Number(value))` for the block-size select. Form state
  holds numbers from the start.
- No `z.union([z.literal(1), z.literal(2)])` on `preferred_block_size`. Unions
  are on the CLAUDE.md forbidden list for the RHF resolver. A plain
  `z.number().int().min(1).max(2)` captures the same constraint at runtime; the
  handful of UI options keeps users from entering a third value.
- No `.transform()` on `teacher_id`. The literal `UNASSIGNED` stays in form
  state; the submit handler converts it to `null` at the client boundary.
- No `.default(1)` on `preferred_block_size`. Default seeds come from
  `defaultValues` on the RHF `useForm({ defaultValues })` call, not the schema.

### FK dropdown plumbing

`LessonFormDialog` renders three `<Select>` fields:

- `school_class_id` — populated from `useSchoolClasses().data ?? []`. Each
  option renders the class `name`.
- `subject_id` — populated from `useSubjects().data ?? []`. Each option renders
  `subject.name` with `subject.short_name` in a muted suffix
  (`{subject.name} · {subject.short_name}`) so users can disambiguate subjects
  that share a long name (e.g. "English basic" vs "English advanced").
- `teacher_id` — populated from `useTeachers().data ?? []` with a
  leading "Unassigned" option whose value is the sentinel `UNASSIGNED` constant.
  Teacher options render `{teacher.first_name} {teacher.last_name} (short_code)`.

When any of the three real-data lists (`schoolClasses`, `subjects`) is empty, an
`<Alert>`-style notice renders above the form with `<Link>` calls pointing at
`/school-classes` and `/subjects`. The submit button is `disabled` while either
list is empty. Teachers can be empty legitimately (unassigned is fine), so a
missing Teachers list does not block submit, only the Teacher dropdown falls
back to "Unassigned only".

(Consistent with SchoolClass: no `<Alert>` shadcn primitive yet; the notice is a
div with token classes, not a new component.)

### FK display in the table

The `LessonResponse` already embeds `school_class`, `subject`, and `teacher`
objects with the names we need. The table renders those directly; no client-side
lookup needed. Unassigned teacher renders `—` with a `title` of
`t("lessons.fields.teacherUnassigned")`. Block size renders
`t("lessons.fields.blockSizeSingle")` or `...Double` rather than the integer.

### Typed 409 on duplicate (class, subject)

The `LessonFormDialog` handles mutation errors inline (the app has no toast
infrastructure yet). The submit handler wraps `createMutation.mutateAsync` /
`updateMutation.mutateAsync` in a `try / catch`. When the caught error is an
`ApiError` with `status === 409`, the dialog sets a form-level root error via
`form.setError("root", { message: t("lessons.errors.duplicate") })` and leaves
the dialog open so the user can adjust the class or subject. The root error
renders through `form.formState.errors.root?.message` in a dedicated `<p>` with
`role="alert"` above the submit button. For all other errors, the dialog
re-throws the error (the existing behaviour; mutation error state bubbles up
through React Query). This mirrors the `login.tsx` pattern.

### Route + crumb wiring

- `_authed.lessons.tsx` mirrors `_authed.school-classes.tsx` exactly:
  ```tsx
  const lessonsSearchSchema = z.object({
    create: z.literal("1").optional(),
  });
  export const Route = createFileRoute("/_authed/lessons")({
    component: LessonsPage,
    validateSearch: lessonsSearchSchema,
  });
  ```
- `app-sidebar.tsx`: change the disabled Lessons entry from `disabled: true,
  to: "#"` to `{ to: "/lessons", labelKey: "sidebar.lessons", icon: Layers }`
  (no `disabled` flag). `Layers` is already imported.
- `app-shell.tsx`: extend `currentCrumbKey` with
  `if (pathname.startsWith("/lessons")) return "sidebar.lessons";`.

### i18n keys

New top-level `lessons.*` namespace.

EN (verbatim):

```json
{
  "lessons": {
    "title": "Lessons",
    "subtitle": "Concrete weekly assignments of a class to a subject and teacher.",
    "new": "New lesson",
    "loadError": "Could not load lessons.",
    "columns": {
      "schoolClass": "Class",
      "subject": "Subject",
      "teacher": "Teacher",
      "hoursPerWeek": "Hours / week",
      "blockSize": "Block size",
      "actions": "Actions"
    },
    "empty": {
      "title": "No lessons yet",
      "body": "Assign each class the subjects it studies this year, with a teacher and weekly hours.",
      "step1": "Create classes and subjects",
      "step2": "Add teachers",
      "step3": "Create a lesson"
    },
    "fields": {
      "schoolClassLabel": "Class",
      "schoolClassPlaceholder": "Select a class",
      "subjectLabel": "Subject",
      "subjectPlaceholder": "Select a subject",
      "teacherLabel": "Teacher",
      "teacherPlaceholder": "Select a teacher",
      "teacherUnassigned": "Unassigned",
      "hoursPerWeekLabel": "Hours / week",
      "blockSizeLabel": "Block size",
      "blockSizeSingle": "Single period",
      "blockSizeDouble": "Double period"
    },
    "dialog": {
      "createTitle": "New lesson",
      "createDescription": "Create a new lesson.",
      "editTitle": "Edit lesson",
      "editDescription": "Update {{className}} · {{subjectName}}.",
      "deleteTitle": "Delete lesson",
      "deleteDescription": "This will permanently delete {{className}} · {{subjectName}}.",
      "missingPrereqs": "Add at least one class and one subject before creating a lesson.",
      "addSchoolClass": "Add a class",
      "addSubject": "Add a subject"
    },
    "errors": {
      "duplicate": "A lesson for this class and subject already exists."
    }
  }
}
```

DE keys mirror the same shape with translated copy. `sidebar.lessons` already
exists in both catalogs and is reused.

### Testing

`frontend/tests/lessons-page.test.tsx`:

- Renders the page through `renderWithProviders` from `tests/render-helpers.tsx`.
- Asserts: a seeded Lesson row renders with its class name, subject short name,
  teacher short code, hours-per-week, and block size label.
- Clicks "New lesson", fills the dialog (class, subject, teacher, hours, block
  size), submits, asserts the dialog closes (proving the POST handler was hit).

`frontend/tests/msw-handlers.ts` extensions:

- `initialLessons` seed (one entry referencing an existing seed class, subject,
  and teacher; denormalized shape so the `LessonResponse` format matches).
- `GET /api/lessons` returns the seed array.
- `POST /api/lessons` parses the body and returns 201 with a generated ID and
  rebuilt `school_class`, `subject`, `teacher` sub-objects by cross-referencing
  the existing seed lists.
- `PATCH /api/lessons/:id` and `DELETE /api/lessons/:id` handlers land even if
  the test doesn't exercise them yet, so future test expansion doesn't need to
  touch the handlers file.

The 409 duplicate handler is not exercised in this PR's tests; the behaviour is
narrow enough that integration-style coverage would be ceremony. When a future
pass lands "typed deletion errors for in-use entities" across the product, the
test pattern established there can fold in duplicate-create coverage too.

### OpenAPI types

`mise run fe:types` regenerates `frontend/src/lib/api-types.ts`. The plan's
first task runs the regeneration so the Lesson schemas resolve at type-check
time. The `/api` prefix lands cleanly because the refactor is already merged.

## Key decisions

- **Lesson alone, not Lesson + Stundentafel.** Roadmap memory and OPEN_THINGS
  both call for separate specs (Q1).
- **Teacher dropdown optional with sentinel "Unassigned" option.** Backend
  allows `NULL`; solver assigns later. Forcing assignment would block drafts
  (Q2).
- **Two-option `Select` for block size, not a number or radio.** Exactly two
  values with human meanings; consistent visual rhythm with the other dropdowns
  (Q3).
- **Defer the bulk `generate-lessons` endpoint.** Belongs with the
  `OPEN_THINGS.md` "manage related rows" item, not here (Q4).
- **Plain text search via the existing Toolbar.** URL-state filters are a
  cross-page concern; consistency with the other CRUD pages matters more than
  feature parity with the backend's filter params (Q5).
- **Denormalized response fields render directly.** `LessonResponse` already
  embeds the class / subject / teacher names; no client-side lookup needed
  (Q6).
- **Typed 409 branch, not pre-flight.** Race-safe and matches backend detail
  string (Q7).
- **Copy the SchoolClass `DeleteSchoolClassDialog` pattern verbatim.** A shared
  ConfirmDialog component belongs in a cleanup PR (Q8, tracked in
  `OPEN_THINGS.md`).
- **Vitest + MSW only; defer Playwright to the bundled e2e-expansion pass**
  (Q9).
- **Flip the existing disabled sidebar entry, don't add a new one** (Q10).
- **No dashboard tile in this PR** (Q11).
- **Hybrid empty-state + in-dialog prerequisite alert** (Q12).
- **Flat Zod schema; coercion in the form submit handler** (Q13, also a
  CLAUDE.md rule).
- **Sequential subagents in the plan.** The i18n catalogs, sidebar, and
  msw-handlers are shared state (Q14).

## Acceptance criteria

1. `/lessons` renders under the authed layout; unauthenticated visitors
   redirect to `/login`.
2. The page lists existing lessons from the backend, shows a loading state, an
   error state, and an empty-list state with onboarding copy that matches the
   batch-1 pages.
3. The table shows Class, Subject (name · short_name), Teacher (short code or
   `—`), Hours, Block size (translated label), and Actions columns.
4. "New lesson" opens a dialog with Class, Subject, Teacher, Hours, and Block
   size fields. Submit creates the lesson; the list refreshes without a hard
   reload.
5. When either the Classes or the Subjects list is empty, the dialog shows a
   translated alert with `<Link>` actions and disables submit. An empty
   Teachers list is non-blocking (Teacher dropdown shows only "Unassigned").
6. Each list row has Edit (opens prefilled dialog, save patches) and Delete
   (opens confirm dialog; backend 404 / 409 surface via the existing
   `ApiError` toast).
7. Creating or editing a lesson with a duplicate `(class, subject)` pair shows
   a translated "already exists" root-level form error; the dialog stays open.
8. Sidebar: the Lessons entry is no longer disabled; clicking it navigates;
   active styling applies on `/lessons`.
9. Top-bar crumb shows "Lessons" / "Unterricht" on `/lessons`.
10. Switching language between EN and DE flips every visible string on the new
    page, including dialog titles, column headers, alert copy, and the block
    size labels.
11. `mise run lint` and `mise run test` both pass locally; CI is green.
12. Coverage ratchet passes. Baseline bumped only if needed.
13. The Subjects / Rooms / Teachers / WeekSchemes / SchoolClasses pages still
    pass their existing tests and are otherwise untouched.

## Risks and mitigations

- **`mise run fe:types` drift.** Generated client types may not match the
  backend if the OpenAPI schema moved since the last frontend change.
  Mitigation: regenerate types as the first plan task; surface unexpected
  breakage in the PR description.
- **Sidebar crowding.** Seven entries (was six). Still acceptable; revisit
  grouping at eight or more.
- **`UNASSIGNED` sentinel collides with a legitimate UUID.** The sentinel is
  the string `__unassigned__` (not a valid UUID format), so `z.string().uuid()`
  would reject it. We handle this by validating only the real-UUID case at the
  submit boundary: before `onSubmit`, replace the sentinel with `null`, then
  hand the payload to the mutation. The form-level Zod schema accepts
  `z.string()` for `teacher_id` (not `.uuid()`) because the sentinel is a
  legal form-state value. The submit handler does the narrow validation.
- **Subject name · short_name display pushes rows past one line.** At current
  data scale the short_name is three chars; worst case is ~40 chars total,
  which fits. If subject names ever grow longer, truncate with `max-w` +
  `truncate` classes at that point.
- **Typed 409 toast requires accessing `err.status`.** `ApiError` already
  carries `status` and `data`; no new API-client work needed.
- **`useTeachers` return shape assumed.** The hook returns an array of
  `TeacherResponse`. Plan's first task verifies this.

## Rollback plan

Revert the feature branch commits. Shared edits are: `app-sidebar.tsx`,
`app-shell.tsx`, both locale JSON files, and `tests/msw-handlers.ts`. All are
additive or one-line replacements; reverting leaves the prior behaviour intact
(sidebar entry returns to disabled, dashboard unchanged). No migrations, no API
surface changes.

## Open questions (deferred)

Tracked or to be added in `OPEN_THINGS.md`:

- Stundentafel CRUD page (entry exists).
- Bulk "Generate lessons from Stundentafel" UI (new entry; wraps the existing
  `POST /classes/{id}/generate-lessons` endpoint).
- Typed deletion errors for in-use entities (entry exists; covers Lesson too).
- Dashboard "recently edited" tile (entry exists; now encompasses Lesson).
- Shared `ConfirmDialog` component (new entry; deduplicates the five
  per-entity delete dialogs).
- URL-state filters for list pages (not yet tracked; add if this spec surfaces
  a real workflow for lessons).
