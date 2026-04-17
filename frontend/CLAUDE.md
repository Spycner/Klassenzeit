# Klassenzeit frontend: do-not-do list

Stack: Vite + React 19, TanStack Router + Query, shadcn/ui, React Hook Form + Zod, react-i18next, next-themes. Rules below are on top of `.claude/CLAUDE.md`, not a replacement.

## Layout (`frontend/src/`)

- `routes/` — TanStack Router file-based routes (`__root.tsx`, `_authed.tsx`, etc.). Route files are thin; they import page components from `features/`.
- `features/<name>/` — Feature-scoped React code (page component, hooks, schema). Keep features self-contained; cross-feature imports are a smell.
- `components/ui/` — shadcn primitives. Generated, rarely edited.
- `components/` — App-level composites (`theme-toggle.tsx`, `language-switcher.tsx`, `layout/app-shell.tsx`).
- `lib/` — Cross-cutting utilities (`api-client.ts`, `auth.ts`, `utils.ts`).
- `i18n/` — `config.ts`, `init.ts`, `locales/{en,de}.json`, `types.d.ts`.
- `styles/app.css` — Tailwind entry + token definitions (`:root`, `.dark`).
- `routeTree.gen.ts`, `lib/api-types.ts` — generated; gitignored; do not edit.

## Commands

Run from repo root unless noted.

- `mise run fe:dev` — dev server on `:5173`, proxies API to `:8000`.
- `mise run fe:test` — Vitest once, no coverage (fast).
- `mise run fe:test:cov` — Vitest with coverage; writes `frontend/coverage/coverage-summary.json`.
- `mise run fe:cov:update-baseline` — rebaseline `.coverage-baseline-frontend` after an intentional coverage drop.
- `mise run fe:types` — regenerate `src/lib/api-types.ts` from the backend OpenAPI schema.
- `mise run fe:build` — production build into `frontend/dist/`.
- `mise exec -- pnpm -C frontend add <pkg>` / `add -D <pkg>` — add a dep (never hand-edit `package.json`).

## Hooks and state

- **No `useEffect` for derived state.** Compute during render. For syncing to props, use `key` to remount or derive inline.
- **No `useState` for data you can recompute** from other state, props, or route search params.
- **No defensive `useMemo`/`useCallback`.** Add only when profiling shows wasted work, or when reference stability is required by a dep array or memoized child.
- **No `forwardRef` in new components.** React 19 treats `ref` as a plain prop. When touching shadcn primitives (e.g. `button.tsx`), clean up in passing.
- **No array index as `key`** in lists that reorder, paginate, filter, or allow deletion. Use a stable id.
- **`useEffect` mount gate** is acceptable only for third-party sync (e.g. `next-themes`); flag it in review for anything else.

## Server state and routing

- **No fetching in `useEffect` + `useState`.** Use TanStack Query (`useQuery`, `useMutation`). Use the typed `client` from `@/lib/api-client`.
- **No local state for filter / sort / page / selection** that a user would want to share or refresh. Put it in TanStack Router search params via `useSearch` with a Zod `validateSearch`.
- **No `useNavigate` for in-app links.** Use `<Link>` so keyboard and middle-click work.

## Forms (RHF + Zod)

- **No uncontrolled to controlled flipping.** Seed `defaultValues` with `""`, not `undefined` or `null`.
- **No submit button without `disabled={isPending}`** and a pending label (`t("common.saving")` etc.).
- **No Zod `.email("msg")` literals for user-facing errors.** Go through `t("…")`; if the message needs to update on locale switch, move the message lookup into the render path (`FormMessage` children), not the schema.

## Styling

- **No inline hex or OKLCH literals** in components. Use tokens: `bg-background`, `text-muted-foreground`, `border-border`, etc. Tokens live in `src/styles/app.css` under `:root` and `.dark`.
- **No Tailwind arbitrary values** (`bg-[#e5e7eb]`, `text-[oklch(...)]`) except for one-off spacing where no token fits.
- **No `!important`.** Solve with selector order or by adding a token.
- **No `style={{...}}` for colors or spacing.** Tailwind class or token CSS var only.

## i18n

- **No string concatenation of translated fragments.** `t("greet") + " " + name` breaks word order in DE. Use interpolation: `t("greet", { name })`.
- **No hardcoded plurals.** Use i18next's `_one` / `_other` keys.
- **No hardcoded user-visible English or German.** Every JSX text node, `aria-label`, placeholder, toast, and error string goes through `t("…")` with entries in both `en.json` and `de.json`.
- **No date or number formatting with `toString()`.** Use `Intl.DateTimeFormat` / `Intl.NumberFormat` seeded from `i18n.language`.

## Accessibility

- **No click handlers on `<div>` or `<span>`.** Use `<Button variant="ghost">` or a real `<a>` / `<Link>`.
- **No color-only signaling** for errors or success. Pair with icon or text.
- **No dialogs without `DialogTitle` / `DialogDescription`.** shadcn's `Dialog` requires them for screen readers.
- **No dynamic content without `aria-live`** for toasts, form-level root errors, and async status.

## TypeScript

- **No `as Foo` assertions** where a type guard or discriminated union would narrow. Assertions rot silently when shapes drift.
- **No `any`.** Prefer `unknown` with a guard, or refine the generic.
- Root `.claude/CLAUDE.md` covers `erasableSyntaxOnly` (no `enum`, no parameter properties, no namespaces, no `import =`). Those apply here too.

## Testing

- **No snapshot tests as the primary assertion.** Assert specific text, roles, or behaviors.
- **No `queryBy*` for async-rendered content.** Use `findBy*` so the test waits instead of racing.
- **No mocking of `client` or hooks.** MSW handles the network boundary; components render as in prod.
- **No `data-testid` when a role or accessible name exists.** Query by role first (`getByRole("button", { name: /…/i })`).

## Bundle

- **No `import * as Icons from "lucide-react"`.** Named imports only; the library is tree-shakable per-icon.
- **No dynamic `import()`.** Static imports only; the Router plugin handles route-level code splitting.
