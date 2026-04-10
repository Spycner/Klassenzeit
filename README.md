# Klassenzeit — Timetabler for schools

A school timetabling system with a FastAPI backend and a Rust solver exposed to Python via PyO3.

## Dev Setup

1. Install [mise](https://mise.jdx.dev/).
2. `mise install` — installs the pinned toolchain (Rust, Python, uv, cocogitto, lefthook, cargo dev tools).
3. `mise run install` — installs git hooks and syncs dependencies (runs maturin for the solver).

## Common tasks

| Command | What it does |
|---|---|
| `mise run dev`   | Run the backend with auto-reload. |
| `mise run test`  | Run all Rust and Python tests. |
| `mise run lint`  | Lint Rust (fmt, clippy, machete) and Python (ruff, ty, vulture). |
| `mise run fmt`   | Auto-format Rust and Python. |
| `mise run cov`   | Produce Rust and Python coverage reports. |
| `mise run audit` | Supply-chain audit (`cargo deny`, `pip-audit`). |
| `mise run bench` | Run solver-core benches. |

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for commit message rules.
