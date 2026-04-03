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

## Next Up

All major milestones complete. Remaining work is tech debt and optimization.

## Notes from Reviews

- Frontend tests not yet added for the new pages/hooks — add before next frontend PR
- Backend integration tests for scheduler API endpoints not yet written
- Greedy solver is intentionally simple (no backtracking) — can be replaced with constraint solver later
- ~~Reference data list endpoints~~ — created (terms, classes, subjects, teachers, rooms, timeslots)
