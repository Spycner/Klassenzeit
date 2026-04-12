# Docstrings and Coverage Gates Design

## Goal

Enforce documentation and test coverage standards on every PR via hard CI gates.
No PR merges without full docstring coverage and maintained test coverage.

## Decisions

- **Docstring scope:** all Python functions, classes, modules, and packages (ruff `D` rules)
- **Docstring convention:** Google style
- **Rust docs:** `#![deny(missing_docs)]` on public items in all crates
- **Coverage floor:** 80% (absolute minimum, never goes below)
- **Coverage ratchet:** committed baseline file; PRs cannot decrease coverage
- **Enforcement:** hard gate (CI fails, PR cannot merge)
- **Rust coverage:** Python-only ratchet for now; Rust coverage gating deferred until codebase grows

## Python Docstring Enforcement

Enable pydocstyle rules in ruff by adding `"D"` to the lint select list in `pyproject.toml`.

Configure Google convention:

```toml
[tool.ruff.lint.pydocstyle]
convention = "google"
```

Key rules enabled:

| Rule | Scope |
|------|-------|
| D100 | Module docstring |
| D101 | Public class |
| D102 | Public method |
| D103 | Public function |
| D104 | Public package (`__init__.py`) |
| D105 | Magic method |
| D106 | Nested class |
| D107 | `__init__` method |

This integrates into the existing `mise run lint` pipeline and CI lint job with no additional wiring.

All existing Python code must be updated with Google-style docstrings to pass the new rules.

## Rust Documentation Enforcement

Add `#![deny(missing_docs)]` to the crate root (`lib.rs`) of:

- `solver/solver-core/src/lib.rs`
- `solver/solver-py/src/lib.rs`

This makes missing doc comments on public items a compile error. Private items remain exempt (idiomatic Rust). The existing `cargo clippy -D warnings` in CI already surfaces these.

All existing public Rust items must have `///` doc comments added.

## Coverage Ratchet

### Baseline file

`.coverage-baseline` in the repo root. Contains a single integer representing the current minimum allowed Python coverage percentage. Version-controlled so changes are visible in PR diffs.

Initial value: `89` (current measured coverage).

### CI enforcement

After the test job in `ci.yml`, a step:

1. Runs `uv run pytest --cov` and extracts the total coverage percentage
2. Reads `.coverage-baseline`
3. Fails if coverage < baseline value
4. Fails if coverage < 80 (absolute floor, redundant safety net)

### Absolute floor

`pytest-cov` is configured with `--cov-fail-under=80` in `pyproject.toml` as a belt-and-suspenders check alongside the CI script.

### Updating the baseline

New mise task `cov:update-baseline`:

- Runs coverage
- Extracts total percentage
- Writes it to `.coverage-baseline`

Developer commits the updated baseline file. The bump is intentional, reviewable in the PR diff, and auditable in git history.

## File Changes Summary

| File | Change |
|------|--------|
| `pyproject.toml` | Add `"D"` to ruff lint select; add `[tool.ruff.lint.pydocstyle]` section; add `--cov-fail-under=80` |
| `solver/solver-core/src/lib.rs` | Add `#![deny(missing_docs)]` |
| `solver/solver-py/src/lib.rs` | Add `#![deny(missing_docs)]` |
| `.coverage-baseline` | New file, contains `89` |
| `.github/workflows/ci.yml` | Add coverage-check step after test job |
| `mise.toml` | Add `cov:update-baseline` task |

No new dependencies. All tooling already exists in the project.

## Implementation Order

1. Add ruff `D` rules and pydocstyle config
2. Add docstrings to all existing Python code
3. Add `#![deny(missing_docs)]` to Rust crates and doc comments to public items
4. Create `.coverage-baseline` file
5. Add `--cov-fail-under=80` to pytest config
6. Add `cov:update-baseline` mise task
7. Add coverage-check step to CI workflow
8. Verify everything passes locally and in CI
