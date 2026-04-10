# Project Scaffolding Design

**Date:** 2026-04-11
**Status:** Approved (design)
**Scope:** Initial scaffold for the Klassenzeit monorepo — Python backend (uv), Rust solver with PyO3 bindings, toolchain management. Frontend is explicitly deferred.

## Goals

1. Single monorepo holding a Python HTTP backend, a pure-Rust solver core, and a thin PyO3 binding crate that exposes the solver to Python.
2. Editable dev loop: editing Rust and re-syncing makes the change available to the backend without manual wheel builds.
3. Reproducible toolchain: any contributor (and CI) runs the same Rust, Python, uv, cocogitto, and lefthook versions.
4. One canonical command per operation (test, lint, format, bench, dev server), used identically by humans and CI.
5. Clean separation between solver logic (pure Rust, benchable, Python-agnostic) and the Python binding layer (thin wrapper).

## Non-goals

- **Frontend scaffolding.** Framework choice (React, Svelte, Vue, …) is unresolved. `frontend/` will be scaffolded in a separate spec once the framework is chosen; this design does not reserve any config or paths for it beyond leaving the directory name available.
- **Authentication, API surface.** This spec covers structural scaffolding only; product-level concerns come later.
- **Database layer and migrations.** ORM/migration choice (SQLAlchemy 2.0 + Alembic vs SQLModel vs something async-native) is a real architectural decision and out of scope here. No `db/` directory in the initial scaffold; it gets its own spec once the stack is chosen.
- **Production deployment.** Docker, reverse proxy, secrets management are out of scope.
- **Licensing.** Deferred. The root `Cargo.toml` does not declare a license; no `LICENSE` file is created. Revisit when the project's distribution model is clearer.
- **CI configuration.** No GitHub Actions / pipeline config in this spec. `mise run audit` exists as a task so CI can invoke it later, but wiring lives in a separate spec.

## Architecture

### Directory layout

```
klassenzeit/
├── pyproject.toml          # uv workspace root
├── uv.lock
├── Cargo.toml              # Cargo workspace root
├── Cargo.lock
├── mise.toml               # toolchain pins + task definitions
├── README.md
├── CONTRIBUTING.md
├── .config/lefthook.yaml
│
├── backend/                # uv workspace member — HTTP API
│   ├── pyproject.toml      # name = "klassenzeit-backend"
│   ├── src/klassenzeit_backend/
│   │   ├── __init__.py
│   │   ├── main.py         # FastAPI entry
│   │   ├── api/            # routers
│   │   ├── core/           # settings, logging
│   │   └── services/       # wraps klassenzeit_solver calls
│   └── tests/
│
├── solver/                 # Rust code — both crates are Cargo workspace members
│   ├── solver-core/        # pure Rust, rlib
│   │   ├── Cargo.toml
│   │   ├── src/lib.rs
│   │   ├── tests/
│   │   └── benches/
│   └── solver-py/          # PyO3 bindings, cdylib (thin wrapper over solver-core)
│       ├── Cargo.toml
│       ├── pyproject.toml  # maturin build backend; name = "klassenzeit-solver"
│       ├── src/lib.rs
│       └── tests/          # Python-level binding smoke tests (pytest)
│
├── scripts/                # dev helpers / one-offs (not task orchestration)
└── docs/
    └── superpowers/specs/  # design documents (including this one)
```

### Key structural decisions

**Two workspace roots at repo top.** The repo root has both a `Cargo.toml` (workspace) and a `pyproject.toml` (uv workspace). `cargo` commands and `uv` commands both work from repo root without `cd`. This is the standard polyglot pattern.

**`solver/solver-py/` is a member of both workspaces.** Cargo sees it as a crate; uv sees it as a Python package because its `pyproject.toml` declares `maturin` as the build backend. This dual membership is what makes the editable dev loop work: `uv sync` at the repo root invokes maturin, compiles the Rust extension, and installs it editably into the shared `.venv/`.

**`solver-core` is PyO3-free.** It's a pure Rust `rlib` — no PyO3 in its `Cargo.toml`. `solver-py` depends on it via `solver-core = { path = "../solver-core" }` and exposes a thin `#[pyfunction]` layer. This keeps optimisation-critical code 100% Python-agnostic, so it can be benchmarked, fuzzed, or reused from a pure-Rust context later without touching binding code.

**Backend depends on the solver as a workspace member**, not a path dep. The root `pyproject.toml` declares `klassenzeit-solver` as a workspace source once; `backend/pyproject.toml` depends on it by name (`klassenzeit-solver`) and uv resolves it to the local member.

## Build & dev wiring

### Root `Cargo.toml`

```toml
[workspace]
resolver = "2"
members = ["solver/solver-core", "solver/solver-py"]

[workspace.package]
edition = "2021"
rust-version = "1.82"

[workspace.dependencies]
# shared deps pinned here, referenced via { workspace = true } in members
proptest = "1"
```

### Root `pyproject.toml`

```toml
[tool.uv.workspace]
members = ["backend", "solver/solver-py"]

[tool.uv.sources]
klassenzeit-solver = { workspace = true }
```

The root itself is not a publishable package — it only defines the workspace. `uv sync` at the repo root resolves both members into a single `.venv/` at the root.

### `solver/solver-core/Cargo.toml`

Plain rlib, no PyO3. Property-testing via `proptest` as a dev-dep.

```toml
[package]
name = "solver-core"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true

[lib]
# default rlib

[dev-dependencies]
proptest = { workspace = true }
```

### `solver/solver-py/Cargo.toml`

PyO3 cdylib depending on `solver-core`:

```toml
[package]
name = "solver-py"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true

[lib]
name = "klassenzeit_solver"   # the Python import name
crate-type = ["cdylib"]

[dependencies]
solver-core = { path = "../solver-core" }
pyo3 = { version = "0.22", features = ["extension-module"] }
```

### `solver/solver-py/pyproject.toml`

Maturin builds the wheel:

```toml
[build-system]
requires = ["maturin>=1.7,<2.0"]
build-backend = "maturin"

[project]
name = "klassenzeit-solver"
version = "0.1.0"
requires-python = ">=3.13"

[tool.maturin]
module-name = "klassenzeit_solver"
features = ["pyo3/extension-module"]
```

### `backend/pyproject.toml`

Populated by `uv init --package backend` and `uv add` commands (see "Scaffold commands" below). Runtime deps: `fastapi[standard]`, `klassenzeit-solver`. **Never hand-edit the `[project.dependencies]` list** — always add dependencies via `uv add`.

### Dev loop

1. `mise install` — installs the pinned toolchain (Rust, Python 3.13, uv, cocogitto, lefthook).
2. `mise run install` — runs `lefthook install` and `uv sync`. On first run, `uv sync` invokes maturin to compile `solver-py` and install it editably into `.venv/`.
3. Edit Rust in `solver/solver-core/` or `solver/solver-py/` → `uv sync` (or `uv run --reinstall-package klassenzeit-solver ...`) rebuilds the native module. Incremental, fast after the first build.
4. Backend imports with `from klassenzeit_solver import ...` like any other dep.
5. Pure-Rust work on `solver-core` stays in the native Rust loop: `cargo nextest run -p solver-core`, `cargo bench -p solver-core`. No Python in that loop.

**Known friction:** uv's maturin-backend rebuilds are not automatic on file change. Rust edits require re-running `uv sync`. If this becomes a significant annoyance in practice, `maturin develop --uv` is the escape hatch — but start with `uv sync` and only reach for the alternative if needed.

## Toolchain & tasks — `mise.toml`

Single file at the repo root. Pins every tool a contributor needs and defines every task. Replaces the manual install checklist currently in `CONTRIBUTING.md`.

```toml
# mise.toml

[tools]
rust    = "1.82"
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

**Rationale for pinning Rust but not uv:** Rust toolchain drift causes silent, hard-to-debug compile and behavior differences; pinning prevents that. uv and the dev tools (cocogitto, lefthook) are less load-bearing and update carefully enough to run as `latest`.

## Python dev tooling

All Python dev tools live in uv dev dependencies, not as mise system tools. Added once at the workspace root, available to every workspace member through the shared `.venv/`.

- **ruff** — linter and formatter. Canonical Astral choice.
- **ty** — Astral's type checker, currently in preview. Chosen to keep the Python tool stack Astral-consistent (ruff + uv + ty). Preview status is a known tradeoff; revisit if it proves unstable in practice.
- **vulture** — dead-code detector. De facto standard, tunable via whitelist file for false positives. Runs across `backend/src`.
- **pytest** — test runner for both backend and solver-py binding tests.
- **pytest-asyncio** — async test support. Required for FastAPI route tests that use `httpx.AsyncClient`. Configured with `asyncio_mode = "auto"` in `[tool.pytest.ini_options]` so tests don't need per-function decorators.
- **pytest-cov** — coverage plugin. Invoked only by `mise run cov`, not by `mise run test`, to keep the TDD loop fast.
- **httpx** — comes along for free from `fastapi[standard]`; used as the FastAPI test client.

### Pytest configuration

Root `pyproject.toml` declares pytest discovery and async mode:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["backend/tests", "solver/solver-py/tests"]
```

## Testing strategy

Three domains, three native runners:

1. **`solver-core` (pure Rust).** `cargo nextest run -p solver-core` and `cargo bench -p solver-core`. This is where most solver logic is tested: unit tests, **property tests via `proptest`**, criterion benches. Fast, no Python interpreter. TDD happens here.

2. **`solver-py` (PyO3 binding layer).** Thin by design, so it gets thin tests: a handful of pytest smoke tests in `solver/solver-py/tests/` that import `klassenzeit_solver`, call each exposed function, and assert the binding contract (types marshalled correctly, errors surface as Python exceptions). Invoked by `mise run test:py`.

3. **`backend` (Python).** `mise run test:py` runs pytest across `backend/tests/`. Uses `httpx.AsyncClient` for async route tests (via `pytest-asyncio`). The solver is a real dependency in backend tests — not mocked. This is intentional: the solver is fast enough that mocking would only hide binding or integration bugs, and it's consistent with the project rule that integration tests hit real dependencies.

**TDD cadence:**
- Red/green/refactor in `solver-core` with `cargo nextest run -p solver-core` — sub-second feedback.
- Red/green/refactor in `backend` with `uv run pytest backend/tests -k <name>` — sub-second feedback.
- `solver-py` rarely needs TDD; its tests act as a binding-contract regression suite.

**Coverage is separate.** `mise run test` runs uninstrumented (fast, TDD-friendly). `mise run cov` runs both `cargo llvm-cov` and `pytest --cov` for report generation — invoked manually or from CI, never in the inner dev loop.

## Lefthook wiring

`.config/lefthook.yaml` gains hooks that call mise tasks directly, so there is one source of truth for every operation.

- `commit-msg`: `cog verify` (already exists, unchanged).
- `pre-commit`: `mise run lint` — runs `lint:rust` and `lint:py` concurrently.
- `pre-push`: `mise run test` — runs `test:rust` and `test:py` concurrently.

## Scaffold commands

The implementation plan must use `uv add` / `uv add --dev` to populate Python **dependencies** — never hand-edit `[project.dependencies]` or `[dependency-groups]` in any `pyproject.toml`. Hand-writing *non-dependency* sections (`[tool.uv.workspace]`, `[tool.uv.sources]`, `[build-system]`, `[project]` metadata, `[tool.maturin]`, `[tool.ruff]`, etc.) is fine and expected — those are configuration, not dependencies.

Ordering matters: `uv add --package klassenzeit-backend klassenzeit-solver` only succeeds once the workspace knows `klassenzeit-solver` is a member, which requires the root workspace config and `solver/solver-py/pyproject.toml` to exist first. Canonical sequence:

```bash
# 1. Toolchain
mise install

# 2. Rust workspace (hand-written — no uv involvement)
#    — root Cargo.toml        (workspace, members, workspace.package, workspace.dependencies)
#    — solver/solver-core/Cargo.toml + src/lib.rs  (pure rlib)
#    — solver/solver-py/Cargo.toml   + src/lib.rs  (cdylib + PyO3, path dep on solver-core)

# 3. uv workspace config (hand-written — workspace config, not dependencies)
#    — root pyproject.toml:
#        [tool.uv.workspace] members = ["backend", "solver/solver-py"]
#        [tool.uv.sources]   klassenzeit-solver = { workspace = true }
#    — solver/solver-py/pyproject.toml:
#        [build-system] requires = ["maturin>=1.7,<2.0"]
#        [build-system] build-backend = "maturin"
#        [project] name = "klassenzeit-solver", version = "0.1.0", requires-python = ">=3.13"
#        [tool.maturin] module-name = "klassenzeit_solver", features = ["pyo3/extension-module"]

# 4. Backend package skeleton — creates backend/pyproject.toml and backend/src/…
uv init --package --name klassenzeit-backend backend

# 5. Backend dependencies — uv add, always
uv add --package klassenzeit-backend "fastapi[standard]"
uv add --package klassenzeit-backend klassenzeit-solver

# 6. Workspace-wide dev dependencies (run at repo root)
uv add --dev pytest pytest-asyncio pytest-cov ruff ty vulture

# 7. First sync — invokes maturin to build solver-py into the shared .venv/
uv sync

# 8. mise.toml (hand-written, see "Toolchain & tasks" section)

# 9. lefthook.yaml (edit existing file, add pre-commit and pre-push hooks)

# 10. Verify the full stack
mise run lint
mise run test
```

**Non-dependency files that are hand-written** (for clarity, since the uv-add rule has caused confusion before):

- All `Cargo.toml` files (Rust has no `uv add` equivalent).
- `mise.toml` (toolchain + tasks — not a package manifest).
- `.config/lefthook.yaml` edits.
- Workspace config in the root `pyproject.toml` (`[tool.uv.workspace]`, `[tool.uv.sources]`) — these declare *structure*, not dependencies.
- `[build-system]`, `[project]` metadata, `[tool.maturin]`, `[tool.ruff]`, `[tool.pytest.ini_options]` etc. inside any `pyproject.toml`.

**What must always go through `uv add`:** every package name that ends up in `[project.dependencies]` or `[dependency-groups]`.

## Documentation updates

`CONTRIBUTING.md` "Prerequisites" and "Installing the dev tools" sections collapse to:

> 1. Install [mise](https://mise.jdx.dev/).
> 2. `mise install`
> 3. `mise run install`

The Conventional Commits section is unchanged.

`README.md` "Dev Setup" is updated to the same three-step flow.

## Open questions resolved during brainstorming

- **Solver coupling to Python** — Two crates in a Cargo workspace (`solver-core` pure Rust, `solver-py` PyO3 bindings).
- **uv workspace location** — Repo root, with `backend/` and `solver/solver-py/` as members.
- **Top-level task runner** — `mise` (also replaces manual toolchain install).
- **Python version** — 3.13.
- **Python dev tools** — ruff, ty, vulture, pytest-asyncio, pytest-cov.
- **Rust dev tools** — proptest (property tests), cargo-nextest (runner), cargo-llvm-cov (coverage), cargo-machete (unused deps), cargo-deny (supply chain).
- **Dependency management** — Python deps always via `uv add`, never hand-edited.
- **ASGI server** — uvicorn, pulled in via `fastapi[standard]`.
- **Frontend** — deferred.
- **License** — deferred; no `license` field in `Cargo.toml`, no `LICENSE` file.
- **Database layer** — deferred; no `db/` directory, no ORM/migration tool pinned.
