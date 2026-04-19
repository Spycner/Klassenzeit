# 0009: Deployment topology for the staging tier

- **Status:** Accepted
- **Date:** 2026-04-19

## Context

The Hetzner VPS already runs a Caddy reverse proxy (with Cloudflare ACME DNS
challenge), a shared Postgres 17, and a Keycloak instance on a Docker network
named `web`. The Caddyfile declares route blocks for
`klassenzeit-staging.pascalkraus.com` and `klassenzeit.pascalkraus.com` that
expect services named `klassenzeit-backend-staging:3001`,
`klassenzeit-frontend-staging:3000`, `klassenzeit-backend-prod:3001`, and
`klassenzeit-frontend-prod:3000`. No such services existed, no Dockerfile
existed in this repo, no CI step published images, and the shared Postgres's
`init-databases.sql` mount pointed at a path in this repo that did not
contain the file.

## Decision

Ship the staging slot via GHCR-published container images built by a new
GitHub Actions workflow, a compose file in `deploy/` that joins the external
`web` network, and a one-shot migrate container that runs `alembic upgrade
head` before the backend starts. The backend image is a multi-stage uv +
Rust build (maturin compiles the `klassenzeit-solver` PyO3 wheel), the
frontend image is a pnpm build piped into nginx:alpine. The frontend ships
relative `/api/*` URLs so one bundle serves every environment. Session
cookies stay host-scoped to `klassenzeit-staging.pascalkraus.com`. VPS
updates are manual: `docker compose pull && docker compose up -d`.

## Alternatives considered

- **Build images on the VPS.** Rejected: backend build needs Rust, which
  would force the toolchain onto the server and make every deploy slow.
- **Single `alembic upgrade head && uvicorn` CMD.** Rejected: couples
  migrations to app boot, so migration failures would surface as boot
  failures and block horizontal scale-out.
- **Backend Docker serving its own static files.** Rejected: couples
  frontend deploys to backend deploys and muddies the build pipeline.
- **Docker secrets or Vault.** Rejected: overkill for single-host compose.
  The env file lives on the VPS, out of git.
- **Add a third `dev` subdomain.** Rejected: staging is the pre-prod slot
  by convention and the Caddy block already exists. Three tiers before
  shipping even one is premature.

## Consequences

Contributors other than pgoell can deploy simply by pushing to `master`.
The first cold build of the backend image takes about five minutes because
of rustup, CI caches the layer via `type=gha,scope=backend`. GHCR packages
default to private, so the first deploy needs the owner to either make the
images public or grant a pull PAT to the VPS. Rollback is one env-var
change: flip `KZ_IMAGE_TAG` in `.env.staging` to a known-good `sha-<short>`
tag and rerun the pull + up. The `init-databases.sql` mount path in
server-infra is an absolute host path pointing into this repo; that
cross-repo coupling is tracked as a follow-up in
`docs/superpowers/OPEN_THINGS.md`.
