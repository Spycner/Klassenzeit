# 0008 — Frontend theming, i18n, and coverage ratchet

- **Status:** Accepted
- **Date:** 2026-04-17

## Context

`docs/superpowers/OPEN_THINGS.md` tracked three frontend gaps: no dark mode toggle, no German localization despite targeting German schools, and no coverage ratchet analogous to the Python side. The author's personal website project (`/home/pascal/Code/website`) solves all three with a Next.js stack (`next-themes`, `next-intl`, oklch design tokens). We needed equivalent behaviour in a Vite + React SPA.

## Decision

1. **Theme tokens.** Port the oklch palette as two CSS variable blocks (`:root` and `.dark`) referenced by `@theme inline` so Tailwind v4 picks up the values. `next-themes` swaps the `.dark` class on `<html>`.
2. **i18n.** Use `react-i18next` with `i18next-browser-languagedetector`. English and German message catalogs ship as statically imported JSON at `frontend/src/i18n/locales/`. Default locale is `de`. Language preference is persisted in `localStorage` under `kz-locale`.
3. **Coverage ratchet.** Mirror the Python pattern. `.coverage-baseline-frontend` sits at repo root alongside `.coverage-baseline`. `mise run fe:test:cov` produces a vitest v8 summary JSON, and a CI step parses `total.lines.pct` with `node -e` (no jq dependency), enforcing both an absolute 50% floor and the baseline ratchet.

## Alternatives considered

- **Hand-rolled theme provider.** Rejected; `next-themes` is tiny, framework-agnostic despite its name, matches the website exactly, and handles storage + system preference.
- **`next-intl`.** Rejected; hard requires Next server components.
- **`@lingui`.** Rejected; smaller community and heavier tooling for a project this size.
- **URL-prefixed locales (`/de/...`).** Rejected; balloons the TanStack Router tree for no SEO/SSR benefit in a post-login SPA.
- **`vitest --coverage` static thresholds instead of a ratchet.** Rejected; thresholds don't ratchet upward with coverage gains.
- **`jq` to parse the coverage JSON in CI.** Rejected in favour of `node -e` so the ratchet works identically locally (where `jq` may not be installed) and in CI.

## Consequences

- New strings added to the UI must land a key in both `en.json` and `de.json`. Drift is caught at review time, not by a lint rule (deferred).
- Translations for Zod validation errors are partial (login only); full coverage is a follow-up tracked in OPEN_THINGS.
- Frontend coverage can now only increase. Intentional drops require `mise run fe:cov:update-baseline` and a committed change to `.coverage-baseline-frontend`.
- The 50% floor is low by design, matching today's single test file. Revisit once baseline clears 70% organically.
- The `storageKey="kz-theme"` and i18n key `kz-locale` prevent collisions with other apps sharing `localhost` during local development.
