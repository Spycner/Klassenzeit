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

## Tech Debt

- [ ] **Test DB setup is manual** — need a script or justfile recipe to create the `loco` user and `klassenzeit-backend_test` database automatically
- [ ] **No dev seed data** for new core tables — need `schools`, `app_users`, `school_memberships` seed data for local development
- [ ] **Loco auth config in yaml** — `auth.jwt.secret` still in config files, unused since we removed Loco auth. Clean up when adding Keycloak middleware (Step 3)
- [ ] **Empty worker/task modules** — `backend/src/workers/downloader.rs` and `backend/src/tasks/mod.rs` are Loco scaffold leftovers. Remove when they cause confusion.
- [ ] **Docker compose files for staging/prod** — referenced in justfile but don't exist yet. Create when deployment is set up.
- [ ] **Deployment pipeline setup** — deploy-staging.yml and deploy-prod.yml exist but need: (1) docker-compose.staging.yml and docker-compose.prod.yml files, (2) `workflow_dispatch` triggers for on-demand deploys, (3) reuse the existing self-hosted runner at `/home/pascal/actions-runner` (currently registered for `Spycner/website` only — re-register at org level or add second registration for Klassenzeit)
- [ ] **Docs site URL** — once GitHub Pages deploy works, add link to CLAUDE.md and repo description
- [x] **Reference data list endpoints** — Created 6 controllers for GET `/api/schools/{id}/terms`, `/classes`, `/subjects`, `/teachers`, `/rooms`, `/timeslots`
- [ ] **Backend integration tests for scheduler API** — Test the full solve/status/solution/apply flow against a real database
- [ ] **Frontend component tests** — No tests for curriculum or schedule pages yet
- [ ] **Solver improvement** — Replace greedy solver with constraint solver (simulated annealing or local search) for better optimization

---

## Notes

- **Domain research:** Domain tables and Step 6 depend on insights from the mother-in-law conversation. Auth stack (Steps 3-5) can proceed independently.
- **Each step gets its own brainstorm → spec → plan → implementation cycle.**
- **TDD throughout** — write failing tests before implementation.
- **Keep docs updated** — update mdBook when architecture changes.
