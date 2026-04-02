# Klassenzeit v2 — Next Steps

Post-scaffold roadmap. Each step builds on the previous. Steps 1-4 are the foundation — once done, you have a fully authenticated, multi-tenant app to build features on.

## Step 1: Set Up Keycloak Realm

Create the `klassenzeit` realm and configure clients for all environments.

- Create realm `klassenzeit` in Keycloak admin (`https://klassenzeit-auth.pascalkraus.com`)
- Create clients: `klassenzeit-dev`, `klassenzeit-staging`, `klassenzeit-prod`
- Configure redirect URIs per client (localhost for dev, actual domains for staging/prod)
- Add custom user attributes: `school_id`
- Create client mappers to include `school_id` and `role` as JWT claims
- Set up initial roles: `admin`, `teacher`, `viewer`
- Export realm config to `docker/keycloak/realm-export.json` for reproducibility

## Step 2: Database Schema (SeaORM Migrations)

Port the v1 schema to SeaORM migrations. Start with core tables needed for auth and multi-tenancy.

**Core tables (needed for auth):**
- `schools` — tenant root
- `app_users` — links to Keycloak identity
- `school_memberships` — user-school-role mapping

**Domain tables (can wait for mother-in-law insights):**
- `school_years`, `terms`
- `teachers`, `subjects`, `rooms`, `school_classes`, `time_slots`
- `teacher_subject_qualifications`, `teacher_availability`
- `room_subject_suitability`
- `lessons` (generated timetable)
- `constraints`

Reference: full v1 schema is on `archive/v1` branch in Flyway migrations.

**Approach:** Implement core tables first, domain tables after the domain research conversation. Use TDD — write migration tests that verify schema correctness.

## Step 3: Auth Middleware in Loco

Wire up JWT validation and multi-tenancy scoping in the Loco backend.

- Add Keycloak JWKS endpoint validation (fetch public keys, verify JWT signatures)
- Create auth middleware that extracts `school_id` and `role` from JWT claims
- Implement `SchoolScoped` extractor that automatically filters queries by `school_id`
- Add PostgreSQL Row-Level Security (RLS) policies as a safety net
- Write integration tests with mock JWTs
- Remove or adapt Loco's built-in auth scaffolding (it generates its own JWT/password auth — we use Keycloak instead)

## Step 4: Frontend Auth Integration

Connect Next.js to Keycloak for login/logout and token forwarding.

- Install and configure `next-auth` with Keycloak provider
- Set up protected routes (redirect to login if unauthenticated)
- Create auth context/hooks for accessing user info and school context
- Forward JWT as `Authorization: Bearer` header on API calls
- Build minimal login/logout flow
- Test the full round-trip: login → get token → call backend → scoped response

## Step 5: First CRUD Endpoints

Prove the full stack works end-to-end with a real feature.

- Schools CRUD (create, read, update) — admin only
- School membership management (invite, remove, change role)
- Basic health/status endpoint showing authenticated user info
- Frontend pages: school dashboard, member list
- E2E tests covering the full flow

## Step 6: Scheduler Integration

Wire the scheduler crate into the backend via background jobs.

- Create API endpoint to trigger schedule generation
- Implement Loco background worker that calls `scheduler::solve()`
- Build the DB-to-scheduler type mapping layer
- Store results back in the `lessons` table
- Frontend: trigger generation, poll for completion, display timetable
- This is where the algorithm work begins — start with a naive solver and iterate

---

## Notes

- **Domain research:** Steps 2 (domain tables) and 6 depend on insights from the mother-in-law conversation. Core tables and auth can proceed independently.
- **Each step should get its own brainstorm → spec → plan → implementation cycle** using the superpowers skills.
- **TDD throughout** — write failing tests before implementation.
- **Keep docs updated** — update mdBook when architecture changes.
