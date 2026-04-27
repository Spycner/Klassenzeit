# Klassenzeit: Solver Rules

Applies to the `solver/` Cargo workspace (`solver-core` + `solver-py`). Assumes the cross-cutting rules in the root `/.claude/CLAUDE.md` (no bare catchalls, unique function names, no dynamic imports, Dockerfile context rules, SHA-pinned third-party actions, Conventional Commits).

## Workspace layout

- **`solver-core`**: pure Rust library. The scheduling algorithm, constraint model, and typed errors live here. No PyO3, no Python, no I/O beyond what callers pass in.
- **`solver-py`**: `cdylib` crate that wraps `solver-core` via PyO3 (`0.28`) and is built by maturin into the `klassenzeit_solver` Python package. Thin wrappers only; no algorithm logic.
- **Root `Cargo.toml`**: workspace root. Declares `edition = "2021"`, `rust-version = "1.85"`, `resolver = "2"`. Shared dev-dependency: `proptest = "1"`. Both crates inherit via `[workspace.package]` / `[workspace.dependencies]`.
- **Root `pyproject.toml`**: uv workspace. `solver/solver-py` is a member; backend pulls it in via `klassenzeit-solver = { workspace = true }`.
- **Hand-maintained `.pyi` stubs**: `solver/solver-py/python/klassenzeit_solver/*.pyi`. Updated in the same commit as a Rust binding change.

## solver-core rules

- **`#![deny(missing_docs)]` is on at the crate root.** Every new `pub` item, including struct fields, enum variants, and macro-generated newtypes, needs a `///` rustdoc line or the crate refuses to compile. Plans that paste ready-to-compile code must include the doc comments.
- **`clippy::doc_lazy_continuation` flags `+` at the start of a `///` continuation line** as a Markdown bullet against the previous line and fails the `-D warnings` build. Use `and` / `plus` instead, or indent the continuation by two spaces.
- **Errors use `thiserror`, one enum per logical boundary** (input parsing, constraint validation, scheduling). No `anyhow` in `solver-core`; a library erases type information when it boxes, and the backend wants to match on specific failure modes.

    ```rust
    #[derive(Debug, thiserror::Error)]
    #[non_exhaustive]
    pub enum Error {
        #[error("input: {0}")]
        Input(String),
    }
    ```

- **Deterministic under test.** No `std::time::SystemTime::now()` inside `solver-core`; no `rand::thread_rng()`. Any randomisation is seeded via a parameter on the public API so tests reproduce. Non-determinism here is silent (unit tests pass for a specific seed) and only surfaces as run-to-run timetable drift. `solver-py` is allowed to wrap the deterministic core with wall-clock timing for logging.
- **Tests.** Inline `#[cfg(test)] mod tests` for unit, `solver-core/tests/*.rs` for integration (property tests, multi-step scenarios). When a shared fixtures module grows, add `solver-core/tests/common/mod.rs`.
- **Bench targets cannot host libtest tests.** A `[[bench]] harness = false` binary (criterion's requirement) runs criterion's `main()`, not libtest; inline `#[cfg(test)] mod tests { #[test] fn ... }` inside the bench compiles but its `#[test]` functions never execute. Put the helper plus its tests in a dedicated `benches/<name>.rs`, then `#[path]`-include that file from both the bench target and a one-line `tests/bench_<name>.rs` integration binary so libtest picks the tests up (`solver-core/benches/percentile.rs` + `solver-core/tests/bench_percentile.rs` are the template).
- **Lowest-delta greedy iterates pre-sorted indices.** `solve_with_config` sorts `time_blocks` by `(day_of_week, position, tb.id)` and `rooms` by `id` once per solve, then iterates index lists. The picker's `(score, day, position, room.id)` tiebreak rule and its early-exit at `score == state.soft_score` both depend on those orderings. PR-9b's LAHC neighbour generator must reuse the same orderings or the solver loses run-to-run determinism that the property test in `tests/score_property.rs` enforces.
- **Soft-score evaluation must not allocate inside `try_place_hour`.** The candidate-scan is `O(time_blocks * rooms)` per placement; an early version of `gap_count_after_insert` cloned the partition `Vec<u8>` per call and breached the 20% bench budget ~17x on `zweizuegig`. The non-allocating shape (compute `new_min`/`new_max`/`len_after` from the existing `&Vec<u8>` plus the proposed `pos`, then call `score::gap_count`) is the canonical pattern; PR-9b's local-search delta evaluation should follow it.

## solver-py rules

- **Thin wrappers only.** Every `solver-core` public symbol exposed to Python goes through a `#[pyfunction]` / `#[pyclass]` in `solver-py/src/lib.rs`. The wrapper marshals arguments, forwards, marshals the result back. No algorithm logic in `solver-py`.
- **Release the GIL on long calls.** Forgetting this serialises every caller behind the interpreter lock; the failure mode is invisible in single-threaded tests. PyO3 0.28 renamed `Python::allow_threads` to `Python::detach`; older snippets on the web still show `allow_threads` and no longer compile.

    ```rust
    #[pyfunction]
    #[pyo3(name = "solve_json")]
    fn py_solve_json(py: Python<'_>, problem: &str) -> PyResult<String> {
        py.detach(|| solver_core::solve_json(problem))
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }
    ```

- **Disambiguate the Rust fn name from the Python-facing name** when the Python name already exists as a `solver-core` symbol. `scripts/check_unique_fns.py` in pre-commit rejects two `fn solve_json` definitions across the workspace; the PyO3 attribute `#[pyo3(name = "solve_json")]` on a differently-named Rust wrapper (`py_solve_json`) keeps the Python surface stable without colliding.
- **Errors map explicitly.** `solver_core::Error` to `PyValueError` for client mistakes (bad input shape), `PyRuntimeError` for solver-internal failures (timeout, internal invariant violation). Placement failures are not errors: they come back as `Violation` entries inside the `Solution`, so the wrapper returns them as normal data and the Python caller decides how to surface them. Use `From` impls or a small adapter for error paths; never `anyhow`.
- **Python tests exercise the binding contract, not the algorithm.** Tests at `solver/solver-py/tests/test_*.py` cover encoding, GIL release, error conversion. Narrow exception: a regression test for a bug that is binding-specific (e.g., float NaN handling across PyO3).
- **Maturin dev loop.**
    - Source-only edit in `solver-core` or `solver-py/src/lib.rs`: `mise run solver:rebuild` (wraps `uvx maturin develop --uv -m solver/solver-py/Cargo.toml`, seconds).
    - Edit touching `solver-py/pyproject.toml`, `Cargo.lock`, or the workspace `Cargo.toml`: `uv sync` (re-resolves the whole workspace, tens of seconds).

## Clippy and allows policy

- No `#![allow(...)]` at crate root, ever.
- No `#[allow(...)]` at item scope unless one of:
    1. A specific lint the contributor judges wrong in this block, with a sibling `// Reason: ...` comment naming why.
    2. PyO3 macro expansion noise (e.g., `clippy::needless_pass_by_value` from `&Bound<'_, PyModule>` in `#[pymodule]` signatures). Allow locally on the wrapper.
- No `#[allow(dead_code)]` outside `#[cfg(test)]`. If you think you need it, run `cargo machete` (already in `mise run lint:rust`); it often surfaces the dependency you actually want to remove.

## Commit scopes

Use the crate directory as Conventional Commits scope:

- Good: `feat(solver-core): greedy first-fit placement`.
- Bad: `feat(solver): greedy first-fit placement` (loses the which-crate signal when `solver-py` also gets a commit that week).

Bare `solver` scope only when a paired change genuinely spans both crates (e.g., new public API in `solver-core` plus its binding in `solver-py` in one atomic commit). `.github/commit-types.yml` enforces commit *types*; scopes are free-form but a consistent convention keeps `git log` grep-friendly.

## Testing-command map

| Change | Command |
| --- | --- |
| Rust-only edit in one crate | `cargo nextest run -p <crate>` |
| Rust-only edit, full workspace | `mise run test:rust` |
| Targeted check for `solver-py` | `cargo nextest run -p solver-py --no-tests=pass` (crate has no Rust-side tests; nextest exits 1 on empty-run otherwise) |
| PyO3 signature or stub change | above + `uv run pytest solver/solver-py/tests` |
| Any commit | `mise run lint` (pre-commit hook runs it anyway; fail fast locally) |
| Algorithm change | `mise run bench` and compare against the committed baseline; refresh with `mise run bench:record` if the PR intentionally changes perf |

## Bench workflow

- **`mise run bench`** runs the criterion bench (`cargo bench -p solver-core --bench solver_fixtures`). Use for the "am I faster than yesterday?" inner loop; the second run's criterion output shows deltas against the first.
- **`mise run bench:record`** re-runs the bench and overwrites `solver/solver-core/benches/BASELINE.md`. Run this if and only if the PR intentionally changes solver performance. The 20% regression budget from `docs/superpowers/OPEN_THINGS.md` (active sprint) applies against the committed file, not a personal baseline.
- **The bench does not run in CI** (shared runners are too noisy for a 20% budget). Algorithm-phase PRs cite the `BASELINE.md` diff in the PR body.
- **Host sensitivity.** The committed numbers anchor to the recording host; when a maintainer refreshes them they should do so on comparable hardware. The footer in `BASELINE.md` records CPU, kernel, and rustc version so reviewers can judge whether a drift is plausible.
- **Fixtures:** two sizes inside one criterion group — `grundschule` (2 classes, 15 lessons, 45 placements) and `zweizuegig` (8 classes, 68 lessons, 196 placements). Each is hand-coded in `solver-core/benches/solver_fixtures.rs` and mirrors a Python seed in `backend/.../seed/demo_*.py`; drift is caught by `assert_eq!(lessons.len(), N)` against literals shared with the matching Python solvability test. The third size (`gesamtschule`) is tracked under `OPEN_THINGS.md` "Acknowledged deferrals".
- **FFD is invariant to lesson input order.** Both bench fixtures iterate subjects in the natural authoring order; `ordering::ffd_order` inside `solve_with_config` sorts lessons by eligibility before placement so the global solve succeeds regardless of input permutation.

## Pointers

- ADR 0001: monorepo with Cargo and uv workspaces.
- ADR 0002: solver split into `solver-core` and `solver-py`.
- Branch `archive/v2` (not merged) holds a prior scheduler iteration under `scheduler/` with LAHC local search, construction + optimisation phases, and a richer violation taxonomy (`ViolationKind::TeacherConflict`, `TeacherGap`, etc.). Useful reference for follow-ups: First-Fit Decreasing ordering, optimisation phase, structured violation names.
- `docs/superpowers/OPEN_THINGS.md`: current sprint items and cross-entity validation debate.
