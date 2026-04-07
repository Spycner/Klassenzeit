# Klassenzeit v2 — Backlog

Status: `done` | `in-progress` | `ready` | `blocked` | `idea`

## Done

### Step 1: Keycloak Realm Setup ✓
Create `klassenzeit` realm, clients, roles, mappers, seed users.
- Spec: `specs/2026-04-03-keycloak-realm-setup.md`
- Plan: `plans/2026-04-03-keycloak-realm-setup.md`

### Step 2: Core DB Schema ✓
Replace Loco auth scaffolding with `schools`, `app_users`, `school_memberships`.
- Spec: `specs/2026-04-03-core-db-schema-design.md`
- Plan: `plans/2026-04-03-core-db-schema.md`

### Step 3: Auth Middleware in Loco ✓
Wire up JWT validation and multi-tenancy scoping in the backend.
- Spec: `specs/2026-04-03-auth-middleware-design.md`
- Plan: `plans/2026-04-03-auth-middleware.md`

### Step 4: Frontend Auth Integration ✓
Connect Next.js to Keycloak for login/logout and token forwarding.
- Spec: `specs/2026-04-03-frontend-auth-design.md`
- Plan: `plans/2026-04-03-frontend-auth.md`

### Step 5: First CRUD Endpoints ✓
Prove the full stack works end-to-end with a real feature.
- Spec: `specs/2026-04-03-first-crud-endpoints-design.md`
- Plan: `plans/2026-04-03-first-crud-endpoints.md`

### Step 5b: i18n (DE/EN) ✓
PR #21 merged.

### Domain Tables Migration ✓
PR #23 merged. All 10 domain tables ported to SeaORM with ERD documentation.
- Spec: `specs/2026-04-03-domain-tables-design.md`
- Plan: `plans/2026-04-03-domain-tables.md`

### Step 6: Scheduler Integration ✓
PR #25 merged. Greedy solver, curriculum CRUD, background worker, solve/preview/apply API, and frontend generation UI.
- Spec: `specs/2026-04-03-scheduler-integration-design.md`
- Plan: `plans/2026-04-03-scheduler-integration.md`

### Reference Data Management ✓
- Reference data list endpoints — PR #28
- Reference data CRUD — PR #29
- Reference data management UI — PR #31
- Dev seed data — PR #33

### Quality & Testing ✓
- Test DB setup script — `just test-db-setup`
- Backend integration tests for scheduler API — PR #34
- Frontend component tests — PR #35

### Deployment ✓
- Docker compose, GHA workflows, Caddy, runner, env files, Keycloak clients
- Staging live: https://klassenzeit-staging.pascalkraus.com
- Dockerfile fix — PR #37

### Cleanup ✓
- Loco auth config removed, empty worker/task modules removed

---

## Backlog — ranked by importance & dependencies

### Tier 1: Solver (core value proposition)

The greedy solver works but doesn't backtrack — it can fail to place lessons even when a valid arrangement exists, and produces no quality optimization.

**Research spike completed** (2026-04-04): report at `~/Zettelkasten/reports/klassenzeit-solver-2026-04-04/report.md`

**Decision: LAHC (Late Acceptance Hill-Climbing) via SolverForge (Rust crate, v0.7.0)**
- LAHC matched or beat SA on 34/35 benchmarks with only 1 parameter (vs SA's 3)
- SolverForge provides ConstraintStream API with incremental scoring, same architecture as Timefold
- Incremental scoring matters more than algorithm choice (orders of magnitude throughput difference)
- Fallback: if SolverForge is too immature, domain model ports to hand-rolled solver
- Move types: Change + Swap first; Kempe chains only if needed for larger instances
- Scoring: HardSoftScore (lexicographic — any 0-hard solution beats any 1+-hard solution)

| # | Item | Status | Depends on | Effort |
|---|------|--------|------------|--------|
| 1a | ~~**Solver research spike**~~ | done | — | — |
| | Algorithm: LAHC. Framework: SolverForge. Scoring: lexicographic HardSoftScore. See report. | | | |
| 1b | ~~**Domain model + construction heuristic**~~ | done | — | M |
| | Hand-rolled constraint solver: 8 hard constraints with incremental scoring (counter matrices), First Fit Decreasing construction heuristic. Property-based testing for scoring correctness. | | | |
| 1c | ~~**Local search + soft constraints**~~ | done | 1b | M |
| | LAHC with Change + Swap moves. 4 soft constraints with incremental scoring. Criterion benchmarks. PR #44. | | | |
| 1d | ~~**Solver validation + benchmarking**~~ | done | 1c | M |
| | 3 Hessen Grundschule instances (4/8/16 classes), class availability constraint, Stundentafel expansion, benchmark binary + criterion. PR #47. | | | |
| 1d+ | ~~**Solver tuning**~~ | done | 1d | S-M |
| | Added Tabu overlay to LAHC. Sweep: tenure 0-100, list_length 100-1000. Finding: plateau is Change+Swap ceiling, not cycling. Tabu retained for harder instances. | | | |
| 1g | ~~**Room capacity / gym splitting**~~ | done | 1d | S |
| | Per-timeslot room capacity with overrides. Stress instance now feasible (Sporthalle cap 2). PR #50. | | | |
| 1e | ~~**Solver constraints UI — PR1 (weights + softening)**~~ | done | 1c | M |
| | `ConstraintWeights` in scheduler + `school_scheduler_settings` table + admin-only GET/PUT endpoints + Scheduler settings tab with soft weights and hard→soft toggles. Teacher/room preference editors tracked separately as 4a/4b. | | | |
| 1f | ~~**Kempe chain moves**~~ | done | 1d+ | M |
| | Resource-pair Kempe chains (BFS over teacher/class/room). 40/40/20 move split. Max chain size 20. Room capacity handling with abort. PR #53. | | | |

### Tier 2: UX polish (make the app usable for real users)

| # | Item | Status | Depends on | Effort |
|---|------|--------|------------|--------|
| 2a | ~~**Onboarding wizard**~~ | done | — | M |
| | PR #58. Auto-launching wizard (embeds existing settings tabs) + dashboard checklist + `POST /load-example` endpoint. Existence-based progress, 7 linear steps with per-step Skip. | | | |
| 2b | ~~**Timetable views**~~ | done | — | M |
| | PR #TBD. New `GET /lessons` endpoint, shared `<TimetableGrid>` + `<ViewModeSelector>` with class/teacher/room toggle and `localStorage` persistence, new read-only `/timetable` route, sidebar entry. Printable layout deferred to 2e. | | | |
| 2c | ~~**Manual timetable editing**~~ | done | — | L |
| | PR #62. Drag-and-drop on `/timetable` for admins via `@dnd-kit/core`. New admin `PATCH /lessons/{id}` and `POST /lessons/swap` endpoints reuse `diagnose()` (via new `evaluate_term_violations` helper) so violations refresh after every edit. Swap is a 3-step transactional update to dodge the non-deferrable partial unique index. Edit dialog for room/teacher reassignment, in-memory undo stack (10-deep, cleared on term change), `?include_violations=true` on the list endpoint for one-shot fetch. Edits that introduce hard violations are allowed — surfaced via `<ViolationsPanel>`, not refused. | | | |
| 2d | ~~**Conflict resolution UI**~~ | done | — | M |
| | PR #TBD. New `diagnose()` pass in scheduler emits structured `Violation { kind, severity, lesson_refs, resources }` for all 11 hard + 4 soft kinds. New `<ViolationsPanel>` groups by severity/kind, click-to-highlight pivots view mode and rings matching cells. "How to fix" popovers deep-link into settings (`?tab=...&focus=<id>`); teachers/rooms/subjects tabs scroll the focused row into view. DE/EN i18n. | | | |
| 2e | **Data import/export** | idea | — | M |
| | CSV/Excel import for bulk data entry (classes, teachers, subjects). PDF/Excel export for timetables. Critical for schools migrating from spreadsheets. | | | |
| 2f | **Responsive / mobile layout** | idea | — | S |
| | Timetable grid doesn't work well on small screens. Sidebar navigation needs mobile polish. | | | |

### Tier 3: Production readiness

| # | Item | Status | Depends on | Effort |
|---|------|--------|------------|--------|
| 3a | **Production deployment** | ready | — | S |
| | Staging is live. Production needs: create release → GHA deploys. Verify prod env files, Keycloak client config, DNS. | | | |
| 3b | **E2E tests** | idea | — | M |
| | Playwright tests for critical flows: login → create school → configure → generate timetable → apply. Directory exists but empty. | | | |
| 3c | **Error handling & loading states** | idea | — | S |
| | Consistent error toasts, retry logic, loading skeletons across all pages. Some pages handle errors better than others. | | | |
| 3d | **Docs site deployment** | ready | — | XS |
| | GitHub Pages for mdBook docs. Add URL to CLAUDE.md and repo description. | | | |
| 3e | **Monitoring & logging** | idea | — | S |
| | Structured logging, health check endpoint, basic metrics. Know when things break in prod. | | | |

### Tier 4: Features for real-world use

| # | Item | Status | Depends on | Effort |
|---|------|--------|------------|--------|
| 4a | ~~**Teacher availability UI**~~ | done | — | M |
| | Weekly grid dialog with single-click cycling (available → preferred → blocked). Admin-gated `GET`/`PUT /api/schools/{id}/teachers/{tid}/availabilities`. Feeds solver `teacher_availabilities` table. Per-term overrides deferred. | | | |
| 4b | ~~**Room suitability UI**~~ | done | — | S |
| | Subject checkbox dialog launched from rooms tab. Admin-gated `GET`/`PUT /api/schools/{id}/rooms/{rid}/suitabilities` with cross-tenant validation. Feeds solver `room_subject_suitabilities` table. | | | |
| 4c | **School year / term management** | idea | — | S |
| | Copy curriculum and settings from previous term. Archive old terms. Currently each term starts from scratch. | | | |
| 4d | **Notifications** | idea | — | M |
| | Email when added to a school, when timetable is generated, when schedule changes. | | | |
| 4e | **Teacher/student dashboard** | idea | — | M |
| | Non-admin view: "my timetable this week". Teachers see their schedule, students see their class schedule. | | | |
| 4f | **Audit log** | idea | — | S |
| | Track who changed what and when. Important for schools with multiple admins. | | | |

### Tier 5: Advanced / nice-to-have

| # | Item | Status | Depends on | Effort |
|---|------|--------|------------|--------|
| 5a | **A/B week patterns** | idea | 1c | M |
| | Biweekly alternating schedules (v1 supported this). Requires solver and UI changes. | | | |
| 5b | **Multi-solution comparison** | idea | 1c | M |
| | Generate multiple timetable candidates, compare scores, pick the best. | | | |
| 5c | **Substitution planning** | idea | 4e | L |
| | When a teacher is absent: suggest replacements, notify affected classes. | | | |
| 5d | **Calendar integration** | idea | 4e | M |
| | Export timetables to iCal/Google Calendar. Sync changes. | | | |
| 5e | **API for external tools** | idea | — | S |
| | Public API docs, API keys, webhook support for integration with other school systems. | | | |

---

## Recommended next priorities

Tier 2 (UX polish) comes first — real schools need a usable app before we ship to prod. **3a: Production deployment** is intentionally moved to the bottom of this list: staging is live and the release-to-prod step is small, but there's no point deploying an app that isn't ready for real users.

**Immediate (UX polish):**
1. **2e: Data import/export** — CSV/Excel import for bulk data, PDF/Excel export for timetables
2. **2f: Responsive / mobile layout** — timetable grid on small screens

**After Tier 2 is done:**
7. **4e: Teacher/student dashboard** — makes the app useful beyond admins
8. **3b: E2E tests** — confidence for ongoing development
9. **3a: Production deployment** — ship once the UX above is in place

---

## Notes

- **Each step gets its own brainstorm → spec → plan → implementation cycle.**
- **TDD throughout** — write failing tests before implementation.
- **Keep docs updated** — update mdBook when architecture changes.
- V1 reference: `archive/v1` branch has Timefold solver with 6 hard + 4 soft constraints.
- V1 soft constraints to port: teacher gap minimization, subject distribution, teacher preferred slots, class teacher first period.
- Solver research report: `~/Zettelkasten/reports/klassenzeit-solver-2026-04-04/report.md`

## Effort key

- **XS** — < 1 hour
- **S** — half day
- **M** — 1-2 days
- **L** — 3-5 days
