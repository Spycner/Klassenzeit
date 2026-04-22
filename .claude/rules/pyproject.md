---
paths:
  - "**/pyproject.toml"
  - "**/uv.lock"
---

# Python dependency hygiene

Add Python packages **only** via `uv add <pkg>` (runtime) or `uv add --dev <pkg>` (dev). Never hand-edit `[project.dependencies]` or `[dependency-groups]` in any `pyproject.toml`; `uv` is the single source of truth for dependency state, and hand edits desync `uv.lock`. For backend-specific deps, use `uv add --package klassenzeit-backend <pkg>`. Root-level `uv add --dev` for shared dev tools.

Hand-writing *non-dependency* sections is fine and expected: `[tool.uv.workspace]`, `[tool.uv.sources]`, `[build-system]`, `[project]` metadata, `[tool.maturin]`, `[tool.ruff]`, `[tool.pytest.ini_options]`, etc. Those are configuration, not dependencies.
