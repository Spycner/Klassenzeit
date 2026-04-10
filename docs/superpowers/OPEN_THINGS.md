# Open Things

Running log of items deferred or noted as tech debt during spec/plan work. Each entry points back to the spec that introduced it.

## From [project scaffolding design](specs/2026-04-11-project-scaffolding-design.md)

- **Frontend scaffolding.** Framework choice (React, Svelte, Vue, …) is unresolved. `frontend/` is not scaffolded in the initial spec; gets its own spec once the framework is chosen.
- **Authentication.** No auth layer in the initial scaffold. Separate spec.
- **Database layer.** ORM/migration tool (SQLAlchemy 2.0 + Alembic vs SQLModel vs async-native) is unresolved. No `db/` directory, no migration tool pinned. Gets its own spec.
- **API surface.** Product-level routes, DTOs, and request/response schemas are out of scope for scaffolding.
- **Production deployment.** Docker, reverse proxy, secrets management.
- **License.** Deferred — no `license` field in `Cargo.toml`, no `LICENSE` file. Revisit when the project's distribution model (open source vs proprietary vs SaaS) is clearer.
- **CI configuration.** No GitHub Actions / pipeline config yet. `mise run audit` and `mise run cov` exist as tasks so CI can invoke them; wiring lives in a separate spec.
- **`ty` preview status.** Astral's type checker is pre-1.0; spec uses it anyway to keep the Python toolchain Astral-consistent. Revisit if it proves unstable.
- **Maturin rebuild friction.** Rust edits to `solver-py` require re-running `uv sync`; not automatic on file change. `maturin develop --uv` is the escape hatch if the manual step becomes annoying.
- **PyO3 type stubs.** `klassenzeit_solver` is a native `.so` without `.pyi` stubs, so `ty` can't introspect it — the two Python import sites use `# ty: ignore[unresolved-import]` as a cheap workaround. The clean fix is a mixed maturin layout (`[tool.maturin] python-source = "python"`, plus an `__init__.py` that re-exports from a nested native submodule named `_rust`, plus an `__init__.pyi` describing the public surface). That was briefly attempted during scaffolding and backed out because it broke runtime imports; the correct layout requires `module-name = "klassenzeit_solver._rust"` and an explicit `from ._rust import *` in `__init__.py`. Do this when the solver API grows past a placeholder.
