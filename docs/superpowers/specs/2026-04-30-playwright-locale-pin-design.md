# Pin Playwright locale to en-US

**Date:** 2026-04-30
**Status:** Design approved (autopilot autonomous mode).

## Context

`frontend/e2e/playwright.config.ts` configures the Chromium project under
`projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], storageState }}]`
and the parent `use` block sets `baseURL`, `screenshot`, and `trace` only. Nothing in
the config sets `locale`, so the Chromium context inherits whichever locale the host
system reports.

The frontend wires `i18next-browser-languagedetector`
(`frontend/src/i18n/init.ts:8-25`) with `order: ["localStorage", "navigator"]` and
`fallbackLng: defaultLocale` where `defaultLocale = "de"`
(`frontend/src/i18n/config.ts:3`). On a fresh browser context with no `kz-locale` in
localStorage, detection therefore falls through to `navigator.language`.

The Playwright specs assert English copy throughout: `admin.setup.ts:17` waits for the
`/welcome back/i` heading; `grundschule-smoke.spec.ts:23,30,34,37,52` clicks "School
classes", "Generate lessons", "Generate", and asserts on "lessons created" and
"Generate schedule". The tests pass today because GitHub-hosted ubuntu-latest launches
Chromium with `navigator.language === "en-US"`, so detection picks `en` and the
catalog serves English copy.

## Problem

The English assertions only work as long as Chromium's reported locale starts with
`en`. A contributor running `mise run e2e` on a German Linux box (a plausible
demographic for a Hessen-Grundschule project) gets `navigator.language === "de-DE"`,
which i18next resolves to `de`, the dashboard renders "Willkommen zurück.", and the
admin-setup `getByRole("heading", { name: /welcome back/i }).waitFor()` hangs to its
60s timeout. The test suite is implicitly coupled to the host system's locale.

OPEN_THINGS Task 1 (Tidy phase) of the active Realer Schulalltag sprint:

> **Pin Playwright locale explicitly.** `[P1]` Carried over from DX/CI sprint. Add
> `locale: "en-US"` to `use` in `frontend/playwright.config.ts` so tests do not rely on
> Chromium's default locale and i18n's English fallback.

That bullet is the entire scope of this PR.

## Goal

One commit, one new key in the top-level `use` block of
`frontend/e2e/playwright.config.ts`:

```ts
use: {
  baseURL: FRONTEND_URL,
  locale: "en-US",
  screenshot: "only-on-failure",
  trace: "retain-on-failure",
},
```

After this PR: every Playwright run, on every host, gets `navigator.language ===
"en-US"`, i18next detects `en`, and the English assertions are deterministic.

## Non-goals

- **Flipping `defaultLocale = "de"` to `"en"`.** Product decision for the demo
  audience; out of scope. The fix aligns Chromium with the test authors' assumption,
  not the other way around.
- **Pinning `timezoneId`, `geolocation`, `permissions`, or `colorScheme`.** No spec
  asserts on time-of-day, geolocation, or system theme. Broader context determinism is
  a separate item if it ever surfaces.
- **A new test that asserts `navigator.language === "en-US"`.** Tautological: the
  existing English-copy assertions are the cross-cutting check.
- **A path-shape rename of `playwright.config.ts`.** The OPEN_THINGS bullet says
  `frontend/playwright.config.ts` for brevity, but the actual file lives at
  `frontend/e2e/playwright.config.ts`. Don't move it.

## Architecture

One key, one file. No new modules, no new abstractions.

## File changes

- `frontend/e2e/playwright.config.ts` (+1 line in the `use` block).
- `docs/superpowers/specs/2026-04-30-playwright-locale-pin-design.md` (this file).
- `docs/superpowers/plans/2026-04-30-playwright-locale-pin.md` (the plan).
- `docs/superpowers/OPEN_THINGS.md` (move Tidy-1 entry from "Tidy phase" → completed,
  same shape as the drift-check entry that closed last PR).

## Commit shape

One commit:

- `test(e2e): pin Playwright locale to en-US` — the config change. Body cites
  OPEN_THINGS Task 1 of the Realer Schulalltag sprint and the latent-bug rationale.

The OPEN_THINGS update lands in the same PR as a follow-up commit
(`docs: close playwright-locale-pin tidy-2 from realer-schulalltag sprint`), matching
the multi-commit pattern used by the recent drift-check PR.

The brainstorm, spec, and plan files each get their own `docs:` commit per autopilot's
standard sequencing.

## Test plan

- Local: `mise run e2e` in the worktree. Both projects (`admin-setup` and `chromium`)
  run; the admin-setup "Welcome back" wait passes against an `en-US`-launched Chromium
  even on a host whose default would otherwise be `de-DE`. No new test added.
- CI: existing `e2e` job in `.github/workflows/ci.yml` runs the suite on PR. Existing
  green is the cross-runner regression check.

## Risks

- **`devices["Desktop Chrome"]` overrides locale.** The Playwright `Desktop Chrome`
  device descriptor does not set `locale` (only `viewport`, `userAgent`, `deviceScaleFactor`,
  `isMobile`, `hasTouch`, `defaultBrowserType`). The top-level `use.locale` therefore
  wins. Verified by inspection of the descriptor source; no code change needed.
- **`page.goto` cached resources from a previous-locale run.** Playwright opens a fresh
  browser context per worker; storage state is replayed from `admin.json` which contains
  cookies but no `kz-locale` localStorage entry. Detection chain falls through to
  navigator on the first page load. Safe.
- **CI runner default already `en-US`.** Setting it explicitly is a no-op on CI; the
  tests will still pass.

## Acceptance criteria

- `frontend/e2e/playwright.config.ts` has `locale: "en-US"` in its top-level `use`
  block.
- `mise run e2e` passes locally and in CI.
- OPEN_THINGS Tidy-1 entry moves to the completed-sprints section (or the in-sprint
  entry is checked off, mirroring the drift-check shape).
- Auto-memory `project_roadmap_status.md` updated to mark Tidy-2 done.
