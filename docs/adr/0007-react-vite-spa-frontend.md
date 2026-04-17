# 0007 — React + Vite SPA for the frontend

- **Status:** Accepted
- **Date:** 2026-04-17

## Context

Klassenzeit needs an admin UI for the scheduling domain now that the backend
exposes a full CRUD API over seven entities (~35 endpoints). The UI is a
closed, invite-only tool: no public pages, no SEO, no streaming requirements.
Contributors should be able to install, run, lint, and test the frontend with
the same `mise run <task>` muscle memory they already have for the backend.

## Decision

Scaffold `frontend/` as a React 19 + Vite 6 single-page app, with:

- **UI:** shadcn/ui primitives copied into the repo, styled with Tailwind CSS v4.
- **Routing + data:** TanStack Router (file-based) and TanStack Query.
- **API access:** `openapi-typescript` + `openapi-fetch`, regenerated from the
  backend's OpenAPI schema via `mise run fe:types`.
- **Forms:** React Hook Form + Zod, wrapped by shadcn's Form component.
- **Lint + format:** Biome (single Rust-backed binary).
- **Tests:** Vitest + React Testing Library + MSW (Node adapter), jsdom env.
- **Package manager:** pnpm, pinned alongside Node 22 LTS via mise.
- **Dev auth:** Vite dev server proxies backend prefixes so cookies stay
  same-origin.

## Alternatives considered

- **Svelte (SvelteKit) / Vue (Vue 3):** smaller ecosystem for admin tables and
  enterprise components in 2026. React's stack (shadcn, TanStack, Radix) is
  the best-in-class admin match.
- **Next.js / Remix:** would add a Node server boundary and a data-loader
  paradigm we don't need behind cookie-session auth with no SEO.
- **Mantine / MUI / Chakra:** heavier runtime theming engines; we prefer
  owning the component source.
- **React Router v7:** mature and ubiquitous, but TanStack Router's type
  inference on params and search is markedly stronger.
- **ESLint + Prettier:** two tools, slower, config sprawl. Biome aligns with
  the project's Astral-philosophy Rust-backed tooling (ruff, ty, clippy).
- **npm / bun:** npm's resolution is loose and its installs are slow; bun's
  ecosystem is still uneven for long-lived business apps. pnpm wins on
  strictness (catches phantom imports) and disk efficiency.
- **Hand-written types or orval:** orval's generated hooks are opinionated
  and heavy. `openapi-typescript` emits only types; `openapi-fetch` is a 5 KB
  typed fetch wrapper over the generated `paths`. Regeneration is one command.

## Consequences

- **Easier:** adding more entity CRUD pages is mechanical; the auth, query,
  mutation, and form patterns are set. Toolchain pinning means "works on my
  machine" is "works on everyone's machine". Type drift between backend and
  frontend is caught at `mise run fe:types` + `tsc`.
- **Harder:** operators now maintain three toolchains (Rust, Python, Node).
  Regenerated `api-types.ts` is not committed, so CI must regenerate it from
  the backend before typecheck — which couples frontend CI to backend
  importability. Vite dev proxy has to list backend prefixes explicitly until
  the backend adopts a uniform `/api` prefix.
- **Revisit if:** we need SEO or SSR (switch to a meta-framework), the UI
  grows past what a single Vite bundle comfortably serves (code-split or
  split into multiple apps), or the backend adopts GraphQL (drop
  `openapi-fetch`).

## Notes

- **openapi-fetch + MSW + jsdom gotcha.** `openapi-fetch`'s `createClient`
  captures `globalThis.fetch` at call time. MSW patches `globalThis.fetch`
  later (inside `beforeAll`), which bypasses the client's captured reference.
  The fix is to pass `fetch: (req, init) => globalThis.fetch(req, init)` so
  the call resolves the current global each time. See
  `frontend/src/lib/api-client.ts`.
