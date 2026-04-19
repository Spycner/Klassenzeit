# Klassenzeit dev deployment (staging tier)

Spec date: 2026-04-19
Status: accepted
Owner: pgoell

## Motivation

Klassenzeit has shipped enough frontend and backend surface that a reviewable, always-on
URL is useful. There is no container image, no CI image-publishing step, and no compose
file that would let the Hetzner VPS in `/home/pascal/Code/server-infra/` actually run the
app. The server-infra Caddyfile already declares `klassenzeit-staging.pascalkraus.com`
and `klassenzeit.pascalkraus.com` routes pointing at `klassenzeit-backend-staging:3001`,
`klassenzeit-frontend-staging:3000`, and the matching `-prod` names, but no service ever
answers those names: the routes are dangling placeholders. Similarly, the shared
`postgres:17-alpine` service mounts `/home/pascal/Code/Klassenzeit/docker/postgres/init-databases.sql`
into its `docker-entrypoint-initdb.d/`, and that file does not exist on disk.

This spec fills in the missing pieces so the staging subdomain becomes live.

## Goals

- Publish container images for the backend (Python + Rust solver) and the frontend
  (static SPA) to `ghcr.io/pgoell/klassenzeit-backend` and
  `ghcr.io/pgoell/klassenzeit-frontend` on every push to `master`, tagged `latest` and
  `sha-<short>`.
- Ship a `deploy/compose.yaml` in the Klassenzeit repo that the VPS can copy under
  `/home/pascal/kz-deploy/` and run against the external `web` Docker network. The
  compose defines `klassenzeit-migrate-staging`, `klassenzeit-backend-staging`, and
  `klassenzeit-frontend-staging` services matching the Caddyfile names.
- Provision a dedicated `klassenzeit_staging` Postgres role and database on the shared
  Postgres via a checked-in SQL init script at `docker/postgres/init-databases.sql`.
  Document a one-off bootstrap command for the already-running Postgres whose init
  scripts will never re-execute.
- Provide a `deploy/.env.staging.example` template and a `deploy/README.md` that walks
  through first-time setup (Caddyfile already ready), per-deploy update, and rollback.
- Run Alembic migrations as a one-shot container that exits before the backend starts,
  with `depends_on: condition: service_completed_successfully`.
- Frontend uses relative `/api/*` URLs so one build serves any environment.
- Add an ADR (`docs/adr/0001-deployment-topology.md`) capturing the load-bearing
  decisions (GHCR, nginx, separate migrate service, manual VPS pulls).

## Non-goals

- No production deployment. The `klassenzeit.pascalkraus.com` prod route in the Caddyfile
  stays dangling; we reuse the same artifacts later under a new env file and a new
  compose service name.
- No Keycloak integration. The backend keeps its local email-password flow. Wiring up
  OIDC against `klassenzeit-auth.pascalkraus.com` is a separate feature with its own
  spec.
- No server-infra repo changes. The Caddyfile entries already exist and the init SQL
  mount points at Klassenzeit. If any server-infra change becomes unavoidable during
  implementation, it ships as a separate out-of-band PR, not inside this branch.
- No new watcher, webhook, or autopull. VPS updates stay manual (three commands via the
  ttyd shell at `term.pascalkraus.com`).
- No SSH-from-CI deploy key. Defer until manual pull proves tedious.
- No CPU or memory limits in the compose.
- No multi-replica backend. Single instance per service. Migration service's
  `service_completed_successfully` guard is forward-compatible if we ever scale out.
- No Docker secrets, no HashiCorp Vault. One env file on the VPS, out of git.
- No image signing or attestation beyond whatever GHCR provides by default.
- No Dependabot config for the new Dockerfiles (separate follow-up if wanted).
- No change to local `compose.yaml`. Local dev still hits `localhost:5433` Postgres with
  credentials `klassenzeit/klassenzeit`.

## Stack

- Backend image base: `ghcr.io/astral-sh/uv:python3.13-bookworm-slim`.
  - Builder stage: installs `rustup`, `maturin` toolchain, runs `uv sync --frozen --no-dev`
    inside `/app`, producing a venv that contains the compiled `klassenzeit_solver` wheel.
  - Runtime stage: same base, copies `/app/.venv` and the `backend/` tree, sets
    `PATH="/app/.venv/bin:$PATH"`, runs `uvicorn klassenzeit_backend.main:app --host 0.0.0.0 --port 3001`.
- Frontend image base: `node:22-alpine` (builder) and `nginx:1.27-alpine` (runtime).
  - Builder stage: enables `corepack`, runs `pnpm install --frozen-lockfile`, runs
    `pnpm run build` (Vite output in `frontend/dist/`).
  - Runtime stage: copies `dist/` to `/usr/share/nginx/html`, drops in an
    SPA-friendly `nginx.conf` (fallback to `index.html`), listens on port 3000.
- Orchestration: Compose-v2 file syntax (Podman-compose compatible). Reuses external
  network `web` and external service `postgres` already running in server-infra.
- CI: new workflow `.github/workflows/deploy-images.yml`. Uses
  `docker/metadata-action`, `docker/login-action`, and `docker/build-push-action`.
  Permissions: `contents: read`, `packages: write`. Triggers: `push: [master]` and
  `workflow_dispatch`.
- Migration runner: `klassenzeit-migrate-staging` uses the backend image, overrides
  `command: ["alembic", "-c", "/app/backend/alembic.ini", "upgrade", "head"]`, and exits
  after running.
- Auth at the edge: Caddy continues to terminate HTTPS and route `/api/*` → backend,
  `/` → frontend. Unchanged.

## Directory layout delivered by this PR

```
Klassenzeit/
├── backend/
│   ├── Dockerfile                    # multi-stage Python + Rust + uv
│   └── .dockerignore
├── frontend/
│   ├── Dockerfile                    # multi-stage pnpm build → nginx
│   ├── nginx.conf                    # SPA fallback to /index.html
│   └── .dockerignore
├── deploy/
│   ├── compose.yaml                  # staging services, external web network
│   ├── .env.staging.example          # template, real file lives on VPS
│   └── README.md                     # first-time + per-deploy runbook
├── docker/
│   └── postgres/
│       └── init-databases.sql        # resolves the dangling server-infra mount
├── docs/
│   ├── adr/
│   │   ├── README.md                 # ADR index (if missing)
│   │   └── 0001-deployment-topology.md
│   └── superpowers/
│       ├── specs/2026-04-19-dev-deployment-design.md   # this file
│       └── plans/2026-04-19-dev-deployment.md          # implementation plan
└── .github/
    └── workflows/
        └── deploy-images.yml         # backend + frontend image publish
```

## Data flow

1. Developer pushes commits to `master` (or uses `workflow_dispatch`).
2. GitHub Actions `deploy-images.yml` builds both images in parallel, pushes to GHCR.
3. Admin SSHes into VPS (or uses ttyd), runs:
   ```
   cd /home/pascal/kz-deploy
   docker compose pull
   docker compose up -d
   ```
4. Compose starts `klassenzeit-migrate-staging`. It runs `alembic upgrade head` against
   the shared Postgres using the dedicated staging role and exits with status 0.
5. `klassenzeit-backend-staging` starts only after the migrate service exits 0, binds
   port 3001 on the `web` network.
6. `klassenzeit-frontend-staging` starts (independent of migrate), serves static assets
   on port 3000 of the `web` network.
7. User hits `https://klassenzeit-staging.pascalkraus.com/`, Caddy terminates TLS and
   proxies:
   - `/api/*` → `klassenzeit-backend-staging:3001`
   - everything else → `klassenzeit-frontend-staging:3000`.

## Image build details

### Backend image

```
# syntax=docker/dockerfile:1.9
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app

# Rust is needed to compile solver-py via maturin during uv sync.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
       | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

COPY pyproject.toml uv.lock ./
COPY backend/pyproject.toml backend/
COPY solver/ solver/
COPY backend/ backend/
RUN uv sync --frozen --no-dev --package klassenzeit-backend

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS runtime
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY backend/ backend/
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1
EXPOSE 3001
CMD ["uvicorn", "klassenzeit_backend.main:app", "--host", "0.0.0.0", "--port", "3001"]
```

- `.dockerignore` excludes `backend/.env`, `frontend/`, `node_modules`, `target/`,
  `docs/`, tests-only directories, and caches.
- Rust toolchain lives only in the builder stage. Runtime image carries the compiled
  `.so` via the `.venv`. Expected final image size < 450 MB.

### Frontend image

```
# syntax=docker/dockerfile:1.9
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/
WORKDIR /app/frontend
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 3000
```

`frontend/nginx.conf`:

```
server {
    listen 3000;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA: unknown paths fall through to index.html.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-cache hashed Vite assets.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Never cache the HTML entry, so new bundles propagate instantly.
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

## Compose file

`deploy/compose.yaml`:

```yaml
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
      test: ["CMD-SHELL", "python -c 'import urllib.request,sys; sys.exit(0 if urllib.request.urlopen(\"http://127.0.0.1:3001/health\").status == 200 else 1)'"]
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

`.env.staging.example` keys (no values checked in):

```
# Image tag to deploy. Override to a :sha-<hash> to rollback.
KZ_IMAGE_TAG=latest

# Full DSN. Host is the postgres container name on the web network.
KZ_DATABASE_URL=postgresql+psycopg://klassenzeit_staging:REPLACE_ME@postgres:5432/klassenzeit_staging

# Backend runtime config.
KZ_ENV=prod
KZ_COOKIE_SECURE=true
# Leave KZ_COOKIE_DOMAIN unset: cookie is host-only to klassenzeit-staging.pascalkraus.com.

# Pool sizing: same as local.
KZ_DB_POOL_SIZE=5
KZ_DB_MAX_OVERFLOW=10
KZ_DB_ECHO=false
```

## Database provisioning

`docker/postgres/init-databases.sql` runs on first Postgres container boot. It is
idempotent so re-running does not break anything:

```sql
-- Keycloak database (created on the already-running Postgres by hand, documented here
-- so future cold starts recreate it). OWNER reuses the superuser so KC_DB_USERNAME
-- stays pointed at the shared admin account declared in server-infra/.env.local.
SELECT 'CREATE DATABASE keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec

-- Dedicated staging role. Password is replaced out-of-band; the init script uses a
-- placeholder that must be rotated before the first real deploy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'klassenzeit_staging') THEN
    CREATE ROLE klassenzeit_staging LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END$$;

SELECT 'CREATE DATABASE klassenzeit_staging OWNER klassenzeit_staging'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'klassenzeit_staging')\gexec
```

For the current Postgres instance whose init scripts already ran (keycloak DB
populated), the deploy README includes a one-off bootstrap:

```bash
# 1. Generate a staging password locally (never re-used).
STAGING_PW=$(openssl rand -base64 24)

# 2. Create the role and DB on the running Postgres.
docker exec -i postgres psql -U "$POSTGRES_USER" <<SQL
CREATE ROLE klassenzeit_staging LOGIN PASSWORD '${STAGING_PW}';
CREATE DATABASE klassenzeit_staging OWNER klassenzeit_staging;
SQL

# 3. Write the DSN into /home/pascal/kz-deploy/.env.staging.
echo "KZ_DATABASE_URL=postgresql+psycopg://klassenzeit_staging:${STAGING_PW}@postgres:5432/klassenzeit_staging" \
  >> /home/pascal/kz-deploy/.env.staging
```

## CI workflow

`.github/workflows/deploy-images.yml`:

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

Both jobs use build contexts rooted at the repo top (`context: .`) so the Dockerfiles
can `COPY pyproject.toml uv.lock` and workspace layout cleanly.

## Runtime config

Backend env resolved per environment:

| Key | Local dev | Staging |
| --- | --- | --- |
| `KZ_DATABASE_URL` | `postgresql+psycopg://klassenzeit:klassenzeit@localhost:5433/klassenzeit_dev` | `postgresql+psycopg://klassenzeit_staging:<pw>@postgres:5432/klassenzeit_staging` |
| `KZ_ENV` | `dev` (default) | `prod` |
| `KZ_COOKIE_SECURE` | `false` (dev is HTTP) | `true` |
| `KZ_COOKIE_DOMAIN` | `None` | `None` (host-only, see Q18) |

Frontend: no env injection. Relative `/api/*` URLs work because Caddy routes
`klassenzeit-staging.pascalkraus.com/api/*` to the backend on the same origin. The
`api-client.ts` default base of `""` already produces relative URLs.

## Operational runbook (excerpted in `deploy/README.md`)

### First-time setup (one-time per VPS)

1. DNS: `klassenzeit-staging` A record already points at the VPS via Cloudflare. Caddy
   block already present in server-infra. Nothing to do.
2. `git clone git@github.com:pgoell/Klassenzeit.git` is not needed on the VPS. The VPS
   only needs the deploy dir:
   ```bash
   mkdir -p /home/pascal/kz-deploy
   scp deploy/compose.yaml vps:/home/pascal/kz-deploy/compose.yaml
   scp deploy/.env.staging.example vps:/home/pascal/kz-deploy/.env.staging
   ```
3. SSH to VPS (or use ttyd). Generate the staging DB role and database via the
   bootstrap command above. Paste the generated password into
   `/home/pascal/kz-deploy/.env.staging`.
4. `cd /home/pascal/kz-deploy && docker compose pull && docker compose up -d`.

### Per-deploy update

```bash
cd /home/pascal/kz-deploy
docker compose pull
docker compose up -d
```

Migration runs automatically, backend and frontend roll over.

### Rollback

```bash
cd /home/pascal/kz-deploy
sed -i 's/^KZ_IMAGE_TAG=.*/KZ_IMAGE_TAG=sha-<known-good>/' .env.staging
docker compose pull
docker compose up -d
```

### Logs

```bash
docker compose logs -f klassenzeit-backend-staging
docker compose logs -f klassenzeit-frontend-staging
docker compose logs klassenzeit-migrate-staging   # one-shot, no -f
```

## Testing strategy

- **Local smoke test (manual, documented in README).** `podman network create web` (one
  time), copy `.env.staging.example` to a real env file with a local Postgres DSN,
  `podman compose -f deploy/compose.yaml up`. Curl `http://127.0.0.1:3001/health`
  (after exposing the port via an override file or `podman inspect`). This is not a
  CI test.
- **Dockerfile sanity in CI.** `deploy-images.yml` pushes the built images to GHCR; a
  successful build equals "this will run on the VPS" for the static file set. Runtime
  failures surface on first deploy.
- **Migration reproducibility.** Existing CI `ci.yml` already runs Alembic via the mise
  tasks in a Postgres service. The migrate container reuses the same Alembic config,
  so CI green implies migrate-service green.
- **ADR lint.** `docs/adr/README.md` index pass is a trivial "does the file exist"
  check inside the lint step; no tooling added.
- **No new Python or JS tests.** Deployment artifacts are config and Dockerfiles.
  Adding tests that shell out to `docker build` would be slow and brittle in CI; the
  image publish workflow is the test.

## Risks and mitigations

- **Dangling `init-databases.sql` mount path.** We resolve it by creating the file, but
  server-infra still hardcodes a host path into a sibling repo. Follow-up lives in
  `OPEN_THINGS.md`.
- **Cookie domain drift when we add prod.** Spec Q18 chooses host-only. If prod and
  staging need shared cookies, switch to `.pascalkraus.com` and audit oauth2-proxy
  cookie collision (different name today, but the domain scope would match).
- **GHCR image visibility.** Packages default to private on first push. README
  includes a one-off "make package public" or "add deploy PAT" step.
- **Build cache growth.** `cache-to: type=gha,mode=max` can balloon. Mitigation: GH
  Actions cache is capped by repo, will evict oldest; monitor `Settings → Actions →
  Caches` once per quarter.
- **Rust toolchain install inside the backend builder is slow on a cold cache.** CI
  `cache-from/to: type=gha,scope=backend` keeps it hot between runs. First build will
  still take ~5 minutes.

## Follow-up work (not in this spec)

- Promote staging to prod by duplicating compose services with `-prod` suffix, pointing
  at `klassenzeit.pascalkraus.com`, and provisioning a `klassenzeit_prod` DB + role.
- Wire Klassenzeit backend to Keycloak OIDC realm on `klassenzeit-auth.pascalkraus.com`.
- Move the Postgres init-SQL mount source into the server-infra tree so there is no
  cross-repo absolute-path coupling.
- Add a `deploy/compose.dev.yaml` override for local smoke tests that publishes ports
  3000/3001 to the host.
- Consider SSH-from-CI auto-deploy once manual pulls become routine.
