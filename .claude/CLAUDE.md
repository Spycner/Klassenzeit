# Klassenzeit

## Overview

School timetabling application — Loco (Rust/Axum) backend, Next.js frontend, PostgreSQL, Keycloak auth.

## History

- The `archive/v1` branch contains the previous version (Spring Boot + React + Keycloak + Timefold Solver). Reference it for domain knowledge and past decisions.

## Project Structure

- `backend/` — Loco app (Rust/Axum, SeaORM)
- `scheduler/` — Standalone Rust library crate for timetable optimization
- `frontend/` — Next.js with Biome, Tailwind
- `docs/` — mdBook documentation
- `docker/` — Keycloak config, DB init scripts, seeds
- `e2e/` — End-to-end tests

## Planning

- Roadmap & next steps: `docs/superpowers/next-steps.md`
- Specs: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- Current status: Step 1 (Keycloak realm setup) is complete. Next up: Step 2 (DB schema migrations).

## Architecture

- Rust workspace: `backend` depends on `scheduler` via path
- Multi-tenant: row-level isolation with `school_id` on every tenant table
- Auth: Keycloak JWT with `school_id` and `role` claims
- Scheduler receives plain data structs, returns timetable — no DB or web dependencies

## Development

- `just dev` — start dev environment
- `just test` — run all tests
- `just check` — run all linters and formatters
- `just docs-build` — build documentation

## Conventions

- TDD: write failing test first, then implement
- Keep docs up to date when changing architecture or adding features
- Backend config in `backend/config/{development,staging,production}.yaml`
- Frontend env vars prefixed with `NEXT_PUBLIC_`
- All DB tables with tenant data must have `school_id` column
- Scheduler crate must remain free of web/DB dependencies

## Testing

- Backend: `cargo test --workspace`
- Frontend: `bun test` in `frontend/`
- E2E: TBD (in `e2e/`)

## Deployment

- Staging: push to `main` triggers GHA deploy
- Production: create GitHub release triggers GHA deploy
- Shared PostgreSQL and Keycloak in `server-infra`
