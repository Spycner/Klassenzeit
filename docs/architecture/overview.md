# System overview

**Klassenzeit** is a scheduling app for school class time — working
title for a planner that will eventually assign teachers, classes,
rooms, and time slots under constraints. The solver is the heart of
the product; everything else serves it.

## Monorepo layout

```
klassenzeit/
├── backend/          # Python 3.13, FastAPI. HTTP API and orchestration.
├── solver/
│   ├── solver-core/  # Pure Rust. Scheduling/optimisation logic.
│   │                 # PyO3-free; unit- and property-tested with proptest.
│   └── solver-py/    # PyO3 bindings. Thin wrapper exposing solver-core
│                     # to Python via `klassenzeit_solver`.
├── frontend/         # Reserved for the eventual frontend (not yet
│                     # scaffolded; framework undecided).
├── compose.yaml      # Root-level podman compose file. Hosts the dev
│                     # Postgres today; frontend and backend services
│                     # will be added here later.
├── mise.toml         # Single source of truth for toolchain versions
│                     # and `mise run <task>` task definitions.
├── Cargo.toml        # Cargo workspace root.
├── pyproject.toml    # uv workspace root.
└── docs/             # This directory.
```

## Toolchain surface

- **`mise`** — installs pinned Rust, Python, uv, and cargo tools;
  defines every canonical task (`install`, `test`, `lint`, `dev`,
  `db:up`, `db:migrate`, …).
- **`uv`** — Python package manager and workspace tool. Every Python
  dependency goes through `uv add`; never hand-edit `pyproject.toml`
  dependency sections.
- **`cargo`** — Rust package manager. Both `solver-core` and
  `solver-py` are members of the top-level Cargo workspace.
- **`podman compose`** — local container orchestration (dev DB,
  eventually containerized backend/frontend).
- **`lefthook`** — git hook runner (`pre-commit`: lint; `pre-push`:
  tests; `commit-msg`: `cog verify`).
- **`cocogitto`** — enforces Conventional Commits on every commit.

## Subsystems

- **Database layer** (`backend/src/klassenzeit_backend/db/`) —
  SQLAlchemy 2.0 async on Postgres 17 with Alembic migrations. See
  [`database.md`](database.md) for contributor details.
- **HTTP API** (`backend/src/klassenzeit_backend/main.py`, growing) —
  FastAPI app. Currently only `/health` exists.
- **Solver** — see `solver/solver-core/` for the Rust crate and its
  benches; `solver/solver-py/` for the PyO3 binding layer.
- **Authentication** — not yet implemented. Design spec pending.

## Decisions

Every load-bearing architectural decision has an entry in
[`../adr/`](../adr/). Read the ADR index first if you want to
understand why the project looks the way it does.
