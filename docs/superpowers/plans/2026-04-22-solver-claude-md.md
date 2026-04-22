# solver/CLAUDE.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scoped `solver/CLAUDE.md` capturing solver-specific conventions (error handling, determinism, PyO3 binding style, GIL release, maturin dev loop, clippy allows policy, commit scopes) ahead of sprint step 1, then remove the resolved bullet from `docs/superpowers/OPEN_THINGS.md`.

**Architecture:** Two commits on top of the already-merged spec + plan commits. The first adds a new file `solver/CLAUDE.md` at the solver workspace root so Anthropic's memory loader picks it up for any file read under `solver-core/` or `solver-py/`. The second removes one resolved bullet from `OPEN_THINGS.md`. No code changes, no test changes, no ADR. Both commits land on branch `docs/solver-claude-md` and flow through a single PR.

**Tech Stack:** Markdown, lefthook pre-commit (runs `mise run lint`), cocogitto commit-msg (enforces Conventional Commits), `mise run check:commit-types`.

---

## File Structure

- **Create:** `/home/pascal/Code/Klassenzeit/solver/CLAUDE.md` (~60 lines)
- **Modify:** `/home/pascal/Code/Klassenzeit/docs/superpowers/OPEN_THINGS.md` (delete one ~5-line bullet under "Pay down alongside the sprint")

No other files change. `README.md`, `docs/architecture/overview.md`, `docs/adr/README.md`, `.github/workflows/*.yml` stay untouched.

---

## Task 1: Write `solver/CLAUDE.md`

**Files:**
- Create: `/home/pascal/Code/Klassenzeit/solver/CLAUDE.md`

- [ ] **Step 1: Confirm the file does not already exist**

Run:
```bash
test ! -f /home/pascal/Code/Klassenzeit/solver/CLAUDE.md && echo "not present"
```
Expected: `not present`.

If the file already exists, stop and re-read `docs/superpowers/specs/2026-04-22-solver-claude-md-design.md` to reconcile — the spec assumed creation from scratch.

- [ ] **Step 2: Write the file**

Create `/home/pascal/Code/Klassenzeit/solver/CLAUDE.md` with exactly this content (six H2 sections, two inline examples, one good/bad pair, one testing-command table, one pointers list). Intentional structural match with `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

```markdown
# Klassenzeit: Solver Rules

Applies to the `solver/` Cargo workspace (`solver-core` + `solver-py`). Assumes the cross-cutting rules in the root `/.claude/CLAUDE.md` (no bare catchalls, unique function names, no dynamic imports, Dockerfile context rules, SHA-pinned third-party actions, Conventional Commits).

## Workspace layout

- **`solver-core`** — pure Rust library. The scheduling algorithm, constraint model, and typed errors live here. No PyO3, no Python, no I/O beyond what callers pass in.
- **`solver-py`** — `cdylib` crate that wraps `solver-core` via PyO3 (`0.28`) and is built by maturin into the `klassenzeit_solver` Python package. Thin wrappers only; no algorithm logic.
- **Root `Cargo.toml`** — workspace root. Declares `edition = "2021"`, `rust-version = "1.85"`, `resolver = "2"`. Shared dev-dependency: `proptest = "1"`. Both crates inherit via `[workspace.package]` / `[workspace.dependencies]`.
- **Root `pyproject.toml`** — uv workspace. `solver/solver-py` is a member; backend pulls it in via `klassenzeit-solver = { workspace = true }`.
- **Hand-maintained `.pyi` stubs** — `solver/solver-py/python/klassenzeit_solver/*.pyi`. Updated in the same commit as a Rust binding change.

## solver-core rules

- **Errors use `thiserror`, one enum per logical boundary** (input parsing, constraint validation, scheduling). No `anyhow` in `solver-core`; a library erases type information when it boxes, and the backend wants to match on specific failure modes.

    ```rust
    #[derive(Debug, thiserror::Error)]
    pub enum Error {
        #[error("input: {0}")]
        Input(String),
        #[error("infeasible at step {step}: {reason}")]
        Infeasible { step: &'static str, reason: String },
    }
    ```

- **Deterministic under test.** No `std::time::SystemTime::now()` inside `solver-core`; no `rand::thread_rng()`. Any randomisation is seeded via a parameter on the public API so tests reproduce. Non-determinism here is silent (unit tests pass for a specific seed) and only surfaces as run-to-run timetable drift. `solver-py` is allowed to wrap the deterministic core with wall-clock timing for logging.
- **Tests.** Inline `#[cfg(test)] mod tests` for unit, `solver-core/tests/*.rs` for integration (property tests, multi-step scenarios). When a shared fixtures module grows, add `solver-core/tests/common/mod.rs`.

## solver-py rules

- **Thin wrappers only.** Every `solver-core` public symbol exposed to Python goes through a `#[pyfunction]` / `#[pyclass]` in `solver-py/src/lib.rs`. The wrapper marshals arguments, forwards, marshals the result back. No algorithm logic in `solver-py`.
- **Release the GIL on long calls.** Forgetting this serialises every caller behind the interpreter lock; the failure mode is invisible in single-threaded tests.

    ```rust
    #[pyfunction]
    fn solve(py: Python<'_>, problem: &str) -> PyResult<String> {
        py.allow_threads(|| solver_core::solve(problem))
            .map_err(|e| PyRuntimeError::new_err(e.to_string()))
    }
    ```

- **Errors map explicitly.** `solver_core::Error` → `PyValueError` for client mistakes (bad input shape), `PyRuntimeError` for solver-internal failures (infeasible, timeout, internal invariant violation). Use `From` impls or a small adapter; never `anyhow`.
- **Python tests exercise the binding contract, not the algorithm.** Tests at `solver/solver-py/tests/test_*.py` cover encoding, GIL release, error conversion. Narrow exception: a regression test for a bug that is binding-specific (e.g., float NaN handling across PyO3).
- **Maturin dev loop.**
    - Source-only edit in `solver-core` or `solver-py/src/lib.rs` → `mise run solver:rebuild` (wraps `uvx maturin develop --uv -m solver/solver-py/Cargo.toml`, seconds).
    - Edit touching `solver-py/pyproject.toml`, `Cargo.lock`, or the workspace `Cargo.toml` → `uv sync` (re-resolves the whole workspace, tens of seconds).

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
| PyO3 signature or stub change | above + `uv run pytest solver/solver-py/tests` |
| Any commit | `mise run lint` (pre-commit hook runs it anyway; fail fast locally) |
| Algorithm change | `mise run bench` (placeholder today; criterion benches land with the MVP) |

## Pointers

- ADR 0001 — monorepo with Cargo and uv workspaces.
- ADR 0002 — solver split into `solver-core` and `solver-py`.
- `docs/superpowers/OPEN_THINGS.md` — current sprint items and cross-entity validation debate.
```

- [ ] **Step 3: Run lint locally (fails fast before the commit hook)**

Run:
```bash
cd /home/pascal/Code/Klassenzeit && mise run lint
```
Expected: exit 0. The only lint relevant to a Markdown-only change is the Markdown/prose pass in the frontend linter + the no-dashes check if one exists; in this repo lint passes are trivial for pure `.md` additions.

If lint fails with something unrelated to this file (e.g., an unrelated drift), stop and raise — do not paper over.

- [ ] **Step 4: Verify the file parses as the six expected H2 sections**

Run:
```bash
grep -c '^## ' /home/pascal/Code/Klassenzeit/solver/CLAUDE.md
```
Expected: `7` (Workspace layout; solver-core rules; solver-py rules; Clippy and allows policy; Commit scopes; Testing-command map; Pointers).

Run:
```bash
wc -l /home/pascal/Code/Klassenzeit/solver/CLAUDE.md
```
Expected: under 100 lines (target ~60, bound 100).

- [ ] **Step 5: Verify no em-dashes or en-dashes in prose**

Per the user's global preference, prose uses hyphens only in compound words (`spec-driven`, `two-week`), never as sentence punctuation. Run:

```bash
grep -nP '[\x{2013}\x{2014}]' /home/pascal/Code/Klassenzeit/solver/CLAUDE.md || echo "none"
```
Expected: `none`.

If any match prints, rewrite with commas, periods, colons, semicolons, or parentheses before committing.

- [ ] **Step 6: Verify the `---` structural separators (if any) are horizontal rules, not punctuation**

The file as written uses `---` in front-matter-less Markdown only for horizontal rules (none currently in the drafted content). No action required unless editing added horizontal rules.

- [ ] **Step 7: Stage and commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add solver/CLAUDE.md
git commit -m "docs(solver): add solver/CLAUDE.md"
```

The lefthook pre-commit hook runs `mise run lint` (step 3 pre-check already made this a pass). The commit-msg hook runs `cog verify` and requires the Conventional Commits format (`docs(solver):` is valid: type `docs`, scope `solver`, lowercase subject).

Expected commit-msg output: `✔️ cog`.

---

## Task 2: Remove resolved bullet from `OPEN_THINGS.md`

**Files:**
- Modify: `/home/pascal/Code/Klassenzeit/docs/superpowers/OPEN_THINGS.md` (delete one bullet block under "Pay down alongside the sprint")

- [ ] **Step 1: Identify the exact block to remove**

Read the current file and locate the bullet that starts with `Write \`solver/CLAUDE.md\` before step 1.`

Run:
```bash
grep -n "solver/CLAUDE.md" /home/pascal/Code/Klassenzeit/docs/superpowers/OPEN_THINGS.md
```
Expected: one or more line numbers inside the "Pay down alongside the sprint" section (roughly, lines 40-80 of the file at spec-time; re-check before editing).

- [ ] **Step 2: Remove the block**

Using the Edit tool, delete the bullet including its blockquote and surrounding blank line so the next bullet renders cleanly. Preserve the surrounding "Pay down alongside the sprint" heading and the cross-entity validation bullet and the logging bullet.

- [ ] **Step 3: Verify the section stays valid**

Run:
```bash
grep -c "^## " /home/pascal/Code/Klassenzeit/docs/superpowers/OPEN_THINGS.md
```
Expected: same H2 count as before the change (section heading `## Pay down alongside the sprint` is not removed).

Run:
```bash
grep -n "solver/CLAUDE.md" /home/pascal/Code/Klassenzeit/docs/superpowers/OPEN_THINGS.md || echo "none"
```
Expected: `none`.

- [ ] **Step 4: Check no other bullet was accidentally removed**

Run:
```bash
cd /home/pascal/Code/Klassenzeit && git diff docs/superpowers/OPEN_THINGS.md
```

Expected: a single deletion block. Additions should be empty (no `+` lines). If the diff shows anything other than the targeted bullet being removed, restore the file from HEAD and retry.

- [ ] **Step 5: Stage and commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add docs/superpowers/OPEN_THINGS.md
git commit -m "docs(open-things): remove resolved solver CLAUDE.md bullet"
```

The commit-msg hook accepts `docs(open-things):` (type `docs`, scope `open-things`, lowercase subject).

---

## Self-Review

Spec coverage check, walking `docs/superpowers/specs/2026-04-22-solver-claude-md-design.md`:

- Six H2 sections (Workspace layout; solver-core rules; solver-py rules; Clippy and allows policy; Commit scopes; Pointers) → Task 1 Step 2 drafts all six. Note: the drafted file actually has seven H2s because "Testing-command map" is its own section instead of being folded into solver-py rules; the spec's "testing-command map" sub-bullet justifies either shape. The file uses seven headings for scan-ability; step 4's grep is adjusted to match.
- `thiserror` example → Task 1 Step 2, in solver-core rules.
- `py.allow_threads` example → Task 1 Step 2, in solver-py rules.
- Good/bad commit scope pair → Task 1 Step 2, in Commit scopes.
- Testing-command table → Task 1 Step 2, in Testing-command map.
- Pointers (ADR 0001, ADR 0002, OPEN_THINGS.md) → Task 1 Step 2, in Pointers.
- Sibling update to OPEN_THINGS.md → Task 2.
- No ADR → confirmed, no task creates one.
- No README.md change → confirmed, no task modifies it.
- No architecture/overview.md change → confirmed, no task modifies it.
- No `.pyi` or `.py` or `.rs` changes → confirmed.

Placeholder scan: no "TBD" / "TODO" / "implement later" / "add appropriate" / "similar to Task N" patterns in the plan. Every code block is complete; every command is exact.

Type consistency: no type signatures across tasks. The embedded Rust in Task 1 Step 2 is the final file content; it does not refer to symbols defined elsewhere in the plan.

Plan is ready to execute.
