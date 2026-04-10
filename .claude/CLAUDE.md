# Klassenzeit — Project Instructions

## Development Workflow

Use superpowers skill if relevant. Always use TDD with red green refactor. Development should always end in PRs after documentation was extensively reviewed and updated.

## Tooling

- **Rust toolchain** is a hard prerequisite (required for the PyO3 bindings and for the dev tools below).
- **Git hook runner:** [Lefthook](https://github.com/evilmartians/lefthook). Config lives at `.config/lefthook.yaml` (lefthook auto-discovers this path).
- **Commit message enforcement:** [Cocogitto](https://docs.cocogitto.io) (`cog`), installed via `cargo install cocogitto`. A `commit-msg` hook runs `cog verify` and rejects non-conventional messages.

## Commit messages

This repo enforces [Conventional Commits](https://www.conventionalcommits.org/).

**Format:** `<type>(<optional scope>): <description>`

**Common types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Append `!` for breaking changes, or add a `BREAKING CHANGE:` footer.

When creating commits, always produce a Conventional Commits-compliant message. See `CONTRIBUTING.md` for the full type table and examples.

Beyond enforcement, `cog` also handles changelog generation (`cog changelog`) and semver bumps (`cog bump`). Prefer these over hand-rolled equivalents.
