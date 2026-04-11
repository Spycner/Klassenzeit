# 0002 — Rust solver split into solver-core and solver-py

- **Status:** Accepted
- **Date:** 2026-04-11 (backfilled; decision made in the project
  scaffolding spec on the same date)

## Context

The solver is the performance-critical heart of the product. We need
to be able to benchmark and property-test it without dragging Python
into the inner loop, while still exposing it to the FastAPI backend
with an ergonomic Python API.

## Decision

Split the Rust code into two crates in the same Cargo workspace:

- **`solver/solver-core/`** — pure Rust `rlib`, no PyO3 in its
  `Cargo.toml`. This is where the optimisation logic lives.
  Unit-tested with `cargo nextest`, property-tested with `proptest`,
  benched with criterion.
- **`solver/solver-py/`** — PyO3 `cdylib`. Depends on `solver-core`
  via `path`. Exposes a thin `#[pyfunction]` layer that marshals
  Python types into `solver-core` calls. Built into a wheel by
  maturin and installed editably into the shared `.venv/`.

## Alternatives considered

- **Single crate with PyO3 baked into the solver.** Rejected because
  every solver benchmark and property test would need a Python
  interpreter, and the core logic would be coupled to PyO3's
  lifetimes.
- **Solver as a separate crate with its own `cargo workspace`.**
  Rejected because the `path` dependency across workspaces is more
  friction than benefit for a two-crate split.

## Consequences

- `solver-core` is reusable in a pure-Rust CLI, a separate
  service, or any other future consumer without touching binding
  code.
- `solver-py` stays thin and easy to audit. Its tests are a
  binding-contract regression suite, not a logic test suite.
- TDD happens in `solver-core` with sub-second feedback; `solver-py`
  rarely needs TDD.
- An extra crate to maintain, but the boundary pays for itself the
  first time we want to benchmark without an interpreter.
