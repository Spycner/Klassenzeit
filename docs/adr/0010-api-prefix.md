# 0010: Uniform `/api` prefix on the backend

- **Status:** Accepted
- **Date:** 2026-04-19

## Context

The FastAPI app used to mount its routers at the root: `/auth/*`, `/subjects`,
`/teachers`, `/rooms`, `/week-schemes`, `/stundentafeln`, `/classes`, `/lessons`,
`/health`, `/openapi.json`, `/docs`, `/redoc`. Any reverse proxy (Vite in dev,
Caddy in staging) had to enumerate every top-level segment to split API traffic
from SPA traffic. The staging deploy shipped in PR #88 regressed because the
default `/api/*` matcher routed nothing, and the SPA fell back to `index.html`
on every backend call. A temporary `path_regexp` matcher on the VPS enumerated
each segment by hand to unblock the deploy.

## Decision

Mount every backend HTTP path under a single `/api` prefix: `/api/auth/*`,
`/api/subjects`, `/api/teachers`, `/api/rooms`, `/api/week-schemes`,
`/api/stundentafeln`, `/api/classes`, `/api/lessons`, plus `/api/health`,
`/api/openapi.json`, `/api/docs`, and `/api/redoc`. The `/__test__/*` router
stays at root because it is an internal Playwright readiness surface that
must never flow through the public `/api/*` path.

## Alternatives considered

- **`app.mount("/api", sub_app)`:** A sub-application has its own OpenAPI
  schema and bypasses parent middleware. The type-generation pipeline dumps
  the parent app's schema, which would miss every mounted route. Rejected.
- **Add `/api` to every leaf router prefix:** Duplicates the literal across
  eight modules and makes a future prefix change a sweep. Rejected.
- **Dual-mount old and new paths for one release:** No external API consumer
  exists, so the transition cost buys nothing. Rejected.

## Consequences

- Reverse proxies (Vite dev, Caddy) match one glob. Adding a new backend
  route no longer requires a proxy change.
- The Caddyfile in `~/Code/server-infra` can revert from its temporary
  `path_regexp` matcher back to `handle /api/* { reverse_proxy ... }`.
- Existing documentation that references unprefixed paths is inaccurate; the
  architecture and authentication docs now show the prefix.
- `mise run fe:types` regenerates the frontend OpenAPI client from the new
  schema; all `client.METHOD("/...")` call sites updated accordingly.
- The staging compose healthcheck now curls `/api/health` internally.
