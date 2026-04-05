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
| | 3 Hessen Grundschule instances (4/8/16 classes), class availability constraint, Stundentafel expansion, benchmark binary + criterion. PR #TBD. | | | |
| 1d+ | **Solver tuning** | ready | 1d | S-M |
| | Based on benchmark results: soft scores plateau (zero variance across seeds) → add Tabu (tenure ~7-10). Stress instance infeasible (Sporthalle bottleneck) → ruin-and-recreate or constraint relaxation. Parameter sweep for LAHC list_length. | | | |
| 1e | **Solver constraints UI** | idea | 1c | M |
| | Frontend for configuring constraint weights, teacher preferences, room preferences. Currently no way to set soft constraints from the UI. | | | |
| 1f | **Kempe chain moves** | idea | 1d | M |
| | Only if Change+Swap plateau on larger instances (25+ classes). Kempe chains swap connected components in conflict graph — reaches solution regions simple moves can't access. | | | |

### Tier 2: UX polish (make the app usable for real users)

| # | Item | Status | Depends on | Effort |
|---|------|--------|------------|--------|
| 2a | **Onboarding wizard** | idea | — | M |
| | Step-by-step setup flow for new schools: create term → add classes → add subjects → add teachers → add rooms → configure timeslots → set curriculum. Currently users land in empty settings with no guidance. | | | |
| 2b | **Timetable views** | idea | — | M |
| | Individual views: per-teacher, per-room (currently only per-class grid). Day/week toggle. Printable layout. | | | |
| 2c | **Manual timetable editing** | idea | — | L |
| | Drag-and-drop lesson editing after generation. Move lessons between slots, swap teachers/rooms. Validate constraints on each move. | | | |
| 2d | **Conflict resolution UI** | idea | — | M |
| | Better violation display: show which constraints are broken, suggest fixes, highlight conflicting resources. Currently just a text list. | | | |
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
| 4a | **Teacher availability UI** | idea | — | M |
| | Visual grid for teachers to mark available/blocked/preferred timeslots. Currently only settable via API/seed data. Feeds into solver constraints. | | | |
| 4b | **Room suitability UI** | idea | — | S |
| | Configure which subjects can use which rooms from the frontend. Currently only via seed data. | | | |
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

**Immediate:**
1. **1d+: Solver tuning** — soft scores plateau, stress instance infeasible → Tabu + ruin-and-recreate
2. **3a: Production deployment** — staging works, prod is just a release away
3. **4a + 4b: Teacher availability + room suitability UI** — solver needs good input data from users

**Short-term (make the app usable for real schools):**
4. **2a: Onboarding wizard** — biggest UX gap for new users
5. **2b: Timetable views** — per-teacher and per-room views are expected by schools

**Medium-term:**
8. **2e: Data import/export** — schools won't re-type hundreds of entries
9. **4e: Teacher/student dashboard** — makes the app useful beyond admins
10. **3b: E2E tests** — confidence for ongoing development

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
