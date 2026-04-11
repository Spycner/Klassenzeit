# Klassenzeit — Timetabler for schools

A school timetabling system with a FastAPI backend and a Rust solver exposed to Python via PyO3.

## Docs

- [`docs/architecture/overview.md`](docs/architecture/overview.md) —
  system overview and monorepo layout.
- [`docs/architecture/database.md`](docs/architecture/database.md) —
  database layer reference.
- [`docs/adr/`](docs/adr/) — architectural decision records.
- [`docs/README.md`](docs/README.md) — full docs map.

## Dev Setup

1. Install [mise](https://mise.jdx.dev/).
2. `mise install` — installs the pinned Rust, Python, uv, cocogitto, and lefthook.
3. `mise run install` — installs git hooks and syncs the Python workspace (`uv sync`, which also builds the Rust solver extension).
4. `mise run db:up` — start the dev Postgres via `podman compose`.
5. `cp backend/.env.example backend/.env` — seed your local env file.
6. `mise run db:migrate` — apply database migrations.
7. `mise run test` — confirm everything works.

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
