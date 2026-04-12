# Authentication Design

**Date:** 2026-04-12
**Status:** Approved (design)
**Scope:** Self-rolled cookie-session authentication for the Klassenzeit backend — user model, session management, admin user CRUD, CLI bootstrap, password validation, rate limiting. No frontend; no email infrastructure.

## Goals

1. Protect backend endpoints with authentication: logged-in or not, admin or regular user.
2. Cookie-session auth with server-side session table — simple revocation, no JWT complexity.
3. Closed, invite-only system: admins create users, no self-service signup.
4. CLI command to bootstrap the first admin account.
5. Sensible password validation: minimum length + common-password blocklist, no composition rules.
6. In-process login rate limiting to prevent brute-force on known emails.
7. Integration tests against real Postgres, consistent with the db-layer spec's test isolation strategy.

## Non-goals

- **Email sending** (SMTP, Resend, SendGrid) and any flow that needs it (self-service password reset, email verification, invite links).
- **MFA / TOTP / passkeys.**
- **OAuth / OIDC / social login.**
- **Self-service registration.**
- **Per-IP rate limiting** — defer to reverse proxy (Caddy) or external service (Cloudflare, fail2ban).
- **Admin UI / frontend.** Admin endpoints are API-only until a frontend spec lands.
- **Audit log** beyond `last_login_at`.
- **Password breach check** (HIBP API). Offline blocklist only.
- **Session cleanup cron.** Manual `mise run auth:cleanup-sessions` task; no in-process background job.

## Data model

Two new tables. The `_ping` probe table (from the db-layer spec) is dropped in the same migration.

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` server default |
| `email` | `VARCHAR(320)` | Unique, lowercased on write, login identifier |
| `password_hash` | `VARCHAR(256)` | Argon2id output |
| `role` | `VARCHAR(16)` | `'admin'` or `'user'`, default `'user'` |
| `is_active` | `BOOLEAN` | Default `true`. Deactivated users can't log in; soft-delete semantics |
| `force_password_change` | `BOOLEAN` | Default `false`. Set `true` by admin-reset; user must change on next login |
| `last_login_at` | `TIMESTAMPTZ` | Nullable, updated on successful login |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Server default `now()`, updated on every write |

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, the session token stored in the cookie |
| `user_id` | `UUID` | FK → `users.id`, indexed |
| `created_at` | `TIMESTAMPTZ` | Server default `now()` |
| `expires_at` | `TIMESTAMPTZ` | Absolute expiry, set at creation (`now() + session_ttl_days`) |

### Key decisions

- **UUID PKs** over serial ints — non-guessable, safe in URLs and cookies.
- **Argon2id** for password hashing (PHC winner, modern default). Library: `argon2-cffi`.
- **No username column** — email is the identifier. Closed system, admin creates accounts.
- **`is_active`** instead of hard-delete — lets admins disable accounts without cascading deletes to future FK relationships.
- **`force_password_change`** — so admin-reset gives a temporary password the user must change on first login.
- **Session table** over signed cookies — revocation is `DELETE FROM sessions WHERE id = ...`. No denylist gymnastics.
- **Absolute expiry only** (14 days, configurable). No sliding window — simpler, and a closed system with ~dozens of users doesn't need forever-sessions.

### Migration

Single Alembic migration: drops `ping` table, creates `users` + `sessions`. The db-layer spec explicitly says `_ping` is deleted by the first feature spec that adds a real model.

## Auth endpoints

All routes under `/auth`. No API versioning prefix (that's an API-surface spec concern).

### Public

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/auth/login` | `{email, password}` | `204` + `Set-Cookie` | Creates session row, sets cookie |

### Authenticated (any role)

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| `POST` | `/auth/logout` | — | `204` + clear cookie | Deletes session row |
| `GET` | `/auth/me` | — | `200 {id, email, role, force_password_change}` | Current user info |
| `POST` | `/auth/change-password` | `{current_password, new_password}` | `204` | Clears `force_password_change`, invalidates all other sessions |

### Admin-only

| Method | Path | Body / Params | Success | Notes |
|---|---|---|---|---|
| `POST` | `/auth/admin/users` | `{email, password, role?}` | `201 {id, email, role}` | Create a user |
| `GET` | `/auth/admin/users` | query: `?active=true\|false` (optional, omit for all) | `200 [{id, email, role, is_active, last_login_at}]` | List users |
| `POST` | `/auth/admin/users/{id}/reset-password` | `{new_password}` | `204` | Sets `force_password_change=true`, kills all user's sessions |
| `POST` | `/auth/admin/users/{id}/deactivate` | — | `204` | Sets `is_active=false`, kills all user's sessions |
| `POST` | `/auth/admin/users/{id}/activate` | — | `204` | Sets `is_active=true` |

## Cookie shape

- **Name:** `kz_session`
- **Value:** session UUID (opaque token)
- **`HttpOnly`:** always
- **`SameSite`:** `Lax`
- **`Secure`:** configurable via `KZ_COOKIE_SECURE` (default `true`, set `false` in dev)
- **`Path`:** `/`
- **`Max-Age`:** `1209600` (14 days, matching session table expiry)

## FastAPI auth dependencies

**`get_current_user`:** Reads the `kz_session` cookie → looks up session row (checks `expires_at > now()`) → loads user (checks `is_active`) → returns `User` model or raises `401 Unauthorized`.

**`require_admin`:** Wraps `get_current_user`, checks `role == 'admin'` or raises `403 Forbidden`.

Routes declare dependencies explicitly:

```python
# Any authenticated user
@router.get("/auth/me")
async def auth_me(user: Annotated[User, Depends(get_current_user)]) -> ...:

# Admin only
@router.post("/auth/admin/users")
async def create_user(user: Annotated[User, Depends(require_admin)]) -> ...:
```

## Password validation

NIST 800-63B-aligned. No composition rules.

- **Minimum length:** 12 characters (configurable via `KZ_PASSWORD_MIN_LENGTH`).
- **Maximum length:** 128 characters (prevents DoS via argon2 on very large inputs).
- **Common-password blocklist:** ~10k entries from the SecLists "10k most common" list, trimmed to entries >= minimum length. Bundled as `klassenzeit_backend/auth/common_passwords.txt`, loaded once at startup as a `frozenset`, checked via set lookup.
- **No composition rules.** No "must have 1 uppercase, 1 number, 1 special character". A 20-char lowercase passphrase is stronger than `P@ssw0rd!`.

Validation runs on: user creation (admin endpoint), password reset (admin endpoint), password change (self-service endpoint), CLI `create-admin`.

## Rate limiting on login

In-process per-email counter. No external infrastructure.

- **Threshold:** 5 failed attempts in 15 minutes locks that email for 15 minutes. Configurable via `KZ_LOGIN_MAX_ATTEMPTS` and `KZ_LOGIN_LOCKOUT_MINUTES`.
- **Storage:** In-memory `dict[str, list[datetime]]` mapping email to timestamps of failed attempts. Pruned lazily on each check.
- **Reset:** Counter clears on successful login.
- **Response:** Locked-out login attempts return `429 Too Many Requests` with a `Retry-After` header.
- **Email enumeration prevention:** Login always returns the same error shape (`401`) for "wrong password" and "no such email". The rate limiter still counts attempts against non-existent emails to prevent timing-based enumeration.
- **Limitation:** Process restart clears all counters. Acceptable for single-process backend with ~dozens of users.

## CLI bootstrap command

```
uv run klassenzeit-backend create-admin --email admin@example.com
```

- Prompts for password on stdin (no `--password` flag — avoids shell history leaking secrets).
- Validates email format, password against the same validation rules (min length, blocklist).
- Hashes with argon2id, inserts into `users` with `role='admin'`.
- If email already exists: error, no upsert.
- Requires `KZ_DATABASE_URL` to be set (reads from `.env` via same `Settings` class).

**Implementation:** `typer` app in `klassenzeit_backend/cli.py`. Entry point registered in `backend/pyproject.toml`:

```toml
[project.scripts]
klassenzeit-backend = "klassenzeit_backend.cli:main"
```

**`mise.toml` task:**

```toml
[tasks."auth:create-admin"]
description = "Create an admin user (prompts for password)"
run = "cd backend && uv run klassenzeit-backend create-admin"
```

## Settings additions

New fields in the `Settings` class (`klassenzeit_backend/core/settings.py`):

```python
# Auth / cookies
cookie_secure: bool = True              # KZ_COOKIE_SECURE
cookie_domain: str | None = None        # KZ_COOKIE_DOMAIN
session_ttl_days: int = 14              # KZ_SESSION_TTL_DAYS

# Password validation
password_min_length: int = 12           # KZ_PASSWORD_MIN_LENGTH

# Login rate limiting
login_max_attempts: int = 5             # KZ_LOGIN_MAX_ATTEMPTS
login_lockout_minutes: int = 15         # KZ_LOGIN_LOCKOUT_MINUTES
```

**`.env.example` additions:**

```bash
# Auth
KZ_COOKIE_SECURE=false
KZ_SESSION_TTL_DAYS=14
KZ_PASSWORD_MIN_LENGTH=12
KZ_LOGIN_MAX_ATTEMPTS=5
KZ_LOGIN_LOCKOUT_MINUTES=15
```

**`.env.test` additions:**

```bash
KZ_COOKIE_SECURE=false
KZ_SESSION_TTL_DAYS=1
KZ_LOGIN_MAX_ATTEMPTS=5
KZ_LOGIN_LOCKOUT_MINUTES=15
```

## File layout

### New files

```
backend/src/klassenzeit_backend/
├── auth/
│   ├── __init__.py
│   ├── passwords.py          # hash_password, verify_password, validate_password
│   ├── sessions.py           # create_session, lookup_session, delete_session, cleanup_expired
│   ├── dependencies.py       # get_current_user, require_admin
│   ├── rate_limit.py         # LoginRateLimiter (in-memory per-email counter)
│   ├── common_passwords.txt  # bundled blocklist (~10k entries)
│   └── routes/
│       ├── __init__.py       # auth_router collecting all sub-routers
│       ├── login.py          # POST /auth/login, POST /auth/logout
│       ├── me.py             # GET /auth/me, POST /auth/change-password
│       └── admin.py          # POST /auth/admin/users, GET, reset, de/activate
├── cli.py                    # typer app, create-admin command
├── db/models/
│   ├── __init__.py           # re-exports User, Session (removes Ping re-export)
│   ├── user.py               # User model
│   └── session.py            # Session model (the DB model, not HTTP session)
```

### Modified files

- `backend/src/klassenzeit_backend/main.py` — include `auth_router`, add rate limiter to `app.state`
- `backend/src/klassenzeit_backend/core/settings.py` — new auth settings fields
- `backend/src/klassenzeit_backend/db/models/__init__.py` — swap `Ping` for `User` + `Session`
- `backend/pyproject.toml` — `[project.scripts]` entry point
- `backend/.env.example` — new `KZ_*` auth vars
- `backend/.env.test` — new `KZ_*` auth vars
- `mise.toml` — `auth:create-admin` and `auth:cleanup-sessions` tasks

### Deleted files

- `backend/src/klassenzeit_backend/db/models/_ping.py`
- `backend/tests/db/test_ping.py` (replaced by auth tests)

## Testing

All tests hit real Postgres via the existing `db_session` / `client` fixture pattern from the db-layer spec.

| Test file | Coverage |
|---|---|
| `test_passwords.py` | Hash round-trip, blocklist rejection, min/max length enforcement, no composition rules enforced (long lowercase passes) |
| `test_login.py` | Happy login → 204 + cookie set, wrong password → 401, inactive user → 401, rate limiting kicks in after N failures → 429, lockout expires → login works again |
| `test_logout.py` | Logout → 204 + session deleted + cookie cleared, double-logout → 401, no cookie → 401 |
| `test_me.py` | Authenticated → 200 with user info, no cookie → 401, expired session → 401, `force_password_change` field present |
| `test_change_password.py` | Happy path → 204 + `force_password_change` cleared, wrong current password → 401, new password too short → 422, other sessions invalidated |
| `test_admin_users.py` | Create user → 201, duplicate email → 409, list users (with active filter), reset password (sets force flag + kills sessions), deactivate (kills sessions + login fails), activate (login works), non-admin → 403 |
| `test_cli.py` | `create-admin` happy path (user exists in DB after), duplicate email → error exit, password too short → error exit |

### Test helpers

A `create_test_user` helper function in `tests/auth/conftest.py` that creates a user with a known password and returns both the `User` object and the plaintext password. Used across test files to avoid repeating user-creation boilerplate.

A `login` helper that calls `POST /auth/login` and returns the client with cookies set. Used in tests that need an authenticated session as a precondition.

## Documentation updates

- **`docs/architecture/database.md`** — add `users` and `sessions` table descriptions.
- **`docs/architecture/authentication.md`** (new) — contributor reference: how auth works, cookie shape, how to add a protected route, how to add a new admin endpoint, how the rate limiter works, how to bootstrap the first admin.
- **`docs/adr/0006-self-rolled-cookie-session-auth.md`** (new) — decision: self-rolled cookie-session over JWT, Keycloak, and third-party hosted. Context: closed system with ~dozens of users, no mobile clients, single backend. Consequences: we own password storage security, revocation is trivial, no external dependency; MFA/OAuth are future work if needed.
- **`CONTRIBUTING.md`** — new "Authentication" section pointing at `docs/architecture/authentication.md`.
- **`docs/superpowers/OPEN_THINGS.md`** — remove "Authentication" from "Product capabilities", add deferred items: MFA/TOTP, email-based password reset, session cleanup cron, password breach check (HIBP), audit log, per-IP rate limiting.

## Definition of done

1. `mise run db:migrate` applies the migration (drops `ping`, creates `users` + `sessions`).
2. `mise run auth:create-admin -- --email admin@test.com` creates an admin (prompts for password).
3. `POST /auth/login` with valid credentials returns `204` with `kz_session` cookie.
4. `GET /auth/me` with valid cookie returns user info.
5. `POST /auth/logout` clears the session.
6. `POST /auth/change-password` works and clears `force_password_change`.
7. Admin endpoints create/list/reset/deactivate/activate users; non-admin gets `403`.
8. Rate limiter returns `429` after 5 failed login attempts.
9. Password validation rejects short passwords and common passwords, accepts long passphrases without special characters.
10. `mise run test:py` passes with all new auth tests.
11. `mise run lint` passes with no new warnings.
12. `GET /health` still returns `{"status": "ok", "solver_check": "ok"}`.
13. Docs updated: `authentication.md`, `database.md`, ADR 0006, CONTRIBUTING, OPEN_THINGS.

## Deferred to OPEN_THINGS

- **MFA / TOTP / passkeys.** Add when the threat model warrants it.
- **Email-based password reset.** Requires email sending infrastructure; add when email is needed for other features too.
- **Session cleanup cron / background job.** `mise run auth:cleanup-sessions` exists as a manual task; automate later.
- **Password breach check (HIBP).** Offline blocklist is the baseline; online check against HIBP k-anonymity API is a nice-to-have.
- **Audit log.** `last_login_at` is the only tracking. Full audit log (who changed what, when) is a separate concern.
- **Per-IP rate limiting.** Defer to reverse proxy (Caddy) or external service. In-process limiter covers per-email only.
- **OAuth / OIDC / social login.** Not needed for a closed system.
- **Self-service registration.** Not needed for a closed system.

## Open questions resolved during brainstorming

- **Identity source** — self-rolled (in-app). Keycloak rejected (ops overhead for a rebuilt project), third-party rejected (vendor dependency the user wants to avoid).
- **Session model** — cookie-session with server-side table. JWT rejected (revocation complexity, localStorage footgun, unnecessary for single-backend monolith).
- **Signup model** — closed / invite-only. Open signup rejected (pulls in email verification, captchas, anti-spam — unnecessary for a school scheduling app).
- **Roles** — two: `admin` and `user`. Single role rejected (need to gate user-management endpoints). Three+ roles rejected (YAGNI — can add finer roles later).
- **Password reset** — admin-only. Self-service email reset rejected (requires email infrastructure not yet justified).
- **First admin bootstrap** — CLI command. Env-var seed rejected (plaintext password in env file). Alembic data migration rejected (secrets in git).
- **Password validation** — NIST 800-63B: min length + common blocklist, no composition rules. Traditional composition rules rejected (security theater per NIST).
- **CLI framework** — typer (wraps click). User preference.
