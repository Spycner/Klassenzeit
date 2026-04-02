# Klassenzeit v2 — Design Spec

## Overview

Klassenzeit is a school timetabling application. v2 is a ground-up rewrite with a new tech stack, designed for multi-tenant school isolation from day one, autonomous Claude-driven development with TDD, and self-hosted deployment on a Hetzner VPS.

The v1 codebase is preserved on the `archive/v1` branch for domain reference (Spring Boot + React + Keycloak + Timefold Solver).

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Loco (Rust, built on Axum) with SeaORM |
| Scheduler | Standalone Rust library crate (constraint solver) |
| Frontend | Next.js (React) |
| Database | PostgreSQL (shared instance, per-env databases) |
| Auth | Keycloak (shared instance, one realm, per-env clients) |
| Docs | mdBook (builds as static site) |
| Task runner | just |
| CI/CD | GitHub Actions with self-hosted runner |
| Reverse proxy | Caddy (existing in server-infra) |
| Pre-commit | prek |

## Project Structure

```
Klassenzeit/
├── .claude/
│   ├── CLAUDE.md              # Project instructions, conventions, architecture
│   ├── settings.json          # Hooks, permissions for autonomous workflow
│   └── commands/              # Custom slash commands
├── backend/                   # Loco app (Rust)
│   ├── src/
│   ├── tests/
│   ├── migration/             # SeaORM migrations
│   └── Cargo.toml
├── scheduler/                 # Standalone Rust library crate
│   ├── src/
│   ├── tests/
│   └── Cargo.toml
├── Cargo.toml                 # Workspace root (members: backend, scheduler)
├── frontend/                  # Next.js app
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── docs/                      # mdBook source
│   ├── book.toml
│   └── src/
├── docker/
│   ├── keycloak/
│   │   └── realm-export.json  # Keycloak realm config
│   ├── postgres/
│   │   └── init.sql           # Creates per-env databases
│   └── seeds/
│       └── dev-seed.sql       # Sample data for dev
├── e2e/                       # End-to-end / API integration tests
├── .github/workflows/         # CI, deploy-staging, deploy-prod
├── docker-compose.yml         # Dev environment
├── docker-compose.staging.yml
├── docker-compose.prod.yml
├── justfile                   # Common commands
├── .env.example               # Documents all required vars (committed)
├── .env.dev                   # Dev defaults (committed, safe values)
├── .env.staging               # On server only (NOT committed)
├── .env.prod                  # On server only (NOT committed)
└── .gitignore
```

## Infrastructure & Deployment

### Shared Services (in server-infra)

PostgreSQL and Keycloak run as shared containers in `server-infra/docker-compose.yml`, on the `web` Docker network. All Klassenzeit environments connect to them by container name.

PostgreSQL hosts three databases: `klassenzeit_dev`, `klassenzeit_staging`, `klassenzeit_prod`. Created via `docker/postgres/init.sql` mounted to `/docker-entrypoint-initdb.d/`.

Keycloak has one realm (`klassenzeit`) with separate clients per environment (`klassenzeit-dev`, `klassenzeit-staging`, `klassenzeit-prod`).

### Three Environments

| Environment | Trigger | Compose file | Database | URL |
|---|---|---|---|---|
| Dev | `just dev` on server | `docker-compose.yml` | `klassenzeit_dev` | localhost ports |
| Staging | Push to `main` (GHA) | `docker-compose.staging.yml` | `klassenzeit_staging` | `staging.klassenzeit.pascalkraus.com` |
| Prod | GitHub release (GHA) | `docker-compose.prod.yml` | `klassenzeit_prod` | `klassenzeit.pascalkraus.com` |

### GHA Workflows

- **CI** — runs on PRs: `cargo test`, `bun test`, `bun run lint`, `mdbook build`
- **Deploy staging** — triggered on push to `main`, self-hosted runner, builds and deploys staging containers
- **Deploy prod** — triggered on GitHub release, same pattern as the website project

### Caddy Routes (added to server-infra/Caddyfile)

- `klassenzeit.pascalkraus.com` → `klassenzeit-prod-frontend:3000`
- `staging.klassenzeit.pascalkraus.com` → `klassenzeit-staging-frontend:3000`
- API proxied via path prefix (`/api` → Loco backend container)

Each compose file runs a frontend and backend container on the `web` network.

## Multi-tenancy & School Isolation

Row-level isolation with `school_id` on every tenant-scoped table.

- Keycloak includes `school_id` as a custom JWT claim
- Loco middleware extracts `school_id` from the token and scopes all queries
- PostgreSQL Row-Level Security (RLS) policies as an additional safety net
- The scheduler crate is unaware of multi-tenancy — it receives one school's data as input

## Authentication

### Keycloak Configuration

- Realm: `klassenzeit`
- Clients: `klassenzeit-dev`, `klassenzeit-staging`, `klassenzeit-prod`
- Custom JWT claims: `school_id`, `role`
- User-school mapping via groups or custom attributes

### Auth Flow

1. Frontend redirects to Keycloak login (via `next-auth` with Keycloak provider)
2. Keycloak returns JWT with `school_id` and `role` claims
3. Frontend sends `Authorization: Bearer` header with each request
4. Loco middleware validates JWT against Keycloak JWKS endpoint, extracts claims
5. All DB queries scoped to the extracted `school_id`

### Roles (initial)

- **Admin** — manages school settings, teachers, rooms, subjects
- **Teacher** — views timetable, sets availability/preferences
- **Viewer** — read-only access (students, parents)

Roles will be refined after domain research with school stakeholders.

## Scheduler Crate

A pure Rust library with no web framework or database dependencies.

### Interface

```rust
pub struct ScheduleInput {
    pub teachers: Vec<Teacher>,
    pub classes: Vec<Class>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub constraints: Vec<Constraint>,
}

pub struct ScheduleOutput {
    pub timetable: Vec<Lesson>,  // teacher + class + room + timeslot
    pub score: Score,
    pub violations: Vec<Violation>,
}

pub fn solve(input: ScheduleInput) -> ScheduleOutput { ... }
```

### Data Flow

```
DB models (SeaORM) → backend converts → scheduler types → solve() → output → backend converts → DB models
```

The scheduler defines its own types optimized for the algorithm. The backend handles mapping between DB models and scheduler types.

### Integration

The Loco app calls `scheduler::solve()` via a background job (Loco's built-in worker queue). Schedule generation is triggered by the user, runs async, result stored in DB.

### Algorithm

Constraint satisfaction / optimization. Hard constraints (no double-booking, room capacity) and soft constraints (preferences, minimize gaps). Exact algorithm (simulated annealing, genetic, local search) to be determined during implementation.

### Testing

Ideal for TDD — pure functions, no IO. Build up constraints incrementally with tests. Deterministic with a fixed random seed.

## Database

Initial schema based on v1 (`archive/v1` branch), adapted for the new stack. SeaORM migrations in `backend/migration/`. Schema will be refined after domain research.

Key tables (tenant-scoped, all have `school_id`):
- `schools`
- `teachers`
- `classes`
- `rooms`
- `subjects`
- `timeslots`
- `lessons` (the generated timetable entries)
- `constraints`

## Development Workflow

- **TDD** with superpowers skill — tests before implementation
- **prek** for pre-commit hooks (lint, format, type checks)
- **Autonomous Claude** — CLAUDE.md and settings.json configured for loop-mode development with minimal human feedback
- **Async communication** — user provides requirements/updates, Claude implements independently
- **mdBook docs** — kept up to date as part of the development process, built as static site in CI
