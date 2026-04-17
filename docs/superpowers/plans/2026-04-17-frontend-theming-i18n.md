# Frontend theming, i18n, dark mode, and coverage ratchet — implementation plan

Plan date: 2026-04-17
Spec: [2026-04-17-frontend-theming-i18n-design.md](../specs/2026-04-17-frontend-theming-i18n-design.md)

Commits land in logical chunks (Conventional Commits scopes). Each chunk runs `mise run lint` and the relevant test subset before committing. TDD where a test can drive the behaviour; for configuration-only commits (deps, CI wiring), a passing build is the gate.

## Chunk A — Design tokens + Tailwind wiring

- [ ] Replace `frontend/src/styles/app.css` with the `@import "tailwindcss"; :root { ... } .dark { ... } @theme inline { ... }` structure.
- [ ] Port the light palette from `website/app/globals.css` (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, radius), mapping each to a `var(--...)` reference in `@theme inline`.
- [ ] Port the dark palette (same token set) under `.dark`.
- [ ] Add `color-scheme: light` / `color-scheme: dark` so native scrollbars track the theme.
- [ ] Skip chart-* and sidebar-* tokens (not used yet).
- [ ] Verify: run `mise run fe:build`, open the dev server, confirm colors look identical in light mode.
- [ ] Commit: `style(frontend): port oklch token palette with dark variant`.

## Chunk B — Theme provider + toggle (TDD)

- [ ] `pnpm -C frontend add next-themes`.
- [ ] Test first: `frontend/tests/theme-toggle.test.tsx`. Render `<ThemeProvider><ThemeToggle/></ThemeProvider>`, assert the toggle is rendered, click it, assert `document.documentElement.classList.contains("dark")` flips.
- [ ] Implement `frontend/src/components/theme-provider.tsx` as a thin wrapper around `next-themes` `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`, `storageKey="kz-theme"`.
- [ ] Implement `frontend/src/components/theme-toggle.tsx` with the `mounted` gate pattern (render placeholder before `useEffect` fires, then Sun/Moon icon). Uses shadcn `Button` variant="ghost" size="icon".
- [ ] Wrap `<RouterProvider/>` in `main.tsx` with `<ThemeProvider>`.
- [ ] Add `<ThemeToggle/>` to the app-shell header (top-right, next to logout).
- [ ] Verify: `mise run fe:test` passes, manual toggle in browser works.
- [ ] Commit: `feat(frontend): add dark mode toggle via next-themes`.

## Chunk C — i18n scaffolding (TDD)

- [ ] `pnpm -C frontend add i18next react-i18next i18next-browser-languagedetector`.
- [ ] Create `frontend/src/i18n/config.ts` exporting `locales = ["en","de"] as const`, `defaultLocale = "de"`, and the `Locale` type.
- [ ] Create `frontend/src/i18n/locales/en.json` and `de.json` with the initial key tree (common, nav, auth.login, dashboard, subjects). Start with the literal strings currently in the code for `en.json`; translate to German for `de.json`.
- [ ] Create `frontend/src/i18n/init.ts` that calls `i18next.use(initReactI18next).use(LanguageDetector).init({...})` with resources, fallback `de`, detector order `['localStorage','navigator']`, storageKey `kz-locale`.
- [ ] Create `frontend/src/i18n/types.d.ts` that registers resources for `useTranslation` typing (`declare module "i18next"`).
- [ ] Import `./i18n/init` once from `main.tsx` before the router is created.
- [ ] Test first: `frontend/tests/i18n.test.tsx` renders a trivial component using `useTranslation`, then flips `i18n.language` between `en` and `de` and asserts the rendered string changes.
- [ ] Verify: `mise run fe:test` passes.
- [ ] Commit: `feat(frontend): add i18n scaffolding with en+de locales`.

## Chunk D — Language switcher (TDD)

- [ ] Test first: `frontend/tests/language-switcher.test.tsx`. Render the switcher with `i18n.language = 'de'`, assert the button label is `"EN"`. Click it, assert `i18n.language` becomes `en` and the label flips to `"DE"`.
- [ ] Implement `frontend/src/components/language-switcher.tsx` as a ghost icon button showing the *other* locale's code.
- [ ] Add to app-shell header next to `ThemeToggle`.
- [ ] Commit: `feat(frontend): add language switcher`.

## Chunk E — Translate all visible strings

- [ ] Update the `de.json` and `en.json` catalogs to cover every string in: `app-shell.tsx`, `login.tsx`, `_authed.index.tsx` (dashboard), `subjects-page.tsx` (including dialogs).
- [ ] Replace JSX text nodes and string props with `t("…")` calls in each of those files.
- [ ] Use interpolation for dynamic bits (`t("dashboard.welcomeEmail", { email: me.data.email })`).
- [ ] Replace Zod literal error messages on the login schema with `t("auth.login.errors.invalidEmail")` etc., since those are user-facing (this is a small translation scope, not the deferred full Zod error-map work).
- [ ] Update `frontend/tests/subjects-page.test.tsx` to query by the German button labels (`/neues fach/i`, `/^anlegen$/i`, etc.) since `de` is default.
- [ ] Verify: `mise run fe:test` passes, visual check at `de` and `en`.
- [ ] Commit: `feat(frontend): translate visible strings to en + de`.

## Chunk F — Coverage ratchet

- [ ] `pnpm -C frontend add -D @vitest/coverage-v8`.
- [ ] Update `frontend/vitest.config.ts` with `test.coverage`: provider `v8`, reporter `['text', 'json-summary']`, reportsDirectory `./coverage`, include `['src/**/*.{ts,tsx}']`, exclude generated files (`src/routeTree.gen.ts`, `src/lib/api-types.ts`) and barrels.
- [ ] Add `frontend/coverage/` to `frontend/.gitignore`.
- [ ] Run `mise run fe:test:cov` once to generate the first baseline, then `echo <number> > .coverage-baseline-frontend` at repo root.
- [ ] Add `mise` tasks: `fe:test:cov` and `fe:cov:update-baseline`.
- [ ] Update `.github/workflows/frontend-ci.yml`: replace the plain `mise run fe:test` step with a combined "Vitest + coverage ratchet" step that runs coverage and performs the floor/baseline check exactly like the Python ratchet (with `jq` over `coverage-summary.json`).
- [ ] Verify: `mise run fe:test:cov` produces the summary JSON, CI workflow yaml is valid.
- [ ] Commit: `ci(frontend): add coverage ratchet with 50% floor`.

## Chunk G — Docs + OPEN_THINGS + ADR

- [ ] Add `docs/adr/0008-frontend-theming-i18n-ratchet.md` documenting the three decisions (next-themes in Vite, react-i18next, coverage ratchet pattern parity) and indexing it in `docs/adr/README.md`.
- [ ] Update `docs/architecture/overview.md` if it lists frontend subsystems, adding theming + i18n.
- [ ] Update `README.md` commands table with `fe:test:cov` and `fe:cov:update-baseline` if they're not there.
- [ ] Update `docs/superpowers/OPEN_THINGS.md`: remove the three resolved entries (dark mode toggle, i18n, coverage ratchet parity). Add a follow-up: "Translate Zod validation errors beyond login".
- [ ] Run `claude-md-management:revise-claude-md` to capture project learnings (e.g. "use `mise run fe:cov:update-baseline` to rebaseline before raising the floor").
- [ ] Run `claude-md-management:claude-md-improver` right after.
- [ ] Commit: `docs: record theming/i18n decisions + update open_things`.

## Chunk H — Push + PR + CI loop

- [ ] `mise exec -- git push -u origin feat/frontend-theming-i18n`.
- [ ] `gh pr create --base master --head feat/frontend-theming-i18n --title "feat(frontend): theming, i18n, dark mode, coverage ratchet" --body "<structured body>"`.
- [ ] Post brainstorm Q&A from `/tmp/kz-brainstorm/brainstorm.md` as PR comments (one per `## Q` block).
- [ ] Poll `gh pr checks <pr>` until green. Fix any failures (likely: coverage reporter format mismatch, missing `jq` in CI — the setup-mise action has `jq` preinstalled on ubuntu-latest).
- [ ] Stop on green. Do not merge.

## Verification sequence (run before each commit in its chunk)

1. `mise run lint`
2. `mise run fe:test` (Chunks B–E) or `mise run fe:test:cov` (Chunk F)
3. Manual browser check where UI changed (Chunks A, B, D, E)

## Risks / watch-outs during implementation

- **next-themes's `mounted` pattern** avoids hydration mismatch on first render; don't skip it, the unit test catches the icon-flicker state.
- **`useTranslation` inside event handlers**: use the hook's returned `t`, don't destructure a stale reference. The switcher test covers this.
- **v8 coverage `include` / `exclude`**: generated files must be excluded or the baseline will be wildly different from source coverage.
- **CI step replacement**: make sure the new coverage step subsumes the old `fe:test` step (both run vitest) so we don't run tests twice.
- **`jq` in CI**: standard on `ubuntu-latest`. If the runner changes, add `sudo apt-get install -y jq` first.
