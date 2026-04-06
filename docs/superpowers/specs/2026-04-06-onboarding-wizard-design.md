# Onboarding Wizard — Design

**Status:** Draft
**Date:** 2026-04-06
**Backlog item:** 2a (Tier 2: UX polish)

## Problem

Newly created schools land on a dashboard that shows only name, slug, and role. Users have no guidance on what to do next. To get to a generated timetable, an admin must discover the seven-tabbed settings page and fill in (in dependency order): a term, classes, subjects, teachers, rooms, timeslots, and curriculum entries — with no signposting that this order matters or that all of it is required.

This is the biggest UX gap for first-time users and the main blocker for shipping the app to real schools.

## Goals

- Give a first-time admin a clear, step-by-step path from "school created" to "ready to generate".
- Make the path **resumable** — users will leave and come back; progress must be visible and recoverable.
- Allow users to **dismiss** the wizard and use the existing settings UI directly if they prefer.
- Offer a one-click way to **load example data** so users can explore the app without typing everything in.
- **No paternalism**: if a user fills in the bare minimum (e.g. one class, one subject), that's fine — the solver will tell them what's missing later.
- Zero new schema. State derives from existing entity counts.

## Non-goals

- Editing the example data template from the UI.
- Per-user dismissal flag, telemetry on completion rates, A/B testing.
- Locales beyond DE/EN.
- Replacing or restyling the existing settings tabs (the wizard reuses them).
- Onboarding for non-admin members (only admins see the wizard and checklist).

## High-level architecture

Pure frontend feature with **one small backend addition** (an example-data loader endpoint). All wizard/checklist state derives from counts returned by the existing entity endpoints. No new tables, no new columns.

Two new UI surfaces:

1. **`OnboardingWizardDialog`** — a full-screen `Dialog` containing a `WizardShell` that wraps the existing settings tab components (one per step).
2. **`OnboardingChecklist`** — a `Card` rendered on the school dashboard that lists the seven steps with check icons, deep-links into the relevant settings tab, and a "Resume setup" button that re-opens the wizard.

A single hook, `useOnboardingProgress(schoolId)`, is the source of truth: it fetches counts in parallel and returns step state. Both UI surfaces consume it.

### Auto-launch rule

When a school dashboard mounts and the user is `admin`, the dashboard checks `useOnboardingProgress`. If **every count is zero**, the wizard dialog opens automatically. Closing the dialog flips a local React state flag so it does not re-open during the same mount. Re-mounting the page only re-opens the wizard if the school is *still* completely empty — once the user has added even one entity, auto-launch never fires again. Non-admins never see the wizard or checklist (consistent with all settings being admin-gated).

This is the "implicit, no flag" approach: zero new schema, behavior matches the user's intuition that the wizard is for *empty* schools.

### Step model

Seven linear steps in dependency order:

1. **Term** — at least one term must exist before everything else.
2. **Classes**
3. **Subjects**
4. **Teachers**
5. **Rooms**
6. **Timeslots**
7. **Curriculum**

Step *N* is "done" when the corresponding entity count is `≥ 1`. Existence-only — no thresholds, no validation, no solver-readiness gates.

Each non-term step has a **Skip** button that moves to the next step without requiring a row to be added. Skipped steps simply remain unchecked on the dashboard checklist; the user can come back via "Resume setup" or by clicking the deep-link in the checklist.

The **Term** step also has no hard "you must add one" gate — Skip is available — but the wizard surfaces the dependency in the step description ("Most other settings need at least one term").

### "Try with example data"

The Term step (step 1) shows a secondary action above the embedded `TermsTab`: **"Try with example data"**. This button is visible only while the school is completely empty. Clicking it calls `POST /api/schools/{id}/load-example`, which populates the school with the canonical example dataset (the same content as the dev seed) inside a single transaction. On success, the wizard closes and the dashboard shows the checklist with all steps checked.

If the school already has any data, the endpoint returns `409 Conflict` and the frontend surfaces a toast: "School already has data — example loader skipped." The button hides itself based on the same emptiness check used for auto-launch, so users normally never see this error in practice.

## Components

```
frontend/src/
├── hooks/
│   └── use-onboarding-progress.ts        # parallel-fetches counts; derives step state
├── components/onboarding/
│   ├── wizard-dialog.tsx                  # <Dialog>; owns step index; Back/Skip/Next
│   ├── wizard-shell.tsx                   # header + progress bar + footer; renders children
│   ├── wizard-steps.ts                    # ordered list: id, titleKey, descKey, TabComponent
│   ├── checklist-card.tsx                 # dashboard checklist with deep-links + Resume button
│   └── load-example-button.tsx            # POSTs /load-example, toasts, refetches
└── app/[locale]/schools/[id]/page.tsx     # adds <OnboardingChecklist /> + auto-launch effect
```

`wizard-steps.ts` is the **single source of truth** for step order. Both the wizard and the checklist iterate over it. Each entry references the existing tab component (`TermsTab`, `ClassesTab`, `SubjectsTab`, `TeachersTab`, `RoomsTab`, `TimeslotsTab` — all in `frontend/src/app/[locale]/schools/[id]/settings/components/`) — no new editor code is written.

**Curriculum exception:** the curriculum editor is not a settings tab — it lives at its own route, `frontend/src/app/[locale]/schools/[id]/curriculum/page.tsx`. The wizard's curriculum step embeds the same editing component used by that page (refactored into a reusable component if it is currently page-level only). For the checklist deep-link, the curriculum step links to `/schools/{id}/curriculum` rather than to `/schools/{id}/settings?tab=…`.

`useOnboardingProgress` returns:

```ts
type StepId = "term" | "classes" | "subjects" | "teachers" | "rooms" | "timeslots" | "curriculum";

type OnboardingProgress = {
  steps: Record<StepId, { done: boolean; count: number }>;
  allComplete: boolean;
  isEmpty: boolean;             // every count === 0
  firstIncomplete: StepId | null;
  refetch: () => Promise<void>;
};
```

`WizardShell` renders:

- Step counter ("Step 3 of 7")
- Progress bar (% of completed steps based on `OnboardingProgress`)
- Localized title and description for the current step
- Footer:
  - **Back** (disabled on step 0)
  - **Skip** (advances without action)
  - **Next** / **Finish** (Finish on the last step)
- Close (×) button in the dialog header — closes the wizard but underlying entity changes are obviously preserved

## Backend changes

Single new endpoint plus a new service module that builds the example dataset in Rust code (the existing `docker/seeds/dev-seed.sql` is a SQL file with hardcoded UUIDs and a hardcoded `school_id`, so it cannot be reused as-is for an arbitrary school).

### New endpoint

```
POST /api/schools/{id}/load-example
```

- Admin-gated (uses the existing `require_admin(&school_ctx)` helper from `backend/src/controllers/scheduler.rs`, lifted into a shared module if needed).
- Tenant-scoped (the existing auth middleware ensures the caller belongs to the school as admin).
- Body: empty.
- Returns:
  - `204 No Content` on success.
  - `409 Conflict` if the school already has any term, class, subject, teacher, room, timeslot, or curriculum entry.
  - Standard `401`/`403` on auth failure.
- Implementation runs inside a single SeaORM transaction. All inserts use the supplied `school_id` so the example data is correctly tenant-scoped.

### New service module

`backend/src/services/example_data.rs`:

```rust
pub async fn load_example_school_data(
    db: &DatabaseTransaction,
    school_id: Uuid,
) -> Result<()>;
```

Builds the canonical dataset in Rust by inserting via the existing SeaORM models. Mirrors the content of `docker/seeds/dev-seed.sql` — one term, several classes, a representative set of subjects, teachers, rooms, weekday timeslots, and a complete curriculum. The dev seed SQL file remains in place for `docker compose` bootstrapping; the Rust function is the runtime equivalent for the wizard. They are intentionally kept in sync by content review (no shared source — the SQL needs hardcoded UUIDs to be idempotent across container restarts, while the Rust function needs to generate fresh UUIDs and accept a `school_id`).

A future cleanup could collapse the two by having the dev-seed binary call `load_example_school_data`, but that is out of scope for this PR.

## Data flow

```
SchoolDashboardPage mounts
  └─ useOnboardingProgress(schoolId)
       ├─ parallel GET counts for 7 entities
       └─ returns { steps, allComplete, isEmpty, firstIncomplete }
  ├─ if (!allComplete && role === admin) render <ChecklistCard />
  └─ if (isEmpty && role === admin && !dismissedThisMount)
       └─ open <WizardDialog initialStep={firstIncomplete ?? 'term'} />
            └─ <WizardShell step={i}>
                 └─ <TermsTab /> | <ClassesTab /> | … (existing components)
            ├─ Skip / Next mutate local step index
            ├─ "Try example data" → POST /load-example → refetch → close
            └─ Finish → close dialog → checklist refreshes
```

`OnboardingProgress.refetch()` runs:

- When the wizard dialog closes.
- On every Next/Skip click (cheap; lets the progress bar update if the embedded tab added rows).

## Error handling

- Existing tab components own their own error UX (toasts, inline messages). The wizard adds nothing on top.
- The example-data endpoint surfaces `409` as a toast (`onboarding.exampleData.alreadyHasData`).
- Network failures during count fetches collapse to a single error state inside the checklist card; the auto-launch effect waits for a successful fetch before deciding.

## i18n

New keys under the `onboarding.*` namespace, both `de.json` and `en.json`:

- `onboarding.wizard.title`, `onboarding.wizard.stepCounter` (with `current`/`total` interpolation)
- `onboarding.steps.term.title`, `.term.description`, … repeated for each of the seven steps
- `onboarding.buttons.back`, `.skip`, `.next`, `.finish`, `.close`
- `onboarding.exampleData.button`, `.exampleData.loading`, `.exampleData.success`, `.exampleData.alreadyHasData`
- `onboarding.checklist.title`, `.resume`, `.allDone`

## Testing

### Backend
Integration tests for `/load-example` (in `backend/tests/requests/example_data.rs`):

- Admin loads into an empty school → `204`, expected counts after the call.
- Non-admin member → `403`.
- Admin loads into a school that already has any one of: a term / class / subject / teacher / room / timeslot / curriculum entry → `409` (one test per entity to prove the conflict check covers all of them).
- Cross-tenant: admin of school A cannot load into school B → `403`.
- Transactionality: a forced failure mid-load leaves the school empty (regression guard for partial inserts).

### Frontend
Component tests:

- `useOnboardingProgress`: mocked count responses produce the correct `steps`, `allComplete`, `isEmpty`, `firstIncomplete`. Includes an empty-school case and a fully-populated case.
- `WizardDialog`: renders the embedded tab for the current step, Skip advances the step index, Next on the last step closes the dialog, Back is disabled on step 0.
- `ChecklistCard`: shows correct check states for a given progress object, deep-link `href`s match the settings-tab query params (and `/curriculum` for the curriculum step), "Resume setup" button opens the wizard at `firstIncomplete`.
- `LoadExampleButton`: hides when school is non-empty, shows toast on `409`, calls refetch on success.

No e2e tests in this PR — Tier 3b will cover the full flow later.

## Out of scope

- Per-user dismissal flag (use the implicit "school is empty" rule instead).
- Editing the example data template from the UI.
- Locales beyond DE/EN.
- Telemetry on wizard completion rates.
- Collapsing `dev-seed.sql` and the new Rust loader into a single source.
- Replacing or restyling existing settings tabs.

## Open questions

None at design time — all decisions resolved during brainstorming.
