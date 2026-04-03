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

## Keycloak (Auth)

The dev environment runs a local Keycloak instance (port 8080) with the `klassenzeit` realm auto-imported on first boot. No manual configuration needed.

### Admin UI

- URL: `http://localhost:8080`
- Credentials: `admin` / `admin`

### Seed Users

All users share password `test1234` and belong to the same test school:

| Email | Role | school\_id |
|-------|------|-----------|
| `admin@test.com` | admin | `00000000-0000-0000-0000-000000000001` |
| `teacher@test.com` | teacher | `00000000-0000-0000-0000-000000000001` |
| `viewer@test.com` | viewer | `00000000-0000-0000-0000-000000000001` |

### JWT Claims

Tokens issued by Keycloak include custom claims:
- `school_id` — the user's school UUID
- `role` — array of realm roles (e.g. `["admin"]`)

### Staging / Production

Staging and prod use the shared Keycloak at `https://klassenzeit-auth.pascalkraus.com`. One-time setup:

```bash
export KEYCLOAK_ADMIN_URL="https://klassenzeit-auth.pascalkraus.com"
export KEYCLOAK_ADMIN_USER="admin"
export KEYCLOAK_ADMIN_PASSWORD="<from server-infra/.env.local>"
./docker/keycloak/setup-realm.sh staging
./docker/keycloak/setup-realm.sh prod
```

The script is idempotent — safe to re-run.
