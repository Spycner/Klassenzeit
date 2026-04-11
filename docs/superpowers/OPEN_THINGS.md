# Open Things

Running log of items deferred or noted as tech debt during spec/plan work. Each entry points back to the spec that introduced it. Within each section, items are ordered by importance.

All current items come from the [project scaffolding design](specs/2026-04-11-project-scaffolding-design.md).

## Product capabilities (blocks user-facing functionality)

Ordered roughly in the sequence they need to land: data first, then access control, then the product surface, then the UI on top, then the path to production.

- **Database layer.** ORM/migration tool (SQLAlchemy 2.0 + Alembic vs SQLModel vs async-native) is unresolved. No `db/` directory, no migration tool pinned. Gets its own spec.
- **Authentication.** No auth layer in the initial scaffold. Separate spec.
- **API surface.** Product-level routes, DTOs, and request/response schemas are out of scope for scaffolding.
- **Frontend scaffolding.** Framework choice (React, Svelte, Vue, …) is unresolved. `frontend/` is not scaffolded in the initial spec; gets its own spec once the framework is chosen.
- **Production deployment.** Docker, reverse proxy, secrets management.

## CI / repo automation

- **Branch and repo settings need a wrapper script.** `docs/superpowers/branch-protection.json` covers branch-scoped settings; `docs/superpowers/repo-settings.json` covers repo-scoped settings (merge strategies, delete-on-merge, squash commit formatting). They must be applied in the correct order on a fresh repo — the repo-settings PATCH must run first so `allow_squash_merge: true` / `allow_merge_commit: false` are in place before the branch-protection PUT with `required_linear_history: true`, which otherwise fails with HTTP 422. Currently you'd run two `gh api` commands by hand in order. Fold them into a wrapper script (`scripts/apply-github-settings.sh` or similar) so the order is encoded once.
- **PR-title type list duplicates `CONTRIBUTING.md`.** `.github/workflows/pr-title.yml` carries its own copy of the conventional-commit type list. If `CONTRIBUTING.md` adds a type, the workflow must update too. Single source of truth needed (e.g. generate the workflow from a templated config).
- **Auto-issue creation on weekly audit failure.** The `audit.yml` cron run is informational only — failures show up in the Actions tab but nothing pages anyone. Standard pattern uses `JasonEtco/create-an-issue@v2` with a templated body. Wire this in once the audit produces enough signal to be worth the noise.
- **Dependabot for the Python/uv ecosystem.** Dependabot doesn't natively understand `uv.lock` as of mid-2025; the `pip` adapter desyncs the lockfile and violates the `uv add`-only rule. Revisit when dependabot ships first-class uv support, or switch to Renovate (which already supports uv).

## Toolchain & build friction

- **`ty` preview status.** Astral's type checker is pre-1.0; spec uses it anyway to keep the Python toolchain Astral-consistent. Revisit if it proves unstable.

## Project metadata

- **License.** Deferred — no `license` field in `Cargo.toml`, no `LICENSE` file. Revisit when the project's distribution model (open source vs proprietary vs SaaS) is clearer.
