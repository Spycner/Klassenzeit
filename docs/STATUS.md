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

## Next Up

Tier 2 (UX polish) continues — make the app usable for real schools before pushing to prod.

- **2b: Timetable views** — per-teacher and per-room views (currently only per-class grid)
- **2c: Manual timetable editing** — drag-and-drop lesson editing after generation
- **2d: Conflict resolution UI** — show which constraints are broken, suggest fixes
- **2e: Data import/export** — CSV/Excel import for bulk data, PDF/Excel export for timetables
- **2f: Responsive / mobile layout** — timetable grid on small screens
- **3a: Production deployment** — staging works, prod is just a release away (do last; ship polished UX first)

## Notes from Reviews

- Settings page has duplicate school fetch (layout + page) — acceptable for now, could use shared context later
