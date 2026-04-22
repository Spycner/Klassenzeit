# solver/CLAUDE.md

**Date:** 2026-04-22
**Status:** Design approved, plan pending.

## Problem

The Rust solver workspace (`solver/solver-core` + `solver/solver-py`) currently has no scoped `CLAUDE.md`. Claude falls back to the root `.claude/CLAUDE.md` for cross-cutting rules ("no bare catchalls" with Rust framing, "unique function names globally", "no dynamic imports", Dockerfile context rules) and to `backend/CLAUDE.md` only for Python callers that import the bindings. Solver-specific conventions — error-handling shape, PyO3 binding style, determinism, maturin dev loop, clippy allows policy, fixture layout — live nowhere and have to be re-derived each session.

`docs/superpowers/OPEN_THINGS.md` tracks this under "Pay down alongside the sprint":

> Write `solver/CLAUDE.md` before step 1. The Rust workspace currently relies on the root `.claude/CLAUDE.md` (no-bare-catchalls with Rust framing lives there). With real solver code landing in `solver-core` / `solver-py`, capture fixture patterns, error handling (catch-specific, propagate), PyO3 binding style, and clippy escape-hatch policy as local rules before the first scheduling PR.

Step 1 of the prototype sprint is the greedy first-fit solver MVP in `solver-core`. Landing conventions before the first substantive PR is the point; conventions added after are harder to retrofit because the first PR's style becomes the de-facto standard.

## Goal

Ship one new file `solver/CLAUDE.md`, ~60 lines, covering both crates under the `solver/` tree. Anthropic's memory loader picks it up for any file read under `solver-core/` or `solver-py/`.

## Non-goals

- **A full Rust style guide.** Root `.claude/CLAUDE.md` already covers cross-cutting rules (no bare catchalls with Rust framing, unique function names, no dynamic imports, SHA-pinning GitHub Actions, Conventional Commits enforcement). `solver/CLAUDE.md` only adds what is solver-specific.
- **Algorithm documentation.** The solver algorithm is TBD and will land in its own spec/plan pair during step 1 of the sprint. `solver/CLAUDE.md` describes how to work in the solver crates, not what the solver does.
- **Sprint tracking.** Sprint-specific content (greedy first-fit MVP, placement persistence, schedule view) stays in `docs/superpowers/OPEN_THINGS.md`. `CLAUDE.md` is loaded every session; stale sprint detail is worse than none.
- **ADR.** This PR documents existing conventions, it does not decide new architecture. ADR 0002 already covers the two-crate split. Adding an ADR for a `CLAUDE.md` addition sets a bad precedent.
- **Custom clippy lint for determinism.** A lint would catch `std::time::SystemTime::now()` and `rand::thread_rng()` inside `solver-core`. Writing one today for a codebase this small is overkill; the rule lives in prose and falls to code review.
- **Per-crate `CLAUDE.md` split.** A future third crate (`solver-cli`, `solver-bench`) could justify a split; today two short crates fit in one file cleanly.
- **Script-based validation of `solver/CLAUDE.md`.** The other two scoped `CLAUDE.md` files (`backend/`, `frontend/`) have no lint / line-cap check. Adding one for solver only is inconsistent. Periodic `claude-md-management:claude-md-improver` runs in `/autopilot` step 6 and 10 catch drift.

## Design

### File location and shape

Single file: `/home/pascal/Code/Klassenzeit/solver/CLAUDE.md`. Six H2 sections in order:

1. **Workspace layout** — what the two crates are, what's shared via the root Cargo/uv workspaces, where tests live, where stubs live.
2. **solver-core rules** — error handling (thiserror), determinism (no clock, seeded RNG), fixture location.
3. **solver-py rules** — thin wrappers only, `py.allow_threads` on long calls, hand-maintained `.pyi` stubs, maturin dev loop.
4. **Clippy and allows policy** — no `#![allow(...)]` at crate root; narrow `#[allow(specific::lint)] // Reason:` for PyO3 macro noise or the rare judgment call.
5. **Commit scopes** — `solver-core` / `solver-py` as Conventional Commits scope; bare `solver` only when a paired change genuinely spans both crates.
6. **Pointers** — ADR 0001 (monorepo), ADR 0002 (crate split), `docs/superpowers/OPEN_THINGS.md` for the current roadmap.

Target ~60 lines, between `backend/CLAUDE.md` (25) and `frontend/CLAUDE.md` (123). Sections 5-15 lines each; if one balloons during a sprint, extract it rather than letting the file drift past ~100.

### Rules captured (full list, with rationale)

**Error handling.**
- `solver-core` uses `#[derive(thiserror::Error)] pub enum Error` per logical boundary (input parsing, constraint validation, scheduling). No `anyhow` in `solver-core`.
- `solver-py` converts `solver_core::Error` into `PyErr` via explicit `From` impls: `PyValueError` for client mistakes (bad input shape), `PyRuntimeError` for solver-internal failures (infeasible, timeout, internal invariant violation).
- Rationale: a library erases type information when it boxes into `anyhow`; typed enums let the backend match on specific failure modes (e.g. "missing qualification for lesson X") and render them.

**Determinism.**
- `solver-core` produces the same output for the same input. No `std::time::SystemTime::now()` inside the crate; no `rand::thread_rng()`.
- Any randomisation is seeded via a parameter on the public API so tests can reproduce.
- Applies to `solver-core` only; `solver-py` is allowed to wrap the deterministic core with wall-clock timing for logging.
- Rationale: non-determinism is silent — unit tests still pass for a specific seed — and only surfaces when the same input produces different timetables run-to-run. Catching at code-review time requires an explicit rule.

**Fixture split.**
- solver-core: inline `#[cfg(test)] mod tests` for unit; `solver-core/tests/*.rs` for integration (property tests, multi-step scenarios). If a shared fixtures module grows, add `solver-core/tests/common/mod.rs`.
- solver-py: Python tests at `solver/solver-py/tests/test_*.py` exercise the PyO3 binding contract only (encoding, GIL release, error conversion).
- Rule: **do not duplicate algorithm tests in Python.** Narrow exception: bugs that are binding-specific (e.g. float NaN handling at the PyO3 boundary).
- Rationale: the same case running in two suites costs twice the time and catches nothing extra, except in the narrow exception.

**PyO3 binding style.**
- Every `solver-core` public symbol exposed to Python goes through a `#[pyfunction]` or `#[pyclass]` wrapper in `solver-py/src/lib.rs`. The wrapper marshals arguments, forwards to `solver-core`, marshals the result back; it contains no algorithm logic.
- Long-running solver calls release the GIL via `py.allow_threads(|| ...)`. Forgetting this serialises every caller behind the interpreter lock; the failure mode ("Python threads don't make progress during a solve") is invisible in single-threaded tests.
- `.pyi` stubs in `solver-py/python/klassenzeit_solver/` are hand-maintained and updated in the same commit as the Rust binding change. Maturin has no stub-gen step; forgetting the stub silently breaks backend type-checking for new symbols.

**Clippy and allows policy.**
- Default: no `#[allow(...)]` at item scope, no `#![allow(...)]` at crate root.
- Two narrow exceptions:
  1. A specific lint the contributor judges wrong in a specific block, with a `// Reason: ...` sibling comment naming why.
  2. PyO3 macro expansion noise (e.g. `clippy::needless_pass_by_value` triggered by `&Bound<'_, PyModule>` in `#[pymodule]` signatures). Allow locally on the wrapper and say so.
- No `#[allow(dead_code)]` outside `#[cfg(test)]`. If you think you need it, run `cargo machete` (already in `mise run lint:rust`) first — it often surfaces the dependency you actually want to remove.

**Maturin dev loop.**
- Source-only edits in `solver-core` or `solver-py/src/lib.rs` → `mise run solver:rebuild` (wraps `uvx maturin develop --uv -m solver/solver-py/Cargo.toml`, runs in seconds).
- Edits to `solver-py/pyproject.toml`, `Cargo.lock`, or the workspace `Cargo.toml` → `uv sync` (re-resolves the whole workspace, tens of seconds).
- Rationale: Claude's default is the slower, safer `uv sync` after every Rust edit, which costs ~1 min per iteration. Naming the fast path teaches the right narrower command.

**Commit scopes.**
- Use the crate directory as scope: `feat(solver-core): ...`, `fix(solver-py): ...`, `test(solver-core): ...`, `build(solver-py): ...`.
- Bare `solver` scope only when a paired change genuinely spans both crates (e.g. new public API in `solver-core` plus its binding in `solver-py` in one atomic commit).
- `.github/commit-types.yml` enforces commit *types*; scopes are free-form, but a consistent convention keeps `git log` grep-friendly.

### Three inline examples

Examples go in the final file where the wrong pattern is non-obvious. Examples bit-rot faster than prose; these three earn their keep.

1. **thiserror enum skeleton** (prevents reaching for `anyhow` by default):
   ```rust
   #[derive(Debug, thiserror::Error)]
   pub enum Error {
       #[error("input: {0}")]
       Input(String),
       #[error("infeasible at step {step}: {reason}")]
       Infeasible { step: &'static str, reason: String },
   }
   ```
2. **`py.allow_threads` wrapper** (prevents the GIL-held regression):
   ```rust
   #[pyfunction]
   fn solve(py: Python<'_>, problem: &str) -> PyResult<String> {
       py.allow_threads(|| solver_core::solve(problem))
           .map_err(|e| PyRuntimeError::new_err(e.to_string()))
   }
   ```
3. **Good and bad commit scope pair** (keeps `git log` readable):
   - Good: `feat(solver-core): greedy first-fit placement`.
   - Bad: `feat(solver): greedy first-fit placement` (loses the which-crate signal when solver-py also gets a commit that week).

### Testing-command map

Short table. Teaches the narrower right command per change kind instead of defaulting to `cargo test --workspace`:

| Change | Command |
| --- | --- |
| Rust-only edit in one crate | `cargo nextest run -p <crate>` |
| Rust-only edit, full workspace | `mise run test:rust` |
| PyO3 signature or stub change | above + `uv run pytest solver/solver-py/tests` |
| Any commit | `mise run lint` (pre-commit hook runs it anyway; fail fast locally) |
| Algorithm change | `mise run bench` (placeholder today; note that) |

### Pointers

Close the file with links rather than restating architecture, so the pointers themselves become the single source of truth that survives refactoring:

- ADR 0001 (monorepo with Cargo + uv workspaces)
- ADR 0002 (solver split into solver-core and solver-py)
- `docs/superpowers/OPEN_THINGS.md` (current sprint items, cross-entity validation debate, follow-ups)

### Sibling doc update

Remove the "Write `solver/CLAUDE.md` before step 1" bullet from `docs/superpowers/OPEN_THINGS.md` under "Pay down alongside the sprint". The surrounding context (cross-entity validation strategy, logging around the solve boundary, sprint steps) stays untouched. This is the only sibling change; `README.md`'s command table does not list subsystem `CLAUDE.md` files, and `docs/architecture/overview.md` does not describe the solver tree layout in a way that needs updating.

## Implementation order

Four commits on the branch `docs/solver-claude-md`:

1. `docs: add solver/CLAUDE.md design spec` — this file.
2. `docs: add solver/CLAUDE.md implementation plan` — the plan at `docs/superpowers/plans/2026-04-22-solver-claude-md.md`.
3. `docs(solver): add solver/CLAUDE.md` — the new file itself, the whole artifact in one commit.
4. `docs(open-things): remove resolved solver CLAUDE.md bullet` — the one-line sibling change in `docs/superpowers/OPEN_THINGS.md`.

Splitting the content commit from the OPEN_THINGS update keeps the `docs/superpowers/OPEN_THINGS.md` history clean (its log reads as a series of "removed X", "added Y" rather than mixed with feature work).

## Risks

- **File ages poorly as the solver grows.** Rules captured for a scaffold may not match a real solver. Mitigated by linking out (OPEN_THINGS.md, ADRs) rather than embedding sprint detail, and by periodic `claude-md-improver` runs.
- **Contributor reaches for `anyhow` anyway.** The rule lives in prose; CI doesn't enforce it. Mitigated by the `thiserror` inline example, by the first step-1 PR establishing the pattern, and by code review. If the rule is violated repeatedly, revisit whether a clippy custom lint is warranted.
- **GIL release rule is proactive.** The current `reverse_chars` stub is instant; the `py.allow_threads` rule bites only when the real solver lands. Fine — rules for a scaffold are cheaper to write before they're needed than after.
- **`.pyi` stub drift.** Hand-maintained stubs are a known maintenance burden. Mitigated by the commit-same-diff rule and by backend type-checking breaking on unknown imports. Revisit if a stub-gen workflow becomes available upstream.
- **"Do not duplicate algorithm tests in Python" misread as absolute.** The binding-specific exception is captured in the spec above and will be captured in the file. Misread risk is low; the exception is named.

## Follow-ups (not this PR)

- Step 1 of the prototype sprint: greedy first-fit solver MVP in `solver-core`. Uses the conventions established by this PR as the starting template (thiserror enum, deterministic API, seeded RNG parameter).
- Structured logging around the solve boundary (tracked separately in OPEN_THINGS.md). When the solver lands, the logging convention may expand `solver-py` rules to cover `tracing` integration.
- Criterion benches under `solver-core/benches/`. The `mise run bench` task exists as a placeholder; when the first bench lands, extend the testing-command map entry.
- Custom clippy lint for determinism. Revisit when the solver has real randomisation and real clock-free surfaces to protect.
