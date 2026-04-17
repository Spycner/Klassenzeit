# Frontend Scaffolding Design

**Date:** 2026-04-17
**Status:** Approved (design)
**Scope:** Scaffold the `frontend/` workspace with a React + Vite SPA, integrate it into the monorepo toolchain, and ship a meaningful end-to-end slice (login + subjects CRUD) against the existing backend API. No production deployment.

## Goals

1. Establish the frontend stack and conventions so future feature work is mechanical.
2. Integrate the frontend into `mise` tasks, lefthook, and CI alongside the backend.
3. Prove the end-to-end path: Vite dev proxy, cookie-session login, typed API calls, cache-aware mutations, a11y-correct form, server-authoritative validation.
4. Generate API types from the backend's OpenAPI schema so the frontend stays honest as the backend evolves.
5. Implement tooling that matches the project's "fast Rust-backed tools" philosophy: Biome, Vitest, pnpm.

## Non-goals

- **Production deployment.** `pnpm build` produces a static bundle; shipping it behind Caddy is the existing "Production deployment" item in OPEN_THINGS.md.
- **Full entity coverage.** Only Subjects CRUD is implemented end-to-end. Other entities (WeekScheme, Room, Teacher, Stundentafel, SchoolClass, Lesson) are follow-up specs.
- **Admin user management UI.** Backend already has the endpoints; the UI comes later.
- **E2E tests (Playwright).** Vitest + React Testing Library only for now.
- **i18n.** Single-language (English) for the scaffold.
- **Backend route refactor.** No `/api` prefix change. Vite proxy lists prefixes explicitly.
- **SSR / meta-framework.** Plain SPA.
- **Optimistic mutations beyond the simple case.** Standard TanStack Query refetch on success.
- **Dark mode toggle.** shadcn/ui supports it; enabling it is a follow-up.

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19 + Vite 6 |
| Language | TypeScript (`strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`) |
| UI components | shadcn/ui (copy-paste) + Radix primitives |
| Styling | Tailwind CSS v4 |
| Data fetching | TanStack Query v5 |
| API types | `openapi-typescript` (types) + `openapi-fetch` (client) |
| Routing | TanStack Router (file-based) |
| Forms | React Hook Form + Zod |
| Lint + format | Biome |
| Tests | Vitest + React Testing Library + jsdom |
| Package manager | pnpm |
| Node | 22 LTS (pinned via mise) |
| Dev auth | Vite proxy to backend (same-origin cookie) |

## Architecture

### Directory layout

```
frontend/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.node.json             # Vite + config file typing
├── biome.json
├── vite.config.ts
├── index.html
├── public/
├── src/
│   ├── main.tsx
│   ├── routeTree.gen.ts           # TanStack Router generated (gitignored)
│   ├── routes/
│   │   ├── __root.tsx             # root layout (Providers + Outlet)
│   │   ├── login.tsx              # /login
│   │   ├── _authed.tsx            # auth-guard layout
│   │   ├── _authed.index.tsx      # / (dashboard)
│   │   └── _authed.subjects.tsx   # /subjects
│   ├── components/
│   │   ├── ui/                    # shadcn primitives (Button, Input, Form, Table, ...)
│   │   └── layout/
│   │       └── app-shell.tsx      # sidebar + header + outlet
│   ├── lib/
│   │   ├── api-types.ts           # generated from OpenAPI (gitignored)
│   │   ├── api-client.ts          # openapi-fetch instance + error-to-exception helper
│   │   ├── auth.ts                # useMe + logout helpers
│   │   └── utils.ts               # cn()
│   ├── features/
│   │   └── subjects/
│   │       ├── hooks.ts           # useSubjects, useCreateSubject, ...
│   │       ├── schema.ts          # Zod schema for the form
│   │       └── subjects-page.tsx  # list + dialog for create/edit + delete
│   └── styles/
│       └── app.css                # Tailwind entry + theme tokens
├── tests/
│   ├── setup.ts                   # RTL jest-dom matchers
│   ├── login.test.tsx
│   └── subjects-page.test.tsx
└── README.md
```

### Runtime shape

- `main.tsx` creates a `QueryClient`, a `Router` from the generated route tree, and mounts the app inside `<QueryClientProvider>` + `<RouterProvider>`.
- `__root.tsx` provides the shared shell components and toaster.
- `_authed.tsx` runs a `beforeLoad` that calls `GET /auth/me`; on 401 it throws a redirect to `/login?next=…`.
- `login.tsx` posts to `/auth/login`, invalidates the `me` query, and navigates to `next` or `/`.
- Each entity page uses TanStack Query hooks generated from typed `openapi-fetch` calls.

### API client

- `openapi-typescript` consumes `http://localhost:8000/openapi.json` and emits `src/lib/api-types.ts`. The file is gitignored; CI regenerates it before type-checking by spinning up the backend or consuming a checked-in `openapi.json` snapshot (see CI below).
- `openapi-fetch` produces a typed `client` with `.GET`, `.POST`, `.PATCH`, `.DELETE`, `.PUT` methods keyed on path and verb.
- `api-client.ts` exports a singleton `client` configured with `baseUrl: '/'` and `credentials: 'include'`. A thin `assertOk(response, error)` helper throws typed `ApiError` instances so TanStack Query's `onError` receives a real `Error`.

### Auth

- Dev: Vite dev-server proxies `/auth`, `/health`, `/subjects`, `/week-schemes`, `/rooms`, `/teachers`, `/stundentafeln`, `/classes`, `/lessons` to `http://localhost:8000`. Cookies stay same-origin.
- Prod: out of scope; Caddy will serve `dist/` and forward API calls to the backend on the same origin.
- The `_authed` layout hydrates `useMe()` (TanStack Query) via `GET /auth/me` and redirects to `/login` on 401.
- Logout calls `POST /auth/logout`, clears TanStack Query cache, and navigates to `/login`.

### Forms

- `react-hook-form` + `@hookform/resolvers/zod` for schema-driven validation.
- shadcn/ui's `<Form>` wrapper wires RHF context into `<FormField>` / `<FormMessage>` so every input shows backend and client errors uniformly.
- Server-side validation errors from FastAPI (422) are parsed and set on the relevant fields via `setError`.

### Testing

- Vitest runs in jsdom. `tests/setup.ts` installs `@testing-library/jest-dom` matchers.
- Tests use MSW (Mock Service Worker) to stub API responses. This keeps tests out of a real backend dependency while still exercising the `openapi-fetch` client.
- Two tests ship in the scaffold: the login form (happy path + invalid credentials) and the subjects page (list render + create dialog submit).

### Lint + format

- Biome runs both lint and format. Config enables `recommended` rules plus `noUnusedImports`, `noUnusedVariables`, `useImportType`, `useExhaustiveDependencies`. `organizeImports` is on.
- Two allowances are formal, not editorial:
  - `suspicious/noExplicitAny`: error, except in type-generation output (gitignored anyway).
  - `style/noDefaultExport`: off (TanStack Router's file-based conventions require default exports).

### Monorepo integration

New `mise` tasks:

| Task | Command |
|---|---|
| `fe:install` | `pnpm install --dir frontend` |
| `fe:dev` | `pnpm -C frontend dev` |
| `fe:build` | `pnpm -C frontend build` |
| `fe:test` | `pnpm -C frontend test` |
| `fe:lint` | `pnpm -C frontend lint` |
| `fe:fmt` | `pnpm -C frontend fmt` |
| `fe:types` | script that spawns the backend briefly, dumps `openapi.json`, runs `openapi-typescript`, and tears the backend down |

Root aggregates:

- `mise run install` adds `pnpm install --dir frontend` after `uv sync`.
- `mise run test` gains `fe:test` as a dependency.
- `mise run lint` gains `fe:lint`.
- `mise run fmt` gains `fe:fmt`.
- `mise run dev` is unchanged (backend only). Document running `mise run fe:dev` in a second terminal.

### Lefthook

`pre-commit` gets a Biome step scoped to staged `frontend/**/*.{ts,tsx,json}` files. `pre-push` adds `mise run fe:test`.

### CI

New `.github/workflows/frontend-ci.yml` that runs on any PR touching `frontend/**` or the workflow itself:

1. Checkout.
2. `mise install` (uses the mise GitHub action).
3. `mise run install` (installs JS deps too).
4. Generate a fresh `openapi.json` via a minimal `python -c` script that calls `FastAPI.openapi()` offline. (No DB needed — just import the app.)
5. `mise run fe:types`, `mise run fe:lint`, `mise run fe:test`, `mise run fe:build`.

No coverage gate yet; align with the backend's gate in a follow-up when enough frontend tests exist.

### ADR

Add ADR 0007 — "React + Vite SPA for the frontend" — recording framework, UI library, routing/data fetching, and tooling choices with a terse rationale and rejected alternatives.

## Key decisions

1. **SPA over meta-framework.** No SSR/SEO needs; Vite is the simplest path.
2. **shadcn/ui over Mantine/MUI.** We own the component source; no runtime theming engine to fight.
3. **TanStack Router + Query.** Type safety and ecosystem coherence trump React Router's ubiquity.
4. **Biome over ESLint + Prettier.** Matches the Astral-philosophy tools already in the repo.
5. **Vite proxy for cookie auth in dev.** Keeps SameSite=Lax working and mirrors production.
6. **OpenAPI-driven types.** The backend is the single source of truth; regen is cheap.
7. **End-to-end slice, not hello-world.** Login + one CRUD page proves the stack; more entities are follow-up.
8. **pnpm over npm/bun.** Phantom-dep strictness + disk efficiency; bun's ecosystem is still uneven for long-lived projects.
9. **Node 22 LTS pinned via mise.** Single toolchain source across backend and frontend.
10. **Generated type file gitignored.** It's build output; checking it in desynchronizes from the backend.

## Open questions (deferred)

- **`/api` prefix on backend.** A future spec may unify mounts; the proxy becomes a single rule then.
- **Dark mode.** Token support lands with shadcn/ui's defaults; enabling the toggle is one follow-up task.
- **i18n / de-DE.** "Klassenzeit" is German-school-oriented; localization should land before user-facing rollout.
- **Parallel dev launcher.** `mise run dev` could start both services; defer until we have a reason to bundle.
- **Coverage gate parity with backend.** Wire in once frontend has enough tests to make the gate non-flaky.

## Success criteria

1. `mise install && mise run install && mise run dev` + `mise run fe:dev` boots both services; logging in at `http://localhost:5173/login` with a seeded admin produces a session cookie that survives a page reload.
2. `/subjects` lists, creates, edits, and deletes subjects against the live backend; cache invalidation refreshes the list after each mutation.
3. `mise run test`, `mise run lint`, `mise run fmt --check`, and `mise run fe:build` all pass locally and in CI.
4. `mise run fe:types` regenerates `api-types.ts` from a running backend without manual steps.
5. ADR 0007 is committed and linked from `docs/architecture/overview.md`.
