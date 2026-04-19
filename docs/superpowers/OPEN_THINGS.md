# Open Things

Running log of items deferred or noted as tech debt during spec/plan work. Each entry points back to the spec that introduced it. Within each section, items are ordered by importance.

Items trace back to the specs that introduced them: the [project scaffolding design](specs/2026-04-11-project-scaffolding-design.md), the [frontend theming / i18n / ratchet design](specs/2026-04-17-frontend-theming-i18n-design.md), and the [entity CRUD pages batch 1 design](specs/2026-04-17-frontend-entity-crud-pages-design.md).

## Product capabilities (blocks user-facing functionality)

Ordered roughly in the sequence they need to land: data first, then access control, then the product surface, then the UI on top, then the path to production.

- **Remaining entity CRUD pages.** Subjects, Rooms, Teachers, and WeekSchemes have UI pages. Stundentafel, SchoolClass, and Lesson still need UI pages; SchoolClass and Lesson want FK dropdowns, and Stundentafel wants a nested-row editor, so each deserves its own spec.
- **Sub-resource editors for base entities.** Room availability and suitability, Teacher availability and qualifications, WeekScheme time blocks, and Stundentafel entries all need their own UI. Treat them as one variant of "manage related rows" and do them in a single spec rather than one spec per entity.
- **Typed deletion errors for in-use entities.** Deleting a Room or Teacher that a Lesson references surfaces the backend 409 as a generic `ApiError` toast. A typed 409 handler, or a pre-flight "is-used" check before opening the delete dialog, should land as one cross-entity pass rather than per-entity duplication.
- **Translate Zod validation errors beyond login.** `LoginSchema` reads message keys via `i18n.t()` at module load (so the text is whatever language was detected on first load and does not update on locale switch). Subjects, Rooms, Teachers, and WeekSchemes schemas all ship with raw English literals. Ship a translated Zod global error map once a second non-login form surfaces them.
- **Raise the frontend coverage floor.** Ratchet currently floors at 50% with baseline 61%. Bump the floor to 70% once baseline clears 75% organically, then 80% to match Python.
- **Parallel `mise run dev` for backend + frontend.** Currently needs two terminals. A `concurrently`-style task or a `mise run dev:all` task would be convenient.
- **Frontend `/api` prefix + CORS.** Vite proxy currently lists backend prefixes explicitly. When the backend adopts a uniform `/api` prefix, the proxy collapses to a single rule and CORS-for-dev becomes unnecessary.
- **Chart and sidebar tokens.** Deferred from the theming spec until a component actually needs them.
- **Untranslated-string lint rule.** Review discipline is the only line of defence against hardcoded English or German sneaking into JSX. Add a Biome plugin or parallel ESLint rule if violations happen in practice.
- **Production deployment.** Docker, reverse proxy, secrets management.
- **Repository / unit-of-work layer.** Routes currently take
  `AsyncSession` directly. A repository layer earns its place only
  once queries get duplicated across endpoints. Add when it hurts.
- **Data migrations / seed data framework.** Schema migrations only
  for now. Add when there's real data to seed.
- **MFA / TOTP / passkeys.** Not needed for current threat model. Add if user base or sensitivity grows.
- **Email-based password reset.** Requires email sending infrastructure. Add when email is needed for other features.
- **OAuth / OIDC / social login.** Not needed for closed system.
- **Self-service registration.** Not needed for closed system.
- **Bulk import/export.** CSV or JSON import for teachers, rooms, subjects. Useful but not needed for MVP.
- **Stundentafel cloning.** Copy a Stundentafel to create a variant. Convenience feature, defer.
- **Cross-entity validation.** E.g., lesson's teacher must be qualified for the lesson's subject. Currently not enforced at API level — solver catches it.

## CI / repo automation

- **Branch and repo settings need a wrapper script.** `docs/superpowers/branch-protection.json` covers branch-scoped settings; `docs/superpowers/repo-settings.json` covers repo-scoped settings (merge strategies, delete-on-merge, squash commit formatting). They must be applied in the correct order on a fresh repo — the repo-settings PATCH must run first so `allow_squash_merge: true` / `allow_merge_commit: false` are in place before the branch-protection PUT with `required_linear_history: true`, which otherwise fails with HTTP 422. Currently you'd run two `gh api` commands by hand in order. Fold them into a wrapper script (`scripts/apply-github-settings.sh` or similar) so the order is encoded once.
- **PR-title type list duplicates `CONTRIBUTING.md`.** `.github/workflows/pr-title.yml` carries its own copy of the conventional-commit type list. If `CONTRIBUTING.md` adds a type, the workflow must update too. Single source of truth needed (e.g. generate the workflow from a templated config).
- **Auto-issue creation on weekly audit failure.** The `audit.yml` cron run is informational only — failures show up in the Actions tab but nothing pages anyone. Standard pattern uses `JasonEtco/create-an-issue@v2` with a templated body. Wire this in once the audit produces enough signal to be worth the noise.
- **Dependabot for the Python/uv ecosystem.** Dependabot doesn't natively understand `uv.lock` as of mid-2025; the `pip` adapter desyncs the lockfile and violates the `uv add`-only rule. Revisit when dependabot ships first-class uv support, or switch to Renovate (which already supports uv).

## Testing

- **Session-scoped event loop may cause timing interference at scale.** The `asyncio_default_fixture_loop_scope = "session"` setting (introduced for the Chunk G DB fixtures) means all async tests and fixtures share a single event loop for the entire pytest session. This prevents asyncpg "Future attached to a different loop" errors with session-scoped fixtures but means one slow or stalled async test can delay all subsequent tests in the session. Not a problem with the current 16-test suite, but worth revisiting if the test suite grows large or if tests with long async timeouts are added.

### E2E (Playwright)

- **Entity coverage beyond Subjects.** Each remaining entity CRUD spec (Rooms, Teachers, WeekSchemes, Stundentafel, SchoolClass, Lesson) should add its own Playwright flow when it lands.
- **Cross-browser matrix.** Firefox and WebKit are disabled for now (Chromium only). Enable when external users appear.
- **Accessibility audits inside Playwright.** `@axe-core/playwright` integration is deferred; track separately.
- **Visual regression.** Percy / Chromatic / Playwright snapshot tooling. Defer until design churn slows.
- **Parallel workers + per-worker DBs.** Currently Playwright runs single-worker against a shared DB. Move to per-worker schemas once CI time matters.
- **Session cleanup in `/__test__/reset`.** The reset endpoint preserves the `sessions` table so storageState stays valid; revisit if tests start needing clean session state.
- **Nightly extended run.** Slower flows, broader data scenarios. Add when the suite is large enough to justify tiering.
- **Test-only router hardening.** Currently gated by `settings.env == "test"`; an additional network-level guard (e.g., bind `/__test__` to localhost only) is possible if the surface grows.
- **Integration test for conditional mount.** `include_testing_router_if_enabled` has unit tests but no integration test that actually imports `main` with `KZ_ENV=dev` and asserts `/__test__/*` returns 404. Add if a future refactor risks breaking the wiring silently.
- **Shell-exported `KZ_ENV=dev` defeats pytest router mounting.** The `os.environ.setdefault` in conftest no-ops if the shell already has `KZ_ENV` set. A shell-exported `KZ_ENV=dev` would silently skip mounting the testing router, and router tests would fail with 404. Add a warning in conftest or switch to `pytest-env` if this bites anyone.
- **Direct navigation to `/subjects` (or other `API_PREFIXES` paths) collides with the Vite preview proxy.** E2E tests can't `page.goto(URLS.subjects)` because Vite forwards it to the backend. Current workaround: navigate to `/` first, then click the nav link. Once the backend adopts a uniform `/api` prefix (see existing `Product capabilities` item), this collision goes away.
- **Admin email must not use `.local` TLD.** `email-validator` (used by `pydantic.EmailStr`) rejects reserved domains. The seed admin uses `admin@example.com`. Revisit if we ever want a more realistic test domain.
- **Branch-protection required check and `e2e-gate` aggregator job.** The spec called for an `if: always()` aggregator that makes `e2e` a required check compatible with path-filtered skips. Not implemented; `e2e` currently runs only when paths match and is not listed in `docs/superpowers/branch-protection.json`. Add both once the suite proves stable enough to block merges.
- **`TRUNCATE ... RESTART IDENTITY CASCADE` may reset sequences beyond the savepoint.** `RESTART IDENTITY` is DDL in some Postgres configurations and can bypass the per-test savepoint rollback. Not an issue at current suite size; revisit if tests begin relying on predictable sequence values.
- **Pin Playwright locale explicitly.** Tests currently rely on Chromium defaulting to `en-US` and i18n falling back to `en`. Add `locale: "en-US"` to `use` in `playwright.config.ts` to make this intent explicit.

## Toolchain & build friction

- **`ty` preview status.** Astral's type checker is pre-1.0; spec uses it anyway to keep the Python toolchain Astral-consistent. Revisit if it proves unstable.
- **`pytest-xdist` parallelization for DB tests.** Sub-millisecond
  rollback teardown makes sequential runs fine at current suite
  size. Worker-ID-keyed test databases become worthwhile once the
  suite is big enough to matter.
- **`pytest-postgresql` or `testcontainers-python` as an alternative
  to compose-based test infra.** Revisit if onboarding friction
  emerges.
- **Structured logging.** Every logger should emit JSON by default so downstream tooling (log aggregators, CLI viewers, debug agents) can parse and analyze output without regex. Choose the library, pick a schema, wire it into the FastAPI app and the backend's test output. Covers the backend for now; solver-py logging is a later concern.

## Auth maintenance

- **Session cleanup cron.** `mise run auth:cleanup-sessions` exists as manual task. Automate via cron or background scheduler when session volume justifies it.
- **Per-IP rate limiting.** Defer to reverse proxy (Caddy) or external service. Current limiter is per-email only.
- **Password breach check (HIBP).** Offline blocklist is the baseline. Online k-anonymity check against HIBP API is a nice-to-have.
- **Audit log.** `last_login_at` is the only tracking. Full audit trail is a separate concern.

## Production readiness

- **Production DB configuration.** Connection pooling at scale, read
  replicas, `statement_timeout`, `pg_stat_statements`. All prod
  concerns, out of scope until the deployment spec.

## Project metadata

- **License.** Deferred — no `license` field in `Cargo.toml`, no `LICENSE` file. Revisit when the project's distribution model (open source vs proprietary vs SaaS) is clearer.
