# Klassenzeit v2 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the full Klassenzeit v2 monorepo so that `just dev` starts a working dev environment with a Loco backend, Next.js frontend, Keycloak auth, and PostgreSQL — all wired together on the VPS.

**Architecture:** Rust workspace (backend + scheduler crate) with Next.js frontend, shared PostgreSQL and Keycloak in server-infra, three Docker Compose files for dev/staging/prod, GitHub Actions CI/CD with self-hosted runner.

**Tech Stack:** Loco (Rust/Axum), SeaORM, Next.js, PostgreSQL, Keycloak, Caddy, Docker Compose, mdBook, just, prek, Biome, GitHub Actions

**Reference:** Design spec at `docs/superpowers/specs/2026-04-02-klassenzeit-v2-design.md`. v1 schema on `archive/v1` branch.

---

## File Structure

```
Klassenzeit/
├── .claude/
│   ├── CLAUDE.md
│   ├── settings.json
│   └── commands/
├── backend/
│   ├── src/
│   │   ├── app.rs
│   │   ├── lib.rs
│   │   ├── controllers/
│   │   │   ├── mod.rs
│   │   │   └── health.rs
│   │   ├── models/
│   │   │   └── mod.rs
│   │   ├── workers/
│   │   │   └── mod.rs
│   │   └── middleware/
│   │       └── mod.rs
│   ├── tests/
│   │   └── requests/
│   │       └── health.rs
│   ├── migration/
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   └── m20260402_000001_create_schools.rs
│   │   └── Cargo.toml
│   ├── config/
│   │   ├── development.yaml
│   │   ├── staging.yaml
│   │   └── production.yaml
│   └── Cargo.toml
├── scheduler/
│   ├── src/
│   │   └── lib.rs
│   ├── tests/
│   │   └── basic.rs
│   └── Cargo.toml
├── Cargo.toml                     # Workspace root
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── lib/
│   ├── public/
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── biome.json
│   ├── package.json
│   └── Dockerfile
├── docs/
│   ├── book.toml
│   └── src/
│       ├── SUMMARY.md
│       └── introduction.md
├── docker/
│   ├── keycloak/
│   │   └── realm-export.json
│   ├── postgres/
│   │   └── init-databases.sql
│   └── seeds/
│       └── dev-seed.sql
├── e2e/
│   └── .gitkeep
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-staging.yml
│   └── deploy-prod.yml
├── docker-compose.yml
├── docker-compose.staging.yml
├── docker-compose.prod.yml
├── justfile
├── .pre-commit-config.yaml
├── .env.example
├── .env.dev
├── .gitignore
└── backend/Dockerfile
```

---

### Task 1: Install Required Tools

**Files:** None (system-level installs)

- [ ] **Step 1: Install loco-cli**

```bash
cargo install loco
```

Expected: binary at `~/.cargo/bin/loco`

- [ ] **Step 2: Install sea-orm-cli**

```bash
cargo install sea-orm-cli
```

Expected: binary at `~/.cargo/bin/sea-orm-cli`

- [ ] **Step 3: Install just**

```bash
cargo install just
```

Expected: binary at `~/.cargo/bin/just`

- [ ] **Step 4: Install mdbook**

```bash
cargo install mdbook
```

Expected: binary at `~/.cargo/bin/mdbook`

- [ ] **Step 5: Install prek**

```bash
cargo install prek
```

Expected: binary at `~/.cargo/bin/prek`

- [ ] **Step 6: Verify all tools**

Run:
```bash
loco --version && sea-orm-cli --version && just --version && mdbook --version && prek --version
```

Expected: version output for each tool, no errors.

- [ ] **Step 7: Commit**

No files to commit — tools are user-global. Move on.

---

### Task 2: Scaffold Loco Backend

**Files:**
- Create: `backend/` (entire Loco project structure)
- Create: `Cargo.toml` (workspace root)

- [ ] **Step 1: Generate Loco project**

```bash
cd /home/pascal/Code/Klassenzeit
loco new --name klassenzeit-backend --db postgres --bg async --assets no
```

This creates a `klassenzeit-backend/` directory. The flags:
- `--db postgres`: PostgreSQL with SeaORM
- `--bg async`: async in-process background workers
- `--assets no`: no asset pipeline (frontend is separate)

If `loco new` doesn't support these flags and requires interactive input, run it interactively and select:
- App name: `klassenzeit-backend`
- Template: SaaS App (or REST API if available)
- Database: PostgreSQL
- Background: Async
- Assets: None / Client-side

- [ ] **Step 2: Move scaffolded project to backend/**

```bash
mv klassenzeit-backend backend
```

- [ ] **Step 3: Create workspace Cargo.toml at root**

Create `/home/pascal/Code/Klassenzeit/Cargo.toml`:

```toml
[workspace]
resolver = "2"
members = [
    "backend",
    "scheduler",
]
```

- [ ] **Step 4: Update backend/Cargo.toml for workspace**

Edit `backend/Cargo.toml` to ensure the `[package]` section has:

```toml
[package]
name = "klassenzeit-backend"
version = "0.1.0"
edition = "2021"
```

Remove any `[workspace]` key from `backend/Cargo.toml` if Loco added one — the workspace is defined at root.

- [ ] **Step 5: Verify it compiles**

```bash
cd /home/pascal/Code/Klassenzeit
cargo build -p klassenzeit-backend
```

Expected: successful compilation.

- [ ] **Step 6: Run Loco's generated tests**

```bash
cargo test -p klassenzeit-backend
```

Expected: all generated tests pass.

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml Cargo.lock backend/
git commit -m "Scaffold Loco backend in Rust workspace"
```

---

### Task 3: Create Scheduler Crate

**Files:**
- Create: `scheduler/Cargo.toml`
- Create: `scheduler/src/lib.rs`
- Create: `scheduler/tests/basic.rs`

- [ ] **Step 1: Write the failing test**

Create `scheduler/tests/basic.rs`:

```rust
use klassenzeit_scheduler::solve;
use klassenzeit_scheduler::types::{ScheduleInput, ScheduleOutput};

#[test]
fn empty_input_returns_empty_timetable() {
    let input = ScheduleInput::default();
    let output = solve(input);
    assert!(output.timetable.is_empty());
    assert!(output.violations.is_empty());
}
```

- [ ] **Step 2: Create scheduler/Cargo.toml**

```toml
[package]
name = "klassenzeit-scheduler"
version = "0.1.0"
edition = "2021"

[dependencies]

[dev-dependencies]
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cargo test -p klassenzeit-scheduler
```

Expected: FAIL — `solve` and `types` module don't exist.

- [ ] **Step 4: Implement minimal types and solve function**

Create `scheduler/src/lib.rs`:

```rust
pub mod types;

use types::{ScheduleInput, ScheduleOutput};

pub fn solve(input: ScheduleInput) -> ScheduleOutput {
    let _ = input;
    ScheduleOutput::default()
}
```

Create `scheduler/src/types.rs`:

```rust
#[derive(Debug, Clone, Default)]
pub struct ScheduleInput {
    pub teachers: Vec<Teacher>,
    pub classes: Vec<Class>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub constraints: Vec<Constraint>,
}

#[derive(Debug, Clone, Default)]
pub struct ScheduleOutput {
    pub timetable: Vec<Lesson>,
    pub score: Score,
    pub violations: Vec<Violation>,
}

#[derive(Debug, Clone)]
pub struct Teacher {
    pub id: uuid::Uuid,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct Class {
    pub id: uuid::Uuid,
    pub name: String,
    pub grade_level: u8,
}

#[derive(Debug, Clone)]
pub struct Room {
    pub id: uuid::Uuid,
    pub name: String,
    pub capacity: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct Subject {
    pub id: uuid::Uuid,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct Constraint {
    pub kind: ConstraintKind,
    pub weight: ConstraintWeight,
}

#[derive(Debug, Clone)]
pub enum ConstraintKind {
    NoTeacherDoubleBooking,
    NoRoomDoubleBooking,
    NoClassDoubleBooking,
}

#[derive(Debug, Clone)]
pub enum ConstraintWeight {
    Hard,
    Soft(f64),
}

#[derive(Debug, Clone)]
pub struct Lesson {
    pub teacher_id: uuid::Uuid,
    pub class_id: uuid::Uuid,
    pub room_id: Option<uuid::Uuid>,
    pub subject_id: uuid::Uuid,
    pub timeslot: TimeSlot,
}

#[derive(Debug, Clone)]
pub struct TimeSlot {
    pub day: u8,
    pub period: u8,
}

#[derive(Debug, Clone, Default)]
pub struct Score {
    pub hard_violations: u32,
    pub soft_score: f64,
}

#[derive(Debug, Clone)]
pub struct Violation {
    pub constraint: ConstraintKind,
    pub description: String,
}
```

Add `uuid` dependency to `scheduler/Cargo.toml`:

```toml
[dependencies]
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cargo test -p klassenzeit-scheduler
```

Expected: PASS — empty input returns empty output.

- [ ] **Step 6: Add scheduler as backend dependency**

Edit `backend/Cargo.toml`, add under `[dependencies]`:

```toml
klassenzeit-scheduler = { path = "../scheduler" }
```

Verify the whole workspace compiles:

```bash
cargo build --workspace
```

Expected: successful compilation.

- [ ] **Step 7: Commit**

```bash
git add scheduler/ backend/Cargo.toml Cargo.lock
git commit -m "Add scheduler crate with placeholder types and solve function"
```

---

### Task 4: Scaffold Next.js Frontend

**Files:**
- Create: `frontend/` (entire Next.js project)

- [ ] **Step 1: Create Next.js project**

```bash
cd /home/pascal/Code/Klassenzeit
bunx create-next-app@latest frontend --ts --app --src-dir --tailwind --eslint=false --import-alias="@/*" --turbopack
```

- [ ] **Step 2: Replace ESLint with Biome**

Remove ESLint config if created, then set up Biome:

```bash
cd frontend
bun add -d @biomejs/biome
```

Create `frontend/biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/latest/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

Add scripts to `frontend/package.json`:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "check": "biome check src/",
    "check:fix": "biome check --write src/",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Clean up default page**

Replace `frontend/src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">Klassenzeit</h1>
    </main>
  );
}
```

- [ ] **Step 4: Verify it builds**

```bash
cd /home/pascal/Code/Klassenzeit/frontend
bun run build
```

Expected: successful Next.js build.

- [ ] **Step 5: Run lint and typecheck**

```bash
bun run check && bun run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/
git commit -m "Scaffold Next.js frontend with Biome and Tailwind"
```

---

### Task 5: Set Up mdBook Documentation

**Files:**
- Create: `docs/book.toml`
- Create: `docs/src/SUMMARY.md`
- Create: `docs/src/introduction.md`

- [ ] **Step 1: Initialize mdBook**

```bash
cd /home/pascal/Code/Klassenzeit
mdbook init docs --title "Klassenzeit" --ignore none
```

This creates `docs/book.toml`, `docs/src/SUMMARY.md`, and `docs/src/chapter_1.md`.

- [ ] **Step 2: Replace default content**

Replace `docs/src/SUMMARY.md`:

```markdown
# Summary

- [Introduction](./introduction.md)
- [Architecture](./architecture.md)
- [Development Setup](./development-setup.md)
```

Rename `docs/src/chapter_1.md` to `docs/src/introduction.md` and replace content:

```markdown
# Klassenzeit

Klassenzeit is a school timetabling application that helps schools create and manage class schedules using an automated scheduling optimization engine.

## Tech Stack

- **Backend:** Loco (Rust/Axum) with SeaORM
- **Scheduler:** Standalone Rust library crate
- **Frontend:** Next.js (React)
- **Database:** PostgreSQL
- **Auth:** Keycloak
- **Docs:** mdBook
```

Create `docs/src/architecture.md`:

```markdown
# Architecture

See [design spec](../superpowers/specs/2026-04-02-klassenzeit-v2-design.md) for the full architecture overview.
```

Create `docs/src/development-setup.md`:

```markdown
# Development Setup

## Prerequisites

- Rust (stable)
- Bun
- Docker & Docker Compose
- just (`cargo install just`)
- prek (`cargo install prek`)
- mdbook (`cargo install mdbook`)

## Quick Start

```bash
just dev
```

This starts PostgreSQL, Keycloak, the Loco backend, and the Next.js frontend.
```

- [ ] **Step 3: Verify docs build**

```bash
mdbook build docs/
```

Expected: HTML output in `docs/book/`.

- [ ] **Step 4: Add docs/book/ to .gitignore**

This is handled in Task 10 (gitignore). For now, just verify it builds.

- [ ] **Step 5: Commit**

```bash
git add docs/book.toml docs/src/
git commit -m "Set up mdBook documentation"
```

---

### Task 6: Add PostgreSQL and Keycloak to server-infra

**Files:**
- Modify: `/home/pascal/Code/server-infra/docker-compose.yml`
- Create: `/home/pascal/Code/Klassenzeit/docker/postgres/init-databases.sql`
- Create: `/home/pascal/Code/Klassenzeit/docker/keycloak/.gitkeep`
- Create: `/home/pascal/Code/Klassenzeit/docker/seeds/dev-seed.sql`

- [ ] **Step 1: Create database init script**

Create `docker/postgres/init-databases.sql` (for the shared server-infra PostgreSQL — staging and prod only):

```sql
-- Create databases for Keycloak and Klassenzeit staging/prod
-- Dev uses its own PostgreSQL container (see docker-compose.yml)
CREATE DATABASE keycloak;
CREATE DATABASE klassenzeit_staging;
CREATE DATABASE klassenzeit_prod;
```

- [ ] **Step 2: Create placeholder seed and keycloak files**

Create `docker/keycloak/.gitkeep` (empty file — realm export will be generated after Keycloak is configured).

Create `docker/seeds/dev-seed.sql`:

```sql
-- Dev seed data — populated after schema migrations are in place
```

- [ ] **Step 3: Add PostgreSQL service to server-infra**

Read `/home/pascal/Code/server-infra/docker-compose.yml` first, then add a `postgres` service:

```yaml
  postgres:
    image: postgres:17-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - web
```

Add `postgres_data` to the `volumes:` section.

Add to `/home/pascal/Code/server-infra/.env`:

```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generate a secure password>
```

- [ ] **Step 4: Add Keycloak service to server-infra**

Add to `/home/pascal/Code/server-infra/docker-compose.yml`:

```yaml
  keycloak:
    image: quay.io/keycloak/keycloak:26.0
    container_name: keycloak
    restart: unless-stopped
    command: start
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: ${POSTGRES_USER}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD}
      KC_HOSTNAME: auth.klassenzeit.pascalkraus.com
      KC_PROXY_HEADERS: xforwarded
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
    depends_on:
      - postgres
    networks:
      - web
```

Add to `/home/pascal/Code/server-infra/.env`:

```
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<generate a secure password>
```

- [ ] **Step 5: Mount init script into postgres container**

Update the postgres service volumes in server-infra to run the init script on first boot:

```yaml
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - /home/pascal/Code/Klassenzeit/docker/postgres/init-databases.sql:/docker-entrypoint-initdb.d/init-databases.sql:ro
```

- [ ] **Step 6: Add Caddy routes for Keycloak**

Add to `/home/pascal/Code/server-infra/Caddyfile`:

```
auth.klassenzeit.pascalkraus.com {
    encode gzip
    reverse_proxy keycloak:8080
}
```

- [ ] **Step 7: Start services and verify**

```bash
cd /home/pascal/Code/server-infra
docker compose up -d postgres keycloak
docker compose logs postgres --tail 20
docker compose logs keycloak --tail 20
```

Expected: PostgreSQL starts, creates the databases from init script. Keycloak starts and is accessible.

Verify databases:

```bash
docker exec postgres psql -U postgres -c "\l" | grep klassenzeit
```

Expected: `klassenzeit_dev`, `klassenzeit_staging`, `klassenzeit_prod` listed.

- [ ] **Step 8: Reload Caddy**

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

- [ ] **Step 9: Commit server-infra changes**

```bash
cd /home/pascal/Code/server-infra
git add docker-compose.yml Caddyfile
git commit -m "Add PostgreSQL and Keycloak shared services"
```

Commit Klassenzeit docker files:

```bash
cd /home/pascal/Code/Klassenzeit
git add docker/
git commit -m "Add database init scripts and docker config placeholders"
```

---

### Task 7: Create Docker Compose Files

**Files:**
- Create: `docker-compose.yml` (dev)
- Create: `docker-compose.staging.yml`
- Create: `docker-compose.prod.yml`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create backend Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM rust:1.93-alpine AS builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY backend/ backend/
COPY scheduler/ scheduler/

RUN cargo build --release -p klassenzeit-backend

FROM alpine:3.21 AS runner

RUN apk add --no-cache ca-certificates

COPY --from=builder /app/target/release/klassenzeit-backend /usr/local/bin/klassenzeit-backend
COPY backend/config/ /app/config/

WORKDIR /app
ENV LOCO_ENV=production

EXPOSE 3001

CMD ["klassenzeit-backend", "start"]
```

- [ ] **Step 2: Create frontend Dockerfile**

Create `frontend/Dockerfile`:

```dockerfile
FROM oven/bun:1-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["bun", "server.js"]
```

- [ ] **Step 3: Update next.config.ts for standalone output**

Edit `frontend/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 4: Create docker-compose.yml (dev)**

Dev runs its own isolated PostgreSQL and Keycloak — no dependency on server-infra services. Safe to reset, safe credentials.

Create `docker-compose.yml`:

```yaml
services:
  postgres-dev:
    image: postgres:17-alpine
    container_name: klassenzeit-postgres-dev
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: klassenzeit_dev
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  keycloak-dev:
    image: quay.io/keycloak/keycloak:26.0
    container_name: klassenzeit-keycloak-dev
    command: start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-dev:5432/klassenzeit_dev
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: dev_password
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
    depends_on:
      - postgres-dev
    restart: unless-stopped

  backend-dev:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: klassenzeit-backend-dev
    environment:
      LOCO_ENV: development
      DATABASE_URL: postgres://postgres:dev_password@postgres-dev:5432/klassenzeit_dev
      KEYCLOAK_URL: http://keycloak-dev:8080
      KEYCLOAK_REALM: klassenzeit
      KEYCLOAK_CLIENT_ID: klassenzeit-dev
    depends_on:
      - postgres-dev
      - keycloak-dev
    ports:
      - "3001:3001"
    restart: unless-stopped

  frontend-dev:
    build:
      context: frontend/
      dockerfile: Dockerfile
    container_name: klassenzeit-frontend-dev
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXT_PUBLIC_KEYCLOAK_URL: http://localhost:8080
      NEXT_PUBLIC_KEYCLOAK_REALM: klassenzeit
      NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: klassenzeit-dev
    depends_on:
      - backend-dev
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  postgres_dev_data:
```

- [ ] **Step 5: Create docker-compose.staging.yml**

Create `docker-compose.staging.yml`:

Staging and prod use the shared PostgreSQL and Keycloak from server-infra via the `web` Docker network. Credentials come from `.env.staging` (gitignored, lives on server only).

```yaml
services:
  backend-staging:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: klassenzeit-backend-staging
    env_file: .env.staging
    environment:
      LOCO_ENV: staging
    networks:
      - web
    restart: unless-stopped

  frontend-staging:
    build:
      context: frontend/
      dockerfile: Dockerfile
    container_name: klassenzeit-frontend-staging
    environment:
      NEXT_PUBLIC_API_URL: http://backend-staging:3001
      NEXT_PUBLIC_KEYCLOAK_URL: https://auth.klassenzeit.pascalkraus.com
      NEXT_PUBLIC_KEYCLOAK_REALM: klassenzeit
      NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: klassenzeit-staging
    networks:
      - web
    restart: unless-stopped

networks:
  web:
    external: true
```

- [ ] **Step 6: Create docker-compose.prod.yml**

Create `docker-compose.prod.yml`:

```yaml
services:
  backend-prod:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: klassenzeit-backend-prod
    env_file: .env.prod
    environment:
      LOCO_ENV: production
    networks:
      - web
    restart: unless-stopped

  frontend-prod:
    build:
      context: frontend/
      dockerfile: Dockerfile
    container_name: klassenzeit-frontend-prod
    environment:
      NEXT_PUBLIC_API_URL: http://backend-prod:3001
      NEXT_PUBLIC_KEYCLOAK_URL: https://auth.klassenzeit.pascalkraus.com
      NEXT_PUBLIC_KEYCLOAK_REALM: klassenzeit
      NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: klassenzeit-prod
    networks:
      - web
    restart: unless-stopped

networks:
  web:
    external: true
```

- [ ] **Step 7: Commit**

```bash
git add backend/Dockerfile frontend/Dockerfile frontend/next.config.ts \
  docker-compose.yml docker-compose.staging.yml docker-compose.prod.yml
git commit -m "Add Dockerfiles and Docker Compose files for all environments"
```

---

### Task 8: Create Environment Files and .gitignore

**Files:**
- Create: `.env.example`
- Create: `.env.dev`
- Create: `.gitignore`

- [ ] **Step 1: Create .env.example**

Create `.env.example`:

```bash
# Database
DATABASE_URL=postgres://user:password@host:5432/klassenzeit_<env>

# Keycloak
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=klassenzeit
KEYCLOAK_CLIENT_ID=klassenzeit-<env>

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=klassenzeit
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=klassenzeit-<env>

# Staging/prod use shared PostgreSQL and Keycloak from server-infra
# Dev uses isolated containers — see docker-compose.yml
```

- [ ] **Step 2: Create .env.dev**

Create `.env.dev`:

Dev uses its own isolated PostgreSQL and Keycloak containers with hardcoded safe credentials. No secrets — safe to commit.

```bash
# Dev environment — safe to commit, uses isolated dev containers
DATABASE_URL=postgres://postgres:dev_password@localhost:5432/klassenzeit_dev

KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=klassenzeit
KEYCLOAK_CLIENT_ID=klassenzeit-dev

NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=klassenzeit
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=klassenzeit-dev
```

- [ ] **Step 3: Create .gitignore**

Create `.gitignore`:

```gitignore
# Rust
target/

# Node / Next.js
frontend/node_modules/
frontend/.next/
frontend/out/

# mdBook output
docs/book/

# Environment (staging/prod contain secrets)
.env.staging
.env.prod

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Docker
*.log
```

- [ ] **Step 4: Commit**

```bash
git add .env.example .env.dev .gitignore
git commit -m "Add environment files and .gitignore"
```

---

### Task 9: Create justfile

**Files:**
- Create: `justfile`

- [ ] **Step 1: Create justfile**

Create `justfile`:

```just
# Load dev environment by default
set dotenv-filename := ".env.dev"

# Development
dev:
    docker compose up -d --build

dev-stop:
    docker compose down

dev-logs:
    docker compose logs -f

# Backend
backend-test:
    cargo test --workspace

backend-check:
    cargo fmt --check --all && cargo clippy --workspace -- -D warnings

backend-fmt:
    cargo fmt --all

# Frontend
frontend-dev:
    cd frontend && bun run dev

frontend-test:
    cd frontend && bun test

frontend-check:
    cd frontend && bun run check && bun run typecheck

frontend-fmt:
    cd frontend && bun run check:fix

# All tests
test: backend-test frontend-test

# All checks (what CI runs)
check: backend-check frontend-check

# Docs
docs-build:
    mdbook build docs/

docs-serve:
    mdbook serve docs/

# Staging
staging-deploy:
    docker compose -f docker-compose.staging.yml up -d --build

staging-stop:
    docker compose -f docker-compose.staging.yml down

# Production
prod-deploy:
    docker compose -f docker-compose.prod.yml up -d --build

prod-stop:
    docker compose -f docker-compose.prod.yml down

# Database
db-migrate:
    cd backend && cargo run -- db migrate

db-reset:
    cd backend && cargo run -- db reset

# Reset dev environment (wipe volumes and start fresh)
dev-reset:
    docker compose down -v
    docker compose up -d
```

- [ ] **Step 2: Verify justfile parses**

```bash
just --list
```

Expected: all recipes listed without errors.

- [ ] **Step 3: Commit**

```bash
git add justfile
git commit -m "Add justfile with dev, test, and deploy commands"
```

---

### Task 10: Set Up prek Pre-commit Hooks

**Files:**
- Create: `.pre-commit-config.yaml`

- [ ] **Step 1: Create .pre-commit-config.yaml**

Create `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
      - id: check-merge-conflict

  - repo: local
    hooks:
      - id: cargo-fmt
        name: cargo fmt
        entry: cargo fmt --all -- --check
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-clippy
        name: cargo clippy
        entry: cargo clippy --workspace -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: biome-check
        name: biome check
        entry: bash -c 'cd frontend && bunx biome check src/'
        language: system
        files: ^frontend/
        pass_filenames: false

      - id: typecheck
        name: typescript typecheck
        entry: bash -c 'cd frontend && bun run typecheck'
        language: system
        files: ^frontend/
        pass_filenames: false
```

- [ ] **Step 2: Install hooks**

```bash
cd /home/pascal/Code/Klassenzeit
prek install
```

Expected: hooks installed to `.git/hooks/pre-commit`.

- [ ] **Step 3: Verify hooks run**

```bash
prek run --all-files
```

Expected: all hooks pass (or report expected issues to fix).

- [ ] **Step 4: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "Add prek pre-commit hooks for Rust and frontend checks"
```

---

### Task 11: Create GitHub Actions Workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-staging.yml`
- Create: `.github/workflows/deploy-prod.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_DB: klassenzeit_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - name: Check formatting
        run: cargo fmt --all -- --check
      - name: Clippy
        run: cargo clippy --workspace -- -D warnings
      - name: Test
        run: cargo test --workspace
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/klassenzeit_test

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: cd frontend && bun install --frozen-lockfile
      - name: Biome check
        run: cd frontend && bun run check
      - name: Typecheck
        run: cd frontend && bun run typecheck
      - name: Build
        run: cd frontend && bun run build

  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install mdbook
        run: cargo install mdbook
      - name: Build docs
        run: mdbook build docs/
```

- [ ] **Step 2: Create staging deploy workflow**

Create `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: docker compose -f docker-compose.staging.yml build
      - name: Deploy
        run: docker compose -f docker-compose.staging.yml up -d
      - name: Cleanup
        run: docker image prune -f
```

- [ ] **Step 3: Create production deploy workflow**

Create `.github/workflows/deploy-prod.yml`:

```yaml
name: Deploy Production

on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: docker compose -f docker-compose.prod.yml build
      - name: Deploy
        run: docker compose -f docker-compose.prod.yml up -d
      - name: Cleanup
        run: docker image prune -f
```

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "Add GitHub Actions CI and deploy workflows"
```

---

### Task 12: Add Caddy Routes for Klassenzeit

**Files:**
- Modify: `/home/pascal/Code/server-infra/Caddyfile`

- [ ] **Step 1: Read current Caddyfile**

Read `/home/pascal/Code/server-infra/Caddyfile` to understand the existing structure.

- [ ] **Step 2: Add staging routes**

Add to Caddyfile:

```
staging.klassenzeit.pascalkraus.com {
    encode gzip

    handle /api/* {
        reverse_proxy klassenzeit-backend-staging:3001
    }

    handle {
        reverse_proxy klassenzeit-frontend-staging:3000
    }
}
```

- [ ] **Step 3: Add production routes**

Add to Caddyfile:

```
klassenzeit.pascalkraus.com {
    encode gzip

    handle /api/* {
        reverse_proxy klassenzeit-backend-prod:3001
    }

    handle {
        reverse_proxy klassenzeit-frontend-prod:3000
    }
}

www.klassenzeit.pascalkraus.com {
    redir https://klassenzeit.pascalkraus.com{uri} permanent
}
```

- [ ] **Step 4: Reload Caddy**

```bash
cd /home/pascal/Code/server-infra
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Expected: no errors.

- [ ] **Step 5: Commit server-infra changes**

```bash
cd /home/pascal/Code/server-infra
git add Caddyfile
git commit -m "Add Klassenzeit staging and production Caddy routes"
```

---

### Task 13: Configure .claude for Autonomous Workflow

**Files:**
- Modify: `.claude/CLAUDE.md`
- Create: `.claude/settings.json`

- [ ] **Step 1: Update CLAUDE.md**

Replace `.claude/CLAUDE.md` with comprehensive project instructions:

```markdown
# Klassenzeit

## Overview

School timetabling application — Loco (Rust) backend, Next.js frontend, PostgreSQL, Keycloak auth.

## History

- The `archive/v1` branch contains the previous version (Spring Boot + React + Keycloak + Timefold Solver). Reference it for domain knowledge and past decisions.

## Project Structure

- `backend/` — Loco app (Rust/Axum, SeaORM)
- `scheduler/` — Standalone Rust library crate for timetable optimization
- `frontend/` — Next.js with Biome, Tailwind
- `docs/` — mdBook documentation
- `docker/` — Keycloak config, DB init scripts, seeds
- `e2e/` — End-to-end tests

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
```

- [ ] **Step 2: Create .claude/settings.json**

Create `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(cargo *)",
      "Bash(bun *)",
      "Bash(just *)",
      "Bash(mdbook *)",
      "Bash(prek *)",
      "Bash(git *)",
      "Bash(docker compose *)"
    ]
  }
}
```

- [ ] **Step 3: Create e2e placeholder**

```bash
touch e2e/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add .claude/ e2e/
git commit -m "Configure .claude for autonomous workflow"
```

---

### Task 14: Verify End-to-End Dev Environment

**Files:** None (verification only)

- [ ] **Step 1: Start dev environment**

```bash
just dev
```

Expected: `klassenzeit-postgres-dev`, `klassenzeit-keycloak-dev`, `klassenzeit-backend-dev`, `klassenzeit-frontend-dev` containers start.

- [ ] **Step 2: Verify dev containers are running**

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep klassenzeit
```

Expected: all four dev containers up.

- [ ] **Step 3: Verify workspace compiles**

```bash
cd /home/pascal/Code/Klassenzeit
cargo build --workspace
```

Expected: successful build.

- [ ] **Step 4: Verify all tests pass**

```bash
just test
```

Expected: backend and frontend tests pass.

- [ ] **Step 5: Verify checks pass**

```bash
just check
```

Expected: formatting and linting pass.

- [ ] **Step 6: Verify docs build**

```bash
just docs-build
```

Expected: mdBook builds without errors.

- [ ] **Step 7: Verify Docker build works**

```bash
docker compose build
```

Expected: both backend and frontend images build successfully.

- [ ] **Step 8: Push to remote**

```bash
git push origin main
```

Expected: all commits pushed. CI workflow triggers on GitHub.
