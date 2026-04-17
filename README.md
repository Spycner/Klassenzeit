# Klassenzeit — Timetabler for schools

A school timetabling system with a FastAPI backend, a Rust solver exposed to Python via PyO3, and a React + Vite admin frontend.

## Docs

- [`docs/architecture/overview.md`](docs/architecture/overview.md) —
  system overview and monorepo layout.
- [`docs/architecture/database.md`](docs/architecture/database.md) —
  database layer reference.
- [`docs/adr/`](docs/adr/) — architectural decision records.
- [`docs/README.md`](docs/README.md) — full docs map.

## Dev Setup

1. Install [mise](https://mise.jdx.dev/).
2. `mise install` — installs the pinned Rust, Python, uv, Node, pnpm, cocogitto, and lefthook.
3. `mise run install` — installs git hooks, syncs the Python workspace (`uv sync`, which also builds the Rust solver extension), and installs frontend dependencies.
4. `mise run db:up` — start the dev Postgres via `podman compose`.
5. `cp backend/.env.example backend/.env` — seed your local env file.
6. `mise run db:migrate` — apply database migrations.
7. `mise run test` — confirm everything works.

## Common tasks

| Command | What it does |
|---|---|
| `mise run dev`      | Run the backend with auto-reload. |
| `mise run fe:dev`   | Run the frontend dev server on `http://localhost:5173` (proxies API calls to the backend). |
| `mise run test`     | Run all Rust, Python, and frontend tests. |
| `mise run lint`     | Lint Rust (fmt, clippy, machete), Python (ruff, ty, vulture), and frontend (Biome). |
| `mise run fmt`      | Auto-format Rust, Python, and frontend. |
| `mise run cov`      | Produce Rust and Python coverage reports. |
| `mise run audit`    | Supply-chain audit (`cargo deny`, `pip-audit`). |
| `mise run bench`    | Run solver-core benches. |
| `mise run fe:build` | Production build of the frontend into `frontend/dist/`. |
| `mise run fe:types` | Regenerate `frontend/src/lib/api-types.ts` from the backend's OpenAPI schema. |

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for commit message rules.
