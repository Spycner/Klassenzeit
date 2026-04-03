# Keycloak Realm Setup — Design Spec

## Overview

Set up the `klassenzeit` Keycloak realm across all environments (dev, staging, prod) to provide JWT-based authentication with multi-tenancy support via `school_id` claims.

## Environments

| Environment | Keycloak Instance | Client ID | Setup Method |
|-------------|-------------------|-----------|--------------|
| Dev | Local Docker container (port 8080) | `klassenzeit-dev` | Realm JSON import on startup |
| Staging | `https://klassenzeit-auth.pascalkraus.com` | `klassenzeit-staging` | Admin REST API script |
| Prod | `https://klassenzeit-auth.pascalkraus.com` | `klassenzeit-prod` | Admin REST API script |

Dev uses an isolated local Keycloak to keep test data off the shared instance and allow offline development.

## Realm Configuration

- **Realm name**: `klassenzeit`
- **SSL required**: `none` for dev, `external` for staging/prod
- **Brute force protection**: disabled in dev, enabled in staging/prod
- **Supported locales**: `en`, `de`
- **Token lifetimes**: access token 5min, refresh token 30min

## Clients

All clients use **Authorization Code flow with PKCE** (public SPA clients, no client secret).

| Client | Redirect URIs | Direct Access Grants |
|--------|---------------|----------------------|
| `klassenzeit-dev` | `http://localhost:3000/*` | Enabled (for test automation) |
| `klassenzeit-staging` | `https://klassenzeit-staging.pascalkraus.com/*` | Disabled |
| `klassenzeit-prod` | `https://klassenzeit.pascalkraus.com/*` | Disabled |

## Roles

Three realm-level roles, assigned directly to users (no groups or composite roles):

- `admin` — full access, can manage school settings and members
- `teacher` — can view and edit timetables for their school
- `viewer` — read-only access to timetables

## Custom JWT Claims

Two protocol mappers (configured at realm level so they apply to all clients):

### `school_id` mapper
- **Type**: User Attribute
- **User attribute**: `school_id`
- **Token claim name**: `school_id`
- **Claim JSON type**: String
- **Added to**: ID token, access token, userinfo

### `realm_roles` mapper
- **Type**: User Realm Role
- **Token claim name**: `role`
- **Multivalued**: true
- **Added to**: ID token, access token

## Multi-tenancy Model

- Each user has a single `school_id` user attribute in Keycloak
- The `school_id` is included as a JWT claim on every token
- Backend middleware extracts `school_id` from the JWT and scopes all queries (implemented in Step 3)
- If a user needs to move schools, their `school_id` attribute is updated in Keycloak

## Dev Seed Users

Pre-configured in the realm export, all pre-verified (no email verification in dev):

| Email | Password | Role | school_id |
|-------|----------|------|-----------|
| `admin@test.com` | `test1234` | admin | `00000000-0000-0000-0000-000000000001` |
| `teacher@test.com` | `test1234` | teacher | `00000000-0000-0000-0000-000000000001` |
| `viewer@test.com` | `test1234` | viewer | `00000000-0000-0000-0000-000000000001` |

No seed users on staging/prod.

## Deliverables

1. **`docker/keycloak/klassenzeit-realm.json`** — full realm export for dev, imported on container startup via `--import-realm`
2. **`docker-compose.yml` update** — mount realm JSON and configure import
3. **`docker/keycloak/setup-realm.sh`** — idempotent script using Keycloak Admin REST API to configure staging/prod (creates realm, client, roles, mappers)
4. **Run the setup script** for both staging and prod environments

## Out of Scope

- Backend JWT validation middleware (Step 3)
- Frontend auth integration (Step 4)
- Row-Level Security policies (Step 3)
- User registration flows (users are created by admins or self-service later)
