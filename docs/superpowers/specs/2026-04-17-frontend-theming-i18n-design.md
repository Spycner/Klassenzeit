# Frontend theming, i18n, dark mode, and coverage ratchet

Spec date: 2026-04-17
Status: accepted
Owner: pgoell

## Motivation

`docs/superpowers/OPEN_THINGS.md` tracks three frontend gaps:

1. **Dark mode toggle.** The shadcn/ui tokens in `frontend/src/styles/app.css` are light-only. Users who prefer dark systems get a bright interface.
2. **German localization.** Klassenzeit targets German schools, but every string in the UI is English.
3. **Coverage ratchet parity.** The backend enforces a coverage floor plus a baseline ratchet. The frontend has neither, so coverage can silently decay.

The author's personal website (`/home/pascal/Code/website`) already solves all three: an oklch-based token palette with a `.dark` variant, `next-themes` + a `ThemeToggle`, and `next-intl` with per-locale JSON messages. This spec ports the *ideas* to Klassenzeit's stack (Vite + React SPA, no Next).

## Scope

In-scope:

- Port the light and dark oklch token palette from `website/app/globals.css` into `frontend/src/styles/app.css`, wired through `@theme inline` so Tailwind utilities pick up the vars.
- Add a `ThemeProvider` (via `next-themes`, which is framework-agnostic despite the name) and a `ThemeToggle` button in the app-shell header.
- Add `react-i18next` with `en` and `de` message catalogs, default language `de`, language detected from `localStorage` then `navigator.language`. Include a `LanguageSwitcher` in the header.
- Translate every user-visible string in the current UI (app-shell nav, dashboard, login, subjects list/form/delete dialog).
- Add a frontend coverage ratchet mirroring the Python pattern: `.coverage-baseline-frontend` at repo root, absolute floor of 50%, enforced by `.github/workflows/frontend-ci.yml`.
- Add `mise` tasks: `fe:test:cov` (runs `vitest --coverage`) and `fe:cov:update-baseline`.
- Update the existing `subjects-page.test.tsx` to use translated button labels so it keeps passing.

Out of scope:

- URL-prefixed locales.
- Translating Zod validation error messages (tracked in OPEN_THINGS).
- Chart or sidebar color tokens (no component uses them yet).
- Lint rule to flag untranslated JSX strings.
- Production deployment color-scheme meta tag; covered under the production deployment OPEN_THING.

## Design

### 1. Design tokens

Replace the current `@theme` static block in `frontend/src/styles/app.css` with two parts:

```css
@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  /* ...full palette, see website/app/globals.css... */
  --radius: 0.625rem;
  color-scheme: light;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ...full palette... */
  color-scheme: dark;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ...one line per token... */
  --radius: var(--radius);
}
```

Tokens ported: `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`, `radius`. Chart and sidebar tokens are deferred.

`color-scheme` is set per variant so the browser's native scrollbar matches.

### 2. Dark-mode toggle

Install `next-themes`. In `frontend/src/main.tsx`, wrap the app in:

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="kz-theme">
  ...
</ThemeProvider>
```

The `storageKey` scopes the preference to Klassenzeit so it doesn't collide with the personal website on the same domain in dev.

A `ThemeToggle` component in `frontend/src/components/theme-toggle.tsx` renders a ghost button with a `Sun` or `Moon` lucide icon. Uses the website's `mounted` gate to avoid first-paint icon flicker.

`useTheme().setTheme(...)` is called with `"dark"` or `"light"`. System theme isn't directly selectable from the toggle (a toggle expresses a binary user choice); the system default is only used until the user picks one.

### 3. Internationalization

Install `i18next`, `react-i18next`, and `i18next-browser-languagedetector`.

```
frontend/src/i18n/
  config.ts          # locale list, default locale, type
  init.ts            # i18n.init(...) with resources + detector
  locales/
    en.json
    de.json
  types.d.ts         # resources typing for t() autocomplete
```

`init.ts` is imported once from `main.tsx` (top-level side effect, like the CSS import). Resources are statically imported (no dynamic import, per CLAUDE.md).

Detector order: `['localStorage', 'navigator']`. Storage key: `kz-locale`. Supported locales: `['en', 'de']`. Fallback: `de`.

`LanguageSwitcher` component (`frontend/src/components/language-switcher.tsx`) renders a ghost button with the other language's code (e.g. `"EN"` when current is `de`). Clicking calls `i18n.changeLanguage(next)`.

### 4. Translation coverage

Every JSX string literal in user-visible components is replaced with `t("namespace.key")`. Keys are organized by feature:

```json
{
  "common": { "loading": "...", "error": "...", "cancel": "..." },
  "nav": { "dashboard": "...", "subjects": "..." },
  "auth": { "login": { "title": "...", "email": "...", "password": "...", "submit": "..." } },
  "dashboard": { "title": "...", "welcome": "Welcome, {{email}}." },
  "subjects": { "title": "...", "new": "...", "columns": { "name": "...", "shortName": "..." }, "actions": { "edit": "...", "delete": "..." }, "empty": "...", "dialog": { ... } }
}
```

ICU-style `{{email}}` interpolation (react-i18next's default) for dynamic parts.

The MSW-backed test suite references the Subject's name (`"Mathematik"`) which is data, not UI copy; that stays. Button labels in the test (`/new subject/i`, `/^create$/i`) become the `de` default values (`/neues fach/i`, `/^anlegen$/i`).

### 5. Coverage ratchet

Install `@vitest/coverage-v8`. Update `frontend/vitest.config.ts` with a `coverage` block: provider `v8`, reporter `["text", "json-summary"]`, include `["src/**/*.{ts,tsx}"]`, exclude generated files and tests.

A new script `scripts/check_frontend_coverage.sh` (or a task directly in `mise.toml`) reads `frontend/coverage/coverage-summary.json`, extracts `total.lines.pct`, compares against `.coverage-baseline-frontend` and the `50` floor.

Mise tasks:

```toml
[tasks."fe:test:cov"]
description = "Run frontend tests with coverage"
dir = "frontend"
run = "pnpm exec vitest run --coverage"

[tasks."fe:cov:update-baseline"]
description = "Update frontend coverage baseline"
run = """
mise run fe:test:cov
jq -r '.total.lines.pct | floor' frontend/coverage/coverage-summary.json > .coverage-baseline-frontend
echo "Frontend baseline updated to $(cat .coverage-baseline-frontend)%"
"""
```

`.github/workflows/frontend-ci.yml` adds a step after the existing Vitest step:

```yaml
- name: Vitest + coverage ratchet
  run: |
    mise run fe:test:cov
    ACTUAL=$(jq -r '.total.lines.pct | floor' frontend/coverage/coverage-summary.json)
    BASELINE=$(cat .coverage-baseline-frontend)
    echo "Frontend coverage: ${ACTUAL}% (baseline: ${BASELINE}%, floor: 50%)"
    if [ "$ACTUAL" -lt 50 ]; then
      echo "::error::Frontend coverage ${ACTUAL}% is below the floor of 50%"
      exit 1
    fi
    if [ "$ACTUAL" -lt "$BASELINE" ]; then
      echo "::error::Frontend coverage ${ACTUAL}% is below baseline ${BASELINE}%. Run 'mise run fe:cov:update-baseline' if intentional."
      exit 1
    fi
```

(The existing `- name: Vitest` step is replaced by this one so we don't run tests twice.)

Coverage output directory `frontend/coverage/` goes into `frontend/.gitignore`.

## Acceptance criteria

1. Starting `mise run fe:dev` and toggling the theme switches the interface to dark and persists across reloads.
2. Navigating to any page in the app with `localStorage['kz-locale'] = 'de'` shows German copy; switching to `en` via the switcher flips the whole UI.
3. A user whose `navigator.language` is `de-DE` sees German on first visit without touching the switcher.
4. `mise run fe:test:cov` produces `frontend/coverage/coverage-summary.json`.
5. `mise run lint`, `mise run test`, and `mise run fe:test:cov` all succeed locally.
6. The Frontend CI job fails if `coverage-summary.json` `total.lines.pct` drops below `.coverage-baseline-frontend` or `50`.
7. `grep -R '>[A-Za-z][^<{]*<' frontend/src/` returns only translation keys or dynamic values, no literal English user-visible copy (verified by spot-check, not an automated test).

## Risks and mitigations

- **next-themes in a non-Next app.** The library does what we need, but support conversations online focus on Next. Mitigation: copy the website's pattern verbatim, it's known to work there in a very similar stack.
- **v8 coverage under-reports in some TS setups.** Vitest transforms TS to ESM without tsc's emit, which is the path v8 coverage handles well. If numbers look wrong during impl, swap to `@vitest/coverage-istanbul`.
- **Language switcher needs re-render on change.** react-i18next's `useTranslation()` subscribes to language changes, so any component using `t()` re-renders automatically. Components that compute strings in event handlers should read `t()` inside render, not from a ref.
- **Existing subjects test breaks.** Test buttons are queried by German regex after this change. Updating the test fixtures is part of the scope, not a regression.

## Rollback plan

All changes land behind feature additions, not behind feature flags. To revert: remove the three new dependencies, drop `.coverage-baseline-frontend`, restore `frontend/src/styles/app.css` to the current form, remove the new components and `i18n/` tree, put English strings back inline. The revert PR would be mechanical (`git revert <merge-sha>`).
