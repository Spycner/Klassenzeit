# Authentication

## Overview

Self-rolled cookie-session authentication. Closed, invite-only system with two roles: `admin` and `user`.

## How it works

1. Admin creates a user via `POST /api/auth/admin/users` (or CLI `create-admin` for the first admin).
2. User logs in via `POST /api/auth/login` with email + password.
3. Backend validates credentials, creates a row in the `sessions` table, returns a `kz_session` cookie.
4. Subsequent requests include the cookie. The `get_current_user` dependency reads it, looks up the session, loads the user.
5. Logout deletes the session row and clears the cookie.

## Cookie shape

| Attribute | Value |
|---|---|
| Name | `kz_session` |
| Value | Session UUID |
| HttpOnly | always |
| SameSite | Lax |
| Secure | `KZ_COOKIE_SECURE` (default true, false in dev) |
| Path | `/` |
| Max-Age | `KZ_SESSION_TTL_DAYS * 86400` |

## Adding a protected route

```python
from typing import Annotated
from fastapi import Depends
from klassenzeit_backend.auth.dependencies import get_current_user, require_admin
from klassenzeit_backend.db.models.user import User

# Any authenticated user
@router.get("/my-route")
async def my_route(user: Annotated[User, Depends(get_current_user)]) -> ...:
    ...

# Admin only
@router.post("/admin-route")
async def admin_route(admin: Annotated[User, Depends(require_admin)]) -> ...:
    ...
```

## Password policy

- Minimum 12 characters (configurable via `KZ_PASSWORD_MIN_LENGTH`)
- Maximum 128 characters
- Checked against a common-password blocklist
- No composition rules (no uppercase/number/special requirements)

## Rate limiting

In-memory per-email counter. 5 failed attempts in 15 minutes locks that email for 15 minutes. Process restart clears counters.

## Bootstrapping the first admin

```bash
mise run auth:create-admin -- --email admin@example.com
```

Prompts for password on stdin. Validates email format and password against the same rules.

## Settings

All auth settings use the `KZ_` prefix:

| Setting | Default | Purpose |
|---|---|---|
| `KZ_COOKIE_SECURE` | `true` | Secure flag on cookie |
| `KZ_COOKIE_DOMAIN` | (none) | Domain attribute on cookie |
| `KZ_SESSION_TTL_DAYS` | `14` | Session expiry |
| `KZ_PASSWORD_MIN_LENGTH` | `12` | Minimum password length |
| `KZ_LOGIN_MAX_ATTEMPTS` | `5` | Failed attempts before lockout |
| `KZ_LOGIN_LOCKOUT_MINUTES` | `15` | Lockout duration |
