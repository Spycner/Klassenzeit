# Auth Middleware Design

## Overview

Add Keycloak JWT authentication and multi-tenant authorization to the Loco backend. The middleware validates JWTs against Keycloak's JWKS endpoint, auto-creates users on first login, and provides extractors for identity and school-scoped access.

## Key Decisions

1. **Auto-create users on first login** — When a valid JWT arrives with an unknown `keycloak_id`, create the `app_user` record from token claims. No admin provisioning step required.
2. **DB-driven school scoping** — The JWT proves identity only. The active school comes from an `X-School-Id` request header, validated against `school_memberships` in the DB. Supports multi-school users.
3. **DB-driven roles** — Role comes from the `school_memberships.role` column for the active user+school pair. JWT `role` and `school_id` claims are ignored.
4. **JWKS caching with refresh-on-failure** — Fetch public keys at startup, cache them. On signature validation failure, fetch fresh keys once before rejecting. Handles key rotation with zero polling.

## Architecture

Three layers:

### 1. JWKS Client (`jwks.rs`)

- Fetches keys from `{keycloak_url}/realms/{realm}/protocol/openid-connect/certs`
- Stores keys in an `Arc<RwLock<JwkSet>>` for concurrent access
- On cache miss or validation failure: fetch fresh keys (at most once per failure)
- Uses `reqwest` for HTTP, `jsonwebtoken` for key decoding

### 2. Auth Middleware (`middleware.rs`)

Axum middleware layer applied to protected routes.

1. Extract `Authorization: Bearer <token>` header
2. Decode JWT header to get `kid` (key ID)
3. Look up signing key in cached JWKS (refresh if not found)
4. Validate signature, `exp`, `iss`, `aud`
5. Attach `AuthClaims` to request extensions

### 3. Extractors (`extractors.rs`)

**`AuthUser`** — For routes that need identity only.
- Reads `AuthClaims` from request extensions (set by middleware)
- Looks up `app_user` by `keycloak_id`
- If not found: auto-creates from claims (`keycloak_id`, `email`, `preferred_username` as display_name)
- Returns the `app_users::Model`

**`SchoolContext`** — For routes that need school-scoped access.
- Implies `AuthUser` (gets the user first)
- Reads `X-School-Id` header (UUID)
- Queries `school_memberships` for `user_id + school_id` where `is_active = true`
- Returns struct with `user: app_users::Model`, `school: schools::Model`, `role: String`
- Rejects with 403 if no active membership exists

## JWT Claims

Validated standard fields:
- `exp` — reject expired tokens
- `iss` — must equal `{keycloak_url}/realms/{realm}`
- `aud` — must contain the configured `client_id`

Extracted into `AuthClaims`:
- `sub` — keycloak_id (String, required)
- `email` — user email (String, required — Keycloak realm enforces email)
- `preferred_username` — display name (Option<String>, falls back to email if absent)

JWT `role` and `school_id` claims are present but **ignored** by the middleware.

## Configuration

New `keycloak` section in YAML configs:

```yaml
# development.yaml
keycloak:
  url: http://keycloak-dev:8080
  realm: klassenzeit
  client_id: klassenzeit-dev

# test.yaml
keycloak:
  url: http://localhost:0  # overridden by test fixtures
  realm: klassenzeit
  client_id: klassenzeit-test

# production.yaml (from env vars)
keycloak:
  url: {{get_env(name="KEYCLOAK_URL")}}
  realm: {{get_env(name="KEYCLOAK_REALM", default="klassenzeit")}}
  client_id: {{get_env(name="KEYCLOAK_CLIENT_ID")}}
```

The JWKS URL is derived: `{url}/realms/{realm}/protocol/openid-connect/certs`

Clean up the existing `auth.jwt` section (Loco scaffold leftover) since we use Keycloak instead.

## Error Responses

| Scenario | Status | Body |
|----------|--------|------|
| Missing/malformed Authorization header | 401 | `{"error": "missing or invalid authorization header"}` |
| Invalid/expired JWT | 401 | `{"error": "invalid token"}` |
| JWKS fetch failure | 502 | `{"error": "authentication service unavailable"}` |
| Missing `X-School-Id` header (SchoolContext) | 400 | `{"error": "missing X-School-Id header"}` |
| Invalid `X-School-Id` format | 400 | `{"error": "invalid school ID format"}` |
| No active membership for user+school | 403 | `{"error": "not a member of this school"}` |

## File Layout

```
backend/src/
  keycloak/
    mod.rs          — module exports
    config.rs       — KeycloakConfig struct, loaded from YAML
    jwks.rs         — JWKS client with caching + refresh-on-failure
    claims.rs       — AuthClaims struct, JWT decoding logic
    middleware.rs    — Axum middleware layer
    extractors.rs   — AuthUser, SchoolContext extractors
    errors.rs       — Auth error types → HTTP responses
```

## Dependencies

Add to `backend/Cargo.toml`:
- `jsonwebtoken = "9"` — JWT signature validation and decoding
- `reqwest = { version = "0.12", features = ["json"] }` — JWKS endpoint HTTP calls

## Testing Strategy

**No real Keycloak in tests.** All tests use a locally-generated RSA keypair.

### Unit Tests
- JWT validation: valid token, expired token, wrong issuer, wrong audience, malformed token
- JWKS cache: key lookup, refresh on unknown `kid`
- Claims extraction: all fields present, missing optional fields

### Integration Tests (in `tests/requests/`)
- Mock JWKS server (serve static JWKS JSON on a local port)
- Full request cycle: valid JWT → middleware → extractor → controller response
- Auto-create user: first request creates `app_user`, second reuses it
- School scoping: valid membership returns 200, no membership returns 403
- Missing `X-School-Id` returns 400
- Role extraction: verify correct role from `school_memberships`

### Test Helpers
- `test_keypair()` — generates RSA keypair for signing test JWTs
- `test_jwks_json()` — builds JWKS JSON from the test public key
- `mock_jwks_server()` — starts a local HTTP server serving the JWKS endpoint
- `create_test_jwt(claims)` — signs a JWT with the test private key

## Loco Integration

- Register the `keycloak` module as a Loco initializer in `app.rs` (loads config, starts JWKS client)
- Apply auth middleware to route groups in `app.rs` routes function
- Keep some routes public (health check, future webhook endpoints)

## Out of Scope

- Row-Level Security (RLS) in PostgreSQL — deferred to a later step as defense-in-depth
- Rate limiting on auth failures
- Token refresh/rotation (handled by frontend + Keycloak directly)
- Admin endpoints for user/membership management (Step 5)
