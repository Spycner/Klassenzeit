# Open Things

Running log of items deferred or noted as tech debt during spec/plan work. Each entry points back to the spec that introduced it.

## From [project scaffolding design](specs/2026-04-11-project-scaffolding-design.md)

- **Frontend scaffolding.** Framework choice (React, Svelte, Vue, …) is unresolved. `frontend/` is not scaffolded in the initial spec; gets its own spec once the framework is chosen.
- **Authentication.** No auth layer in the initial scaffold. Separate spec.
- **Database layer.** ORM/migration tool (SQLAlchemy 2.0 + Alembic vs SQLModel vs async-native) is unresolved. No `db/` directory, no migration tool pinned. Gets its own spec.
- **API surface.** Product-level routes, DTOs, and request/response schemas are out of scope for scaffolding.
- **Production deployment.** Docker, reverse proxy, secrets management.
- **License.** Deferred — no `license` field in `Cargo.toml`, no `LICENSE` file. Revisit when the project's distribution model (open source vs proprietary vs SaaS) is clearer.
- **Auto-issue creation on weekly audit failure.** The `audit.yml` cron run is informational only — failures show up in the Actions tab but nothing pages anyone. Standard pattern uses `JasonEtco/create-an-issue@v2` with a templated body. Wire this in once the audit produces enough signal to be worth the noise.
- **Dependabot for the Python/uv ecosystem.** Dependabot doesn't natively understand `uv.lock` as of mid-2025; the `pip` adapter desyncs the lockfile and violates the `uv add`-only rule. Revisit when dependabot ships first-class uv support, or switch to Renovate (which already supports uv).
- **PR-title type list duplicates `CONTRIBUTING.md`.** `.github/workflows/pr-title.yml` carries its own copy of the conventional-commit type list. If `CONTRIBUTING.md` adds a type, the workflow must update too. Single source of truth needed (e.g. generate the workflow from a templated config).
- **`ty` preview status.** Astral's type checker is pre-1.0; spec uses it anyway to keep the Python toolchain Astral-consistent. Revisit if it proves unstable.
- **Maturin rebuild friction.** Rust edits to `solver-py` require re-running `uv sync`; not automatic on file change. `maturin develop --uv` is the escape hatch if the manual step becomes annoying.
- **PyO3 type stubs.** `klassenzeit_solver` is a native `.so` without `.pyi` stubs, so `ty` can't introspect it — the two Python import sites use `# ty: ignore[unresolved-import]` as a cheap workaround. The clean fix is a mixed maturin layout (`[tool.maturin] python-source = "python"`, plus an `__init__.py` that re-exports from a nested native submodule named `_rust`, plus an `__init__.pyi` describing the public surface). That was briefly attempted during scaffolding and backed out because it broke runtime imports; the correct layout requires `module-name = "klassenzeit_solver._rust"` and an explicit `from ._rust import *` in `__init__.py`. Do this when the solver API grows past a placeholder.
