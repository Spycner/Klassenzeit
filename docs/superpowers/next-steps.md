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

---

### Step 5: First CRUD Endpoints ✓
Prove the full stack works end-to-end with a real feature.
- Spec: `specs/2026-04-03-first-crud-endpoints-design.md`
- Plan: `plans/2026-04-03-first-crud-endpoints.md`

---

## Ready (no blockers)

### ~~Step 5b: i18n (DE/EN)~~ ✓
Completed — PR #21 merged.

### ~~Domain Tables Migration~~ ✓
Completed — PR #23 merged. All 10 domain tables ported to SeaORM with ERD documentation.
- Spec: `specs/2026-04-03-domain-tables-design.md`
- Plan: `plans/2026-04-03-domain-tables.md`

### Step 6: Scheduler Integration ✓
Completed — PR #25 merged. Greedy solver, curriculum CRUD, background worker, solve/preview/apply API, and frontend generation UI.
- Spec: `specs/2026-04-03-scheduler-integration-design.md`
- Plan: `plans/2026-04-03-scheduler-integration.md`

---

## Backlog — ordered by importance & dependencies

### Tier 1: Core functionality (app not usable without these)

- [x] **Reference data CRUD** — PR #29. Create/update/delete for all 6 entities. Soft delete for teachers/rooms/classes; hard delete for subjects/timeslots/terms.
- [x] **Reference data management UI** — PR #31. Admin-only Settings page with tabbed CRUD for all 6 entities. Includes school years list endpoint.
- [x] **Dev seed data** — PR #33. SQL seed file + Keycloak bootstrap script. `just dev-setup` for full automated setup.

### Tier 2: Quality & confidence

- [ ] **Test DB setup script** — Justfile recipe to auto-create the `loco` user and `klassenzeit-backend_test` database. Currently manual (see CLAUDE.md testing section). Prerequisite for running integration tests easily.
- [ ] **Backend integration tests for scheduler API** — Test the full solve/status/solution/apply flow against a real database.
- [ ] **Frontend component tests** — No tests for curriculum or schedule pages yet. Add before the next frontend PR.

### Tier 3: Deployment

- [ ] **Docker compose files for staging/prod** — `docker-compose.staging.yml` and `docker-compose.prod.yml` don't exist yet. Referenced in justfile and needed by deploy workflows.
- [ ] **Deployment pipeline setup** — `deploy-staging.yml` and `deploy-prod.yml` GHA workflows exist but need: (1) the compose files from above, (2) `workflow_dispatch` triggers, (3) runner registration (reuse `/home/pascal/actions-runner` or register a second one for Klassenzeit).
- [ ] **Docs site URL** — Once GitHub Pages deploy works, add link to CLAUDE.md and repo description.

### Tier 4: Cleanup

- [ ] **Loco auth config in yaml** — `auth.jwt.secret` still in config files, unused since Keycloak replaced Loco auth. Remove dead config.
- [ ] **Empty worker/task modules** — `backend/src/workers/downloader.rs` and `backend/src/tasks/mod.rs` are Loco scaffold leftovers. Delete.

### Tier 5: Optimization

- [ ] **Solver improvement** — Replace greedy solver with constraint solver (simulated annealing or local search) for better timetable quality. The greedy solver works but doesn't backtrack.

### Done

- [x] **Reference data list endpoints** — PR #28. Created 6 controllers for GET `/api/schools/{id}/terms`, `/classes`, `/subjects`, `/teachers`, `/rooms`, `/timeslots`.

---

## Notes

- **Each step gets its own brainstorm → spec → plan → implementation cycle.**
- **TDD throughout** — write failing tests before implementation.
- **Keep docs updated** — update mdBook when architecture changes.
