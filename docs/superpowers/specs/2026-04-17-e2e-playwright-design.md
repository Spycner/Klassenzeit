# End-to-End Testing with Playwright

**Status:** Draft, ready for plan phase.
**Date:** 2026-04-17.
**Owner:** pgoell.

## Goal

Add a third test tier, browser-driven end-to-end tests with Playwright, that validates the real frontend against the real backend and a real Postgres instance. The existing tiers (Vitest+MSW component tests, pytest integration tests) stay unchanged.

Starting scope is smoke-only: one authentication setup flow and one entity CRUD flow (Subjects). Subsequent entity specs will each add their own Playwright flow as that entity lands in the UI.

## Non-goals

These are explicitly deferred and will be tracked in `docs/superpowers/OPEN_THINGS.md` under a new "Testing (E2E)" subsection:

- Playwright flows for Rooms, Teachers, WeekSchemes, Stundentafeln, SchoolClasses, Lessons. Each entity's own CRUD spec will add its flow.
- Cross-browser matrix beyond Chromium (Firefox, WebKit).
- Visual regression tooling (Percy, Chromatic, Playwright snapshots).
- Accessibility audits inside Playwright flows (`@axe-core/playwright`).
- Performance assertions derived from Playwright traces.
- Mobile viewport emulation.
- Parallel-worker test DB isolation. The initial scheme runs Playwright single-worker and truncates one shared DB between tests.
- A test-only reset endpoint for pytest. Backend integration tests keep using savepoint rollback.
- Frontend coverage ratchet contribution from Playwright. Browser flows are a separate signal.
- Nightly extended Playwright suite.

## Design

### Test tiers

| Tier | What it covers | Driver | Speed |
|------|----------------|--------|-------|
| Unit / component (existing) | Rendering, form validation, hook behavior | Vitest + jsdom + MSW | Fast |
| Integration (existing) | Routes, DB queries, auth middleware | Pytest + real Postgres + ASGI | Medium |
| E2E (new) | Real browser, real SPA, real API, real DB | Playwright + Chromium | Slow |

### Starting scope

- One authentication setup test (logs in via the real UI, saves `storageState`).
- One Subjects CRUD flow: create a subject, assert it appears in the list, edit it, delete it.
- Chromium only.

### Directory layout

```
frontend/
  e2e/
    playwright.config.ts      # webServer entries, storageState setup, baseURL
    .auth/                    # gitignored, holds storageState JSON after setup
    fixtures/
      test.ts                 # extended Playwright `test` with auto-reset fixture
      admin.setup.ts          # logs in once via real UI, saves storageState
    flows/
      smoke.spec.ts
      subjects.spec.ts
    support/
      urls.ts
```

### Tooling and packages

Added via pnpm:

- `@playwright/test`, dev dependency.
- `playwright`, dev dependency.

Installed via `pnpm exec playwright install chromium` (cached in CI).

### Mise tasks

- `mise run e2e`: full run. Starts DB if not up, applies migrations with `KZ_ENV=test`, seeds admin, delegates to Playwright's `webServer` for backend + frontend boot, runs the suite.
- `mise run e2e:ui`: same, with Playwright's `--ui` inspector for local authoring.
- `mise run e2e:install`: one-time browser install.
- `mise run fe:preview`: new task that runs `vite preview` for the built SPA. The Playwright webServer uses this rather than `fe:dev`, so CI exercises the production build path.

### Playwright config highlights

`frontend/e2e/playwright.config.ts`:

- Two `webServer` entries: one for the backend (`mise run dev` listening on `:8000`), one for the SPA (`mise run fe:build && mise run fe:preview`, listening on `:4173`). Both are waited on via URL.
- `baseURL: 'http://localhost:4173'`.
- `use.storageState: 'frontend/e2e/.auth/admin.json'` globally, overridable per-test for login-specific tests.
- `reuseExistingServer: !process.env.CI`, so local reruns skip startup.
- `forbidOnly: !!process.env.CI`.
- `retries: process.env.CI ? 2 : 0`.
- `reporter: [['list'], ['html', { outputFolder: 'frontend/playwright-report' }]]`.
- Single worker (`workers: 1`) while the DB is shared.

### Gitignores

- `frontend/e2e/.auth/`
- `frontend/playwright-report/`
- `frontend/test-results/`

### Backend test-only surface

A new router, `klassenzeit_backend.testing.router`, is mounted on `app` only when `settings.env == "test"`. The router module raises `RuntimeError` on import-with-mount if env mismatches, preventing a misconfigured prod from silently exposing it.

Endpoints:

- `POST /__test__/reset`: truncates all application tables in a single transaction (`TRUNCATE ... RESTART IDENTITY CASCADE`) and re-seeds a fixed admin user. Returns 204.
- `GET /__test__/health`: trivial readiness probe used by the Playwright webServer.

Fixed admin seed credentials, `.env.test`-only:

- Email: `admin@test.local`
- Password: `test-password`

Why these endpoints rather than reusing `mise run db:reset` plus `auth:create-admin`:

- `db:reset` destroys the container volume (restart is slow, on the order of 10s between tests).
- `TRUNCATE ... CASCADE` against the live connection is sub-millisecond.
- Lifecycle control stays inside the HTTP process the tests already talk to.

### Settings change

`backend/src/klassenzeit_backend/core/settings.py` gains:

```python
env: Literal["dev", "test", "prod"] = "dev"
```

- `.env.test` sets `KZ_ENV=test`.
- `.env` and prod env do not set `KZ_ENV`, defaulting to `"dev"` locally and being set explicitly by deploy configs in prod.
- CI sets `KZ_ENV=test` only for the e2e job.

### Safety rails for test-only router

- Import-time guard: `if settings.env != "test": raise RuntimeError(...)`.
- New backend test `backend/tests/testing/test_router_gating.py` asserts `/__test__/reset` returns 404 when `KZ_ENV` is `"dev"` or unset.
- CI jobs other than `e2e` run with `KZ_ENV` unset.

### Playwright fixtures

`frontend/e2e/fixtures/test.ts` extends Playwright's base `test`:

```ts
export const test = base.extend<{ reset: void }>({
  reset: [async ({ request }, use) => {
    await request.post("/__test__/reset");
    await use();
  }, { auto: true }],
});
```

`auto: true` plus the configured `baseURL` means every test starts with a clean DB without opting in. All flow tests import `test` from this module rather than `@playwright/test` directly.

### Authentication setup

`frontend/e2e/fixtures/admin.setup.ts` runs as a Playwright dependency project:

1. Navigates to `/login`.
2. Fills the real form with `admin@test.local` / `test-password`.
3. Submits, waits for the dashboard route.
4. Saves storage state to `frontend/e2e/.auth/admin.json`.

Other Playwright projects list `admin-setup` as a dependency so the state is guaranteed to exist before any other test runs.

The login flow itself stays covered by this single setup test, plus any explicit login/logout tests that override `storageState`.

### Locator conventions

- Prefer `getByRole`, `getByLabel`, `getByText` against i18n-rendered text.
- Tests force the English locale on navigation (query parameter or `localStorage` seeded in the setup).
- `data-testid` is a last resort, used only when role-based locators cannot disambiguate (e.g., list rows).
- No CSS selector strings in assertions.

### Per-test structure

- One `test.describe` per page or flow.
- Each test is self-contained: arrange via UI actions, assert on visible DOM.
- Cleanup comes from the auto `reset` fixture, not from explicit teardown code.

### Artifacts

- Screenshot on failure only: `use: { screenshot: 'only-on-failure' }`.
- Trace retained on failure: `use: { trace: 'retain-on-failure' }`.
- HTML report and `test-results/` uploaded as CI artifacts on failure.

### CI wiring

A new `e2e` job is added to `.github/workflows/frontend-ci.yml`, gated by `dorny/paths-filter@v3` on:

- `frontend/**`
- `backend/**`
- `compose.yaml`
- `.github/workflows/frontend-ci.yml` (workflow self-changes always rerun)

Job steps, in order:

1. Checkout, mise setup (same as the existing frontend job).
2. Start Postgres. Preferred path: `podman compose up -d db`. Fallback path, decided at implementation time based on Actions runner support: a GitHub Actions `services.postgres` entry.
3. `KZ_ENV=test mise run db:migrate`.
4. Seed admin. Either a new `auth:seed-e2e-admin` mise task with fixed credentials, or a `--non-interactive` flag added to `auth:create-admin`. Chosen at implementation time.
5. `pnpm -C frontend exec playwright install --with-deps chromium`, with `~/.cache/ms-playwright` cached via `actions/cache`.
6. `mise run e2e`. Playwright's webServer boots backend and `vite preview`, then runs the suite.
7. On failure, upload `frontend/playwright-report/` and `frontend/test-results/` as artifacts.

Target wall-clock: under 3 minutes at starting scope, spin-up dominating.

### Branch protection

The `e2e` job becomes a required check. Because of path filtering, PRs that do not touch `frontend/`, `backend/`, or `compose.yaml` see the job as skipped. To keep branch protection satisfied on skipped runs, an `e2e-gate` aggregator job with `if: always()` reports success when the filtered job is skipped or succeeds, and reports failure otherwise. The aggregator is the required check, not `e2e` itself.

## Open questions (to resolve during implementation)

- Postgres source in CI: `podman compose up -d db` vs GitHub Actions `services.postgres`. Decide once we see how the runner handles podman.
- Admin seeding mechanism: extend `auth:create-admin` with a non-interactive flag, or add a dedicated `auth:seed-e2e-admin` mise task. Either is fine; pick the smaller diff.
- Mechanism for locking Playwright to English during tests: query parameter, `localStorage` set in setup, or cookie. Pick whichever matches the existing i18n init path with the least intrusion.

## Risks

- If the `KZ_ENV=test` gate slips (e.g., a future refactor makes the router always mount), `/__test__/reset` becomes a live wipe button in prod. Mitigation: the import-time runtime guard plus the backend gating test.
- `vite preview` differs from `fe:dev` in SPA fallback handling and port. Pin both explicitly in the Playwright config so silent behavior drift does not bite.
- Playwright's webServer boot ordering is fiddly. Early tests can flake if the frontend proxies to a backend that is not yet ready. `GET /__test__/health` plus `webServer.url` waits close this window.

## Success criteria

- `mise run e2e` passes locally on a clean checkout.
- The `e2e` job passes in CI on PRs that touch frontend or backend.
- A deliberate regression in the Subjects create flow (e.g., breaking the submit handler) is caught by the Playwright suite.
- `KZ_ENV` unset or `"dev"` returns 404 for `/__test__/reset` (asserted by backend test).
- Coverage ratchet and all existing tiers remain green.

## Follow-ups to file in OPEN_THINGS.md

New "Testing (E2E)" subsection:

- Playwright flows for remaining entities, added per entity as each lands.
- Cross-browser matrix (Firefox, WebKit) when external users appear.
- `@axe-core/playwright` accessibility audits.
- Visual regression tooling.
- Parallel-worker DB isolation (per-worker schemas) once CI time matters.
- Nightly extended run with broader or slower flows.
