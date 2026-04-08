# Klassenzeit — Current Status

## Completed Steps

### Step 1: Keycloak Realm Setup
- Spec: `superpowers/specs/2026-04-03-keycloak-realm-setup.md`
- Plan: `superpowers/plans/2026-04-03-keycloak-realm-setup.md`

### Step 2: Core DB Schema
- Spec: `superpowers/specs/2026-04-03-core-db-schema-design.md`
- Plan: `superpowers/plans/2026-04-03-core-db-schema.md`

### Step 3: Auth Middleware in Loco
- Spec: `superpowers/specs/2026-04-03-auth-middleware-design.md`
- Plan: `superpowers/plans/2026-04-03-auth-middleware.md`

### Step 4: Frontend Auth Integration
- Spec: `superpowers/specs/2026-04-03-frontend-auth-design.md`
- Plan: `superpowers/plans/2026-04-03-frontend-auth.md`
- PR: #17 (merged)

### Step 5: First CRUD Endpoints
- Spec: `superpowers/specs/2026-04-03-first-crud-endpoints-design.md`
- Plan: `superpowers/plans/2026-04-03-first-crud-endpoints.md`
- PR: #18 (merged)

### Step 5b: i18n (DE/EN)
- Spec: `superpowers/specs/2026-04-03-i18n-design.md`
- Plan: `superpowers/plans/2026-04-03-i18n.md`
- PR: #21 (merged)

### Domain Tables Migration
- Spec: `superpowers/specs/2026-04-03-domain-tables-design.md`
- Plan: `superpowers/plans/2026-04-03-domain-tables.md`
- PR: #23 (merged)

### Step 6: Scheduler Integration
- Spec: `superpowers/specs/2026-04-03-scheduler-integration-design.md`
- Plan: `superpowers/plans/2026-04-03-scheduler-integration.md`
- PR: #25 (merged)

### Reference Data Management UI
- Spec: `superpowers/specs/2026-04-04-reference-data-ui-design.md`
- Plan: `superpowers/plans/2026-04-04-reference-data-ui.md`
- PR: #31 (merged)

### Dev Seed Data
- Spec: `superpowers/specs/2026-04-04-dev-seed-data-design.md`
- Plan: `superpowers/plans/2026-04-04-dev-seed-data.md`
- PR: #33 (merged)

### Scheduler API Integration Tests
- PR: #34 (merged)

### Frontend Component Tests
- PR: #35

### Deployment Config + Cleanup
- Backend staging/production config files (PR #36)
- Removed scaffold leftovers (PR #36)
- Dockerfile binary name fix + workflow_dispatch triggers (PR #37)

### Deployment Live
- Runner: `iuno-klassenzeit` registered for `Spycner/Klassenzeit`
- Staging: https://klassenzeit-staging.pascalkraus.com (auto-deploys on push to main)
- Keycloak clients: `klassenzeit-staging` and `klassenzeit-prod` in realm

### Solver Domain Model + Construction Heuristic
- Spec: `superpowers/specs/2026-04-04-solver-domain-model-design.md`
- Plan: `superpowers/plans/2026-04-04-solver-domain-model.md`

### Local Search + Soft Constraints
- Spec: `superpowers/specs/2026-04-04-local-search-soft-constraints-design.md`
- Plan: `superpowers/plans/2026-04-04-local-search-soft-constraints.md`
- PR: #44 (merged)

### Solver Validation + Benchmarking
- Spec: `superpowers/specs/2026-04-05-solver-validation-design.md`
- Plan: `superpowers/plans/2026-04-05-solver-validation.md`
- PR: #47 (merged)

### Room Capacity / Gym Splitting
- Spec: `superpowers/specs/2026-04-05-room-capacity-design.md`
- Plan: `superpowers/plans/2026-04-05-room-capacity.md`
- PR: #50 (merged)

### Solver Tuning (LAHC + Tabu Hybrid)
- Spec: `superpowers/specs/2026-04-05-solver-tuning-design.md`
- Plan: `superpowers/plans/2026-04-05-solver-tuning.md`
- Added Tabu search overlay to LAHC solver with aspiration criterion
- Parameter sweep across tenure (0-100) and list_length (100-1000)
- Finding: soft score plateau is due to move neighborhood limits (Change+Swap ceiling), not cycling
- Tabu infrastructure retained for harder instances; defaults: tenure=7, list_length=500

### Kempe Chain Moves
- Spec: `superpowers/specs/2026-04-05-kempe-chain-moves-design.md`
- Plan: `superpowers/plans/2026-04-05-kempe-chain-moves.md`
- PR: #53 (merged)
- Resource-pair Kempe chains via BFS over teacher/class/room conflicts
- 40/40/20 move split (Change/Swap/Kempe), max chain size 20
- Room capacity handling with abort-and-restore
- Tabu integration with seed+timeslot entry

### Solver Constraints UI — PR1 (Weights + Softening)
- Spec: `superpowers/specs/2026-04-06-solver-constraints-ui-design.md`
- Plan: `superpowers/plans/2026-04-06-solver-constraints-ui.md`
- `ConstraintWeights` in scheduler crate — 4 soft weights + 6 softenable hard toggles, threaded through `ScheduleInput`/`ProblemFacts`
- Scoring property tests parameterised over random weights
- `school_scheduler_settings` table (JSONB) + `GET`/`PUT /api/schools/{id}/scheduler-settings` (admin-gated)
- New "Scheduler" tab in school settings UI with soft weight sliders and hard→soft toggles

### Preference Editors — PR2 (4a + 4b)
- Spec: `superpowers/specs/2026-04-06-preference-editors-design.md`
- Plan: `superpowers/plans/2026-04-06-preference-editors.md`
- `GET`/`PUT /api/schools/{id}/teachers/{tid}/availabilities` — admin-gated replace-all, validates day/period/type, tenant-scoped, optional `?term_id` query param
- `GET`/`PUT /api/schools/{id}/rooms/{rid}/suitabilities` — admin-gated replace-all with cross-tenant subject validation
- `TeacherAvailabilityDialog`: weekly grid with single-click cycle (available → preferred → blocked)
- `RoomSuitabilityDialog`: subject checkbox list
- Default-scope only; per-term overrides deferred to a future PR

### Onboarding Wizard (2a)
- Spec: `superpowers/specs/2026-04-06-onboarding-wizard-design.md`
- Plan: `superpowers/plans/2026-04-06-onboarding-wizard.md`
- `useOnboardingProgress` hook derives 7-step status from existing entity counts (terms, classes, subjects, teachers, rooms, timeslots, curriculum); stale-response guard via request-id counter.
- `WizardDialog` embeds existing settings tabs inside a `WizardShell` (header, progress bar, Back/Skip/Next/Finish). Curriculum step links to its own page via a CTA button instead of embedding.
- `ChecklistCard` on the school dashboard shows remaining steps with deep-links and a "Resume setup" button; hides itself when all complete.
- Auto-launches once on empty schools for admins; implicit "school is empty" rule — no dismissal flag needed.
- New `POST /api/schools/{id}/load-example` endpoint (admin-gated, 409 on non-empty) populates the canonical example dataset in a single transaction via `services::example_data::load_example_school_data`.

### Timetable Views (2b)
- Spec: `superpowers/specs/2026-04-07-timetable-views-design.md`
- Plan: `superpowers/plans/2026-04-07-timetable-views.md`
- New `GET /api/schools/{id}/terms/{term_id}/lessons` endpoint (any school member, tenant-scoped via `school_years.school_id`).
- Shared `<TimetableGrid>` component (`@/components/timetable/timetable-grid`) and `<ViewModeSelector>` with class/teacher/room toggle and `localStorage`-persisted last view per school.
- New read-only `/timetable` route loads applied lessons; `/schedule` preview gains all three view modes via the same components.
- Sidebar gains a `Timetable` entry (separate from `Schedule`).

### Conflict Resolution UI (2d)
- Spec: `superpowers/specs/2026-04-07-conflict-resolution-ui-design.md`
- Plan: `superpowers/plans/2026-04-07-conflict-resolution-ui.md`
- New `diagnose()` pass in `scheduler/src/constraints.rs` mirrors `full_evaluate` and emits structured `Violation { kind, severity, message, lesson_refs, resources }` for all 11 hard + 4 soft constraint kinds. Runs once after local search; no perf regression. Invariant test guards parity with `full_evaluate`.
- Backend `ViolationDto`/`LessonRefDto`/`ResourceRefDto` serialized as part of `SolveResult.violations`. Integration test asserts the structured shape on an unqualified-teacher instance.
- New `<ViolationsPanel>` (`@/components/timetable/violations-panel`) with hard/soft tabs, per-kind grouping, click-to-highlight rows that pivot the timetable view (teacher/room/class) and decorate matching cells in `<TimetableGrid>` via new `highlightedCells`/`highlightTone` props.
- "How to fix" popover deep-links into the relevant settings tab (`?tab=teachers&focus=<id>` etc.); teachers/rooms/subjects tabs scroll the focused row into view and flash it for 1.5s.
- All 15 violation kind titles + fix hints localised in DE and EN.

### Manual Timetable Editing (2c)
- Spec: `superpowers/specs/2026-04-07-manual-timetable-editing-design.md`
- Plan: `superpowers/plans/2026-04-07-manual-timetable-editing.md`
- PR: #62 (merged)
- New `evaluate_term_violations(db, school_id, term_id)` helper in `services::scheduler` rebuilds a `PlanningSolution` from the persisted DB lessons (vs. the curriculum-derived skeleton) and runs the existing `diagnose()` pass — single source of truth for both solver and manual edits.
- Two new admin endpoints in `controllers::lessons`: `PATCH /api/schools/{id}/terms/{tid}/lessons/{lid}` (timeslot/room/teacher, room nullable via double-Option deserializer) and `POST .../lessons/swap`. Both return `{ lesson(s), violations }`.
- Swap is a **three-step transactional update** (park A's room → move B → move A) to dodge the partial unique index `uq_lessons_room_timeslot` which is non-deferrable.
- `GET .../lessons?include_violations=true` returns a wrapped `{ lessons, violations }` object so the page fetches both in one round trip; default behavior unchanged.
- Frontend: `<TimetableGrid>` gains an `editable` mode wired with `@dnd-kit/core` (PointerSensor 4px activation distance to avoid kebab-vs-drag confusion). Drag = move timeslot; drop on occupied = swap; kebab opens `<LessonEditDialog>` for room/teacher reassignment.
- New `<LessonEditDialog>` (diff-only submit) and `<UndoToolbar>`. In-memory undo stack capped at 10, cleared on term change. Undo issues inverse PATCH; swap pushes both snapshots so two undos fully revert.
- `/timetable` page is now editable for admins (role from existing `GET /api/schools/{id}` pattern), with `<ViolationsPanel>` mounted and fed fresh violations after every edit. Edits that introduce hard violations are allowed — surfaced, not refused.

### Responsive / Mobile Layout (2f)
- Spec: `superpowers/specs/2026-04-08-responsive-mobile-design.md`
- Plan: `superpowers/plans/2026-04-08-responsive-mobile.md`
- New `<MobileHeader>` mounted inside `<SidebarInset>` (md:hidden) with `<SidebarTrigger>` + route-derived title — closes the "phone users have no nav" gap.
- Timetable single-day view on mobile: new `visibleDays?: number[]` prop on `<TimetableGrid>`, day-tab strip persisted to `localStorage` (`mobileDay` field added to view-mode storage), `editable=false` on mobile (drag-and-drop disabled). Violation pivot now also switches the active day.
- Mobile card-list rendering for every reference-data tab (rooms, teachers, subjects, classes, terms, timeslots), members, and curriculum. Pattern: existing `<Table>` wrapped `hidden md:block`, sibling `space-y-2 md:hidden` cards with `flex-1` outline action buttons.
- Settings tab strip becomes horizontally scrollable with negative-margin bleed; outer page padding `p-4 md:p-6`.
- Viewport-aware widths on every dialog (`max-h-[90vh] max-w-[95vw] overflow-y-auto`) plus `break-words` on violation resource badges.
- No new translation keys; reuses `common.edit`, `common.remove`, and existing per-tab namespaces.
- Tests: new `visibleDays` and `MobileHeader` tests; existing tests updated to `getAllByText(...)[0]` where the dual desktop/mobile rendering caused matches; new `matchMedia` jsdom shim in test setup. 73 frontend Vitest tests pass.

### Data Import/Export (2e)
- Spec: `superpowers/specs/2026-04-08-data-import-export-design.md`
- Plan: `superpowers/plans/2026-04-08-data-import-export.md`
- CSV round-trip (export → edit → preview → commit) for all six reference-data entities (teachers, subjects, rooms, classes, timeslots, curriculum). Natural-key upsert; rows missing from the CSV are left alone.
- Backend `services::import_export` module: per-entity parse/diff/commit/export, shared `csv_io` helpers, and a `PreviewTokenCache` (DashMap, 10-min TTL, 100 entries/school) keyed on a UUID returned by preview.
- Three controller endpoints under `/api/schools/{id}`: `GET /export/{entity}` (route does not include `.csv`; the `Content-Disposition` filename does), `POST /import/{entity}/preview` (multipart), `POST /import/{entity}/commit` (json `{token}`). All admin-gated. Curriculum requires `?term_id`. Cross-tenant or cross-entity tokens → 410.
- Commit re-validates the cached rows against current DB state and applies them in a single SeaORM transaction. Any DB error rolls back the whole import. Preview rows with `invalid` actions block commit.
- Frontend: new "Import / Export" admin settings tab with one card per entity (Export + Import buttons; term selector for curriculum). Reusable `<ImportPreviewDialog>` shows summary chips, file warnings, and per-row diff/errors with a Confirm gate.
- Print-to-PDF for the timetable view via a Print button + `@media print` rules in `globals.css` (A4 landscape, hides app shell, scopes to `.printable-timetable`).
- 14 backend integration tests cover the round-trip per entity, dry-run/commit happy path, expired/cross-tenant/cross-entity tokens, missing required column, non-admin 403, and rollback atomicity. 70 frontend Vitest tests pass.

## Next Up

Tier 2 (UX polish) is complete. Next priorities:

- **4e: Teacher/student dashboard** — non-admin views (`/timetable` for teachers showing only their schedule)
- **3b: E2E tests** — Playwright coverage for critical flows
- **3a: Production deployment** — staging works, prod is just a release away

## Notes from Reviews

- Settings page has duplicate school fetch (layout + page) — acceptable for now, could use shared context later
