# Dev Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship container images, a compose file, and a GHCR publishing workflow so `klassenzeit-staging.pascalkraus.com` becomes a live URL served from the Hetzner VPS that already runs Caddy and Postgres.

**Architecture:** Two multi-stage Dockerfiles (backend: `uv + rust + maturin → uv runtime`, frontend: `node/pnpm builder → nginx`). One compose file in `deploy/` declares a one-shot migrate container and the two app containers, all joined to the external `web` network beside the shared Postgres. A new GitHub Actions workflow publishes images to `ghcr.io/pgoell/klassenzeit-{backend,frontend}` on every push to master. A SQL init script resolves the dangling mount in server-infra, and a deploy README documents the manual VPS update flow.

**Tech Stack:** Docker / Podman Compose v2; nginx:1.27-alpine; ghcr.io/astral-sh/uv:python3.13-bookworm-slim; node:22-alpine; rustup stable toolchain; GitHub Actions docker/metadata-action + build-push-action v6; Postgres 17; FastAPI + Alembic.

---

## File structure

### New files

- `backend/Dockerfile` — multi-stage Python + Rust builder, uv runtime. ~35 lines.
- `backend/.dockerignore` — excludes `.env`, pycache, tests, docs.
- `frontend/Dockerfile` — multi-stage pnpm build → nginx runtime. ~20 lines.
- `frontend/nginx.conf` — SPA fallback + cache headers. ~25 lines.
- `frontend/.dockerignore` — excludes `node_modules`, `dist`, `coverage`.
- `deploy/compose.yaml` — three services on external `web` network. ~55 lines.
- `deploy/.env.staging.example` — env template. ~15 lines.
- `deploy/README.md` — bootstrap + update + rollback runbook. ~120 lines.
- `docker/postgres/init-databases.sql` — idempotent role + DB creation. ~20 lines.
- `docs/adr/README.md` — ADR index. ~15 lines.
- `docs/adr/0001-deployment-topology.md` — load-bearing decisions. ~80 lines.
- `.github/workflows/deploy-images.yml` — GHCR publish workflow. ~60 lines.

### Modified files

- `docs/superpowers/OPEN_THINGS.md` — add follow-up about the init-SQL cross-repo coupling; remove this spec from the "pending" list if it appears.
- `README.md` — add a short "Deployment" section (~6 lines) pointing at `deploy/README.md`.

### Files explicitly untouched

- `backend/src/**` — zero code changes.
- `frontend/src/**` — zero code changes.
- `compose.yaml` (root-level, local dev) — untouched.
- `.github/workflows/ci.yml`, `frontend-ci.yml`, `audit.yml`, `pr-title.yml` — untouched.
- `/home/pascal/Code/server-infra/` — out of scope, different repo.

---

## Task 1: Backend .dockerignore

**Why first:** Keeps every subsequent `docker build` fast by avoiding `node_modules`, `target/`, pytest caches, and `.env` files in the build context.

**Files:**
- Create: `backend/.dockerignore`

- [ ] **Step 1: Write the failing verification**

Run: `test -f backend/.dockerignore && echo ok || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the file**

```
# backend/.dockerignore
# Paths are relative to the repo-root build context (see
# .github/workflows/deploy-images.yml: context=".", file=backend/Dockerfile).
**/__pycache__
**/*.pyc
**/.pytest_cache
**/.ruff_cache
**/.mypy_cache
**/.venv
**/.env
**/.env.*
!**/.env.example

# Workspace dirs the backend image does not need.
frontend/
node_modules/
target/
docs/
e2e/
coverage/
.coverage-baseline*
.git
.github
.claude
.lefthook*
```

- [ ] **Step 3: Re-run verification**

Run: `test -f backend/.dockerignore && echo ok || echo missing`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/.dockerignore
git commit -m "build(backend): add .dockerignore for deploy image"
```

---

## Task 2: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

**Context:** This Dockerfile is called with build context = repo root (see CI workflow in Task 8). `COPY` paths are therefore relative to the repo root, e.g., `COPY backend/ backend/`. The backend depends on the `klassenzeit-solver` workspace member which is a PyO3 Rust crate under `solver/`. Both sources must be in the build context for `uv sync` to compile the solver wheel via maturin.

- [ ] **Step 1: Write the failing verification**

Run: `test -f backend/Dockerfile && echo ok || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1.9
#
# backend/Dockerfile
#
# Build context: repo root (see .github/workflows/deploy-images.yml).
# Stage 1 installs Rust so maturin can compile the klassenzeit-solver PyO3 wheel
# during `uv sync`. Stage 2 is the same base without the Rust toolchain, keeping
# the runtime image slim.

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential curl ca-certificates pkg-config libssl-dev \
 && rm -rf /var/lib/apt/lists/* \
 && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy workspace manifests + sources required to resolve and build the
# klassenzeit-backend package plus its workspace dependency klassenzeit-solver.
COPY pyproject.toml uv.lock ./
COPY backend/pyproject.toml backend/pyproject.toml
COPY solver/ solver/
COPY backend/ backend/

RUN uv sync --frozen --no-dev --package klassenzeit-backend

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS runtime
WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY backend/ /app/backend/

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 3001
CMD ["uvicorn", "klassenzeit_backend.main:app", "--host", "0.0.0.0", "--port", "3001"]
```

- [ ] **Step 3: Lint the Dockerfile**

Run (optional, only if hadolint is installed): `hadolint backend/Dockerfile`
Expected: no warnings above level `info`. Skip if hadolint unavailable.

- [ ] **Step 4: Smoke-build locally**

Run from repo root:
```bash
podman build -f backend/Dockerfile -t kz-backend:smoke .
```

Expected:
- Build completes without errors.
- Final image has `/app/.venv/bin/uvicorn` on PATH.
- Container will fail to start without `KZ_DATABASE_URL`; do not boot it here, the build succeeding is the assertion.

If you do not have podman / docker locally: skip this step, but do run it on CI via Task 8. Note in the commit message that the local smoke was skipped.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile
git commit -m "build(backend): add multi-stage Dockerfile for deploy image"
```

---

## Task 3: Frontend .dockerignore

**Files:**
- Create: `frontend/.dockerignore`

- [ ] **Step 1: Verify file is missing**

Run: `test -f frontend/.dockerignore && echo ok || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the file**

```
# frontend/.dockerignore
# Build context is the repo root; these paths are under frontend/.
frontend/node_modules
frontend/dist
frontend/coverage
frontend/.vite
frontend/openapi.json
frontend/src/routeTree.gen.ts
frontend/src/lib/api-types.ts

# And from the repo root, exclude unrelated trees so the context stays small.
backend/
solver/
docs/
e2e/
.git
.github
.claude
target/
```

Note: `routeTree.gen.ts` and `api-types.ts` are gitignored and regenerated by the
TanStack Router plugin and `mise run fe:types` respectively; the build produces
its own fresh `routeTree.gen.ts`.

- [ ] **Step 3: Re-verify**

Run: `test -f frontend/.dockerignore && echo ok`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add frontend/.dockerignore
git commit -m "build(frontend): add .dockerignore for deploy image"
```

---

## Task 4: Frontend nginx config

**Files:**
- Create: `frontend/nginx.conf`

- [ ] **Step 1: Verify file is missing**

Run: `test -f frontend/nginx.conf && echo ok || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the config**

```nginx
# frontend/nginx.conf
# Mounted into /etc/nginx/conf.d/default.conf by the runtime stage of
# frontend/Dockerfile. Caddy at the edge terminates HTTPS; this server only
# serves the static bundle over plain HTTP on port 3000 over the internal
# `web` Docker network.

server {
    listen 3000;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA: unknown paths fall through to index.html so client-side routes work.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-cache Vite's content-hashed assets; they are safe to cache forever.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Never cache the HTML entry so a redeploy is visible on the next refresh.
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

- [ ] **Step 3: Re-verify**

Run: `test -f frontend/nginx.conf && echo ok`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add frontend/nginx.conf
git commit -m "build(frontend): add nginx SPA config for deploy image"
```

---

## Task 5: Frontend Dockerfile

**Files:**
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Verify file is missing**

Run: `test -f frontend/Dockerfile && echo ok || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1.9
#
# frontend/Dockerfile
#
# Build context: repo root. Two stages: node builder with pnpm via corepack,
# nginx:alpine runtime serving the static bundle on port 3000.

FROM node:22-alpine AS builder
WORKDIR /app/frontend

RUN corepack enable

# Leverage the layer cache: install deps from package.json + pnpm-lock.yaml
# alone, then copy the rest of the source tree.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm run build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 3000
# nginx:alpine already has a healthy default CMD ["nginx", "-g", "daemon off;"];
# do not override.
```

- [ ] **Step 3: Smoke-build locally**

Run from repo root:
```bash
podman build -f frontend/Dockerfile -t kz-frontend:smoke .
```

Expected: build completes; image contains `/usr/share/nginx/html/index.html`.

If podman / docker unavailable: skip and rely on CI (Task 8). Note skip in the
commit message.

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile
git commit -m "build(frontend): add multi-stage Dockerfile for deploy image"
```

---

## Task 6: Postgres init-databases.sql

**Why:** Resolves the dangling mount in `/home/pascal/Code/server-infra/docker-compose.yml:95`. Future cold starts will auto-create the Keycloak DB + the staging role/DB. The running Postgres instance already exists with a populated data volume, so this file will not execute on the current server state; the deploy README includes a one-off bootstrap for that case.

**Files:**
- Create: `docker/postgres/init-databases.sql`

- [ ] **Step 1: Verify file is missing**

Run: `test -f docker/postgres/init-databases.sql && echo ok || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the SQL**

```sql
-- docker/postgres/init-databases.sql
-- Mounted by /home/pascal/Code/server-infra/docker-compose.yml into the
-- postgres service's /docker-entrypoint-initdb.d directory. Runs once when
-- the postgres_data volume is empty. Idempotent so re-execution after a
-- manual volume wipe is safe.
--
-- Uses the \gexec pattern so conditional CREATE DATABASE works under psql
-- despite CREATE DATABASE not supporting IF NOT EXISTS.

-- Keycloak database. Owner stays as the shared superuser so
-- KC_DB_USERNAME/KC_DB_PASSWORD (declared in server-infra/.env.local) keep
-- working without additional role grants.
SELECT 'CREATE DATABASE keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec

-- Dedicated Klassenzeit staging role. The placeholder password MUST be
-- rotated before the first real deploy: on an already-running Postgres,
-- follow deploy/README.md's bootstrap section instead of relying on this
-- script.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'klassenzeit_staging') THEN
        CREATE ROLE klassenzeit_staging LOGIN PASSWORD 'CHANGE_ME';
    END IF;
END
$$;

SELECT 'CREATE DATABASE klassenzeit_staging OWNER klassenzeit_staging'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'klassenzeit_staging')\gexec
```

- [ ] **Step 3: Syntax-check with psql (optional)**

Run if a local psql client is installed:
```bash
psql --set ON_ERROR_STOP=1 --single-transaction --no-psqlrc -f /dev/null \
  < docker/postgres/init-databases.sql 2>&1 | head -20 || true
```

A connection-refused error is fine (no DB connection is needed); what you do
not want is a syntax error before the connect attempt. Skip if unsure.

- [ ] **Step 4: Commit**

```bash
git add docker/postgres/init-databases.sql
git commit -m "build(db): add staging role + DB init script for shared postgres"
```

---

## Task 7: Deploy compose and env template

**Files:**
- Create: `deploy/compose.yaml`
- Create: `deploy/.env.staging.example`

- [ ] **Step 1: Verify both files missing**

Run: `test -f deploy/compose.yaml || test -f deploy/.env.staging.example && echo present || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the compose file**

```yaml
# deploy/compose.yaml
# Copied to /home/pascal/kz-deploy/compose.yaml on the VPS and run against
# the external `web` network declared by /home/pascal/Code/server-infra/docker-compose.yml.
# The shared postgres + caddy services live in that external compose; this
# file only declares the Klassenzeit app containers.

services:
  klassenzeit-migrate-staging:
    image: ghcr.io/pgoell/klassenzeit-backend:${KZ_IMAGE_TAG:-latest}
    container_name: klassenzeit-migrate-staging
    command: ["alembic", "-c", "/app/backend/alembic.ini", "upgrade", "head"]
    env_file:
      - .env.staging
    restart: "no"
    networks:
      - web

  klassenzeit-backend-staging:
    image: ghcr.io/pgoell/klassenzeit-backend:${KZ_IMAGE_TAG:-latest}
    container_name: klassenzeit-backend-staging
    env_file:
      - .env.staging
    depends_on:
      klassenzeit-migrate-staging:
        condition: service_completed_successfully
    restart: unless-stopped
    networks:
      - web
    healthcheck:
      test:
        - "CMD-SHELL"
        - "python -c 'import urllib.request,sys; sys.exit(0 if urllib.request.urlopen(\"http://127.0.0.1:3001/health\").status == 200 else 1)'"
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s

  klassenzeit-frontend-staging:
    image: ghcr.io/pgoell/klassenzeit-frontend:${KZ_IMAGE_TAG:-latest}
    container_name: klassenzeit-frontend-staging
    restart: unless-stopped
    networks:
      - web
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://127.0.0.1:3000/ || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5

networks:
  web:
    external: true
    name: web
```

- [ ] **Step 3: Write the env example**

```
# deploy/.env.staging.example
# Copy to /home/pascal/kz-deploy/.env.staging on the VPS and fill in the
# placeholder password from the bootstrap step (see deploy/README.md).

# Image tag to deploy. Override to `sha-<short>` to roll back to a specific
# commit's published images.
KZ_IMAGE_TAG=latest

# Full Klassenzeit DSN. Hostname `postgres` is the shared Postgres container
# on the `web` network. The role + DB are created by the bootstrap step.
KZ_DATABASE_URL=postgresql+psycopg://klassenzeit_staging:REPLACE_ME@postgres:5432/klassenzeit_staging

# Runtime config.
KZ_ENV=prod
KZ_COOKIE_SECURE=true
# KZ_COOKIE_DOMAIN is intentionally unset so kz_session is host-only to
# klassenzeit-staging.pascalkraus.com (see spec Q18).

# Pool sizing matches local dev.
KZ_DB_POOL_SIZE=5
KZ_DB_MAX_OVERFLOW=10
KZ_DB_ECHO=false
```

- [ ] **Step 4: Validate compose syntax**

Run:
```bash
podman compose -f deploy/compose.yaml config > /dev/null
```

Or with docker:
```bash
docker compose -f deploy/compose.yaml config > /dev/null
```

Expected: exits 0. If it warns about missing `.env.staging`, that is expected;
run with `--env-file deploy/.env.staging.example` to confirm:

```bash
docker compose --env-file deploy/.env.staging.example -f deploy/compose.yaml config > /dev/null
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add deploy/compose.yaml deploy/.env.staging.example
git commit -m "build(deploy): add staging compose and env template"
```

---

## Task 8: GitHub Actions image publish workflow

**Files:**
- Create: `.github/workflows/deploy-images.yml`

- [ ] **Step 1: Verify file is missing**

Run: `test -f .github/workflows/deploy-images.yml && echo ok || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the workflow**

```yaml
name: Deploy images

on:
  push:
    branches: [master]
  workflow_dispatch:

concurrency:
  group: deploy-images-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  packages: write

jobs:
  backend:
    name: Publish backend image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/klassenzeit-backend
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: backend/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=backend
          cache-to: type=gha,scope=backend,mode=max

  frontend:
    name: Publish frontend image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/klassenzeit-frontend
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: frontend/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=frontend
          cache-to: type=gha,scope=frontend,mode=max
```

- [ ] **Step 3: Validate with actionlint (optional)**

Run if actionlint is installed:
```bash
actionlint .github/workflows/deploy-images.yml
```

Expected: no errors. If not installed, skip; CI will surface problems.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-images.yml
git commit -m "ci: publish backend and frontend images to GHCR on master"
```

Note: The workflow only runs on pushes to `master`, not on PR. To verify it
green-lights before merge, a reviewer can manually trigger `workflow_dispatch`
on the PR branch from the Actions tab.

---

## Task 9: ADR index + first ADR

**Files:**
- Create: `docs/adr/README.md`
- Create: `docs/adr/0001-deployment-topology.md`

- [ ] **Step 1: Verify both files missing**

Run:
```bash
test -f docs/adr/README.md || test -f docs/adr/0001-deployment-topology.md \
  && echo present || echo missing
```
Expected: `missing`

- [ ] **Step 2: Write the ADR index**

```markdown
# Architecture Decision Records

Short records of load-bearing architectural decisions. One file per decision,
numbered in order of acceptance. Each ADR has: context, decision, alternatives
considered, consequences. Keep them short — this is a changelog of judgment
calls, not a design document.

## Index

| # | Title | Status | Date |
|---|-------|--------|------|
| [0001](0001-deployment-topology.md) | Deployment topology for the staging tier | Accepted | 2026-04-19 |
```

- [ ] **Step 3: Write the first ADR**

```markdown
# 0001. Deployment topology for the staging tier

- **Status:** Accepted
- **Date:** 2026-04-19
- **Deciders:** pgoell
- **Spec:** `docs/superpowers/specs/2026-04-19-dev-deployment-design.md`

## Context

The Hetzner VPS already runs a Caddy reverse proxy (with Cloudflare ACME DNS
challenge), a shared Postgres 17, and a Keycloak instance on a Docker network
named `web`. The Caddyfile declares route blocks for
`klassenzeit-staging.pascalkraus.com` and `klassenzeit.pascalkraus.com` that
expect services named `klassenzeit-backend-staging:3001`,
`klassenzeit-frontend-staging:3000`, `klassenzeit-backend-prod:3001`, and
`klassenzeit-frontend-prod:3000`. No such services existed; no Dockerfile
existed in this repo; no CI step published images; the shared Postgres's
`init-databases.sql` mount pointed at a path in this repo that did not
contain the file.

This ADR captures the choices made to turn the staging slot into a live URL
without introducing new infrastructure on the VPS.

## Decision

1. **Image registry: GHCR.** Images are built in GitHub Actions on push to
   `master` and pushed to `ghcr.io/pgoell/klassenzeit-backend` and
   `ghcr.io/pgoell/klassenzeit-frontend`, tagged `latest` plus `sha-<short>`.
   `GITHUB_TOKEN` has `packages: write`, so no external PAT is needed.
2. **Backend image: multi-stage uv + Rust.** Base
   `ghcr.io/astral-sh/uv:python3.13-bookworm-slim` for both stages; the
   builder stage adds rustup so maturin can compile the `klassenzeit-solver`
   PyO3 wheel. Runtime stage copies the resulting `/app/.venv`.
3. **Frontend image: pnpm builder → nginx runtime.** node:22-alpine builder
   runs `pnpm run build`; nginx:1.27-alpine serves the `dist/` bundle on
   port 3000 with SPA fallback to `index.html`.
4. **Migrations: ephemeral container.** A `klassenzeit-migrate-staging`
   service runs `alembic upgrade head` and exits. The backend container
   `depends_on` it with `condition: service_completed_successfully`. This
   avoids hiding migration failures inside app boot and is forward-compatible
   with multi-replica backend scale-out.
5. **Compose lives in the Klassenzeit repo** under `deploy/`. Images and
   orchestration ship together; server-infra stays the home of shared
   infrastructure only. The Klassenzeit deploy compose joins the external
   `web` network declared by server-infra.
6. **Manual VPS updates.** The admin runs `docker compose pull && docker
   compose up -d` via the ttyd shell at `term.pascalkraus.com`. No
   Watchtower, no webhook, no SSH-from-CI. Revisit once manual pulls prove
   tedious.
7. **Relative `/api/*` URLs in the frontend.** Caddy routes `/api/*` and
   `/` to different services on the same origin, so the frontend bundle uses
   the default empty API base and ships identical bytes to every environment.
8. **Host-only session cookie.** `KZ_COOKIE_DOMAIN` stays unset. The
   session cookie is scoped to `klassenzeit-staging.pascalkraus.com` only.
   If future Keycloak SSO between staging and prod needs a wider scope,
   revisit and switch to `.pascalkraus.com`.

## Alternatives considered

- **Build images on the VPS.** Rejected: backend build needs Rust, which
  would force the toolchain onto the server and make every deploy slow.
- **Single `alembic upgrade head && uvicorn` CMD.** Rejected: couples
  migrations to app boot; failures would surface as app-start failures.
- **Backend Docker serving its own static files.** Rejected: couples
  frontend deploys to backend deploys and muddies the build pipeline.
- **Docker secrets / Vault.** Rejected: overkill for single-host compose.
  The env file lives on the VPS, out of git.
- **Add a third `dev` subdomain.** Rejected: staging is the pre-prod slot
  by convention and the Caddy block already exists. Creating three tiers
  before shipping even one is premature.

## Consequences

- Contributors other than pgoell can deploy simply by pushing to master.
- The first cold build of the backend image will take ~5 minutes while
  installing Rust; CI caches the layer via `type=gha,scope=backend`.
- GHCR packages default to private; the first deploy will need the owner
  to either make the images public or grant the VPS a pull PAT. Documented
  in `deploy/README.md`.
- The `init-databases.sql` mount path in server-infra is an absolute host
  path pointing into this repo; brittle if the repo moves. Tracked as a
  follow-up in `docs/superpowers/OPEN_THINGS.md`.
- Rollback is one env-var change: flip `KZ_IMAGE_TAG` in `.env.staging` to
  a known-good `sha-<short>` tag and re-run `docker compose pull && up -d`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/README.md docs/adr/0001-deployment-topology.md
git commit -m "docs(adr): record deployment topology for staging tier"
```

---

## Task 10: Deploy README runbook

**Files:**
- Create: `deploy/README.md`

- [ ] **Step 1: Verify file is missing**

Run: `test -f deploy/README.md && echo ok || echo missing`
Expected: `missing`

- [ ] **Step 2: Write the README**

```markdown
# Deployment (staging)

Runbook for the `klassenzeit-staging.pascalkraus.com` environment on the
Hetzner VPS. The Caddyfile already routes the hostname to
`klassenzeit-backend-staging:3001` and `klassenzeit-frontend-staging:3000`
on the shared `web` Docker network; this directory supplies the services
that answer those names.

## What is here

- `compose.yaml` — three-service compose (migrate, backend, frontend) that
  joins the external `web` network.
- `.env.staging.example` — env template. The real `.env.staging` lives on
  the VPS in `/home/pascal/kz-deploy/` and never enters git.

## First-time setup (per VPS)

Pre-requisites already in place on the VPS and not repeated here:
- Caddy + Postgres + Keycloak running from `/home/pascal/Code/server-infra/`.
- Cloudflare DNS A record for `klassenzeit-staging` pointing at the VPS.
- The shared Postgres container is named `postgres` on the `web` network.

1. **Copy deploy assets to the VPS.** From your laptop:

   ```bash
   ssh pascal@<VPS> 'mkdir -p /home/pascal/kz-deploy'
   scp deploy/compose.yaml pascal@<VPS>:/home/pascal/kz-deploy/compose.yaml
   scp deploy/.env.staging.example pascal@<VPS>:/home/pascal/kz-deploy/.env.staging
   ```

   Or use the ttyd shell at https://term.pascalkraus.com to `cat >` each file.

2. **Bootstrap the Postgres role and database.** On the VPS, from the
   server-infra directory (so the `POSTGRES_USER`/`POSTGRES_PASSWORD` env
   vars are loaded):

   ```bash
   cd /home/pascal/Code/server-infra
   source .env.local  # or read the values manually
   STAGING_PW=$(openssl rand -base64 24)
   docker exec -i postgres psql -U "$POSTGRES_USER" <<SQL
   CREATE ROLE klassenzeit_staging LOGIN PASSWORD '${STAGING_PW}';
   CREATE DATABASE klassenzeit_staging OWNER klassenzeit_staging;
   SQL
   echo "Generated staging password (paste into .env.staging): ${STAGING_PW}"
   ```

   Copy the printed password into
   `/home/pascal/kz-deploy/.env.staging` by replacing `REPLACE_ME` in
   `KZ_DATABASE_URL`.

3. **Make sure GHCR images are pullable.** On first deploy the images may
   be private. Options:
   - (a) On GitHub, open each package page
     (`github.com/pgoell/Klassenzeit/pkgs/container/klassenzeit-backend`,
     likewise for frontend) and change visibility to Public.
   - (b) On the VPS, log docker in with a PAT that has `read:packages`:
     `docker login ghcr.io -u pgoell -p <PAT>`.

4. **First pull + up.**

   ```bash
   cd /home/pascal/kz-deploy
   docker compose pull
   docker compose up -d
   ```

   The migrate container runs once and exits; backend and frontend come up
   behind the existing Caddy. Verify:

   ```bash
   curl -fsS https://klassenzeit-staging.pascalkraus.com/health
   # expected: {"status":"ok","solver_check":"ko"}
   curl -fsS https://klassenzeit-staging.pascalkraus.com/ | head -c 200
   # expected: HTML starting with <!doctype html>...
   ```

## Per-deploy update

After a master push triggers the `deploy-images.yml` workflow, SSH into
the VPS (or open ttyd) and run:

```bash
cd /home/pascal/kz-deploy
docker compose pull
docker compose up -d
```

`docker compose up -d` recreates only containers whose images changed.
The migrate service runs again and exits before the backend restarts.

## Rollback

Published images are tagged with both `latest` and `sha-<short>`. To go
back to a known-good commit:

```bash
cd /home/pascal/kz-deploy
sed -i 's/^KZ_IMAGE_TAG=.*/KZ_IMAGE_TAG=sha-abcdef1/' .env.staging
docker compose pull
docker compose up -d
```

Replace `abcdef1` with the short SHA of the target commit. Confirm with
`docker inspect klassenzeit-backend-staging --format '{{.Image}}'`.

## Logs and troubleshooting

```bash
# Tail live logs (backend / frontend).
docker compose logs -f klassenzeit-backend-staging
docker compose logs -f klassenzeit-frontend-staging

# Inspect the one-shot migration run.
docker compose logs klassenzeit-migrate-staging

# Check health and network attachment.
docker inspect klassenzeit-backend-staging \
  --format '{{.State.Health.Status}} on {{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}'
```

If migration fails: the backend container will not start because
`depends_on.condition: service_completed_successfully` is unmet. Re-run
`docker compose up -d` after fixing the underlying issue (usually a DB
role or a bad `KZ_DATABASE_URL`).

## Local smoke test

To sanity-check the compose before deploying:

```bash
# One-time: create a local `web` network so compose's external reference resolves.
podman network create web 2>/dev/null || true

# Start a local Postgres on the web network with a throwaway role.
podman run --name kz-pg-smoke -d --network web \
  -e POSTGRES_USER=klassenzeit_staging \
  -e POSTGRES_PASSWORD=smoke \
  -e POSTGRES_DB=klassenzeit_staging \
  docker.io/library/postgres:17

# Point an override env file at the local DB.
cat > /tmp/.env.smoke <<EOF
KZ_IMAGE_TAG=latest
KZ_DATABASE_URL=postgresql+psycopg://klassenzeit_staging:smoke@kz-pg-smoke:5432/klassenzeit_staging
KZ_ENV=prod
KZ_COOKIE_SECURE=false
KZ_DB_POOL_SIZE=5
KZ_DB_MAX_OVERFLOW=10
KZ_DB_ECHO=false
EOF

# Start; note: uses published images, so you must have pushed at least once.
cp /tmp/.env.smoke deploy/.env.staging
podman compose -f deploy/compose.yaml up
```

Tear down with `podman compose -f deploy/compose.yaml down && podman rm -f kz-pg-smoke`.
Do NOT commit `deploy/.env.staging` — it is gitignored implicitly by the
blank template, but double-check before committing unrelated deploy changes.
```

- [ ] **Step 3: Commit**

```bash
git add deploy/README.md
git commit -m "docs(deploy): add staging runbook"
```

---

## Task 11: Gitignore deploy env + root README note

**Files:**
- Modify: `.gitignore` (add `deploy/.env.*` rule except `.example`)
- Modify: `README.md` (add a short Deployment section)

- [ ] **Step 1: Check current gitignore handling**

Run: `grep -E '^deploy|env' .gitignore || echo no-rule`
Expected: either an existing rule or `no-rule`.

- [ ] **Step 2: Append the gitignore rule**

Add at the bottom of `.gitignore`:

```
# Deployment secrets — real .env.staging lives on the VPS, not in git.
/deploy/.env.*
!/deploy/.env.*.example
```

- [ ] **Step 3: Verify the rule works**

Run:
```bash
cp deploy/.env.staging.example deploy/.env.staging
git status --porcelain deploy/.env.staging
```

Expected: empty output (file is ignored). Then delete the test file:

```bash
rm deploy/.env.staging
```

- [ ] **Step 4: Add Deployment section to root README**

Locate the section header right after "Tooling" or wherever the "Commands"
table lives, and insert (or append to the end of the file if no obvious
spot):

```markdown
## Deployment

Klassenzeit deploys to `klassenzeit-staging.pascalkraus.com` on a Hetzner
VPS via container images published to GHCR on every push to `master`. The
runbook lives in [`deploy/README.md`](deploy/README.md). Architecture
decisions are captured in [ADR 0001](docs/adr/0001-deployment-topology.md).
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore README.md
git commit -m "docs: point README at deploy runbook and ignore .env.staging"
```

---

## Task 12: OPEN_THINGS follow-up

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Read the current file**

Run: `head -40 docs/superpowers/OPEN_THINGS.md`

Note the existing structure and ordering conventions before editing.

- [ ] **Step 2: Add one new follow-up**

Insert (in the order-by-importance slot that matches) an item roughly of
the form:

```markdown
- **Move Postgres init-SQL source into server-infra.** `server-infra/docker-compose.yml` mounts `/home/pascal/Code/Klassenzeit/docker/postgres/init-databases.sql` via an absolute host path; this couples the two repos by path rather than by contract. Move the file into the server-infra tree and update the mount source. Priority: low (only affects cold VPS setups).
```

If OPEN_THINGS lists the current spec as pending, also strike it through or
remove it since the deploy is now shipping.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs: record init-SQL cross-repo coupling follow-up"
```

---

## Task 13: Finalize docs via revise-claude-md + claude-md-improver

This task runs two skills back-to-back; it is the same pattern every
autopilot run uses before pushing. Both are invoked via the `Skill` tool.

**Files:** whichever `CLAUDE.md` files the skills decide need updates.

- [ ] **Step 1: Invoke `claude-md-management:revise-claude-md`**

The skill scans the session and proposes edits. Apply them. Expected
content to surface:
- Docker build context is the repo root; backend + frontend Dockerfiles
  live under their respective subdirs, not at the repo root.
- Deploy env file lives outside git on the VPS; the template is checked in.
- GHCR is the image registry of record.

- [ ] **Step 2: Invoke `claude-md-management:claude-md-improver`**

Second-pass audit. Apply the findings.

- [ ] **Step 3: Commit all CLAUDE.md changes**

```bash
git add **/CLAUDE.md
git commit -m "docs(claude-md): record deploy patterns from dev deployment spec"
```

If no changes were proposed, skip the commit; leave this checkbox ticked
anyway and note in the commit history that the skills ran and produced no
diffs.

---

## Self-review

Run this checklist against the spec before declaring the plan done:

**Spec coverage:**

| Spec section | Task(s) |
| --- | --- |
| Backend image build | Tasks 1, 2 |
| Frontend image build | Tasks 3, 4, 5 |
| DB provisioning + bootstrap | Task 6 (SQL), Task 10 (README) |
| Deploy compose | Task 7 |
| Env template + secrets model | Task 7, Task 11 (gitignore) |
| CI workflow | Task 8 |
| ADR | Task 9 |
| Deploy runbook | Task 10 |
| OPEN_THINGS follow-up | Task 12 |
| CLAUDE.md + doc polish | Task 13 |

No spec requirements are unmapped.

**Placeholder scan:** searched for "TBD", "TODO", "fill in" — none found.
`CHANGE_ME` inside `init-databases.sql` is intentional and explained.
`REPLACE_ME` inside `.env.staging.example` is intentional.

**Type consistency:** service names (`klassenzeit-backend-staging`,
`klassenzeit-frontend-staging`, `klassenzeit-migrate-staging`) match across
compose, Caddyfile (which we do not edit), and the health-check commands.
Image names (`ghcr.io/pgoell/klassenzeit-backend`,
`ghcr.io/pgoell/klassenzeit-frontend`) match across compose, CI workflow,
and ADR. Port numbers (3001 backend, 3000 frontend) match Caddyfile and
Dockerfile `EXPOSE` lines.

**Scope:** thirteen tasks, all bite-sized, no task spans multiple
subsystems. Plan fits one PR.
