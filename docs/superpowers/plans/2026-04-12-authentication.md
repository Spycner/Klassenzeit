# Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-rolled cookie-session authentication to the Klassenzeit backend — user model, session management, admin user CRUD, CLI bootstrap, password validation, rate limiting.

**Architecture:** Two new DB tables (`users`, `sessions`) replace the `_ping` probe. Auth state lives server-side; a `kz_session` cookie holds an opaque session UUID. Routes are split into public (login), authenticated (me, change-password, logout), and admin-only (user CRUD). A `LoginRateLimiter` on `app.state` throttles login brute-force. Settings and rate limiter are stored on `app.state` (same pattern as engine/session_factory). The CLI uses `typer` for the `create-admin` bootstrap command.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Alembic, argon2-cffi, typer, Postgres 17, pytest + httpx

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `backend/src/klassenzeit_backend/db/models/user.py` | `User` ORM model |
| `backend/src/klassenzeit_backend/db/models/session.py` | `UserSession` ORM model (DB session, not HTTP) |
| `backend/src/klassenzeit_backend/auth/__init__.py` | Package marker |
| `backend/src/klassenzeit_backend/auth/passwords.py` | `hash_password`, `verify_password`, `validate_password` |
| `backend/src/klassenzeit_backend/auth/common_passwords.txt` | Bundled ~10k blocklist |
| `backend/src/klassenzeit_backend/auth/rate_limit.py` | `LoginRateLimiter` (in-memory per-email) |
| `backend/src/klassenzeit_backend/auth/sessions.py` | `create_session`, `lookup_session`, `delete_session`, `delete_user_sessions`, `cleanup_expired_sessions` |
| `backend/src/klassenzeit_backend/auth/dependencies.py` | `get_current_user`, `require_admin` FastAPI deps |
| `backend/src/klassenzeit_backend/auth/routes/__init__.py` | `auth_router` collecting sub-routers |
| `backend/src/klassenzeit_backend/auth/routes/login.py` | `POST /auth/login`, `POST /auth/logout` |
| `backend/src/klassenzeit_backend/auth/routes/me.py` | `GET /auth/me`, `POST /auth/change-password` |
| `backend/src/klassenzeit_backend/auth/routes/admin.py` | Admin user CRUD routes |
| `backend/src/klassenzeit_backend/cli.py` | `typer` app, `create-admin` command |
| `backend/tests/auth/__init__.py` | Package marker |
| `backend/tests/auth/conftest.py` | `create_test_user`, `login_user` helpers |
| `backend/tests/auth/test_passwords.py` | Password hash/verify/validate tests |
| `backend/tests/auth/test_rate_limit.py` | Rate limiter tests |
| `backend/tests/auth/test_login.py` | Login/logout route tests |
| `backend/tests/auth/test_me.py` | Me/change-password route tests |
| `backend/tests/auth/test_admin.py` | Admin route tests |
| `backend/tests/auth/test_cli.py` | CLI command tests |
| `docs/architecture/authentication.md` | Living contributor reference |
| `docs/adr/0006-self-rolled-cookie-session-auth.md` | Decision record |

### Modified files

| File | Change |
|---|---|
| `backend/src/klassenzeit_backend/core/settings.py` | Add auth settings fields |
| `backend/src/klassenzeit_backend/db/models/__init__.py` | Replace `Ping` re-export with `User` + `UserSession` |
| `backend/src/klassenzeit_backend/main.py` | Add `auth_router`, store `settings` + `rate_limiter` on `app.state` |
| `backend/pyproject.toml` | Add `[project.scripts]` entry point |
| `backend/.env.example` | Add `KZ_COOKIE_SECURE`, etc. |
| `backend/.env.test` | Add `KZ_COOKIE_SECURE=false`, `KZ_SESSION_TTL_DAYS=1` |
| `backend/tests/conftest.py` | Update `client` fixture to set `app.state.settings` + `app.state.rate_limiter` |
| `backend/tests/db/test_models.py` | Replace Ping assertions with User + UserSession |
| `mise.toml` | Add `auth:create-admin`, `auth:cleanup-sessions` tasks |
| `docs/architecture/database.md` | Add `users` and `sessions` table docs |
| `docs/superpowers/OPEN_THINGS.md` | Remove "Authentication" bullet, add deferred items |
| `CONTRIBUTING.md` | Add "Authentication" section |

### Deleted files

| File | Reason |
|---|---|
| `backend/src/klassenzeit_backend/db/models/_ping.py` | Replaced by real models |
| `backend/tests/db/test_ping.py` | Replaced by auth tests; `test_health.py` already covers health endpoint |

---

### Task 1: Add dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add argon2-cffi**

Run from repo root:

```bash
uv add --package klassenzeit-backend argon2-cffi
```

- [ ] **Step 2: Add typer**

```bash
uv add --package klassenzeit-backend typer
```

- [ ] **Step 3: Verify deps resolve**

```bash
uv sync
```

Expected: clean sync, no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml uv.lock
git commit -m "build: add argon2-cffi and typer dependencies"
```

---

### Task 2: Extend Settings with auth config

**Files:**
- Modify: `backend/src/klassenzeit_backend/core/settings.py`
- Modify: `backend/tests/core/test_settings.py`
- Modify: `backend/.env.example`
- Modify: `backend/.env.test`

- [ ] **Step 1: Write failing test for auth settings**

Add to `backend/tests/core/test_settings.py`:

```python
def test_auth_settings_defaults(monkeypatch) -> None:
    monkeypatch.setenv(
        "KZ_DATABASE_URL",
        "postgresql+asyncpg://u:p@localhost:5432/kz",
    )
    settings = Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]

    assert settings.cookie_secure is True
    assert settings.cookie_domain is None
    assert settings.session_ttl_days == 14
    assert settings.password_min_length == 12
    assert settings.login_max_attempts == 5
    assert settings.login_lockout_minutes == 15


def test_auth_settings_from_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "KZ_DATABASE_URL",
        "postgresql+asyncpg://u:p@localhost:5432/kz",
    )
    monkeypatch.setenv("KZ_COOKIE_SECURE", "false")
    monkeypatch.setenv("KZ_COOKIE_DOMAIN", "example.com")
    monkeypatch.setenv("KZ_SESSION_TTL_DAYS", "7")
    monkeypatch.setenv("KZ_PASSWORD_MIN_LENGTH", "16")
    monkeypatch.setenv("KZ_LOGIN_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("KZ_LOGIN_LOCKOUT_MINUTES", "30")

    settings = Settings(_env_file=None)  # ty: ignore[missing-argument, unknown-argument]

    assert settings.cookie_secure is False
    assert settings.cookie_domain == "example.com"
    assert settings.session_ttl_days == 7
    assert settings.password_min_length == 16
    assert settings.login_max_attempts == 3
    assert settings.login_lockout_minutes == 30
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest backend/tests/core/test_settings.py::test_auth_settings_defaults -v
```

Expected: FAIL — `Settings` has no `cookie_secure` attribute.

- [ ] **Step 3: Add auth fields to Settings**

In `backend/src/klassenzeit_backend/core/settings.py`, add after the `db_echo` field:

```python
    # Auth
    cookie_secure: bool = True
    cookie_domain: str | None = None
    session_ttl_days: int = 14
    password_min_length: int = 12
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest backend/tests/core/test_settings.py -v
```

Expected: all pass.

- [ ] **Step 5: Update .env.example**

Append to `backend/.env.example`:

```bash

# Auth
KZ_COOKIE_SECURE=false
KZ_SESSION_TTL_DAYS=14
KZ_PASSWORD_MIN_LENGTH=12
KZ_LOGIN_MAX_ATTEMPTS=5
KZ_LOGIN_LOCKOUT_MINUTES=15
```

- [ ] **Step 6: Update .env.test**

Append to `backend/.env.test`:

```bash
KZ_COOKIE_SECURE=false
KZ_SESSION_TTL_DAYS=1
KZ_LOGIN_MAX_ATTEMPTS=5
KZ_LOGIN_LOCKOUT_MINUTES=15
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/core/settings.py backend/tests/core/test_settings.py backend/.env.example backend/.env.test
git commit -m "feat(auth): add auth settings to Settings class"
```

---

### Task 3: User model

**Files:**
- Create: `backend/src/klassenzeit_backend/db/models/user.py`
- Modify: `backend/tests/db/test_models.py`

- [ ] **Step 1: Write failing test for User model metadata**

Replace the Ping-specific tests in `backend/tests/db/test_models.py` with User tests. Full file:

```python
"""Tests for the model re-export surface and model metadata."""

from sqlalchemy import Boolean, DateTime, Integer, String

from klassenzeit_backend.db.base import Base
from klassenzeit_backend.db.models import User


def test_user_model_is_registered_on_metadata() -> None:
    assert "users" in Base.metadata.tables


def test_user_has_expected_columns() -> None:
    table = Base.metadata.tables["users"]

    id_col = table.c["id"]
    assert id_col.primary_key

    email_col = table.c["email"]
    assert email_col.unique
    assert isinstance(email_col.type, String)
    assert email_col.type.length == 320

    hash_col = table.c["password_hash"]
    assert isinstance(hash_col.type, String)
    assert hash_col.type.length == 256

    role_col = table.c["role"]
    assert isinstance(role_col.type, String)

    active_col = table.c["is_active"]
    assert isinstance(active_col.type, Boolean)

    force_col = table.c["force_password_change"]
    assert isinstance(force_col.type, Boolean)

    login_col = table.c["last_login_at"]
    assert isinstance(login_col.type, DateTime)
    assert login_col.type.timezone is True
    assert login_col.nullable is True

    created_col = table.c["created_at"]
    assert isinstance(created_col.type, DateTime)
    assert created_col.type.timezone is True
    assert created_col.server_default is not None

    updated_col = table.c["updated_at"]
    assert isinstance(updated_col.type, DateTime)
    assert updated_col.type.timezone is True
    assert updated_col.server_default is not None


def test_user_is_importable_from_models_package() -> None:
    assert User.__tablename__ == "users"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest backend/tests/db/test_models.py::test_user_model_is_registered_on_metadata -v
```

Expected: FAIL — `User` not importable from `klassenzeit_backend.db.models`.

- [ ] **Step 3: Create User model**

Create `backend/src/klassenzeit_backend/db/models/user.py`:

```python
"""User model for authentication."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    force_password_change: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
```

- [ ] **Step 4: Update models/__init__.py to export User**

Replace `backend/src/klassenzeit_backend/db/models/__init__.py` contents with:

```python
"""Model re-export surface.

Every new model file must be re-exported here. Alembic's ``env.py``
imports this package so ``Base.metadata`` is populated before
``target_metadata`` is read; models not re-exported are invisible to
autogenerate.
"""

from klassenzeit_backend.db.models.user import User

__all__ = ["User"]
```

(We'll add `UserSession` in the next task.)

- [ ] **Step 5: Run tests**

```bash
uv run pytest backend/tests/db/test_models.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/db/models/user.py backend/src/klassenzeit_backend/db/models/__init__.py backend/tests/db/test_models.py
git commit -m "feat(auth): add User model"
```

---

### Task 4: UserSession model

**Files:**
- Create: `backend/src/klassenzeit_backend/db/models/session.py`
- Modify: `backend/src/klassenzeit_backend/db/models/__init__.py`
- Modify: `backend/tests/db/test_models.py`

- [ ] **Step 1: Write failing test for UserSession model**

Add to `backend/tests/db/test_models.py`:

```python
from klassenzeit_backend.db.models import UserSession


def test_user_session_model_is_registered_on_metadata() -> None:
    assert "sessions" in Base.metadata.tables


def test_user_session_has_expected_columns() -> None:
    table = Base.metadata.tables["sessions"]

    id_col = table.c["id"]
    assert id_col.primary_key

    user_id_col = table.c["user_id"]
    assert user_id_col.nullable is False
    fk_names = [fk.target_fullname for fk in user_id_col.foreign_keys]
    assert "users.id" in fk_names

    created_col = table.c["created_at"]
    assert isinstance(created_col.type, DateTime)
    assert created_col.type.timezone is True

    expires_col = table.c["expires_at"]
    assert isinstance(expires_col.type, DateTime)
    assert expires_col.type.timezone is True


def test_user_session_is_importable_from_models_package() -> None:
    assert UserSession.__tablename__ == "sessions"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest backend/tests/db/test_models.py::test_user_session_model_is_registered_on_metadata -v
```

Expected: FAIL — `UserSession` not importable.

- [ ] **Step 3: Create UserSession model**

Create `backend/src/klassenzeit_backend/db/models/session.py`:

```python
"""Session model for cookie-based authentication.

Named ``UserSession`` to avoid confusion with SQLAlchemy's
``AsyncSession``. The table name remains ``sessions``.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func, text
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
```

- [ ] **Step 4: Update models/__init__.py**

```python
"""Model re-export surface.

Every new model file must be re-exported here. Alembic's ``env.py``
imports this package so ``Base.metadata`` is populated before
``target_metadata`` is read; models not re-exported are invisible to
autogenerate.
"""

from klassenzeit_backend.db.models.session import UserSession
from klassenzeit_backend.db.models.user import User

__all__ = ["User", "UserSession"]
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest backend/tests/db/test_models.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/db/models/session.py backend/src/klassenzeit_backend/db/models/__init__.py backend/tests/db/test_models.py
git commit -m "feat(auth): add UserSession model"
```

---

### Task 5: Migration — drop ping, create users + sessions

**Files:**
- New: `backend/alembic/versions/<autogenerated>_auth_tables.py`
- Delete: `backend/src/klassenzeit_backend/db/models/_ping.py`
- Delete: `backend/tests/db/test_ping.py`

- [ ] **Step 1: Delete _ping.py**

Delete `backend/src/klassenzeit_backend/db/models/_ping.py`.

- [ ] **Step 2: Delete test_ping.py**

Delete `backend/tests/db/test_ping.py`. The health endpoint is already tested by `backend/tests/test_health.py`.

- [ ] **Step 3: Generate migration**

```bash
mise run db:revision -- -m "drop ping, create users and sessions"
```

- [ ] **Step 4: Review the generated migration**

Open the generated file in `backend/alembic/versions/`. Verify it contains:
- `op.drop_table("ping")` in upgrade
- `op.create_table("users", ...)` with all columns, UUID PK with `gen_random_uuid()` default, unique constraint on email
- `op.create_table("sessions", ...)` with FK to `users.id`, index on `user_id`
- `op.create_index(...)` for `user_id` on sessions and `email` on users
- Downgrade reverses everything (drops sessions first due to FK, then users, then recreates ping)

Fix any issues in the generated migration by hand if needed.

- [ ] **Step 5: Apply migration to dev and test DBs**

```bash
mise run db:migrate
```

- [ ] **Step 6: Run remaining tests**

```bash
uv run pytest backend/tests/ -v
```

Expected: `test_health.py`, `test_settings.py`, `test_base.py`, `test_models.py` all pass. `test_ping.py` is gone.

- [ ] **Step 7: Commit**

```bash
git add -A backend/alembic/versions/ backend/src/klassenzeit_backend/db/models/ backend/tests/db/
git commit -m "feat(auth): migration drops ping, creates users and sessions tables"
```

---

### Task 6: Password module

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/__init__.py`
- Create: `backend/src/klassenzeit_backend/auth/passwords.py`
- Create: `backend/src/klassenzeit_backend/auth/common_passwords.txt`
- Create: `backend/tests/auth/__init__.py`
- Create: `backend/tests/auth/test_passwords.py`

- [ ] **Step 1: Create package markers**

Create empty `backend/src/klassenzeit_backend/auth/__init__.py` and `backend/tests/auth/__init__.py`.

- [ ] **Step 2: Write failing tests for password hashing and validation**

Create `backend/tests/auth/test_passwords.py`:

```python
"""Tests for password hashing and validation."""

import pytest

from klassenzeit_backend.auth.passwords import (
    PasswordValidationError,
    hash_password,
    validate_password,
    verify_password,
)


class TestHashAndVerify:
    def test_hash_roundtrip(self) -> None:
        password = "a-secure-passphrase"
        hashed = hash_password(password)
        assert hashed != password
        assert verify_password(password, hashed) is True

    def test_wrong_password_fails(self) -> None:
        hashed = hash_password("correct-password!")
        assert verify_password("wrong-password!!", hashed) is False

    def test_different_hashes_for_same_password(self) -> None:
        h1 = hash_password("same-password-here")
        h2 = hash_password("same-password-here")
        assert h1 != h2  # salt differs


class TestValidatePassword:
    def test_valid_long_lowercase_passphrase(self) -> None:
        validate_password("this is a long passphrase", min_length=12)

    def test_rejects_too_short(self) -> None:
        with pytest.raises(PasswordValidationError, match="at least 12"):
            validate_password("short", min_length=12)

    def test_rejects_too_long(self) -> None:
        with pytest.raises(PasswordValidationError, match="at most 128"):
            validate_password("x" * 129, min_length=12)

    def test_rejects_common_password(self) -> None:
        with pytest.raises(PasswordValidationError, match="too common"):
            validate_password("password123456", min_length=12)

    def test_no_composition_rules(self) -> None:
        # A 20-char lowercase passphrase passes — no uppercase/number/special required
        validate_password("twentycharslowercase!", min_length=12)

    def test_custom_min_length(self) -> None:
        validate_password("sixteencharsok!!", min_length=16)
        with pytest.raises(PasswordValidationError, match="at least 16"):
            validate_password("fifteencharsno", min_length=16)
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
uv run pytest backend/tests/auth/test_passwords.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 4: Download and prepare common passwords blocklist**

```bash
curl -sL "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt" \
  | awk 'length >= 12' \
  > backend/src/klassenzeit_backend/auth/common_passwords.txt
```

Verify the file has entries:

```bash
wc -l backend/src/klassenzeit_backend/auth/common_passwords.txt
```

Expected: several hundred to ~1-2k lines (only entries >= 12 chars from the 10k list).

- [ ] **Step 5: Implement passwords.py**

Create `backend/src/klassenzeit_backend/auth/passwords.py`:

```python
"""Password hashing and validation.

Hashing uses argon2id via argon2-cffi (PHC winner, modern default).
Validation follows NIST 800-63B: minimum length + common-password
blocklist, no composition rules.
"""

from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()

_COMMON_PASSWORDS: frozenset[str] | None = None


def _load_common_passwords() -> frozenset[str]:
    global _COMMON_PASSWORDS  # noqa: PLW0603
    if _COMMON_PASSWORDS is None:
        path = Path(__file__).parent / "common_passwords.txt"
        _COMMON_PASSWORDS = frozenset(
            line.strip().lower() for line in path.read_text().splitlines() if line.strip()
        )
    return _COMMON_PASSWORDS


class PasswordValidationError(ValueError):
    """Raised when a password fails validation rules."""


def validate_password(password: str, *, min_length: int = 12) -> None:
    """Validate password against length and blocklist rules.

    Raises ``PasswordValidationError`` on failure.
    """
    if len(password) < min_length:
        msg = f"Password must be at least {min_length} characters"
        raise PasswordValidationError(msg)
    if len(password) > 128:
        msg = "Password must be at most 128 characters"
        raise PasswordValidationError(msg)
    if password.lower() in _load_common_passwords():
        msg = "Password is too common"
        raise PasswordValidationError(msg)


def hash_password(password: str) -> str:
    """Hash a password with argon2id."""
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a hash. Returns False on mismatch."""
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
```

- [ ] **Step 6: Run tests**

```bash
uv run pytest backend/tests/auth/test_passwords.py -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/ backend/tests/auth/
git commit -m "feat(auth): password hashing and validation module"
```

---

### Task 7: Rate limiter

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/rate_limit.py`
- Create: `backend/tests/auth/test_rate_limit.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/auth/test_rate_limit.py`:

```python
"""Tests for the in-memory login rate limiter."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from klassenzeit_backend.auth.rate_limit import LoginRateLimiter


class TestLoginRateLimiter:
    def test_not_locked_initially(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        assert limiter.is_locked("user@test.com") is False

    def test_locks_after_max_attempts(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(3):
            limiter.record_failure("user@test.com")
        assert limiter.is_locked("user@test.com") is True

    def test_not_locked_below_max(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(2):
            limiter.record_failure("user@test.com")
        assert limiter.is_locked("user@test.com") is False

    def test_reset_clears_counter(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(3):
            limiter.record_failure("user@test.com")
        limiter.reset("user@test.com")
        assert limiter.is_locked("user@test.com") is False

    def test_lockout_expires(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        past = datetime.now(timezone.utc) - timedelta(minutes=16)
        with patch(
            "klassenzeit_backend.auth.rate_limit._now",
            return_value=past,
        ):
            for _ in range(3):
                limiter.record_failure("user@test.com")
        # Now (real time) is 16 minutes after the failures — lockout expired
        assert limiter.is_locked("user@test.com") is False

    def test_seconds_until_unlock(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(3):
            limiter.record_failure("user@test.com")
        seconds = limiter.seconds_until_unlock("user@test.com")
        assert 0 < seconds <= 900

    def test_seconds_until_unlock_when_not_locked(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        assert limiter.seconds_until_unlock("user@test.com") == 0

    def test_different_emails_are_independent(self) -> None:
        limiter = LoginRateLimiter(max_attempts=3, lockout_minutes=15)
        for _ in range(3):
            limiter.record_failure("a@test.com")
        assert limiter.is_locked("a@test.com") is True
        assert limiter.is_locked("b@test.com") is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest backend/tests/auth/test_rate_limit.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement rate_limit.py**

Create `backend/src/klassenzeit_backend/auth/rate_limit.py`:

```python
"""In-memory per-email login rate limiter.

Tracks failed login timestamps per email. Locks an email after
``max_attempts`` failures within ``lockout_minutes``. Counters reset
on successful login. Process restart clears all state — acceptable
for a single-process backend with a small user base.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone


def _now() -> datetime:
    """Seam for testing — patch this to control time."""
    return datetime.now(timezone.utc)


class LoginRateLimiter:
    def __init__(self, max_attempts: int = 5, lockout_minutes: int = 15) -> None:
        self._max_attempts = max_attempts
        self._lockout_duration = timedelta(minutes=lockout_minutes)
        self._attempts: dict[str, list[datetime]] = defaultdict(list)

    def _prune(self, email: str) -> None:
        cutoff = _now() - self._lockout_duration
        self._attempts[email] = [t for t in self._attempts[email] if t > cutoff]
        if not self._attempts[email]:
            del self._attempts[email]

    def is_locked(self, email: str) -> bool:
        self._prune(email)
        return len(self._attempts.get(email, [])) >= self._max_attempts

    def record_failure(self, email: str) -> None:
        self._attempts[email].append(_now())

    def reset(self, email: str) -> None:
        self._attempts.pop(email, None)

    def seconds_until_unlock(self, email: str) -> int:
        self._prune(email)
        attempts = self._attempts.get(email, [])
        if len(attempts) < self._max_attempts:
            return 0
        unlock_at = attempts[0] + self._lockout_duration
        remaining = (unlock_at - _now()).total_seconds()
        return max(0, int(remaining))
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest backend/tests/auth/test_rate_limit.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/rate_limit.py backend/tests/auth/test_rate_limit.py
git commit -m "feat(auth): in-memory login rate limiter"
```

---

### Task 8: Session management functions

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/sessions.py`
- Create: `backend/tests/auth/test_sessions.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/auth/test_sessions.py`:

```python
"""Tests for session CRUD functions (DB integration)."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.passwords import hash_password
from klassenzeit_backend.auth.sessions import (
    cleanup_expired_sessions,
    create_session,
    delete_session,
    delete_user_sessions,
    lookup_session,
)
from klassenzeit_backend.db.models.session import UserSession
from klassenzeit_backend.db.models.user import User


async def _make_user(db: AsyncSession, email: str = "sess@test.com") -> User:
    user = User(
        email=email,
        password_hash=hash_password("testpassword123"),
        role="user",
    )
    db.add(user)
    await db.flush()
    return user


async def test_create_session_returns_session(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    session = await create_session(db_session, user.id, ttl_days=14)
    assert session.user_id == user.id
    assert session.id is not None
    assert session.expires_at > datetime.now(timezone.utc)


async def test_lookup_session_finds_valid(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    created = await create_session(db_session, user.id, ttl_days=14)
    found = await lookup_session(db_session, created.id)
    assert found is not None
    assert found.id == created.id


async def test_lookup_session_returns_none_for_expired(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    session = UserSession(
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db_session.add(session)
    await db_session.flush()
    found = await lookup_session(db_session, session.id)
    assert found is None


async def test_lookup_session_returns_none_for_missing(db_session: AsyncSession) -> None:
    found = await lookup_session(db_session, uuid.uuid4())
    assert found is None


async def test_delete_session_removes_it(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    session = await create_session(db_session, user.id, ttl_days=14)
    await delete_session(db_session, session.id)
    found = await lookup_session(db_session, session.id)
    assert found is None


async def test_delete_user_sessions_removes_all(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    await create_session(db_session, user.id, ttl_days=14)
    await create_session(db_session, user.id, ttl_days=14)
    await delete_user_sessions(db_session, user.id)
    result = await db_session.execute(
        select(UserSession).where(UserSession.user_id == user.id)
    )
    assert result.scalars().all() == []


async def test_cleanup_expired_sessions(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    # One expired
    expired = UserSession(
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db_session.add(expired)
    # One valid
    await create_session(db_session, user.id, ttl_days=14)
    await db_session.flush()
    count = await cleanup_expired_sessions(db_session)
    assert count == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest backend/tests/auth/test_sessions.py -v
```

Expected: FAIL — `klassenzeit_backend.auth.sessions` not found.

- [ ] **Step 3: Implement sessions.py**

Create `backend/src/klassenzeit_backend/auth/sessions.py`:

```python
"""Session CRUD operations.

Functions in this module add/modify/delete objects but do NOT commit.
The caller (route handler) is responsible for committing the
transaction.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.session import UserSession


async def create_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    ttl_days: int = 14,
) -> UserSession:
    """Create a new session for the given user."""
    session = UserSession(
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=ttl_days),
    )
    db.add(session)
    await db.flush()
    return session


async def lookup_session(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> UserSession | None:
    """Find a non-expired session by ID."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.expires_at > datetime.now(timezone.utc),
        )
    )
    return result.scalar_one_or_none()


async def delete_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    """Delete a single session."""
    await db.execute(delete(UserSession).where(UserSession.id == session_id))
    await db.flush()


async def delete_user_sessions(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    exclude_session_id: uuid.UUID | None = None,
) -> None:
    """Delete all sessions for a user, optionally keeping one."""
    stmt = delete(UserSession).where(UserSession.user_id == user_id)
    if exclude_session_id is not None:
        stmt = stmt.where(UserSession.id != exclude_session_id)
    await db.execute(stmt)
    await db.flush()


async def cleanup_expired_sessions(db: AsyncSession) -> int:
    """Delete all expired sessions. Returns the number deleted."""
    result = await db.execute(
        delete(UserSession).where(
            UserSession.expires_at <= datetime.now(timezone.utc),
        )
    )
    await db.flush()
    return result.rowcount  # type: ignore[return-value]
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest backend/tests/auth/test_sessions.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/sessions.py backend/tests/auth/test_sessions.py
git commit -m "feat(auth): session CRUD functions"
```

---

### Task 9: Auth dependencies

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/dependencies.py`
- Create: `backend/tests/auth/conftest.py`
- Create: `backend/tests/auth/test_dependencies.py`

- [ ] **Step 1: Create auth test fixtures**

Create `backend/tests/auth/conftest.py`:

```python
"""Shared fixtures for auth tests.

Uses the factory-fixture pattern so tests declare ``create_test_user``
and ``login_as`` as fixture parameters — no cross-module imports needed.
"""

from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.passwords import hash_password
from klassenzeit_backend.db.models.user import User

# Type aliases for the factory callables
type CreateUserFn = Callable[..., Awaitable[tuple[User, str]]]
type LoginFn = Callable[[str, str], Awaitable[None]]


@pytest.fixture
def create_test_user(db_session: AsyncSession) -> CreateUserFn:
    """Factory fixture: ``await create_test_user(email=..., password=...)``."""

    async def _create(
        *,
        email: str = "user@test.com",
        password: str = "testpassword123",
        role: str = "user",
        is_active: bool = True,
        force_password_change: bool = False,
    ) -> tuple[User, str]:
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            role=role,
            is_active=is_active,
            force_password_change=force_password_change,
        )
        db_session.add(user)
        await db_session.flush()
        return user, password

    return _create


@pytest.fixture
def login_as(client: AsyncClient) -> LoginFn:
    """Factory fixture: ``await login_as(email, password)``."""

    async def _login(email: str, password: str) -> None:
        response = await client.post(
            "/auth/login",
            json={"email": email, "password": password},
        )
        assert response.status_code == 204, response.text

    return _login
```

- [ ] **Step 2: Write failing tests for auth dependencies**

Create `backend/tests/auth/test_dependencies.py`:

```python
"""Tests for get_current_user and require_admin dependencies.

These run as HTTP-level tests via the ``client`` fixture since the
dependencies read cookies from the request.
"""

import uuid

from httpx import AsyncClient


async def test_unauthenticated_returns_401(client: AsyncClient) -> None:
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_invalid_session_cookie_returns_401(client: AsyncClient) -> None:
    client.cookies.set("kz_session", "not-a-uuid")
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_nonexistent_session_returns_401(client: AsyncClient) -> None:
    client.cookies.set("kz_session", str(uuid.uuid4()))
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_inactive_user_returns_401(
    client: AsyncClient,
    create_test_user,
) -> None:
    _, pw = await create_test_user(email="inactive@test.com", is_active=False)
    response = await client.post(
        "/auth/login",
        json={"email": "inactive@test.com", "password": pw},
    )
    assert response.status_code == 401
```

Note: these tests require the `/auth/me` and `/auth/login` routes to exist. They will fail until the routes are wired in Task 11. We write them here to clarify the dependency contract, but they won't pass until after Task 11.

- [ ] **Step 3: Implement dependencies.py**

Create `backend/src/klassenzeit_backend/auth/dependencies.py`:

```python
"""FastAPI auth dependencies.

``get_current_user`` reads the ``kz_session`` cookie, looks up the
session in the DB, loads the user, and returns it. Raises 401 if
anything is missing or invalid.

``require_admin`` wraps ``get_current_user`` and checks role.
"""

import uuid
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.sessions import lookup_session
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_session)],
    kz_session: Annotated[str | None, Cookie()] = None,
) -> User:
    """Return the authenticated user or raise 401."""
    if kz_session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        session_id = uuid.UUID(kz_session)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    session = await lookup_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    return user


async def require_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Return the authenticated admin user or raise 403."""
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return user
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/dependencies.py backend/tests/auth/conftest.py backend/tests/auth/test_dependencies.py
git commit -m "feat(auth): get_current_user and require_admin dependencies"
```

---

### Task 10: Wire auth router + app.state into main.py

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/routes/__init__.py`
- Modify: `backend/src/klassenzeit_backend/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Create routes package with empty router**

Create `backend/src/klassenzeit_backend/auth/routes/__init__.py`:

```python
"""Auth router — collects all auth sub-routers.

Import sub-routers here as they are created. The ``auth_router`` is
included in the FastAPI app by ``main.py``.
"""

from fastapi import APIRouter

auth_router = APIRouter()

# Sub-routers will be included here as they are created:
# from klassenzeit_backend.auth.routes.login import router as login_router
# auth_router.include_router(login_router)
```

- [ ] **Step 2: Update main.py**

Replace `backend/src/klassenzeit_backend/main.py` with:

```python
"""FastAPI entry point for the Klassenzeit backend.

The ``lifespan`` context manager owns the async engine, session factory,
settings, and rate limiter. They live on ``app.state`` rather than as
module-level globals so tests can override them.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from klassenzeit_backend.auth.rate_limit import LoginRateLimiter
from klassenzeit_backend.auth.routes import auth_router
from klassenzeit_backend.core.settings import get_settings
from klassenzeit_backend.db.engine import build_engine
from klassenzeit_solver import reverse_chars


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    engine = build_engine()
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    app.state.rate_limiter = LoginRateLimiter(
        max_attempts=settings.login_max_attempts,
        lockout_minutes=settings.login_lockout_minutes,
    )
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(title="Klassenzeit", lifespan=lifespan)
app.include_router(auth_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "solver_check": reverse_chars("ok")}
```

- [ ] **Step 3: Update conftest.py client fixture**

In `backend/tests/conftest.py`, update the `client` fixture to set auth state on `app.state`. Replace the client fixture with:

```python
@pytest.fixture
async def client(
    db_session: AsyncSession,
    settings: Settings,
) -> AsyncIterator[AsyncClient]:
    from klassenzeit_backend.auth.rate_limit import LoginRateLimiter

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.state.settings = settings
    app.state.rate_limiter = LoginRateLimiter(
        max_attempts=settings.login_max_attempts,
        lockout_minutes=settings.login_lockout_minutes,
    )
    app.dependency_overrides[get_session] = override_get_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as c:
            yield c
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 4: Run existing tests to verify nothing broke**

```bash
uv run pytest backend/tests/ -v
```

Expected: all existing tests pass. The health endpoint still works.

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/routes/__init__.py backend/src/klassenzeit_backend/main.py backend/tests/conftest.py
git commit -m "feat(auth): wire auth router and app.state into main"
```

---

### Task 11: Login and logout routes

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/routes/login.py`
- Create: `backend/tests/auth/test_login.py`
- Modify: `backend/src/klassenzeit_backend/auth/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/auth/test_login.py`:

```python
"""Tests for POST /auth/login and POST /auth/logout."""

from httpx import AsyncClient


async def test_login_returns_204_and_sets_cookie(
    client: AsyncClient,
    create_test_user,
) -> None:
    _, pw = await create_test_user(email="login@test.com")
    response = await client.post(
        "/auth/login",
        json={"email": "login@test.com", "password": pw},
    )
    assert response.status_code == 204
    assert "kz_session" in response.cookies


async def test_login_wrong_password_returns_401(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="wrong@test.com")
    response = await client.post(
        "/auth/login",
        json={"email": "wrong@test.com", "password": "wrongpassword!!"},
    )
    assert response.status_code == 401


async def test_login_nonexistent_email_returns_401(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/auth/login",
        json={"email": "nobody@test.com", "password": "doesntmatter!!"},
    )
    assert response.status_code == 401


async def test_login_inactive_user_returns_401(
    client: AsyncClient,
    create_test_user,
) -> None:
    _, pw = await create_test_user(email="inactive@test.com", is_active=False)
    response = await client.post(
        "/auth/login",
        json={"email": "inactive@test.com", "password": pw},
    )
    assert response.status_code == 401


async def test_login_is_case_insensitive(
    client: AsyncClient,
    create_test_user,
) -> None:
    _, pw = await create_test_user(email="case@test.com")
    response = await client.post(
        "/auth/login",
        json={"email": "CASE@TEST.COM", "password": pw},
    )
    assert response.status_code == 204


async def test_login_rate_limit_returns_429(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="rate@test.com")
    for _ in range(5):
        await client.post(
            "/auth/login",
            json={"email": "rate@test.com", "password": "wrongpassword!!"},
        )
    response = await client.post(
        "/auth/login",
        json={"email": "rate@test.com", "password": "wrongpassword!!"},
    )
    assert response.status_code == 429
    assert "Retry-After" in response.headers


async def test_login_rate_limit_counts_nonexistent_email(
    client: AsyncClient,
) -> None:
    for _ in range(5):
        await client.post(
            "/auth/login",
            json={"email": "ghost@test.com", "password": "wrongpassword!!"},
        )
    response = await client.post(
        "/auth/login",
        json={"email": "ghost@test.com", "password": "wrongpassword!!"},
    )
    assert response.status_code == 429


async def test_logout_returns_204_and_clears_cookie(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    _, pw = await create_test_user(email="logout@test.com")
    await login_as("logout@test.com", pw)
    response = await client.post("/auth/logout")
    assert response.status_code == 204
    assert "kz_session" in response.headers.get("set-cookie", "")


async def test_logout_without_session_returns_401(
    client: AsyncClient,
) -> None:
    response = await client.post("/auth/logout")
    assert response.status_code == 401


async def test_double_logout_returns_401(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    _, pw = await create_test_user(email="double@test.com")
    await login_as("double@test.com", pw)
    first = await client.post("/auth/logout")
    assert first.status_code == 204
    client.cookies.delete("kz_session")
    second = await client.post("/auth/logout")
    assert second.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest backend/tests/auth/test_login.py -v
```

Expected: FAIL — route not found (404).

- [ ] **Step 3: Implement login route**

Create `backend/src/klassenzeit_backend/auth/routes/login.py`:

```python
"""Login and logout routes."""

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import get_current_user
from klassenzeit_backend.auth.passwords import verify_password
from klassenzeit_backend.auth.rate_limit import LoginRateLimiter
from klassenzeit_backend.auth.sessions import create_session, delete_session
from klassenzeit_backend.core.settings import Settings
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    settings: Settings = request.app.state.settings
    rate_limiter: LoginRateLimiter = request.app.state.rate_limiter
    email = body.email.lower()

    if rate_limiter.is_locked(email):
        retry_after = rate_limiter.seconds_until_unlock(email)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        rate_limiter.record_failure(email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    if not user.is_active:
        rate_limiter.record_failure(email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    rate_limiter.reset(email)

    user.last_login_at = datetime.now(timezone.utc)
    session = await create_session(db, user.id, ttl_days=settings.session_ttl_days)
    await db.commit()

    response.set_cookie(
        key="kz_session",
        value=str(session.id),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        domain=settings.cookie_domain,
        path="/",
        max_age=settings.session_ttl_days * 86400,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
    _user: Annotated[User, Depends(get_current_user)],
    kz_session: Annotated[str | None, Cookie()] = None,
) -> None:
    settings: Settings = request.app.state.settings

    if kz_session:
        await delete_session(db, uuid.UUID(kz_session))
        await db.commit()

    response.delete_cookie(
        key="kz_session",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        domain=settings.cookie_domain,
        path="/",
    )
```

- [ ] **Step 4: Wire login router into auth_router**

Update `backend/src/klassenzeit_backend/auth/routes/__init__.py`:

```python
"""Auth router — collects all auth sub-routers."""

from fastapi import APIRouter

from klassenzeit_backend.auth.routes.login import router as login_router

auth_router = APIRouter()
auth_router.include_router(login_router)
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest backend/tests/auth/test_login.py -v
```

Expected: all pass.

- [ ] **Step 6: Run the dependency tests from Task 9 too**

```bash
uv run pytest backend/tests/auth/test_dependencies.py -v
```

Expected: all pass (they rely on `/auth/me` and `/auth/login` which will be available after next task — skip if they fail, they'll be validated in Task 12).

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/routes/ backend/tests/auth/test_login.py
git commit -m "feat(auth): login and logout routes"
```

---

### Task 12: Me and change-password routes

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/routes/me.py`
- Create: `backend/tests/auth/test_me.py`
- Modify: `backend/src/klassenzeit_backend/auth/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/auth/test_me.py`:

```python
"""Tests for GET /auth/me and POST /auth/change-password."""

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.sessions import create_session, lookup_session
from klassenzeit_backend.db.models.session import UserSession


async def test_me_returns_user_info(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="me@test.com")
    await login_as("me@test.com", "testpassword123")
    response = await client.get("/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "me@test.com"
    assert body["role"] == "user"
    assert body["force_password_change"] is False
    assert "id" in body


async def test_me_without_cookie_returns_401(client: AsyncClient) -> None:
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_me_with_expired_session_returns_401(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_user,
) -> None:
    user, _ = await create_test_user(email="expired@test.com")
    session = UserSession(
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db_session.add(session)
    await db_session.flush()
    client.cookies.set("kz_session", str(session.id))
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_me_shows_force_password_change(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="force@test.com", force_password_change=True)
    await login_as("force@test.com", "testpassword123")
    response = await client.get("/auth/me")
    assert response.json()["force_password_change"] is True


async def test_change_password_succeeds(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    _, pw = await create_test_user(email="change@test.com")
    await login_as("change@test.com", pw)
    response = await client.post(
        "/auth/change-password",
        json={"current_password": pw, "new_password": "a-brand-new-passphrase"},
    )
    assert response.status_code == 204


async def test_change_password_wrong_current_returns_401(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    _, pw = await create_test_user(email="wrongcur@test.com")
    await login_as("wrongcur@test.com", pw)
    response = await client.post(
        "/auth/change-password",
        json={"current_password": "wrongpassword!!", "new_password": "newpassphrase!!"},
    )
    assert response.status_code == 401


async def test_change_password_too_short_returns_422(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    _, pw = await create_test_user(email="short@test.com")
    await login_as("short@test.com", pw)
    response = await client.post(
        "/auth/change-password",
        json={"current_password": pw, "new_password": "short"},
    )
    assert response.status_code == 422


async def test_change_password_clears_force_flag(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="clearflag@test.com", force_password_change=True)
    await login_as("clearflag@test.com", "testpassword123")
    await client.post(
        "/auth/change-password",
        json={
            "current_password": "testpassword123",
            "new_password": "a-brand-new-passphrase",
        },
    )
    me = await client.get("/auth/me")
    assert me.json()["force_password_change"] is False


async def test_change_password_invalidates_other_sessions(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_user,
    login_as,
) -> None:
    user, pw = await create_test_user(email="killsess@test.com")
    # Create an extra session (simulating another device)
    other_session = await create_session(db_session, user.id, ttl_days=14)
    await db_session.commit()

    await login_as("killsess@test.com", pw)
    await client.post(
        "/auth/change-password",
        json={"current_password": pw, "new_password": "a-brand-new-passphrase"},
    )
    # The other session should be gone
    found = await lookup_session(db_session, other_session.id)
    assert found is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest backend/tests/auth/test_me.py -v
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement me routes**

Create `backend/src/klassenzeit_backend/auth/routes/me.py`:

```python
"""Current-user routes: /auth/me and /auth/change-password."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import get_current_user
from klassenzeit_backend.auth.passwords import (
    PasswordValidationError,
    hash_password,
    validate_password,
    verify_password,
)
from klassenzeit_backend.auth.sessions import delete_user_sessions
from klassenzeit_backend.core.settings import Settings
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    force_password_change: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.get("/me")
async def auth_me(
    user: Annotated[User, Depends(get_current_user)],
) -> MeResponse:
    return MeResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        force_password_change=user.force_password_change,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
    kz_session: Annotated[str | None, Cookie()] = None,
) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    settings: Settings = request.app.state.settings
    try:
        validate_password(body.new_password, min_length=settings.password_min_length)
    except PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    user.password_hash = hash_password(body.new_password)
    user.force_password_change = False

    # Invalidate all other sessions
    current_session_id = uuid.UUID(kz_session) if kz_session else None
    await delete_user_sessions(db, user.id, exclude_session_id=current_session_id)
    await db.commit()
```

- [ ] **Step 4: Wire me router into auth_router**

Update `backend/src/klassenzeit_backend/auth/routes/__init__.py`:

```python
"""Auth router — collects all auth sub-routers."""

from fastapi import APIRouter

from klassenzeit_backend.auth.routes.login import router as login_router
from klassenzeit_backend.auth.routes.me import router as me_router

auth_router = APIRouter()
auth_router.include_router(login_router)
auth_router.include_router(me_router)
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest backend/tests/auth/test_me.py -v
```

Expected: all pass.

- [ ] **Step 6: Run dependency tests now too**

```bash
uv run pytest backend/tests/auth/test_dependencies.py -v
```

Expected: all pass (routes exist now).

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/routes/ backend/tests/auth/test_me.py
git commit -m "feat(auth): me and change-password routes"
```

---

### Task 13: Admin user routes

**Files:**
- Create: `backend/src/klassenzeit_backend/auth/routes/admin.py`
- Create: `backend/tests/auth/test_admin.py`
- Modify: `backend/src/klassenzeit_backend/auth/routes/__init__.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/auth/test_admin.py`:

```python
"""Tests for admin user management routes."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.user import User


async def test_create_user(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="admin@test.com", role="admin")
    await login_as("admin@test.com", "testpassword123")
    response = await client.post(
        "/auth/admin/users",
        json={
            "email": "newuser@test.com",
            "password": "a-secure-passphrase",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "newuser@test.com"
    assert body["role"] == "user"
    assert "id" in body


async def test_create_user_with_admin_role(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="admin2@test.com", role="admin")
    await login_as("admin2@test.com", "testpassword123")
    response = await client.post(
        "/auth/admin/users",
        json={
            "email": "newadmin@test.com",
            "password": "a-secure-passphrase",
            "role": "admin",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "admin"


async def test_create_user_duplicate_email_returns_409(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="dupadmin@test.com", role="admin")
    await login_as("dupadmin@test.com", "testpassword123")
    await client.post(
        "/auth/admin/users",
        json={"email": "dup@test.com", "password": "a-secure-passphrase"},
    )
    response = await client.post(
        "/auth/admin/users",
        json={"email": "dup@test.com", "password": "another-passphrase!"},
    )
    assert response.status_code == 409


async def test_create_user_weak_password_returns_422(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="weakadmin@test.com", role="admin")
    await login_as("weakadmin@test.com", "testpassword123")
    response = await client.post(
        "/auth/admin/users",
        json={"email": "weak@test.com", "password": "short"},
    )
    assert response.status_code == 422


async def test_non_admin_returns_403(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="regular@test.com", role="user")
    await login_as("regular@test.com", "testpassword123")
    response = await client.post(
        "/auth/admin/users",
        json={"email": "x@test.com", "password": "a-secure-passphrase"},
    )
    assert response.status_code == 403


async def test_list_users(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="listadmin@test.com", role="admin")
    await login_as("listadmin@test.com", "testpassword123")
    await client.post(
        "/auth/admin/users",
        json={"email": "listme@test.com", "password": "a-secure-passphrase"},
    )
    response = await client.get("/auth/admin/users")
    assert response.status_code == 200
    emails = [u["email"] for u in response.json()]
    assert "listadmin@test.com" in emails
    assert "listme@test.com" in emails


async def test_list_users_filter_active(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="filteradmin@test.com", role="admin")
    await login_as("filteradmin@test.com", "testpassword123")
    await client.post(
        "/auth/admin/users",
        json={"email": "willdeactivate@test.com", "password": "a-secure-passphrase"},
    )
    users = (await client.get("/auth/admin/users")).json()
    uid = next(u["id"] for u in users if u["email"] == "willdeactivate@test.com")
    await client.post(f"/auth/admin/users/{uid}/deactivate")

    active = await client.get("/auth/admin/users?active=true")
    active_emails = [u["email"] for u in active.json()]
    assert "willdeactivate@test.com" not in active_emails

    inactive = await client.get("/auth/admin/users?active=false")
    inactive_emails = [u["email"] for u in inactive.json()]
    assert "willdeactivate@test.com" in inactive_emails


async def test_reset_password(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="resetadmin@test.com", role="admin")
    await login_as("resetadmin@test.com", "testpassword123")
    create_resp = await client.post(
        "/auth/admin/users",
        json={"email": "resetme@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    response = await client.post(
        f"/auth/admin/users/{uid}/reset-password",
        json={"new_password": "a-new-secure-passphrase"},
    )
    assert response.status_code == 204


async def test_reset_password_sets_force_flag(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="forceadmin@test.com", role="admin")
    await login_as("forceadmin@test.com", "testpassword123")
    create_resp = await client.post(
        "/auth/admin/users",
        json={"email": "forcereset@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    await client.post(
        f"/auth/admin/users/{uid}/reset-password",
        json={"new_password": "a-new-secure-passphrase"},
    )
    # Verify force flag directly via DB query
    result = await db_session.execute(
        select(User).where(User.email == "forcereset@test.com")
    )
    user = result.scalar_one()
    assert user.force_password_change is True


async def test_deactivate_user(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="deactadmin@test.com", role="admin")
    await login_as("deactadmin@test.com", "testpassword123")
    create_resp = await client.post(
        "/auth/admin/users",
        json={"email": "deactme@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    response = await client.post(f"/auth/admin/users/{uid}/deactivate")
    assert response.status_code == 204


async def test_deactivated_user_cannot_login(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="deactlogin@test.com", role="admin")
    await login_as("deactlogin@test.com", "testpassword123")
    create_resp = await client.post(
        "/auth/admin/users",
        json={"email": "blocked@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    await client.post(f"/auth/admin/users/{uid}/deactivate")
    login_resp = await client.post(
        "/auth/login",
        json={"email": "blocked@test.com", "password": "a-secure-passphrase"},
    )
    assert login_resp.status_code == 401


async def test_activate_user(
    client: AsyncClient,
    create_test_user,
    login_as,
) -> None:
    await create_test_user(email="actadmin@test.com", role="admin")
    await login_as("actadmin@test.com", "testpassword123")
    create_resp = await client.post(
        "/auth/admin/users",
        json={"email": "reactivate@test.com", "password": "a-secure-passphrase"},
    )
    uid = create_resp.json()["id"]
    await client.post(f"/auth/admin/users/{uid}/deactivate")
    response = await client.post(f"/auth/admin/users/{uid}/activate")
    assert response.status_code == 204
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest backend/tests/auth/test_admin.py::test_create_user -v
```

Expected: FAIL — 404.

- [ ] **Step 3: Implement admin routes**

Create `backend/src/klassenzeit_backend/auth/routes/admin.py`:

```python
"""Admin user management routes."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.dependencies import require_admin
from klassenzeit_backend.auth.passwords import (
    PasswordValidationError,
    hash_password,
    validate_password,
)
from klassenzeit_backend.auth.sessions import delete_user_sessions
from klassenzeit_backend.core.settings import Settings
from klassenzeit_backend.db.models.user import User
from klassenzeit_backend.db.session import get_session

router = APIRouter(prefix="/auth/admin", tags=["auth-admin"])


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "user"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: str


class UserListItem(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    last_login_at: datetime | None


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: CreateUserRequest,
    request: Request,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> UserResponse:
    settings: Settings = request.app.state.settings
    email = body.email.lower()

    # Check duplicate
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    try:
        validate_password(body.password, min_length=settings.password_min_length)
    except PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.commit()

    return UserResponse(id=user.id, email=user.email, role=user.role)


@router.get("/users")
async def admin_list_users(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
    active: bool | None = None,
) -> list[UserListItem]:
    stmt = select(User)
    if active is not None:
        stmt = stmt.where(User.is_active == active)
    result = await db.execute(stmt.order_by(User.created_at))
    return [
        UserListItem(
            id=u.id,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            last_login_at=u.last_login_at,
        )
        for u in result.scalars()
    ]


async def _get_target_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return user


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def admin_reset_password(
    user_id: uuid.UUID,
    body: ResetPasswordRequest,
    request: Request,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    settings: Settings = request.app.state.settings
    try:
        validate_password(body.new_password, min_length=settings.password_min_length)
    except PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    user = await _get_target_user(db, user_id)
    user.password_hash = hash_password(body.new_password)
    user.force_password_change = True
    await delete_user_sessions(db, user.id)
    await db.commit()


@router.post("/users/{user_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def admin_deactivate_user(
    user_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await _get_target_user(db, user_id)
    user.is_active = False
    await delete_user_sessions(db, user.id)
    await db.commit()


@router.post("/users/{user_id}/activate", status_code=status.HTTP_204_NO_CONTENT)
async def admin_activate_user(
    user_id: uuid.UUID,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    user = await _get_target_user(db, user_id)
    user.is_active = True
    await db.commit()
```

- [ ] **Step 4: Wire admin router into auth_router**

Update `backend/src/klassenzeit_backend/auth/routes/__init__.py`:

```python
"""Auth router — collects all auth sub-routers."""

from fastapi import APIRouter

from klassenzeit_backend.auth.routes.admin import router as admin_router
from klassenzeit_backend.auth.routes.login import router as login_router
from klassenzeit_backend.auth.routes.me import router as me_router

auth_router = APIRouter()
auth_router.include_router(login_router)
auth_router.include_router(me_router)
auth_router.include_router(admin_router)
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest backend/tests/auth/test_admin.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/routes/ backend/tests/auth/test_admin.py
git commit -m "feat(auth): admin user management routes"
```

---

### Task 14: CLI create-admin command

**Files:**
- Create: `backend/src/klassenzeit_backend/cli.py`
- Create: `backend/tests/auth/test_cli.py`
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/auth/test_cli.py`:

```python
"""Tests for the create-admin CLI command.

The CLI logic is tested in two layers:
1. The core DB function (``create_admin_in_db``) via the ``db_session``
   fixture — full integration, rollback-isolated.
2. The CLI argument parsing/validation via typer's ``CliRunner`` —
   unit-level, no DB needed for validation paths.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.cli import create_admin_in_db
from klassenzeit_backend.db.models.user import User


async def test_create_admin_in_db_happy_path(db_session: AsyncSession) -> None:
    user = await create_admin_in_db(
        db_session,
        email="cliadmin@test.com",
        password="a-secure-passphrase",
    )
    assert user.email == "cliadmin@test.com"
    assert user.role == "admin"

    # Verify persisted
    result = await db_session.execute(
        select(User).where(User.email == "cliadmin@test.com")
    )
    assert result.scalar_one_or_none() is not None


async def test_create_admin_in_db_duplicate_email(db_session: AsyncSession) -> None:
    await create_admin_in_db(
        db_session,
        email="dupecli@test.com",
        password="a-secure-passphrase",
    )
    with pytest.raises(ValueError, match="already exists"):
        await create_admin_in_db(
            db_session,
            email="dupecli@test.com",
            password="another-passphrase!",
        )


async def test_create_admin_in_db_validates_password(db_session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="at least"):
        await create_admin_in_db(
            db_session,
            email="shortpw@test.com",
            password="short",
        )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest backend/tests/auth/test_cli.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement cli.py**

Create `backend/src/klassenzeit_backend/cli.py`:

```python
"""CLI entry point for the Klassenzeit backend.

Currently provides the ``create-admin`` command for bootstrapping
the first admin user.
"""

import asyncio

import typer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.auth.passwords import (
    PasswordValidationError,
    hash_password,
    validate_password,
)
from klassenzeit_backend.core.settings import get_settings
from klassenzeit_backend.db.models.user import User

cli = typer.Typer(no_args_is_help=True)


async def create_admin_in_db(
    db: AsyncSession,
    email: str,
    password: str,
    *,
    min_password_length: int = 12,
) -> User:
    """Create an admin user in the database.

    Validates the password and checks for duplicate emails.
    Does NOT commit — caller must commit or the test fixture rolls back.

    Raises ``ValueError`` on validation failure or duplicate email.
    """
    try:
        validate_password(password, min_length=min_password_length)
    except PasswordValidationError as exc:
        raise ValueError(str(exc)) from exc

    email = email.lower()
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is not None:
        msg = f"User with email {email} already exists"
        raise ValueError(msg)

    user = User(
        email=email,
        password_hash=hash_password(password),
        role="admin",
    )
    db.add(user)
    await db.flush()
    return user


async def _run_create_admin(email: str, password: str) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    settings = get_settings()
    engine = create_async_engine(str(settings.database_url))
    factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with factory() as session:
            await create_admin_in_db(
                session,
                email,
                password,
                min_password_length=settings.password_min_length,
            )
            await session.commit()
    finally:
        await engine.dispose()


@cli.command()
def create_admin(
    email: str = typer.Option(..., "--email", help="Admin email address"),
) -> None:
    """Create an admin user. Prompts for password on stdin."""
    password = typer.prompt("Password", hide_input=True, confirmation_prompt=True)

    try:
        asyncio.run(_run_create_admin(email, password))
    except ValueError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1)

    typer.echo(f"Admin user created: {email}")


def main() -> None:
    cli()
```

- [ ] **Step 4: Add entry point to pyproject.toml**

Add to `backend/pyproject.toml` (after the `[build-system]` section):

```toml
[project.scripts]
klassenzeit-backend = "klassenzeit_backend.cli:main"
```

- [ ] **Step 5: Sync so the entry point is installed**

```bash
uv sync
```

- [ ] **Step 6: Run tests**

```bash
uv run pytest backend/tests/auth/test_cli.py -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/cli.py backend/tests/auth/test_cli.py backend/pyproject.toml uv.lock
git commit -m "feat(auth): CLI create-admin command with typer"
```

---

### Task 15: mise.toml tasks and .env updates

**Files:**
- Modify: `mise.toml`

- [ ] **Step 1: Add auth tasks to mise.toml**

Add to the tasks section in `mise.toml`:

```toml
# ─── Auth ───────────────────────────────────────────────────────────────

[tasks."auth:create-admin"]
description = "Create an admin user (prompts for password)"
dir = "{{config_root}}/backend"
run = "uv run klassenzeit-backend create-admin"

[tasks."auth:cleanup-sessions"]
description = "Delete expired sessions from the database"
dir = "{{config_root}}/backend"
run = "uv run python -c \"import asyncio; from klassenzeit_backend.auth.sessions import cleanup_expired_sessions; from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker; from klassenzeit_backend.core.settings import get_settings; s=get_settings(); e=create_async_engine(str(s.database_url)); f=async_sessionmaker(e); asyncio.run((lambda: __import__('contextlib').asynccontextmanager(lambda: (yield None)).__aenter__())())\""
```

Actually, the cleanup task is too complex as a one-liner. Better to add a CLI command. Update `backend/src/klassenzeit_backend/cli.py` to add a `cleanup-sessions` command:

In `cli.py`, add:

```python
@cli.command()
def cleanup_sessions() -> None:
    """Delete expired sessions from the database."""
    from klassenzeit_backend.auth.sessions import cleanup_expired_sessions

    async def _run() -> int:
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        settings = get_settings()
        engine = create_async_engine(str(settings.database_url))
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as session:
                count = await cleanup_expired_sessions(session)
                await session.commit()
                return count
        finally:
            await engine.dispose()

    count = asyncio.run(_run())
    typer.echo(f"Deleted {count} expired session(s)")
```

And the mise task becomes:

```toml
[tasks."auth:create-admin"]
description = "Create an admin user (prompts for password)"
dir = "{{config_root}}/backend"
run = "uv run klassenzeit-backend create-admin"

[tasks."auth:cleanup-sessions"]
description = "Delete expired sessions from the database"
dir = "{{config_root}}/backend"
run = "uv run klassenzeit-backend cleanup-sessions"
```

- [ ] **Step 2: Verify the CLI entry point**

```bash
uv run klassenzeit-backend --help
```

Expected: shows `create-admin` and `cleanup-sessions` commands.

- [ ] **Step 3: Commit**

```bash
git add mise.toml backend/src/klassenzeit_backend/cli.py
git commit -m "feat(auth): mise tasks for auth admin and session cleanup"
```

---

### Task 16: Documentation

**Files:**
- Create: `docs/architecture/authentication.md`
- Create: `docs/adr/0006-self-rolled-cookie-session-auth.md`
- Modify: `docs/architecture/database.md`
- Modify: `docs/superpowers/OPEN_THINGS.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Create authentication architecture doc**

Create `docs/architecture/authentication.md`:

```markdown
# Authentication

## Overview

Self-rolled cookie-session authentication. Closed, invite-only system with two roles: `admin` and `user`.

## How it works

1. Admin creates a user via `POST /auth/admin/users` (or CLI `create-admin` for the first admin).
2. User logs in via `POST /auth/login` with email + password.
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
```

- [ ] **Step 2: Create ADR 0006**

Create `docs/adr/0006-self-rolled-cookie-session-auth.md`:

```markdown
# ADR 0006: Self-rolled cookie-session authentication

**Status:** Accepted
**Date:** 2026-04-12

## Context

The Klassenzeit backend needs authentication to protect endpoints. The system is closed (invite-only), serves ~dozens of users, has a single backend, and no mobile clients.

## Decision

Self-rolled cookie-session auth with a server-side `sessions` table, argon2id password hashing, and NIST 800-63B password validation.

### Rejected alternatives

- **JWT:** Stateless tokens complicate revocation (need a denylist or short-lived tokens + refresh dance). Not justified for a single-backend monolith.
- **Keycloak (self-hosted OIDC):** Ops overhead (upgrades, backups, realm config) exceeds the value for a closed system with ~dozens of users.
- **Third-party hosted (Clerk, Auth0):** Vendor dependency the maintainer wants to avoid; adds an external service for a use case that doesn't need it.

## Consequences

- We own password storage security. argon2id mitigates this.
- Revocation is trivial: delete a row.
- No external dependency for auth.
- MFA, OAuth, and social login are future work if the threat model or user base changes.
```

- [ ] **Step 3: Update database.md**

Add a section to `docs/architecture/database.md` documenting the `users` and `sessions` tables. Insert after the existing model documentation section:

```markdown
### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, `gen_random_uuid()` |
| `email` | `VARCHAR(320)` | Unique, lowercased |
| `password_hash` | `VARCHAR(256)` | Argon2id |
| `role` | `VARCHAR(16)` | `'admin'` or `'user'` |
| `is_active` | `BOOLEAN` | Soft-delete flag |
| `force_password_change` | `BOOLEAN` | Set by admin reset |
| `last_login_at` | `TIMESTAMPTZ` | Nullable |
| `created_at` | `TIMESTAMPTZ` | Server default |
| `updated_at` | `TIMESTAMPTZ` | Auto-updated |

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | PK, session token |
| `user_id` | `UUID` | FK → `users.id` |
| `created_at` | `TIMESTAMPTZ` | Server default |
| `expires_at` | `TIMESTAMPTZ` | Absolute expiry |
```

- [ ] **Step 4: Update OPEN_THINGS.md**

Remove the "Authentication" bullet from "Product capabilities". Add deferred items:

Under "Product capabilities", replace the Authentication bullet with these new items (in the appropriate sections):

```markdown
- **MFA / TOTP / passkeys.** Not needed for current threat model. Add if user base or sensitivity grows.
- **Email-based password reset.** Requires email sending infrastructure. Add when email is needed for other features.
- **OAuth / OIDC / social login.** Not needed for closed system.
- **Self-service registration.** Not needed for closed system.
```

Under "CI / repo automation" or a new "Auth maintenance" section:

```markdown
- **Session cleanup cron.** `mise run auth:cleanup-sessions` exists as manual task. Automate via cron job or background scheduler when session volume justifies it.
- **Per-IP rate limiting.** Defer to reverse proxy (Caddy) or external service. Current limiter is per-email only.
- **Password breach check (HIBP).** Offline blocklist is the baseline. Online k-anonymity check against HIBP API is a nice-to-have.
- **Audit log.** `last_login_at` is the only tracking. Full audit trail is a separate concern.
```

- [ ] **Step 5: Update CONTRIBUTING.md**

Add an "Authentication" section pointing to `docs/architecture/authentication.md`.

- [ ] **Step 6: Commit**

```bash
git add docs/ CONTRIBUTING.md
git commit -m "docs: authentication architecture, ADR, and contributor guide updates"
```

---

### Task 17: Final verification

- [ ] **Step 1: Run full lint**

```bash
mise run lint
```

Expected: clean. Fix any issues (unused imports, formatting, type errors).

- [ ] **Step 2: Run full test suite**

```bash
mise run test
```

Expected: all Python and Rust tests pass.

- [ ] **Step 3: Verify health endpoint**

```bash
mise run dev &
sleep 2
curl http://localhost:8000/health
kill %1
```

Expected: `{"status": "ok", "solver_check": "ko"}`

- [ ] **Step 4: Verify CLI works**

```bash
uv run klassenzeit-backend --help
```

Expected: shows `create-admin` and `cleanup-sessions` commands.

- [ ] **Step 5: Final commit if any lint/format fixes were needed**

```bash
git add -A
git commit -m "fix: lint and format fixes for auth implementation"
```

(Skip if nothing to fix.)
