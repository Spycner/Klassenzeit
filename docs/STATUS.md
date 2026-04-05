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

## Next Up

Solver improvement options:
- **1f: Kempe chain moves** — to escape basins Change+Swap can't reach
- **3a: Production deployment** — staging works, prod is just a release away

## Notes from Reviews

- Settings page has duplicate school fetch (layout + page) — acceptable for now, could use shared context later
