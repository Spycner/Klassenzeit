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
- **Single test file:** `cd frontend && mise exec -- pnpm vitest run <path>`. Don't use `mise exec -- pnpm -C frontend vitest ...`: pnpm treats `frontend` as a filter target, then can't find `vitest` in the recursive set. Don't use `mise run fe:test -- --run` either: the task body is a shell `if [ -f ... ]`, so positional args land in the `if` arg list and the shell errors.

## Hooks and state

- **No `useEffect` for derived state.** Compute during render. For syncing to props, use `key` to remount or derive inline.
- **No `useState` for data you can recompute** from other state, props, or route search params.
- **No defensive `useMemo`/`useCallback`.** Add only when profiling shows wasted work, or when reference stability is required by a dep array or memoized child.
- **No `forwardRef` in new components.** React 19 treats `ref` as a plain prop. When touching shadcn primitives (e.g. `button.tsx`), clean up in passing.
- **No array index as `key`.** Biome's `noArrayIndexKey` rule rejects `list.map((_, i) => <X key={i}/>)` even for static fixed-size arrays. For fixed slots (period numbers, day-of-week labels, etc.) define a module-level `const SLOTS = ["P1", "P2", …]` and key by the string.
- **`useEffect` mount gate** is acceptable only for third-party sync (e.g. `next-themes`); flag it in review for anything else.

## Server state and routing

- **No fetching in `useEffect` + `useState`.** Use TanStack Query (`useQuery`, `useMutation`). Use the typed `client` from `@/lib/api-client`.
- **No local state for filter / sort / page / selection** that a user would want to share or refresh. Put it in TanStack Router search params via `useSearch` with a Zod `validateSearch`.
- **No `useNavigate` for in-app links.** Use `<Link>` so keyboard and middle-click work.
- **Page components that consume search params should use `useSearch({ strict: false })`** with a typed cast, not `useSearch({ from: "/_authed/foo" })`. The test harness (`renderWithProviders`) mounts components at `/` with no route tree for the real path; strict matching throws at render.

## Forms (RHF + Zod)

- **No uncontrolled to controlled flipping.** Seed `defaultValues` with `""`, not `undefined` or `null`.
- **No submit button without `disabled={isPending}`** and a pending label (`t("common.saving")` etc.).
- **No Zod `.email("msg")` literals for user-facing errors.** Go through `t("…")`; if the message needs to update on locale switch, move the message lookup into the render path (`FormMessage` children), not the schema.
- **No Zod `.uuid()` for FK form fields.** Zod v4's `.uuid()` enforces RFC 4122 version/variant bits, so pattern-UUIDs like `11111111-…-111111111111` (seed / test data) fail validation. Use `z.string().min(1)` for FK IDs; the backend validates UUID format anyway.

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
- **`t()` keys are typed against `en.json`** (via `src/i18n/types.d.ts`). Changing a key's shape (string → object, or renaming) breaks every call site at type-check time. Migrate call sites in one pass.
- **No template-literal keys.** `` t(`prefix.${var}`) `` does not typecheck. Build an array of `{ key, label }` objects where `label` is resolved with a literal key: `t("prefix.foo")`, then render from `label`.

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
- **Radix primitives need Pointer Events polyfills in jsdom.** `Select`, `Slider`, `Popover`, etc. call `target.hasPointerCapture(...)` on click; without `Element.prototype.hasPointerCapture` / `setPointerCapture` / `releasePointerCapture` / `scrollIntoView` stubbed, the trigger throws and the dropdown never opens. The polyfills live in `tests/setup.ts` gated by `if (!Element.prototype.X)`. Leave them in place when adding new Radix-using tests.
- **shadcn `Select` trigger has `role="combobox"` in tests.** Query the trigger with `getByRole("combobox", { name: /label/i })`. Options render in a Radix portal, so look them up with `screen.findByRole("option", { name: /…/i })` (not `within(dialog)`).
- **Same translated string in two places breaks `getByText`.** When two i18n keys resolve to the same copy and both render on screen (e.g. `dashboard.stats.classes` and `sidebar.schoolClasses` both producing "School classes"), `findByText` throws "Found multiple elements". Disambiguate with `getAllByText` + a className / role filter, or rename one of the keys so the rendered labels diverge.
- **Stacked Radix Dialogs count as multiple `role="dialog"` nodes.** When a parent dialog opens a nested Dialog (e.g. the curriculum edit dialog hosting the entry-form dialog), `screen.getAllByRole("dialog")` returns both. To assert the nested dialog closed while the parent stayed open, wait for the invalidation before counting: `await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1))`, then re-query the surviving parent by its heading.
- **sonner 2.x only renders a `<section>` live region on mount.** The `<ol data-sonner-toaster>` attaches once the first `toast.*()` fires. Test mount-only behaviour via `document.querySelector('section[aria-label="Notifications alt+T"]')`, not `[data-sonner-toaster]`.
- **Sub-resource MSW handlers need mutable per-test state.** When a test sequence is POST child, then GET parent detail (expected to include the new child), a static seed does not reflect the POST. Export a mutable `Record<parentId, Array<child>>` from `tests/msw-handlers.ts` (e.g. `stundentafelEntriesByTafelId`) and let the POST / PATCH / DELETE handlers mutate it. Tests reset it in `beforeEach` by iterating `Object.keys` and assigning `[]`.
- **Test utilities live at `frontend/tests/render-helpers.tsx`.** Feature tests import `renderWithProviders` from `../../../tests/render-helpers` (or the equivalent relative path). There is no `@/test-utils/render` alias; snippets that reference one are stale.
- **Component tests that query English labels must pin the locale.** i18next defaults to the user agent's language (jsdom reports `de-DE`), so `getByRole("button", { name: /save/i })` silently misses "Speichern". Add `import i18n from "@/i18n/init"; beforeAll(() => i18n.changeLanguage("en"));` at the top of any test whose assertions rely on English copy. (`@/i18n/config` only exports locale constants, not the i18n instance.)
- **`renderWithProviders` is async; use a local wrapper for sync queries.** The shared helper in `frontend/tests/render-helpers.tsx` wraps the tree in a TanStack Router `RouterProvider`, which mounts asynchronously. Sync `screen.getByRole(...)` immediately after it sees an empty DOM and throws. For components that do not need Router (most pure-UI primitives), use a local `QueryClientProvider` wrapper and `render` directly, mirroring `frontend/src/features/rooms/rooms-dialogs.test.tsx`'s `wrapRoomDialog`. Reach for `renderWithProviders` only when the component under test uses `useNavigate` / `useSearch` / TanStack Router hooks, and even then prefer `findBy*` / `waitFor` over sync queries.
- **`vi.useFakeTimers()` without a `toFake` filter hangs `waitFor` / `findBy*`.** Vitest 4 fakes `setTimeout` too, which RTL's polling relies on, so asserts time out at 5s. When a test needs a deterministic `new Date()` for a component (e.g. the recently-edited tile's relative-time formatter), use `vi.useFakeTimers({ toFake: ["Date"] })` and leave `setTimeout` real.

## UX conventions

- **Toasts via `sonner`.** Use `toast.success` / `toast.info` / `toast.error` from `sonner` for page-level notifications. The wrapper lives at `src/components/ui/sonner.tsx`; the `<Toaster />` is mounted once in `main.tsx` (and in `tests/render-helpers.tsx` so `renderWithProviders` tests can assert toast copy via `findByText`). Keep `form.setError("root", ...)` for in-dialog validation errors; that pattern is unchanged.

## Bundle

- **No `import * as Icons from "lucide-react"`.** Named imports only; the library is tree-shakable per-icon.
- **No dynamic `import()`.** Static imports only; the Router plugin handles route-level code splitting.
