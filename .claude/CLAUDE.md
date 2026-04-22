# Klassenzeit: Project Instructions

## Where rules live

Project instructions are split across several files so Claude only loads what is relevant to the current working context:

- **This file (`.claude/CLAUDE.md`)** — architecture, workflow, global coding rules, commit-message conventions. Loaded every session.
- **`backend/CLAUDE.md`** — Python / FastAPI / SQLAlchemy / pytest rules. Loaded when Claude reads files under `backend/`.
- **`frontend/CLAUDE.md`** — React / TanStack / shadcn / i18n / Vitest rules. Loaded when Claude reads files under `frontend/`.
- **`.claude/rules/*.md`** — rules scoped by file path rather than directory, via `paths:` frontmatter. Today: `pyproject.md` for workspace-wide Python dependency hygiene.

See [Anthropic's memory docs](https://code.claude.com/docs/en/memory) for the loading model.

## Architecture at a glance

- `backend/` — FastAPI + SQLAlchemy async, served under `klassenzeit_backend`. Runtime state (engine, session factory, settings, rate limiter) lives on `app.state`, set in `lifespan`.
- `frontend/` — Vite 7 + React 19 SPA with TanStack Router/Query, shadcn/ui, react-i18next. Proxies API to `:8000` in dev.
- `solver/` — Rust Cargo workspace with `solver-core` (pure) and `solver-py` (PyO3 bindings built via maturin).
- `deploy/` — staging compose for the Hetzner VPS. Pulls `ghcr.io/pgoell/klassenzeit-{backend,frontend}` images published by `.github/workflows/deploy-images.yml`, joins the external `web` network run out of `~/Code/server-infra/`. The same workflow's `deploy-staging` job runs on the repo's self-hosted runner (`iuno-klassenzeit`) and auto-redeploys every master push via `docker compose pull && up -d` in `/home/pascal/kz-deploy/`. Runbook: `deploy/README.md`. Decisions: `docs/adr/0009-deployment-topology.md`.
- Dev loop runs via `mise` tasks; Postgres via `podman compose` from `compose.yaml` (root-level compose is local dev only, distinct from `deploy/compose.yaml`).

## Development Workflow

**Skills are not optional when a workflow names them.** Slash commands (notably `/autopilot`) and the superpowers skill set call out specific skills by name. "Invoke the skill" means call the `Skill` tool and let it return, then follow what it says. Synthesizing a skill's output freehand, even when it looks right, is skipping the skill and counts as a process violation. If a workflow step names a skill, calling `Skill` is the first action of that step, and the end-of-turn summary must note any listed skill that was unavailable and therefore skipped.

Always use TDD with red-green-refactor, driven by `superpowers:test-driven-development`. Development always ends in PRs after documentation was extensively reviewed and updated.

Before opening a PR, run `claude-md-management:revise-claude-md` if the session produced learnings worth persisting, and if you ran that, run `claude-md-management:claude-md-improver` right after. Both via the `Skill` tool.

Keep things that are out of scope for a step, or that you notice as tech debt or todos, in `docs/superpowers/OPEN_THINGS.md`, ordered by importance. Don't add duplicates.

**`/autopilot <topic>`** runs the full flow end-to-end (brainstorm, spec, plan, implementation, PR, green CI) without checking in at each step. See `.claude/commands/autopilot.md` for the exact sequence, its required-skill-invocations table, and the skill audit that runs before the PR opens. Use it whenever the user describes a feature or chore they'd otherwise expect you to walk through step-by-step.

## Work selection: quality first, tidy first

When picking the next item off `docs/superpowers/OPEN_THINGS.md` without a more specific directive from the user, prefer **tech debt and quality work over new user-facing features**. Follow Kent Beck's "Tidy First?" heuristic: small structural refactors that make subsequent feature work cheaper and safer come before the features themselves. Concretely:

1. Read OPEN_THINGS.md top to bottom. Skim the "Product capabilities" section last.
2. Pick the highest-impact item from the "CI / repo automation", "Testing", "Toolchain & build friction", "Auth maintenance", or "Production readiness" sections that is unblocked and fits a single PR.
3. Structural refactors that remove duplication, collapse drift between near-identical call sites, or replace alert/ad-hoc patterns with shared primitives count as tidy-first and are preferred over feature work.
4. A structural change and a behavioral change never ship in the same commit. If a tidy-first refactor uncovers a behavior bug, surface the bug and fix it in a separate commit with its own typed prefix (`fix(...)`), not folded into the refactor.
5. Behavior must be preserved across a tidy commit: tests that passed before must pass after without modification, except where the only change is a test's import path or a mock signature rendered obsolete by the refactor.

If every quality item in OPEN_THINGS.md is blocked or out of scope for one PR, fall back to the next feature item and note why in the PR body.

## Tooling

### Commands

- `mise run dev` — start backend with auto-reload
- `mise run fe:dev` — start frontend dev server on `:5173` (proxies API to `:8000`)
- `mise run test` — run all tests (Rust + Python + frontend)
- `mise run test:py` — Python tests only (`uv run pytest`)
- `mise run test:rust` — Rust tests only (`cargo nextest run`)
- `mise run fe:test` — frontend Vitest only
- `mise run lint` — all linters (ruff, ty, vulture, clippy, machete, cargo fmt, biome)
- `mise run fmt` — auto-format everything
- `mise run fe:types` — regenerate frontend OpenAPI types from the backend
- `mise run db:up` / `db:stop` / `db:reset` / `db:migrate` — Postgres lifecycle

- **Rust toolchain** is a hard prerequisite (required for the PyO3 bindings and for the dev tools below).
- **Git hook runner:** [Lefthook](https://github.com/evilmartians/lefthook). Config lives at `.config/lefthook.yaml` (lefthook auto-discovers this path).
- **Commit message enforcement:** [Cocogitto](https://docs.cocogitto.io) (`cog`), installed via `cargo install cocogitto`. A `commit-msg` hook runs `cog verify` and rejects non-conventional messages.

## Coding standards

- **No bare catchalls.** No untyped `catch` in TypeScript, no `Result<_, _>` swallowed with `_` in Rust. Catch the specific error you can handle; let the rest propagate. (Python framing lives in `backend/CLAUDE.md`.)
- **No dynamic imports.** All imports must be static/top-of-file so the dependency graph is statically analyzable. No `import()` expressions, no `importlib.import_module` in hot paths.
- **Unique function names globally.** Function names must be unique across the entire codebase, even across classes and files. `scripts/check_unique_fns.py` runs in pre-commit and walks TS/TSX too, so when duplicating a page skeleton across entities, rename helpers per feature: `RoomsPageHead` not `PageHead`, `handleRoomSubmit` not `onSubmit`, `confirmRoomDelete` not `confirm`.
- **Dockerfile build context is the repo root.** `backend/Dockerfile` and `frontend/Dockerfile` are built from the repo root with `context: .` and `file: <subdir>/Dockerfile` (see `.github/workflows/deploy-images.yml`). Every `COPY` inside them is therefore written as `COPY backend/ backend/`, `COPY frontend/ ./`, etc. The matching `.dockerignore` lives next to each Dockerfile but its patterns are evaluated against the repo root.
- **ADR titles skip the em-dash.** `docs/adr/template.md` renders `# NNNN — Title`, but the user's global preference forbids em- and en-dashes in new prose. Use a colon (`# NNNN: Title`) in new ADRs. Existing ADRs 0001-0008 stay as they are; ADRs are immutable per `docs/adr/README.md`.

## Commit messages

This repo enforces [Conventional Commits](https://www.conventionalcommits.org/).

**Format:** `<type>(<optional scope>): <description>`

**PR titles** must also satisfy `subjectPattern: ^[a-z].+$` (checked by `amannn/action-semantic-pull-request`). Start the subject with a lowercase letter even when the first word is an acronym: `feat(frontend): crud pages ...`, not `feat(frontend): CRUD pages ...`.

**Common types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Append `!` for breaking changes, or add a `BREAKING CHANGE:` footer.

When creating commits, always produce a Conventional Commits-compliant message. See `CONTRIBUTING.md` for the full type table and examples.

Beyond enforcement, `cog` also handles changelog generation (`cog changelog`) and semver bumps (`cog bump`). Prefer these over hand-rolled equivalents.
