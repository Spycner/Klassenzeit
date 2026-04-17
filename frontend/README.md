# Klassenzeit Frontend

React + Vite SPA for the Klassenzeit admin UI.

## Dev

```bash
mise run install        # installs backend + frontend deps (runs once)
mise run dev            # starts the backend on :8000
mise run fe:dev         # starts the frontend on :5173 (separate terminal)
```

The Vite dev server proxies API calls (`/auth`, `/subjects`, …) to the backend, so cookies stay same-origin.

## Common tasks

| Command | Purpose |
|---|---|
| `mise run fe:dev` | Vite dev server with HMR |
| `mise run fe:build` | Production build in `dist/` |
| `mise run fe:test` | Vitest run |
| `mise run fe:lint` | Biome lint |
| `mise run fe:fmt` | Biome format (in-place) |
| `mise run fe:types` | Regenerate `src/lib/api-types.ts` from the backend's OpenAPI schema |

## Stack

- **Framework:** React 19 + Vite 6
- **Language:** TypeScript (strict + `erasableSyntaxOnly`)
- **UI:** shadcn/ui + Radix primitives
- **Styling:** Tailwind CSS v4
- **Data:** TanStack Query + openapi-fetch (typed from the backend schema)
- **Routing:** TanStack Router (file-based)
- **Forms:** React Hook Form + Zod
- **Lint/format:** Biome
- **Tests:** Vitest + React Testing Library + MSW

See [`docs/adr/0007-react-vite-spa-frontend.md`](../docs/adr/0007-react-vite-spa-frontend.md) for the rationale.
