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
- Current status: see `docs/STATUS.md` (update this file after each PR merge)

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

## Workflow

- When brainstorming/designing, go with your recommended approach — don't wait for approval on each question
- Automatically flow through the full pipeline: spec → plan → implementation → PR
- Only pause for user input on genuinely ambiguous decisions with no clear best option
- After creating a PR, fix all CI failures and review issues until the PR is mergeable, then merge it
- After merging a PR, review and update CLAUDE.md (e.g. current status), `docs/superpowers/next-steps.md`, and any other docs that may be stale after the changes
- When done, ping the user on GitHub (PR comment or mention) to notify completion

## Conventions

- TDD: write failing test first, then implement
- Keep docs up to date when changing architecture or adding features
- Backend config in `backend/config/{development,staging,production}.yaml`
- Frontend env vars prefixed with `NEXT_PUBLIC_`
- All DB tables with tenant data must have `school_id` column
- Scheduler crate must remain free of web/DB dependencies

## Testing

- Backend unit tests: `cargo test --workspace`
- Backend integration tests: `cargo test -p klassenzeit-backend --test mod` (requires running Postgres)
- Frontend: `bun run test` in `frontend/` (NOT `bun test` — that uses bun's built-in runner instead of vitest)
- E2E: TBD (in `e2e/`)
- Integration tests require: `docker compose up -d postgres-dev`, then `just test-db-setup` (creates `loco` user and `klassenzeit-backend_test` database if they don't exist). `just backend-test` runs this automatically.

## Deployment

- Staging: push to `main` triggers GHA deploy
- Production: create GitHub release triggers GHA deploy
- Shared PostgreSQL and Keycloak in `server-infra`
