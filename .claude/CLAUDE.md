# Klassenzeit — Project Instructions

## Development Workflow

Use superpowers skill if relevant. Always use TDD with red green refactor. Development should always end in PRs after documentation was extensively reviewed and updated.

Before creating a PR, also run claude-md-management if session has relevant information. If you ran it, also run claude-md-improver.

Keep things that are out of scope for a step, or things you notice as tech debts / todos etc in docs/superpowers/OPEN_THINGS.md order by importance. and dont add duplicates.

## Tooling

- **Rust toolchain** is a hard prerequisite (required for the PyO3 bindings and for the dev tools below).
- **Git hook runner:** [Lefthook](https://github.com/evilmartians/lefthook). Config lives at `.config/lefthook.yaml` (lefthook auto-discovers this path).
- **Commit message enforcement:** [Cocogitto](https://docs.cocogitto.io) (`cog`), installed via `cargo install cocogitto`. A `commit-msg` hook runs `cog verify` and rejects non-conventional messages.

## Python dependencies

Add Python packages **only** via `uv add <pkg>` (runtime) or `uv add --dev <pkg>` (dev). Never hand-edit `[project.dependencies]` or `[dependency-groups]` in any `pyproject.toml` — `uv` is the single source of truth for dependency state, and hand edits desync `uv.lock`.

Hand-writing *non-dependency* sections is fine and expected: `[tool.uv.workspace]`, `[tool.uv.sources]`, `[build-system]`, `[project]` metadata, `[tool.maturin]`, `[tool.ruff]`, `[tool.pytest.ini_options]`, etc. Those are configuration, not dependencies.

## Commit messages

This repo enforces [Conventional Commits](https://www.conventionalcommits.org/).

**Format:** `<type>(<optional scope>): <description>`

**Common types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Append `!` for breaking changes, or add a `BREAKING CHANGE:` footer.

When creating commits, always produce a Conventional Commits-compliant message. See `CONTRIBUTING.md` for the full type table and examples.

Beyond enforcement, `cog` also handles changelog generation (`cog changelog`) and semver bumps (`cog bump`). Prefer these over hand-rolled equivalents.
