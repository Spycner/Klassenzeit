# Project Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Klassenzeit monorepo: Python backend (uv workspace) + Rust solver (Cargo workspace with `solver-core` and `solver-py` PyO3 bindings) + mise-managed toolchain + full lint/test/coverage/audit tasks. Frontend, DB layer, and license are explicitly deferred.

**Architecture:** Two workspace roots at the repo top — `Cargo.toml` for Rust, `pyproject.toml` for uv. `solver/solver-py/` is a member of both workspaces so uv+maturin can install it editably into the shared `.venv/`. `solver-core` is a pure-Rust rlib with no PyO3 — `solver-py` is a thin `cdylib` wrapper over it. mise pins Rust 1.93, Python 3.13, uv, cocogitto, lefthook, cargo-nextest, cargo-llvm-cov, cargo-machete, cargo-deny.

**Tech Stack:** Rust 1.93 + Cargo workspaces, PyO3 0.25 + maturin 1.7, Python 3.13 + uv workspaces, FastAPI + httpx (via `fastapi[standard]`), ruff + ty + vulture + pytest/pytest-asyncio/pytest-cov, proptest (Rust), cargo-nextest (runner), cargo-llvm-cov (Rust coverage), cargo-deny + pip-audit (supply chain), mise (toolchain + tasks), lefthook (git hooks), cocogitto (commit message enforcement).

**Spec:** [`docs/superpowers/specs/2026-04-11-project-scaffolding-design.md`](../specs/2026-04-11-project-scaffolding-design.md)

**Placeholder example function (used throughout for end-to-end validation):** `reverse_chars(s: &str) -> String` — reverses a string by Unicode scalars. Unit tests + proptest (reverse-twice is identity) + PyO3 binding + backend `/health` route that calls it. This gives a real, testable path through every layer without committing to domain logic.

---

## Task 1: Create `mise.toml`, `.gitignore`, and install toolchain

**Files:**
- Create: `mise.toml`
- Create: `.gitignore`

- [ ] **Step 1: Write the `.gitignore`**

```gitignore
# Python
.venv/
__pycache__/
*.pyc
.pytest_cache/
.coverage
.ruff_cache/
.ty_cache/

# Rust
target/

# Git worktrees (project-local)
.worktrees/

# Editors / OS
.DS_Store
.idea/
.vscode/
```

- [ ] **Step 2: Write the full `mise.toml`**

```toml
# mise.toml — toolchain pins and task definitions

[tools]
rust    = "1.93"
python  = "3.13"
uv      = "latest"
"cargo:cocogitto"            = "latest"
"ubi:evilmartians/lefthook"  = "latest"
"cargo:cargo-nextest"        = "latest"
"cargo:cargo-llvm-cov"       = "latest"
"cargo:cargo-machete"        = "latest"
"cargo:cargo-deny"           = "latest"

[env]
# Populate as needed (e.g. RUST_BACKTRACE = "1")

# ─── Bootstrap ──────────────────────────────────────────────────────────────

[tasks.install]
description = "Bootstrap dev environment (hooks + deps)"
run = [
  "lefthook install",
  "uv sync",
]

# ─── Dev loop ───────────────────────────────────────────────────────────────

[tasks.dev]
description = "Run the backend with auto-reload"
run = "uv run uvicorn klassenzeit_backend.main:app --reload"

# ─── Testing ────────────────────────────────────────────────────────────────

[tasks.test]
description = "Run all tests (Rust + Python)"
depends = ["test:rust", "test:py"]

[tasks."test:rust"]
description = "Run Rust workspace tests (via nextest)"
run = "cargo nextest run --workspace"

[tasks."test:py"]
description = "Run Python tests (backend + solver-py bindings)"
run = "uv run pytest"

[tasks.bench]
description = "Run solver-core benches"
run = "cargo bench -p solver-core"

# ─── Coverage (separate from `test` — slower, for reports not TDD) ──────────

[tasks.cov]
description = "Run coverage for Rust and Python"
depends = ["cov:rust", "cov:py"]

[tasks."cov:rust"]
run = "cargo llvm-cov --workspace --lcov --output-path target/lcov.info"

[tasks."cov:py"]
run = "uv run pytest --cov=klassenzeit_backend --cov=klassenzeit_solver"

# ─── Supply-chain audits (run in CI, not pre-push) ──────────────────────────

[tasks.audit]
description = "Supply-chain audits — license, advisory, unused deps"
run = [
  "cargo deny check",
  "uvx pip-audit",
]

# ─── Lint & format ──────────────────────────────────────────────────────────

[tasks.lint]
description = "Run all linters"
depends = ["lint:rust", "lint:py"]

[tasks."lint:rust"]
run = [
  "cargo fmt --check",
  "cargo clippy --workspace --all-targets -- -D warnings",
  "cargo machete",
]

[tasks."lint:py"]
description = "Lint, format-check, type-check, and dead-code scan Python"
run = [
  "uv run ruff check",
  "uv run ruff format --check",
  "uv run ty check",
  "uv run vulture backend/src",
]

[tasks.fmt]
description = "Auto-format everything"
run = [
  "cargo fmt",
  "uv run ruff format",
]
```

- [ ] **Step 3: Install toolchain via mise**

Run: `mise install`
Expected: mise downloads and installs Rust 1.93, Python 3.13, uv, cocogitto, lefthook, cargo-nextest, cargo-llvm-cov, cargo-machete, cargo-deny. First run takes several minutes (Cargo installs compile from source).

- [ ] **Step 4: Verify versions**

Run: `mise exec -- rustc --version && mise exec -- python --version && mise exec -- uv --version`
Expected: `rustc 1.93.x`, `Python 3.13.x`, `uv 0.x.x` (or newer).

- [ ] **Step 5: Commit**

```bash
git add mise.toml .gitignore
git commit -m "chore: pin toolchain via mise and add .gitignore"
```

---

## Task 2: Create Rust workspace root

**Files:**
- Create: `Cargo.toml`

- [ ] **Step 1: Write the workspace `Cargo.toml`**

```toml
[workspace]
resolver = "2"
members = ["solver/solver-core"]

[workspace.package]
edition      = "2021"
rust-version = "1.85"

[workspace.dependencies]
proptest = "1"
```

Only `solver-core` is listed initially. `solver-py` is added to the members list in Task 4 when the crate itself is created, so that `cargo` commands in Task 3 can parse the workspace without stumbling on a non-existent member.

- [ ] **Step 2: Verify workspace is parseable**

Run: `cargo metadata --format-version 1 > /dev/null`
Expected: fails with an error about `solver/solver-core/Cargo.toml` not existing. This is expected — the workspace declaration is valid, the member just doesn't exist yet.

- [ ] **Step 3: Commit**

```bash
git add Cargo.toml
git commit -m "build(cargo): add workspace root manifest"
```

---

## Task 3: Scaffold `solver-core` with TDD

**Files:**
- Create: `solver/solver-core/Cargo.toml`
- Create: `solver/solver-core/src/lib.rs`
- Create: `solver/solver-core/tests/proptest_reverse.rs`

- [ ] **Step 0: Create the crate directories**

Run: `mkdir -p solver/solver-core/src solver/solver-core/tests`

- [ ] **Step 1: Write the crate manifest**

```toml
# solver/solver-core/Cargo.toml
[package]
name         = "solver-core"
version      = "0.1.0"
edition.workspace      = true
rust-version.workspace = true

[lib]
# default rlib

[dev-dependencies]
proptest = { workspace = true }
```

- [ ] **Step 2: Write the failing unit test (no implementation yet)**

Create `solver/solver-core/src/lib.rs`:

```rust
//! solver-core — pure Rust solver logic. No Python, no PyO3.

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

- [ ] **Step 3: Verify the test fails to compile**

Run: `cargo nextest run -p solver-core`
Expected: compile error — `cannot find function 'reverse_chars' in this scope`.

- [ ] **Step 4: Write minimal implementation**

Replace `solver/solver-core/src/lib.rs` with:

```rust
//! solver-core — pure Rust solver logic. No Python, no PyO3.

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

- [ ] **Step 5: Verify unit tests pass**

Run: `cargo nextest run -p solver-core`
Expected: `Summary: 3 tests run: 3 passed`.

- [ ] **Step 6: Add proptest for the reverse-twice identity**

Create `solver/solver-core/tests/proptest_reverse.rs`:

```rust
use proptest::prelude::*;
use solver_core::reverse_chars;

proptest! {
    #[test]
    fn reversing_twice_yields_original(s in ".*") {
        let once = reverse_chars(&s);
        let twice = reverse_chars(&once);
        prop_assert_eq!(twice, s);
    }
}
```

- [ ] **Step 7: Verify proptest passes**

Run: `cargo nextest run -p solver-core`
Expected: `Summary: 4 tests run: 4 passed` (three unit tests + one proptest).

- [ ] **Step 8: Commit**

```bash
git add solver/solver-core
git commit -m "feat(solver-core): scaffold crate with reverse_chars and proptest"
```

---

## Task 4: Scaffold `solver-py` (Rust-side PyO3 wrapper)

**Files:**
- Modify: root `Cargo.toml` — add `solver/solver-py` to `[workspace] members`
- Create: `solver/solver-py/Cargo.toml`
- Create: `solver/solver-py/pyproject.toml`
- Create: `solver/solver-py/src/lib.rs`

- [ ] **Step 0: Create the crate directories**

Run: `mkdir -p solver/solver-py/src solver/solver-py/tests`

- [ ] **Step 0b: Extend workspace members**

Edit the root `Cargo.toml` so `[workspace] members` becomes:

```toml
members = ["solver/solver-core", "solver/solver-py"]
```

(Task 2 left `solver-py` out because the crate didn't exist yet; now it does.)

- [ ] **Step 1: Write the Cargo manifest**

```toml
# solver/solver-py/Cargo.toml
[package]
name    = "solver-py"
version = "0.1.0"
edition.workspace      = true
rust-version.workspace = true

[lib]
name       = "klassenzeit_solver"
crate-type = ["cdylib"]

[dependencies]
solver-core = { path = "../solver-core", version = "0.1.0" }
pyo3        = { version = "0.25", features = ["extension-module"] }
```

- [ ] **Step 2: Write the PyO3 module**

Create `solver/solver-py/src/lib.rs`:

```rust
//! solver-py — thin PyO3 wrapper over solver-core. Only glue lives here.

use pyo3::prelude::*;

#[pyfunction]
fn reverse_chars(s: &str) -> String {
    solver_core::reverse_chars(s)
}

#[pymodule]
fn klassenzeit_solver(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(reverse_chars, m)?)?;
    Ok(())
}
```

- [ ] **Step 3: Write the maturin `pyproject.toml`**

```toml
# solver/solver-py/pyproject.toml
[build-system]
requires      = ["maturin>=1.7,<2.0"]
build-backend = "maturin"

[project]
name            = "klassenzeit-solver"
version         = "0.1.0"
requires-python = ">=3.13"
description     = "PyO3 bindings for the Klassenzeit solver"

[tool.maturin]
module-name = "klassenzeit_solver"
features    = ["pyo3/extension-module"]
```

- [ ] **Step 4: Verify the Rust side type-checks**

Run: `cargo check -p solver-py`
Expected: compiles cleanly (may download pyo3 crate on first run).

- [ ] **Step 5: Commit**

```bash
git add solver/solver-py Cargo.toml
git commit -m "feat(solver-py): scaffold PyO3 wrapper exposing reverse_chars"
```

---

## Task 5: Create root `pyproject.toml` (uv workspace + tool configs)

**Files:**
- Create: `pyproject.toml`

- [ ] **Step 1: Write the workspace root**

```toml
# Root pyproject.toml — declares the uv workspace and shared tool config.
# This is NOT a publishable package; it has no [project] section.

[tool.uv.workspace]
members = ["backend", "solver/solver-py"]

[tool.uv.sources]
klassenzeit-solver = { workspace = true }

# ─── Shared Python tool config ──────────────────────────────────────────────

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths    = ["backend/tests", "solver/solver-py/tests"]
# `importlib` avoids the classic pytest trap where two test dirs that both
# contain `__init__.py` collide under the same `tests` package name.
addopts      = ["--import-mode=importlib"]

[tool.ruff]
target-version = "py313"
line-length    = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "SIM"]

[tool.vulture]
min_confidence = 80
paths          = ["backend/src"]

[tool.coverage.run]
source = ["backend/src", "solver/solver-py"]
```

- [ ] **Step 2: Commit**

Note: `uv` commands will not yet be runnable against the workspace because `backend/pyproject.toml` does not exist yet. That's resolved in Task 6.

```bash
git add pyproject.toml
git commit -m "build(uv): add workspace root with shared tool config"
```

---

## Task 6: Initialize the backend package

**Files:**
- Create (via `uv init`): `backend/pyproject.toml`
- Create (via `uv init`): `backend/src/klassenzeit_backend/__init__.py`
- Create (via `uv init`): `backend/README.md` (may be auto-generated — remove if not wanted)
- Modify (if needed): root `pyproject.toml` — confirm `backend` is in members

- [ ] **Step 1: Remove the empty `backend/` placeholder so `uv init` can populate it**

Run: `[ -z "$(ls -A backend)" ] && rmdir backend || echo "backend is not empty — inspect before continuing"`
Expected: the empty directory is removed, or the command stops and lets you inspect.

- [ ] **Step 2: Create the backend package**

Run: `uv init --package --name klassenzeit-backend backend`
Expected: `backend/pyproject.toml`, `backend/src/klassenzeit_backend/__init__.py`, and possibly a `backend/README.md` are created.

- [ ] **Step 3: Verify the package layout**

Run: `ls -la backend backend/src/klassenzeit_backend`
Expected: see `pyproject.toml` in `backend/`, and `__init__.py` (plus possibly a default `hello.py` or similar) in `backend/src/klassenzeit_backend/`.

- [ ] **Step 4: Clean up any default hello module that `uv init` creates**

If `backend/src/klassenzeit_backend/` contains anything other than `__init__.py`, delete the extras:

Run: `find backend/src/klassenzeit_backend -type f ! -name __init__.py -delete`

Replace `backend/src/klassenzeit_backend/__init__.py` with:

```python
"""Klassenzeit backend package."""
```

- [ ] **Step 5: Confirm `backend` is listed in root workspace members**

Run: `grep -A2 '\[tool.uv.workspace\]' pyproject.toml`
Expected: `members = ["backend", "solver/solver-py"]`. If uv init removed or altered it, restore the list to exactly that.

- [ ] **Step 6: Commit**

```bash
git add backend pyproject.toml
git commit -m "feat(backend): initialize klassenzeit-backend uv package"
```

---

## Task 7: Add backend runtime dependencies

**Files:**
- Modify: `backend/pyproject.toml` (via `uv add` only)

- [ ] **Step 1: Add FastAPI with standard extras**

Run: `uv add --package klassenzeit-backend "fastapi[standard]"`
Expected: `backend/pyproject.toml` gains `fastapi[standard]` in `[project.dependencies]`; `uv.lock` is created/updated at repo root.

- [ ] **Step 2: Add the solver as a workspace dep**

Run: `uv add --package klassenzeit-backend klassenzeit-solver`
Expected: `backend/pyproject.toml` gains `klassenzeit-solver`; uv resolves it to the workspace member via `[tool.uv.sources]` in the root.

- [ ] **Step 3: Verify backend deps are correct**

Run: `grep -A5 '\[project.dependencies\]\|^dependencies' backend/pyproject.toml`
Expected: a list containing both `fastapi[standard]` and `klassenzeit-solver`. **Do not hand-edit the list** — if something is wrong, remove with `uv remove` and re-add.

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml uv.lock
git commit -m "feat(backend): add fastapi[standard] and klassenzeit-solver deps"
```

---

## Task 8: Add workspace-wide dev dependencies

**Files:**
- Modify: root `pyproject.toml` (via `uv add --dev`)
- Modify: `uv.lock`

- [ ] **Step 1: Add all Python dev tools in one command**

Run: `uv add --dev pytest pytest-asyncio pytest-cov ruff ty vulture`
Expected: root `pyproject.toml` gains `[dependency-groups]` `dev` list with all six packages; `uv.lock` updates.

- [ ] **Step 2: Verify the dev group**

Run: `grep -A10 '\[dependency-groups\]' pyproject.toml`
Expected: a `dev = [...]` list containing pytest, pytest-asyncio, pytest-cov, ruff, ty, vulture.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "build(uv): add Python dev deps (pytest, ruff, ty, vulture, coverage)"
```

---

## Task 9: Verify the workspace is fully synced

**Files:** none (verification only — `.venv/` was created by earlier `uv add` commands and is already gitignored from Task 1).

- [ ] **Step 1: Run an explicit sync to confirm a clean state**

Run: `uv sync`
Expected: `Resolved N packages`, `Audited N packages` — everything already installed from Tasks 7–8. No rebuild needed.

- [ ] **Step 2: Verify the solver import works end-to-end**

Run: `uv run python -c "from klassenzeit_solver import reverse_chars; print(reverse_chars('hello'))"`
Expected: `olleh`

- [ ] **Step 3: Sanity-check that `.venv/` and `target/` are untracked**

Run: `git status --short | grep -E '\.venv|target' || echo "clean"`
Expected: `clean` — neither directory should appear in git status because `.gitignore` from Task 1 excludes them.

---

## Task 10: Write `solver-py` binding smoke test

**Files:**
- Create: `solver/solver-py/tests/__init__.py` (empty)
- Create: `solver/solver-py/tests/test_bindings.py`

- [ ] **Step 1: Write the failing test**

Create `solver/solver-py/tests/__init__.py` as an empty file.

Create `solver/solver-py/tests/test_bindings.py`:

```python
"""Smoke tests for the klassenzeit_solver PyO3 bindings.

These tests assert the binding contract (types, values, error propagation),
not solver logic. Solver logic is tested in Rust via solver-core.
"""

from klassenzeit_solver import reverse_chars  # ty: ignore[unresolved-import]


def test_reverse_chars_basic() -> None:
    assert reverse_chars("hello") == "olleh"


def test_reverse_chars_empty() -> None:
    assert reverse_chars("") == ""


def test_reverse_chars_unicode() -> None:
    assert reverse_chars("äöü") == "üöä"


def test_reverse_chars_returns_str() -> None:
    assert isinstance(reverse_chars("abc"), str)
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `uv run pytest solver/solver-py/tests -v`
Expected: `4 passed`. (The binding already works from Task 9, so these tests are green on the first run.)

- [ ] **Step 3: Commit**

```bash
git add solver/solver-py/tests
git commit -m "test(solver-py): add binding smoke tests for reverse_chars"
```

---

## Task 11: Write backend `/health` endpoint with TDD

**Files:**
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/test_health.py`
- Create: `backend/src/klassenzeit_backend/main.py`

- [ ] **Step 1: Write the failing async test**

Create `backend/tests/__init__.py` as an empty file.

Create `backend/tests/test_health.py`:

```python
"""Tests for the /health endpoint.

Verifies the full stack: FastAPI routing + async client + real call into
the klassenzeit_solver PyO3 binding. The solver is not mocked.
"""

from httpx import ASGITransport, AsyncClient
from klassenzeit_backend.main import app


async def test_health_returns_ok_and_exercises_solver() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "ok", "solver_check": "ko"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest backend/tests/test_health.py -v`
Expected: `ModuleNotFoundError: No module named 'klassenzeit_backend.main'` or `ImportError: cannot import name 'app'`.

- [ ] **Step 3: Write the minimal backend implementation**

Create `backend/src/klassenzeit_backend/main.py`:

```python
"""FastAPI entry point for the Klassenzeit backend."""

from fastapi import FastAPI
from klassenzeit_solver import reverse_chars  # ty: ignore[unresolved-import]

app = FastAPI(title="Klassenzeit")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "solver_check": reverse_chars("ok")}
```

The `# ty: ignore[unresolved-import]` pragma tells Astral's ty type checker to stop complaining that it can't introspect `klassenzeit_solver`. The module is a PyO3 `.so` without type stubs — ty has no way to know `reverse_chars` exists from pure Python analysis. Stubs (a `.pyi` file shipped alongside the extension) are the proper long-term fix; see `docs/superpowers/OPEN_THINGS.md`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest backend/tests/test_health.py -v`
Expected: `1 passed`.

- [ ] **Step 5: Run the full Python test suite**

Run: `uv run pytest`
Expected: all backend and solver-py tests pass (5 total: 4 binding smoke + 1 health).

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/main.py backend/tests
git commit -m "feat(backend): add /health endpoint wiring FastAPI to the solver"
```

---

## Task 12: Update `lefthook.yaml` with lint and test hooks

**Files:**
- Modify: `.config/lefthook.yaml`

- [ ] **Step 1: Replace `.config/lefthook.yaml` with the extended config**

```yaml
# .config/lefthook.yaml

commit-msg:
  commands:
    cog:
      run: cog verify --file {1} --ignore-merge-commits --ignore-fixup-commits

pre-commit:
  commands:
    lint:
      run: mise run lint

pre-push:
  commands:
    test:
      run: mise run test
```

- [ ] **Step 2: Re-install hooks so lefthook picks up the new stages**

Run: `lefthook install`
Expected: `sync hooks: ✔️ (commit-msg, pre-commit, pre-push)` or similar.

- [ ] **Step 3: Smoke-test the lint hook manually**

Run: `mise run lint`
Expected: every linter runs green — `cargo fmt --check` passes, `cargo clippy` passes, `cargo machete` reports no unused deps, `ruff check` passes, `ruff format --check` passes, `ty check` passes, `vulture backend/src` passes. If vulture flags false positives, adjust `min_confidence` in `pyproject.toml` `[tool.vulture]` or add a whitelist file `.vulture_whitelist.py` and pass it (`uv run vulture backend/src .vulture_whitelist.py`) — fix inline and proceed.

- [ ] **Step 4: Smoke-test the test hook manually**

Run: `mise run test`
Expected: `test:rust` and `test:py` both pass in parallel.

- [ ] **Step 5: Commit**

```bash
git add .config/lefthook.yaml
git commit -m "ci(lefthook): run lint on pre-commit and tests on pre-push"
```

---

## Task 13: Update `README.md` and `CONTRIBUTING.md` for the mise bootstrap flow

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Replace `README.md` dev-setup section**

Replace the entire contents of `README.md` with:

```markdown
# Klassenzeit — Timetabler for schools

A school timetabling system with a FastAPI backend and a Rust solver exposed to Python via PyO3.

## Dev Setup

1. Install [mise](https://mise.jdx.dev/).
2. `mise install` — installs the pinned toolchain (Rust, Python, uv, cocogitto, lefthook, cargo dev tools).
3. `mise run install` — installs git hooks and syncs dependencies (runs maturin for the solver).

## Common tasks

| Command | What it does |
|---|---|
| `mise run dev`   | Run the backend with auto-reload. |
| `mise run test`  | Run all Rust and Python tests. |
| `mise run lint`  | Lint Rust (fmt, clippy, machete) and Python (ruff, ty, vulture). |
| `mise run fmt`   | Auto-format Rust and Python. |
| `mise run cov`   | Produce Rust and Python coverage reports. |
| `mise run audit` | Supply-chain audit (`cargo deny`, `pip-audit`). |
| `mise run bench` | Run solver-core benches. |

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for commit message rules.
```

- [ ] **Step 2: Replace the "Prerequisites" and "First-time setup" sections of `CONTRIBUTING.md`**

Locate the first two `##` sections in `CONTRIBUTING.md` ("Prerequisites" and "First-time setup") and replace both with:

```markdown
## Prerequisites

The only thing you install by hand is [mise](https://mise.jdx.dev/). mise provides every other tool (Rust, Python, uv, cocogitto, lefthook, cargo-nextest, cargo-llvm-cov, cargo-machete, cargo-deny) at the pinned versions defined in `mise.toml`.

## First-time setup

```bash
mise install         # installs the pinned toolchain
mise run install     # installs git hooks and syncs deps (builds the solver via maturin)
```

After this, `mise run test`, `mise run lint`, `mise run dev` all work.

```

Leave the "Commit messages" section of `CONTRIBUTING.md` unchanged.

- [ ] **Step 3: Commit**

```bash
git add README.md CONTRIBUTING.md
git commit -m "docs: document mise bootstrap flow in README and CONTRIBUTING"
```

---

## Task 14: Final end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run lint**

Run: `mise run lint`
Expected: every step green.

- [ ] **Step 2: Run tests**

Run: `mise run test`
Expected: all Rust (`solver-core` 4 tests) and Python (5 tests: 4 binding + 1 health) tests pass.

- [ ] **Step 3: Smoke-test the dev server**

Run (in one terminal): `mise run dev`
Run (in another terminal): `curl -s http://127.0.0.1:8000/health`
Expected: `{"status":"ok","solver_check":"ko"}`
Stop the dev server with Ctrl-C.

- [ ] **Step 4: Smoke-test coverage**

Run: `mise run cov`
Expected: `cargo llvm-cov` writes `target/lcov.info`; `pytest --cov` prints a coverage report to stdout. Both should pass without errors. Any non-zero coverage on the placeholder `reverse_chars` / `/health` path is acceptable — this is a smoke test of the coverage pipeline, not a coverage-threshold gate.

- [ ] **Step 5: Smoke-test the audit task**

Run: `mise run audit`
Expected: `cargo deny check` reports no advisories against the pinned crates; `pip-audit` reports no known vulnerabilities in the resolved Python deps. If `cargo deny` complains about missing config, create a minimal `deny.toml` at repo root with `[advisories]`, `[licenses] allow = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "Unicode-DFS-2016"]`, `[bans]`, and `[sources]` stanzas (see `cargo deny init` for a template) and re-run.

- [ ] **Step 6: Verify git history is clean**

Run: `git log --oneline main..HEAD`
Expected: a linear sequence of conventional commits, one per task.

- [ ] **Step 7: Final verification commit (if `deny.toml` was added in Step 5)**

```bash
git add deny.toml
git commit -m "build(cargo-deny): add minimal policy for supply-chain audit"
```

If no `deny.toml` was needed, skip this step.

---

## Self-review notes

- **Spec coverage:** every section of the spec maps to at least one task:
  - Directory layout → Tasks 2, 3, 4, 5, 6
  - Build & dev wiring (Cargo.toml, pyproject.toml, maturin) → Tasks 2, 4, 5, 9
  - Toolchain & tasks (`mise.toml`) → Task 1
  - Python dev tooling → Tasks 5, 8
  - Testing strategy → Tasks 3 (proptest), 10 (binding smoke), 11 (async backend)
  - Lefthook wiring → Task 12
  - Scaffold commands → Tasks 1–9 in order
  - Documentation updates → Task 13
  - Final verification → Task 14
- **Deferred items** (frontend, DB, license, CI, auth) are intentionally absent and tracked in `docs/superpowers/OPEN_THINGS.md`.
- **Commit style:** every commit uses a Conventional Commits prefix enforceable by cocogitto.
