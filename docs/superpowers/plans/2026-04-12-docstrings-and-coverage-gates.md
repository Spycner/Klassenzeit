# Docstrings and Coverage Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce docstring presence on all Python and Rust public items, and gate PRs on a coverage ratchet (floor: 80%, baseline: 89%).

**Architecture:** Enable ruff `D` rules (pydocstyle, Google convention) for Python, `#![deny(missing_docs)]` for Rust crates, and add a CI step that checks coverage against a committed `.coverage-baseline` file.

**Tech Stack:** ruff (D rules), cargo/rustc (`missing_docs`), pytest-cov, GitHub Actions, mise tasks.

---

### Task 1: Enable ruff pydocstyle rules

**Files:**
- Modify: `pyproject.toml:33-56` (ruff lint select and add pydocstyle section)

- [ ] **Step 1: Add `"D"` to ruff lint select and configure Google convention**

In `pyproject.toml`, add `"D"` to the `[tool.ruff.lint]` select list and add a new `[tool.ruff.lint.pydocstyle]` section:

```toml
[tool.ruff.lint]
select = [
    "E", "W",   # pycodestyle
    "F",        # pyflakes
    "I",        # isort
    "B",        # bugbear
    "C4",       # comprehensions
    "UP",       # pyupgrade
    "SIM",      # simplify
    "RUF",      # ruff-specific
    "N",        # pep8-naming
    "PTH",      # pathlib over os.path
    "PIE",      # misc anti-patterns
    "RET",      # return statement hygiene
    "TID",      # tidy imports
    "TC",       # type-checking import grouping
    "S",        # bandit (security)
    "ASYNC",    # async best practices
    "ERA",      # eradicate commented-out code
    "PL",       # pylint subset
    "D",        # pydocstyle (docstring enforcement)
]
```

Add after the `[tool.ruff.lint.isort]` section:

```toml
[tool.ruff.lint.pydocstyle]
convention = "google"
```

- [ ] **Step 2: Run ruff to see all violations**

Run: `uv run ruff check 2>&1 | head -80`

Expected: many `D1xx` violations listing every missing docstring. This confirms the rules are active. Do not fix anything yet — the next tasks handle that.

- [ ] **Step 3: Commit config change**

```bash
git add pyproject.toml
git commit -m "build: enable ruff pydocstyle rules with google convention"
```

---

### Task 2: Add docstrings to `__init__.py` packages and small modules

**Files:**
- Modify: `backend/src/klassenzeit_backend/core/__init__.py`
- Modify: `backend/src/klassenzeit_backend/db/__init__.py`
- Modify: `backend/src/klassenzeit_backend/auth/__init__.py`
- Modify: `solver/solver-py/python/klassenzeit_solver/__init__.py`
- Modify: `backend/src/klassenzeit_backend/db/base.py`
- Modify: `backend/src/klassenzeit_backend/core/settings.py`
- Modify: `backend/src/klassenzeit_backend/db/models/user.py`
- Modify: `backend/src/klassenzeit_backend/db/models/session.py`

- [ ] **Step 1: Add module docstrings to empty `__init__.py` files**

`backend/src/klassenzeit_backend/core/__init__.py`:
```python
"""Core configuration and shared utilities."""
```

`backend/src/klassenzeit_backend/db/__init__.py`:
```python
"""Database engine, session, and model definitions."""
```

`backend/src/klassenzeit_backend/auth/__init__.py`:
```python
"""Authentication: routes, dependencies, sessions, and password handling."""
```

`solver/solver-py/python/klassenzeit_solver/__init__.py` — add a docstring before the import:
```python
"""Python bindings for the Klassenzeit constraint solver."""

from ._rust import reverse_chars

__all__ = ["reverse_chars"]
```

- [ ] **Step 2: Add class docstring to `Base` in `db/base.py`**

`backend/src/klassenzeit_backend/db/base.py` — add docstring to the `Base` class (line 21):
```python
class Base(DeclarativeBase):
    """Declarative base for all ORM models, with constraint naming convention."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
```

- [ ] **Step 3: Add class docstring to `Settings` in `core/settings.py`**

`backend/src/klassenzeit_backend/core/settings.py` — add docstring to `Settings` (line 25):
```python
class Settings(BaseSettings):
    """Backend configuration loaded from environment variables with ``KZ_`` prefix."""

    model_config = SettingsConfigDict(
```

- [ ] **Step 4: Add class docstrings to DB models**

`backend/src/klassenzeit_backend/db/models/user.py` — add docstring to `User` (line 12):
```python
class User(Base):
    """Application user with email/password credentials and role-based access."""

    __tablename__ = "users"
```

`backend/src/klassenzeit_backend/db/models/session.py` — add docstring to `UserSession` (line 16):
```python
class UserSession(Base):
    """Cookie-based login session tied to a user with an expiry timestamp."""

    __tablename__ = "sessions"
```

- [ ] **Step 5: Run ruff check on modified files**

Run: `uv run ruff check backend/src/klassenzeit_backend/core/__init__.py backend/src/klassenzeit_backend/db/__init__.py backend/src/klassenzeit_backend/auth/__init__.py solver/solver-py/python/klassenzeit_solver/__init__.py backend/src/klassenzeit_backend/db/base.py backend/src/klassenzeit_backend/core/settings.py backend/src/klassenzeit_backend/db/models/user.py backend/src/klassenzeit_backend/db/models/session.py`

Expected: no `D1xx` violations on these files.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/core/__init__.py backend/src/klassenzeit_backend/db/__init__.py backend/src/klassenzeit_backend/auth/__init__.py solver/solver-py/python/klassenzeit_solver/__init__.py backend/src/klassenzeit_backend/db/base.py backend/src/klassenzeit_backend/core/settings.py backend/src/klassenzeit_backend/db/models/user.py backend/src/klassenzeit_backend/db/models/session.py
git commit -m "docs: add docstrings to packages, base, settings, and models"
```

---

### Task 3: Add docstrings to auth route modules

**Files:**
- Modify: `backend/src/klassenzeit_backend/auth/routes/admin.py`
- Modify: `backend/src/klassenzeit_backend/auth/routes/login.py`
- Modify: `backend/src/klassenzeit_backend/auth/routes/me.py`

- [ ] **Step 1: Add docstrings to `admin.py` classes and functions**

```python
class CreateUserRequest(BaseModel):
    """Request body for admin user creation."""

    email: EmailStr
    password: str
    role: str = "user"


class UserResponse(BaseModel):
    """Response body after creating a user."""

    id: uuid.UUID
    email: str
    role: str


class UserListItem(BaseModel):
    """Single entry in the admin user listing."""

    id: uuid.UUID
    email: str
    role: str
    is_active: bool
    last_login_at: datetime | None


class ResetPasswordRequest(BaseModel):
    """Request body for admin password reset."""

    new_password: str
```

For the route functions and helper:

```python
@router.post("/users", status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: CreateUserRequest,
    request: Request,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> UserResponse:
    """Create a new user account. Requires admin role."""
```

```python
@router.get("/users")
async def admin_list_users(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
    active: bool | None = None,
) -> list[UserListItem]:
    """List all users, optionally filtered by active status."""
```

```python
async def _get_target_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    """Load a user by ID or raise 404."""
```

```python
async def admin_reset_password(
    ...
) -> None:
    """Reset a user's password and force a password change on next login."""
```

```python
async def admin_deactivate_user(
    ...
) -> None:
    """Deactivate a user and invalidate all their sessions."""
```

```python
async def admin_activate_user(
    ...
) -> None:
    """Re-activate a deactivated user account."""
```

- [ ] **Step 2: Add docstrings to `login.py` classes and functions**

```python
class LoginRequest(BaseModel):
    """Request body for email/password login."""

    email: EmailStr
    password: str
```

```python
async def login(
    ...
) -> None:
    """Authenticate with email/password and set a session cookie."""
```

```python
async def logout(
    ...
) -> None:
    """Delete the current session and clear the session cookie."""
```

- [ ] **Step 3: Add docstrings to `me.py` classes and functions**

```python
class MeResponse(BaseModel):
    """Response body for the current user profile."""

    id: uuid.UUID
    email: str
    role: str
    force_password_change: bool


class ChangePasswordRequest(BaseModel):
    """Request body for changing the current user's password."""

    current_password: str
    new_password: str
```

```python
async def auth_me(
    user: Annotated[User, Depends(get_current_user)],
) -> MeResponse:
    """Return the current authenticated user's profile."""
```

```python
async def change_password(
    ...
) -> None:
    """Change the current user's password and invalidate other sessions."""
```

- [ ] **Step 4: Run ruff check on route files**

Run: `uv run ruff check backend/src/klassenzeit_backend/auth/routes/`

Expected: no `D1xx` violations.

- [ ] **Step 5: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/routes/
git commit -m "docs: add docstrings to auth route modules"
```

---

### Task 4: Add docstrings to rate limiter and remaining backend files

**Files:**
- Modify: `backend/src/klassenzeit_backend/auth/rate_limit.py`
- Modify: `backend/src/klassenzeit_backend/main.py`
- Modify: `backend/src/klassenzeit_backend/cli.py`

- [ ] **Step 1: Add docstrings to `LoginRateLimiter` class and methods**

```python
class LoginRateLimiter:
    """In-memory rate limiter that locks an email after repeated failed logins."""

    def __init__(self, max_attempts: int = 5, lockout_minutes: int = 15) -> None:
        """Configure the limiter with attempt threshold and lockout duration."""
        self._max_attempts = max_attempts
        self._lockout_duration = timedelta(minutes=lockout_minutes)
        self._attempts: dict[str, list[datetime]] = defaultdict(list)

    def _prune(self, email: str) -> None:
        """Remove expired failure timestamps for the given email."""
        cutoff = _now() - self._lockout_duration
        self._attempts[email] = [t for t in self._attempts[email] if t > cutoff]
        if not self._attempts[email]:
            del self._attempts[email]

    def is_locked(self, email: str) -> bool:
        """Return True if the email has exceeded the failure threshold."""
        self._prune(email)
        return len(self._attempts.get(email, [])) >= self._max_attempts

    def record_failure(self, email: str) -> None:
        """Record a failed login attempt for the given email."""
        self._attempts[email].append(_now())

    def reset(self, email: str) -> None:
        """Clear all failure records for the given email after a successful login."""
        self._attempts.pop(email, None)

    def seconds_until_unlock(self, email: str) -> int:
        """Return seconds remaining until the lockout expires, or 0 if not locked."""
        self._prune(email)
```

- [ ] **Step 2: Add docstrings to `main.py` functions**

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize engine, session factory, settings, and rate limiter on app startup."""
```

```python
@app.get("/health")
async def health() -> dict[str, str]:
    """Return a simple health-check response with a solver smoke test."""
```

- [ ] **Step 3: Add docstring to `cli.py::main`**

```python
def main() -> None:
    """Entry point for the ``klassenzeit-backend`` CLI."""
    cli()
```

- [ ] **Step 4: Run ruff check on all source files**

Run: `uv run ruff check`

Expected: all checks passed (zero `D1xx` violations remaining).

- [ ] **Step 5: Run the full test suite to confirm nothing broke**

Run: `mise run test`

Expected: all 78 Python tests pass, all Rust tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/auth/rate_limit.py backend/src/klassenzeit_backend/main.py backend/src/klassenzeit_backend/cli.py
git commit -m "docs: add docstrings to rate limiter, main, and cli"
```

---

### Task 5: Add `#![deny(missing_docs)]` to Rust crates

**Files:**
- Modify: `solver/solver-core/src/lib.rs`
- Modify: `solver/solver-py/src/lib.rs`

- [ ] **Step 1: Add deny attribute and doc comments to `solver-core/src/lib.rs`**

```rust
//! solver-core — pure Rust solver logic. No Python, no PyO3.

#![deny(missing_docs)]

/// Reverse the characters in a string.
pub fn reverse_chars(s: &str) -> String {
    s.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reverses_hello() {
        assert_eq!(reverse_chars("hello"), "olleh");
    }

    #[test]
    fn reverses_empty() {
        assert_eq!(reverse_chars(""), "");
    }

    #[test]
    fn reverses_unicode() {
        assert_eq!(reverse_chars("äöü"), "üöä");
    }
}
```

- [ ] **Step 2: Add deny attribute and doc comments to `solver-py/src/lib.rs`**

```rust
//! solver-py — thin PyO3 wrapper over solver-core. Only glue lives here.

#![deny(missing_docs)]

use pyo3::prelude::*;

/// Reverse the characters in a string (PyO3 wrapper).
#[pyfunction]
fn reverse_chars(s: &str) -> String {
    solver_core::reverse_chars(s)
}

/// Python module exposing solver-core functions.
#[pymodule]
fn _rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(reverse_chars, m)?)?;
    Ok(())
}
```

- [ ] **Step 3: Build and run Rust tests**

Run: `cargo clippy --workspace --all-targets -- -D warnings && cargo nextest run --workspace`

Expected: no warnings, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add solver/solver-core/src/lib.rs solver/solver-py/src/lib.rs
git commit -m "build: deny missing_docs in Rust crates and add doc comments"
```

---

### Task 6: Create coverage baseline and configure pytest floor

**Files:**
- Create: `.coverage-baseline`
- Modify: `pyproject.toml:23` (addopts)

- [ ] **Step 1: Create `.coverage-baseline` file**

Create `.coverage-baseline` in the repo root with content:
```
89
```

- [ ] **Step 2: Add `--cov-fail-under=80` to pytest addopts**

In `pyproject.toml`, update the `addopts` line:

```toml
addopts      = ["--import-mode=importlib", "--cov-fail-under=80"]
```

Note: `--cov-fail-under` only takes effect when `--cov` is passed. Normal `mise run test:py` (no `--cov` flag) is unaffected.

- [ ] **Step 3: Verify the floor works**

Run: `uv run pytest --cov=klassenzeit_backend --cov=klassenzeit_solver`

Expected: tests pass, coverage reported at ~89%, and the `--cov-fail-under=80` check passes (no "FAIL Required test coverage" message).

- [ ] **Step 4: Commit**

```bash
git add .coverage-baseline pyproject.toml
git commit -m "build: add coverage baseline file and 80% pytest floor"
```

---

### Task 7: Add `cov:update-baseline` mise task

**Files:**
- Modify: `mise.toml:107-118` (coverage section)

- [ ] **Step 1: Add the task to `mise.toml`**

Add after the existing `[tasks."cov:py"]` section:

```toml
[tasks."cov:update-baseline"]
description = "Run Python coverage and update .coverage-baseline with the new total"
run = """
uv run pytest --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term 2>&1 \
  | grep '^TOTAL' \
  | awk '{print int($NF)}' \
  > .coverage-baseline
echo "Baseline updated to $(cat .coverage-baseline)%"
"""
```

- [ ] **Step 2: Test the task**

Run: `mise run cov:update-baseline`

Expected: output shows "Baseline updated to 89%" (or similar), and `.coverage-baseline` contains `89`.

- [ ] **Step 3: Commit**

```bash
git add mise.toml
git commit -m "build: add cov:update-baseline mise task"
```

---

### Task 8: Add coverage ratchet check to CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update the test job to run coverage and check the ratchet**

Replace the final step of the `test` job with:

```yaml
      - name: Run mise test pipeline
        run: mise run test
      - name: Check Python coverage ratchet
        run: |
          COVERAGE_OUTPUT=$(uv run pytest --cov=klassenzeit_backend --cov=klassenzeit_solver --cov-report=term -q 2>&1)
          ACTUAL=$(echo "$COVERAGE_OUTPUT" | grep '^TOTAL' | awk '{print int($NF)}')
          BASELINE=$(cat .coverage-baseline)
          echo "Coverage: ${ACTUAL}% (baseline: ${BASELINE}%, floor: 80%)"
          if [ "$ACTUAL" -lt 80 ]; then
            echo "::error::Coverage ${ACTUAL}% is below the absolute floor of 80%"
            exit 1
          fi
          if [ "$ACTUAL" -lt "$BASELINE" ]; then
            echo "::error::Coverage ${ACTUAL}% is below the ratchet baseline of ${BASELINE}%. Run 'mise run cov:update-baseline' if this drop is intentional."
            exit 1
          fi
```

- [ ] **Step 2: Verify the workflow YAML is valid**

Run: `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('Valid YAML')"` (if PyYAML is available) or visually inspect the indentation.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add coverage ratchet check to PR pipeline"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run full lint suite**

Run: `mise run lint`

Expected: all checks passed (ruff D rules, clippy, fmt, machete, ty, vulture — zero violations).

- [ ] **Step 2: Run full test suite**

Run: `mise run test`

Expected: all Python tests pass, all Rust tests pass.

- [ ] **Step 3: Run coverage and verify ratchet**

Run: `mise run cov:py`

Expected: coverage >= 89%, no "FAIL Required test coverage" message.

- [ ] **Step 4: Verify Rust docs build cleanly**

Run: `cargo doc --workspace --no-deps 2>&1`

Expected: no warnings about missing docs.
