# Frontend Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `frontend/` workspace with a React + Vite SPA, integrate it into the monorepo toolchain, and ship a meaningful end-to-end slice (login + subjects CRUD) wired to the existing FastAPI backend.

**Architecture:** React 19 + Vite 6 + TypeScript. shadcn/ui + Tailwind v4 for UI. TanStack Router + Query for routing and data. React Hook Form + Zod for forms. openapi-typescript + openapi-fetch for typed API access. Biome for lint/format. Vitest + React Testing Library + MSW for tests. pnpm as the package manager, pinned alongside Node 22 LTS via mise.

**Scope:** Scaffold only. Deployment, extra entity CRUDs, e2e tests, and dark mode are follow-ups.

---

## File map

### New files

| File | Responsibility |
|---|---|
| `frontend/package.json` | Workspace manifest, scripts |
| `frontend/pnpm-lock.yaml` | Lockfile (generated) |
| `frontend/tsconfig.json` | Strict TS + `erasableSyntaxOnly` + `verbatimModuleSyntax` |
| `frontend/tsconfig.node.json` | Config-file typing context |
| `frontend/biome.json` | Biome config (lint + format) |
| `frontend/vite.config.ts` | Vite + plugins + dev proxy |
| `frontend/vitest.config.ts` | Vitest config (jsdom, setup file) |
| `frontend/index.html` | SPA entry |
| `frontend/src/main.tsx` | Router + QueryClient providers |
| `frontend/src/routes/__root.tsx` | Root layout |
| `frontend/src/routes/login.tsx` | `/login` page |
| `frontend/src/routes/_authed.tsx` | Auth-guard layout |
| `frontend/src/routes/_authed.index.tsx` | Dashboard |
| `frontend/src/routes/_authed.subjects.tsx` | Subjects CRUD page |
| `frontend/src/components/ui/*` | shadcn components (button, input, form, table, dialog, toast, …) |
| `frontend/src/components/layout/app-shell.tsx` | Sidebar + header layout |
| `frontend/src/lib/api-client.ts` | `openapi-fetch` singleton |
| `frontend/src/lib/auth.ts` | `useMe` / `useLogout` hooks |
| `frontend/src/lib/utils.ts` | `cn()` helper |
| `frontend/src/features/subjects/hooks.ts` | `useSubjects`, `useCreateSubject`, `useUpdateSubject`, `useDeleteSubject` |
| `frontend/src/features/subjects/schema.ts` | Zod schema for Subject form |
| `frontend/src/features/subjects/subjects-page.tsx` | Subjects list + dialog |
| `frontend/src/styles/app.css` | Tailwind entry + theme tokens |
| `frontend/tests/setup.ts` | RTL + jest-dom matchers |
| `frontend/tests/msw-handlers.ts` | Shared MSW handlers |
| `frontend/tests/login.test.tsx` | Login form test |
| `frontend/tests/subjects-page.test.tsx` | Subjects page test |
| `frontend/README.md` | One-pager on dev commands |
| `frontend/.gitignore` | `node_modules`, `dist`, `src/routeTree.gen.ts`, `src/lib/api-types.ts`, `coverage` |
| `scripts/dump_openapi.py` | Offline OpenAPI schema dump (no DB needed) |
| `scripts/gen_frontend_types.sh` | Wrapper: dump schema + run openapi-typescript |
| `.github/workflows/frontend-ci.yml` | CI pipeline for frontend |
| `docs/adr/0007-react-vite-spa-frontend.md` | ADR capturing stack decisions |

### Modified files

| File | Change |
|---|---|
| `mise.toml` | Add node + pnpm tool pins and `fe:*` tasks; hook `fe:*` into root aggregates |
| `.config/lefthook.yaml` | Add Biome pre-commit step + `fe:test` pre-push step |
| `docs/architecture/overview.md` | Document frontend, update layout |
| `docs/adr/README.md` | Index ADR 0007 |
| `README.md` | Add frontend dev commands |
| `docs/superpowers/OPEN_THINGS.md` | Mark frontend-scaffolding line resolved; note follow-ups (deploy, dark mode, i18n, more entity CRUDs) |
| `.gitignore` | (if needed) exclude `frontend/node_modules` at repo root |

---

## Task 1: Toolchain pins + `mise` tasks

Add Node + pnpm to `mise.toml` and scaffold the `fe:*` task set. No code yet, just plumbing so subsequent tasks can run `pnpm` through mise.

**Files:** `mise.toml`

- [ ] **Step 1: Pin Node and pnpm.** Add under `[tools]`:
  ```toml
  node = "22"
  "npm:pnpm" = "latest"
  ```
  (Use `"npm:pnpm"` if mise has no first-party pnpm plugin on this version; otherwise `pnpm = "latest"`. Verify with `mise plugin list` during the task.)

- [ ] **Step 2: Add `fe:*` tasks.**
  ```toml
  [tasks."fe:install"]
  description = "Install frontend dependencies"
  dir = "{{config_root}}/frontend"
  run = "pnpm install"

  [tasks."fe:dev"]
  description = "Run the frontend dev server"
  dir = "{{config_root}}/frontend"
  run = "pnpm dev"

  [tasks."fe:build"]
  description = "Build the frontend for production"
  dir = "{{config_root}}/frontend"
  run = "pnpm build"

  [tasks."fe:test"]
  description = "Run frontend tests"
  dir = "{{config_root}}/frontend"
  run = "pnpm test"

  [tasks."fe:lint"]
  description = "Lint the frontend (Biome)"
  dir = "{{config_root}}/frontend"
  run = "pnpm lint"

  [tasks."fe:fmt"]
  description = "Format the frontend (Biome)"
  dir = "{{config_root}}/frontend"
  run = "pnpm fmt"

  [tasks."fe:types"]
  description = "Regenerate OpenAPI types for the frontend"
  run = "bash scripts/gen_frontend_types.sh"
  ```

- [ ] **Step 3: Wire `fe:*` into root aggregates.** Update existing `install`, `test`, `lint`, `fmt` tasks so they depend on `fe:install`, `fe:test`, `fe:lint`, `fe:fmt` respectively (add to the `depends` array). Leave `dev` unchanged.

- [ ] **Step 4: Verify.** Run `mise install` then `mise tasks` — new tasks should appear. Do not run `fe:*` yet (frontend does not exist).

- [ ] **Step 5: Commit.**
  ```bash
  git add mise.toml
  git commit -m "build(mise): pin node + pnpm and add fe:* tasks"
  ```

---

## Task 2: Package manifest + TypeScript + Biome config

Create the frontend package directory with its manifest and configs. Install no dependencies yet beyond what Vite + React need.

**Files:** `frontend/package.json`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/biome.json`, `frontend/.gitignore`, `frontend/README.md`

- [ ] **Step 1: Create `frontend/package.json`.** Fields:
  - `"name": "klassenzeit-frontend"`, `"private": true`, `"type": "module"`.
  - `"scripts"`: `dev`, `build` (= `vite build`), `preview`, `test` (= `vitest run`), `test:watch`, `lint` (= `biome check .`), `fmt` (= `biome format --write .`), `fmt:check` (= `biome format .`), `typecheck` (= `tsc --noEmit`).
  - Leave `dependencies` and `devDependencies` empty; Task 3 adds them via `pnpm add`.

- [ ] **Step 2: Create `frontend/tsconfig.json`.**
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "jsx": "react-jsx",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "strict": true,
      "erasableSyntaxOnly": true,
      "verbatimModuleSyntax": true,
      "noUncheckedIndexedAccess": true,
      "noImplicitOverride": true,
      "isolatedModules": true,
      "resolveJsonModule": true,
      "skipLibCheck": true,
      "allowImportingTsExtensions": false,
      "noEmit": true,
      "paths": { "@/*": ["./src/*"] }
    },
    "include": ["src", "tests"],
    "references": [{ "path": "./tsconfig.node.json" }]
  }
  ```

- [ ] **Step 3: Create `frontend/tsconfig.node.json`.** Same strict settings, `include: ["vite.config.ts", "vitest.config.ts"]`, `composite: true`.

- [ ] **Step 4: Create `frontend/biome.json`.**
  ```json
  {
    "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
    "organizeImports": { "enabled": true },
    "files": { "ignore": ["dist", "coverage", "src/routeTree.gen.ts", "src/lib/api-types.ts"] },
    "linter": {
      "enabled": true,
      "rules": {
        "recommended": true,
        "correctness": { "useExhaustiveDependencies": "error" },
        "style": { "noDefaultExport": "off", "useImportType": "error" }
      }
    },
    "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
    "javascript": { "formatter": { "quoteStyle": "double" } }
  }
  ```
  Pin to whatever version Task 3 installs (update `$schema` accordingly).

- [ ] **Step 5: Create `frontend/.gitignore`.** Entries: `node_modules`, `dist`, `coverage`, `src/routeTree.gen.ts`, `src/lib/api-types.ts`, `.vite`.

- [ ] **Step 6: Create `frontend/README.md`.** Short dev guide: `mise run fe:install`, `fe:dev`, `fe:test`, `fe:types`. Point at the spec.

- [ ] **Step 7: Commit.**
  ```bash
  git add frontend/
  git commit -m "chore(frontend): scaffold package manifest and config files"
  ```

---

## Task 3: Install runtime + dev dependencies

Install the full stack via pnpm. This populates `pnpm-lock.yaml` and `node_modules` (gitignored).

**Files:** `frontend/package.json`, `frontend/pnpm-lock.yaml`

Run every `pnpm add` from `frontend/` (via `mise exec -- pnpm -C frontend add …` or by `cd frontend`).

- [ ] **Step 1: Runtime dependencies.**
  ```bash
  pnpm -C frontend add \
    react react-dom \
    @tanstack/react-router @tanstack/react-query \
    react-hook-form @hookform/resolvers zod \
    openapi-fetch \
    class-variance-authority clsx tailwind-merge lucide-react \
    @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-label \
    @radix-ui/react-toast
  ```

- [ ] **Step 2: Dev dependencies.**
  ```bash
  pnpm -C frontend add -D \
    typescript @types/react @types/react-dom \
    vite @vitejs/plugin-react \
    @tanstack/router-plugin @tanstack/router-devtools @tanstack/react-query-devtools \
    tailwindcss @tailwindcss/vite \
    @biomejs/biome \
    vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom \
    msw \
    openapi-typescript
  ```

- [ ] **Step 3: Verify `package.json`.** Versions should resolve cleanly; `pnpm-lock.yaml` is created.

- [ ] **Step 4: Commit.**
  ```bash
  git add frontend/package.json frontend/pnpm-lock.yaml
  git commit -m "chore(frontend): install react + vite + tanstack + shadcn deps"
  ```

---

## Task 4: Vite + Tailwind wiring

Configure Vite with the React plugin, TanStack Router plugin, Tailwind v4 plugin, and the dev proxy. Build the minimal `main.tsx` that boots the app to an empty `<div>`.

**Files:** `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/styles/app.css`, `frontend/src/lib/utils.ts`

- [ ] **Step 1: `vite.config.ts`.**
  ```ts
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";
  import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
  import tailwindcss from "@tailwindcss/vite";
  import path from "node:path";

  const BACKEND = "http://localhost:8000";
  const API_PREFIXES = [
    "/auth",
    "/health",
    "/subjects",
    "/week-schemes",
    "/rooms",
    "/teachers",
    "/stundentafeln",
    "/classes",
    "/lessons",
  ];

  export default defineConfig({
    plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
      port: 5173,
      proxy: Object.fromEntries(
        API_PREFIXES.map((prefix) => [prefix, { target: BACKEND, changeOrigin: true }]),
      ),
    },
  });
  ```

- [ ] **Step 2: `index.html`.** Standard Vite template with `<title>Klassenzeit</title>` and `<div id="root">`.

- [ ] **Step 3: `src/styles/app.css`.**
  ```css
  @import "tailwindcss";
  @theme { /* placeholder — fill when shadcn init runs */ }
  ```

- [ ] **Step 4: `src/lib/utils.ts`.** Export `cn` using `clsx` + `tailwind-merge`.

- [ ] **Step 5: `src/main.tsx`.** For now, mount a bare `<StrictMode><div>Klassenzeit</div></StrictMode>`; router wiring lands in Task 5.

- [ ] **Step 6: Smoke test.** `mise run fe:dev`, hit `http://localhost:5173`, see the placeholder text, Ctrl-C.

- [ ] **Step 7: Commit.**
  ```bash
  git add frontend/
  git commit -m "feat(frontend): vite + tailwind bootstrap"
  ```

---

## Task 5: Router + QueryClient providers

Introduce TanStack Router file-based routing and the QueryClient provider. Replace the placeholder `main.tsx` with the real providers. Add the root layout.

**Files:** `frontend/src/main.tsx`, `frontend/src/routes/__root.tsx`, `frontend/src/routes/_authed.tsx`, `frontend/src/routes/_authed.index.tsx`, `frontend/src/routes/login.tsx`

- [ ] **Step 1: `__root.tsx`.** Export `Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Root })`. `Root` renders a `<Toaster />`, `<Outlet />`, and `<TanStackRouterDevtools />`.

- [ ] **Step 2: `_authed.tsx`.** Layout route with `beforeLoad({ context, location })` that runs `context.queryClient.ensureQueryData({ queryKey: ['me'], queryFn: fetchMe })`. On error, throw `redirect({ to: '/login', search: { next: location.href } })`. Component renders the `<AppShell>` wrapping `<Outlet />` (AppShell is a thin placeholder in this task — a real one lands in Task 7).

- [ ] **Step 3: `_authed.index.tsx`.** Placeholder dashboard: "Welcome, {email}" pulled from `useMe()`.

- [ ] **Step 4: `login.tsx`.** Placeholder: empty form. Real implementation lands in Task 8.

- [ ] **Step 5: `main.tsx`.**
  ```tsx
  import { StrictMode } from "react";
  import { createRoot } from "react-dom/client";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { RouterProvider, createRouter } from "@tanstack/react-router";
  import { routeTree } from "./routeTree.gen";
  import "./styles/app.css";

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 10_000 } },
  });
  const router = createRouter({ routeTree, context: { queryClient } });

  declare module "@tanstack/react-router" {
    interface Register { router: typeof router }
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
  ```

- [ ] **Step 6: Smoke test.** `mise run fe:dev`; visit `/`; TanStack Router plugin should generate `routeTree.gen.ts`; the auth guard redirects to `/login`. No errors in console.

- [ ] **Step 7: Commit.**
  ```bash
  git add frontend/
  git commit -m "feat(frontend): tanstack router + query providers"
  ```

---

## Task 6: shadcn/ui primitives + Tailwind theme

Manually bring in the shadcn components the scaffold uses. Do NOT run `npx shadcn init` (we want version-pinned, reviewable diffs). Copy component sources from the shadcn registry into `src/components/ui/`, tuned for Tailwind v4.

**Files:** `frontend/src/components/ui/{button,input,label,form,table,dialog,toast,toaster,use-toast}.tsx`, `frontend/src/styles/app.css`

- [ ] **Step 1: Tokenize Tailwind theme.** Replace `app.css` contents with the Tailwind v4 + shadcn theme tokens (light-mode only is fine for the scaffold; dark tokens can be added later without breaking). Include `@theme inline` block with `--color-*` variables shadcn expects.

- [ ] **Step 2: Port `button.tsx`.** Use `class-variance-authority` + `@radix-ui/react-slot`. Variants: default, destructive, outline, secondary, ghost, link.

- [ ] **Step 3: Port `input.tsx`, `label.tsx`.**

- [ ] **Step 4: Port `form.tsx`.** Wire RHF context (`FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `FormDescription`).

- [ ] **Step 5: Port `table.tsx`.** Basic `<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>`, `<TableCaption>`.

- [ ] **Step 6: Port `dialog.tsx`.** Radix Dialog wrapper.

- [ ] **Step 7: Port `toast.tsx` + `toaster.tsx` + `use-toast.ts`.** Radix Toast.

- [ ] **Step 8: Verify `mise run fe:lint` passes.** Fix anything Biome complains about.

- [ ] **Step 9: Commit.**
  ```bash
  git add frontend/
  git commit -m "feat(frontend): shadcn ui primitives + tailwind theme"
  ```

---

## Task 7: App shell + AuthShell

Replace the placeholder `AppShell` with a proper sidebar + header layout. Add a Logout button that calls `/auth/logout` and invalidates queries.

**Files:** `frontend/src/components/layout/app-shell.tsx`, `frontend/src/lib/auth.ts`, `frontend/src/routes/_authed.tsx`

- [ ] **Step 1: `lib/auth.ts`.** Export `useMe()` (`useQuery({ queryKey: ['me'], queryFn: fetchMe })`) and `useLogout()` (`useMutation`). `fetchMe` uses the `openapi-fetch` client to call `GET /auth/me`.

- [ ] **Step 2: `AppShell`.** Responsive layout — left sidebar with links (`Dashboard`, `Subjects`), header with email + logout button. Use shadcn components for the button.

- [ ] **Step 3: Wire into `_authed.tsx`.**

- [ ] **Step 4: Smoke test.** Full round trip in the browser: navigate to `/`, get redirected to `/login`, manually log in via `curl` in another terminal to get a cookie, reload, see the dashboard, click Logout, get redirected back to `/login`.

- [ ] **Step 5: Commit.**
  ```bash
  git add frontend/
  git commit -m "feat(frontend): app shell with sidebar + logout"
  ```

---

## Task 8: Login form

Build the real login page with RHF + Zod + shadcn Form. Handle 401 by showing an error toast + inline form error.

**Files:** `frontend/src/routes/login.tsx`

- [ ] **Step 1: Validation schema.**
  ```ts
  const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, "Password is required"),
  });
  ```

- [ ] **Step 2: `login.tsx` component.** Use `useForm` with Zod resolver, `useMutation` for the POST. On success: invalidate `['me']`, navigate to `search.next ?? '/'`. On 401: `form.setError('password', { message: 'Invalid email or password' })`. Route definition: `createFileRoute('/login')({ validateSearch: z.object({ next: z.string().optional() }), component: LoginPage })`.

- [ ] **Step 3: Accessibility.** Email input has `autocomplete="email"`, password has `autocomplete="current-password"`; submit button is disabled while mutation is pending.

- [ ] **Step 4: Smoke test in browser** (backend must be running + an admin user must exist).

- [ ] **Step 5: Commit.**
  ```bash
  git add frontend/
  git commit -m "feat(frontend): login form with validation and error handling"
  ```

---

## Task 9: OpenAPI type generation pipeline

Ship the script pair that regenerates `api-types.ts` from the backend schema.

**Files:** `scripts/dump_openapi.py`, `scripts/gen_frontend_types.sh`, `frontend/src/lib/api-client.ts`

- [ ] **Step 1: `scripts/dump_openapi.py`.**
  ```python
  """Dump the FastAPI OpenAPI schema to stdout without starting the server."""
  import json
  from klassenzeit_backend.main import app

  if __name__ == "__main__":
      print(json.dumps(app.openapi(), indent=2))
  ```
  (This imports the app directly — no DB connection opened, because the engine is built in the lifespan, not at import time.)

- [ ] **Step 2: `scripts/gen_frontend_types.sh`.**
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  cd "$(dirname "$0")/.."
  uv run --project backend python scripts/dump_openapi.py > frontend/openapi.json.tmp
  mv frontend/openapi.json.tmp frontend/openapi.json
  pnpm -C frontend exec openapi-typescript frontend/openapi.json -o frontend/src/lib/api-types.ts
  ```
  Make it executable.

- [ ] **Step 3: `api-client.ts`.**
  ```ts
  import createClient from "openapi-fetch";
  import type { paths } from "./api-types";
  export const client = createClient<paths>({ baseUrl: "/", credentials: "include" });
  ```

- [ ] **Step 4: Update `frontend/.gitignore`.** Add `openapi.json`.

- [ ] **Step 5: Verify.** Run `mise run fe:types` with the backend running (and without — both should work, because the script doesn't hit the DB). `api-types.ts` should exist and typecheck.

- [ ] **Step 6: Commit.**
  ```bash
  git add scripts/ frontend/
  git commit -m "build(frontend): openapi-driven type generation"
  ```

---

## Task 10: Subjects CRUD page

Full end-to-end slice: list, create, edit, delete, each using TanStack Query + openapi-fetch + RHF.

**Files:** `frontend/src/features/subjects/{hooks.ts,schema.ts,subjects-page.tsx}`, `frontend/src/routes/_authed.subjects.tsx`

- [ ] **Step 1: `features/subjects/hooks.ts`.** Four hooks:
  - `useSubjects()` → `useQuery({ queryKey: ['subjects'], queryFn: () => client.GET('/subjects') })`
  - `useCreateSubject()` → `useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subjects'] }) })`
  - `useUpdateSubject()` — analogous, PATCH `/subjects/{id}`
  - `useDeleteSubject()` — DELETE `/subjects/{id}`

- [ ] **Step 2: `features/subjects/schema.ts`.** Zod schema matching the backend's `SubjectCreate` (name, short_name, color? — confirm field list from `api-types.ts`).

- [ ] **Step 3: `subjects-page.tsx`.** shadcn `<Table>` for the list, `<Dialog>` for create/edit. Delete with a `<Dialog>` confirm. Loading and empty states.

- [ ] **Step 4: Route file `_authed.subjects.tsx`.** Trivial wrapper that renders `<SubjectsPage />`.

- [ ] **Step 5: Smoke test.** Create, edit, delete a subject against the live backend; verify the list refreshes.

- [ ] **Step 6: Commit.**
  ```bash
  git add frontend/
  git commit -m "feat(frontend): subjects crud page"
  ```

---

## Task 11: Tests (Vitest + MSW)

Add two tests: login happy path + invalid credentials, subjects page list + create dialog.

**Files:** `frontend/vitest.config.ts`, `frontend/tests/{setup.ts,msw-handlers.ts,login.test.tsx,subjects-page.test.tsx}`

- [ ] **Step 1: `vitest.config.ts`.** `test.environment = 'jsdom'`, `test.setupFiles = ['./tests/setup.ts']`, `test.globals = true`.

- [ ] **Step 2: `tests/setup.ts`.** Import `@testing-library/jest-dom/vitest`. Set up MSW server lifecycle (`beforeAll(server.listen)`, `afterEach(server.resetHandlers)`, `afterAll(server.close)`).

- [ ] **Step 3: `tests/msw-handlers.ts`.** Handlers for `POST /auth/login`, `GET /auth/me`, `GET /subjects`, `POST /subjects`.

- [ ] **Step 4: `tests/login.test.tsx`.** Render `<LoginPage />` inside a test router + QueryClient. Assert: form validates, 401 response surfaces inline error, successful login navigates away.

- [ ] **Step 5: `tests/subjects-page.test.tsx`.** Render `<SubjectsPage />`. Assert: list renders from handler, create dialog submits and closes.

- [ ] **Step 6: Verify.** `mise run fe:test` passes. `mise run fe:lint` passes.

- [ ] **Step 7: Commit.**
  ```bash
  git add frontend/
  git commit -m "test(frontend): login and subjects page tests"
  ```

---

## Task 12: Lefthook integration

Add the frontend hook steps so the team's existing pre-commit / pre-push workflow catches frontend regressions.

**Files:** `.config/lefthook.yaml`

- [ ] **Step 1: Add a `fe:biome` step** under `pre-commit` scoped to staged `frontend/**/*.{ts,tsx,json,css}` files: `{staged_files}` expanded into a `pnpm -C frontend exec biome check --no-errors-on-unmatched {staged_files}` command. (Use `biome check --staged` if supported by the installed version.)

- [ ] **Step 2: Add `fe:test`** under `pre-push` as a parallel step alongside the existing backend test step.

- [ ] **Step 3: Run `lefthook run pre-commit` and `lefthook run pre-push`** to sanity-check.

- [ ] **Step 4: Commit.**
  ```bash
  git add .config/lefthook.yaml
  git commit -m "build(lefthook): run biome + fe:test on staged frontend changes"
  ```

---

## Task 13: CI workflow

Add `frontend-ci.yml`. Runs lint + test + build on PRs touching the frontend.

**Files:** `.github/workflows/frontend-ci.yml`

- [ ] **Step 1: Write the workflow.** Triggers: `pull_request` on paths `frontend/**`, `scripts/dump_openapi.py`, `scripts/gen_frontend_types.sh`, `.github/workflows/frontend-ci.yml`, `mise.toml`, `backend/src/**` (so backend schema changes trigger a type regen + frontend typecheck). Steps: checkout, `jdx/mise-action@v2`, `mise run install` (installs both backend and frontend deps), `mise run fe:types`, `mise run fe:lint`, `mise run fe:test`, `mise run fe:build`, and a separate `pnpm -C frontend exec tsc --noEmit` step.

- [ ] **Step 2: Commit.**
  ```bash
  git add .github/workflows/frontend-ci.yml
  git commit -m "ci: add frontend lint/test/build workflow"
  ```

---

## Task 14: Docs + ADR + OPEN_THINGS update

- [ ] **Step 1: ADR 0007.** `docs/adr/0007-react-vite-spa-frontend.md` — capture the framework + UI + routing/data/forms/lint/test decisions and the rejected alternatives (Svelte/Vue, Next.js/Remix, Mantine/MUI, React Router, ESLint+Prettier, npm/bun).

- [ ] **Step 2: `docs/adr/README.md`.** Add a line for ADR 0007.

- [ ] **Step 3: `docs/architecture/overview.md`.** Update the monorepo tree so `frontend/` is described (not "reserved"); add a subsystem entry for the frontend with the stack summary and a link to ADR 0007.

- [ ] **Step 4: Root `README.md`.** Add frontend commands: `mise run fe:install`, `fe:dev`, `fe:test`, `fe:types`.

- [ ] **Step 5: `docs/superpowers/OPEN_THINGS.md`.** Remove the "Frontend scaffolding" bullet; add shorter follow-up items: "Frontend dark mode toggle", "Frontend i18n / de-DE", "Remaining entity CRUD pages (WeekScheme, Room, Teacher, Stundentafel, SchoolClass, Lesson)", "Parallel `mise run dev` for backend + frontend".

- [ ] **Step 6: Commit.**
  ```bash
  git add docs/ README.md
  git commit -m "docs: frontend scaffolding architecture + ADR 0007"
  ```

---

## Task 15: Final verification

- [ ] **Step 1:** `mise run install` — both backend and frontend deps install cleanly.
- [ ] **Step 2:** `mise run lint` — passes.
- [ ] **Step 3:** `mise run test` — backend + frontend tests pass.
- [ ] **Step 4:** `mise run fe:build` — produces `frontend/dist/` without errors.
- [ ] **Step 5:** `mise run fe:types` — regenerates `api-types.ts` cleanly.
- [ ] **Step 6:** Manual browser smoke test — start backend (`mise run dev`) + frontend (`mise run fe:dev`), create an admin via `mise run auth:create-admin`, log in, create a subject, edit it, delete it, log out. Cookie survives reload.
- [ ] **Step 7:** `git log --oneline origin/main..HEAD` — confirm every commit is Conventional-Commit compliant.
