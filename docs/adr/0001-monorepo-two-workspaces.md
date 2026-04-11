# 0001 — Monorepo with Cargo and uv workspaces

- **Status:** Accepted
- **Date:** 2026-04-11 (backfilled; decision made in the project
  scaffolding spec on the same date)

## Context

Klassenzeit needs a Python HTTP backend and a Rust solver in the same
repository, with a fast dev loop where Rust edits are immediately
available to the backend. Contributors and CI must use the same
toolchain, and there must be one canonical command per operation
(test, lint, format).

## Decision

Use a single repository with two workspace roots at the top level: a
Cargo workspace (`Cargo.toml`) and a uv workspace (`pyproject.toml`).
Both `cargo` and `uv` commands work from the repo root without `cd`.

`backend/` and `solver/solver-py/` are uv workspace members;
`solver/solver-core/` and `solver/solver-py/` are Cargo workspace
members. `solver/solver-py/` is a member of *both* — its
`pyproject.toml` declares `maturin` as the build backend, so `uv sync`
invokes maturin to build the Rust extension and install it editably
into the shared `.venv/`.

## Alternatives considered

- **Separate repositories.** Rejected because it would require
  publishing the solver as a wheel on every Rust edit and breaks the
  editable dev loop.
- **Single Python workspace, solver as a submodule.** Rejected
  because Cargo submodules are second-class citizens and CI wiring
  becomes awkward.
- **Python workspace only, Rust via a hand-rolled wheel.** Rejected
  because it duplicates what maturin already does and loses IDE
  integration for the Rust code.

## Consequences

- Contributors install one toolchain (`mise install`) and get one
  venv (`.venv/`) and one target directory.
- `uv sync` after a Rust edit triggers a maturin rebuild. Fast after
  the first build, but *not* automatic on file change.
- Two workspace concepts is unusual in the broader ecosystem, but
  the polyglot pattern is well-trodden (PyO3 projects, Rust-backed
  Python libraries).
