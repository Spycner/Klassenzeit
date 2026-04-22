# Open Things

Running log of items deferred or noted as tech debt during spec/plan work. Each entry points back to the spec that introduced it. Within each section, items are ordered by importance.

Items trace back to the specs that introduced them: the [project scaffolding design](specs/2026-04-11-project-scaffolding-design.md), the [frontend theming / i18n / ratchet design](specs/2026-04-17-frontend-theming-i18n-design.md), the [entity CRUD pages batch 1 design](specs/2026-04-17-frontend-entity-crud-pages-design.md), and the [frontend design implementation](specs/2026-04-19-frontend-design-implementation-design.md).

## Product capabilities (blocks user-facing functionality)

Ordered roughly in the sequence they need to land: data first, then access control, then the product surface, then the UI on top, then the path to production.

- **Deep-linked entity edit.** The Dashboard "Recently edited" tile links to the entity's list page without opening the edit dialog for that row. Add a `?edit=<id>` search param (validated by Zod in `validateSearch`) on each CRUD page, and teach the list component to open the matching dialog on mount. Defer until a second use case demands bookmarkable edits.
- **`active` flag on WeekScheme.** Split-view detail pane is wired to render an "active" badge; currently never shows because the backend has no flag. Add the column (plus a "set active" mutation) before the badge earns its space.
- **Duplicate a Stundentafel.** Creating a variant means re-adding every subject entry by hand, which is tedious. Add `POST /stundentafeln/{id}/duplicate` that clones the tafel plus all entries in one transaction, auto-suffixing the name (`"{orig} (Kopie)"`, then `"(Kopie 2)"`, `"(Kopie 3)"` on collision). Frontend: a "Duplizieren" / "Duplicate" button in the row's action cell next to Edit/Delete; on success toast + navigate to edit the new tafel. Reported during frontend small-fixups session.
- **Auto-infer WeekScheme time-block position + validate ordering.** Today the time-blocks form asks users to type a period number, and nothing prevents overlapping or out-of-order periods on the same day. Change to: drop the `position` input; backend assigns `position` as the chronological rank (by `start_time`) among blocks on the same day, renumbering siblings in one transaction on insert/edit; validate that for every consecutive pair on the same day sorted by `start_time`, `start_time >= previous end_time`, returning 422 on overlap. Frontend mirrors the check for inline feedback and maps 422 to a form root error, following the existing 409-duplicate pattern. DB column and `(day, position)` uniqueness stay as-is. Reported during frontend small-fixups session.
- **Extract a shared `EntityListTable` primitive.** Every entity page (Subjects, Rooms, Teachers, SchoolClasses, Stundentafeln, Lessons) duplicates the same `<div className="overflow-x-auto rounded-xl border bg-card"><Table>…` shell with Name/... columns and Edit/Delete action cell. This PR's code review caught that an `overflow-hidden` wrapper clipped action buttons on narrow viewports and needed the same fix applied to all six pages. Collapsing to `<EntityListTable columns={…} rows={…} renderRow={…} actions={…} />` would let cross-entity polish (mobile overflow, sticky headers, hover states, keyboard navigation) land once instead of six times. Surfaced during PR #116 review.
- **Lint rule for `useEffect` derived-state syncs.** `frontend/CLAUDE.md` forbids `useEffect(() => setX(fromProp), [fromProp])` for derived state, but the rule is enforced by review discipline only. `teacher-availability-grid.tsx` and `teacher-qualifications-editor.tsx` still ship the forbidden pattern (seeding a draft state from `detail.data`). Write a tiny Biome plugin, eslint-plugin-react-hooks rule, or a bespoke `scripts/check_use_effect_sync.ts` that flags `useEffect` bodies that are pure `setState(f(dep))`. Surfaced during PR #116 review.
- **Audit toast error fallbacks for copy reuse.** Several `toast.error(err instanceof Error ? err.message : t("x.action"))` call sites used the button-label key as the error fallback, rendering "Save availability" as an error string. This PR added `saveError` keys and fixed the two known sites, but a systematic `rg "toast.error\\(.*t\\(.*\\.save"` pass before the next release would catch any stragglers. Consider a `mutationErrorKey(entity, action)` helper that returns the right key by convention so call sites can't pick the wrong one. Surfaced during PR #116 review.
- **Shared typed-i18n helpers for computed keys.** Multiple features (`week-schemes-page.tsx`, `teacher-availability-grid.tsx`, `time-blocks-table.tsx`) cast a numeric day index back to a `0 | 1 | 2 | 3 | 4` literal (`t(\`common.daysShort.${day as 0 | 1 | 2 | 3 | 4}\`)`) to satisfy typed i18n. Move the cast into a single helper (e.g. `i18n/day-keys.ts` exporting `dayShortKey(n: number)` returning the typed literal or throwing on out-of-range) so individual features stop re-deriving it and the `frontend/CLAUDE.md` "No `as Foo` assertions" rule holds at call sites. Surfaced during PR #116 review.
- **Sub-resource setup in the create flow.** Today "New teacher" saves the bare entity, then the user must click Edit to add qualifications; same pattern for rooms (suitability) and week-schemes (time blocks). It's a two-step workflow for what feels like one action. Options: (a) auto-reopen the edit dialog with the new entity after a successful create, so sub-resource editors are the natural next step; (b) inline the sub-resource editors inside the create dialog and defer their POST until after the parent save succeeds (non-atomic, extra error-handling for partial failures). Option (a) is cheaper; prefer unless a user study says the extra click still hurts. Constraint: keep the memory rule that sub-resource editors live inline in the parent dialog, not on separate routes. Reported during frontend small-fixups session.
- **Bulk delete across entity tables.** Design includes checkbox columns; we dropped them this pass because there's no bulk-delete backend route. Add `DELETE /<entity>?ids=...` + a confirm dialog once there's a compelling workflow.
- **Import / export buttons.** Placeholder "Import" button renders disabled on every CRUD page. Wire to backend CSV/JSON endpoints once those land.
- **Route RHF root errors through toasts.** With `sonner` landed, the next cross-entity pass can consider replacing `form.setError("root", ...)` on 409-on-delete with a `toast.error(...)` surface. Intersects with "Typed deletion errors for in-use entities"; decide UX in that PR.
- **Dedicated `toasts.*` i18n namespace.** Today the only toast copy reuses `schoolClasses.generateLessons.*`. When a second, non-schoolClasses feature fires a toast, carve out a `toasts.*` namespace in that same pass rather than scattering toast strings across entity namespaces.
- **Typed deletion errors for in-use entities.** Deleting a Room or Teacher that a Lesson references surfaces the backend 409 as a generic `ApiError` toast. A typed 409 handler, or a pre-flight "is-used" check before opening the delete dialog, should land as one cross-entity pass rather than per-entity duplication.
- **`entry_count` / `total_hours` on `StundentafelListResponse`.** The Stundentafel list row shows Name, Grade, Actions only. A total-hours or entry-count column would be nice but requires a backend schema change; defer until users ask for an at-a-glance signal.
- **Translate Zod validation errors beyond login.** `LoginSchema` reads message keys via `i18n.t()` at module load (so the text is whatever language was detected on first load and does not update on locale switch). Subjects, Rooms, Teachers, and WeekSchemes schemas all ship with raw English literals. Ship a translated Zod global error map once a second non-login form surfaces them.
- **Raise the frontend coverage floor.** Ratchet currently floors at 50% with baseline 61%. Bump the floor to 70% once baseline clears 75% organically, then 80% to match Python.
- **Parallel `mise run dev` for backend + frontend.** Currently needs two terminals. A `concurrently`-style task or a `mise run dev:all` task would be convenient.
- **Self-hosted fonts.** Frontend imports Quicksand / Lora / Fira Code / Special Elite via `@import url(fonts.googleapis.com/...)`. Move to locally hosted `@font-face` (`public/fonts/*.woff2`) once offline dev or third-party privacy is a concern.
- **Time-of-day-aware welcome greeting.** Dashboard shows "Welcome back." regardless of clock; prototype suggested "Guten Morgen, Pascal." A one-liner with `Intl.DateTimeFormat` plus the logged-in user's first name.
- **Untranslated-string lint rule.** Review discipline is the only line of defence against hardcoded English or German sneaking into JSX. Add a Biome plugin or parallel ESLint rule if violations happen in practice.
- **Production deployment.** Docker, reverse proxy, secrets management.
- **Repository / unit-of-work layer.** Routes currently take
  `AsyncSession` directly. A repository layer earns its place only
  once queries get duplicated across endpoints. Add when it hurts.
- **Data migrations / seed data framework.** Schema migrations only
  for now. Add when there's real data to seed.
- **Realistic Hessen Grundschule mock/seed data.** When seeding or generating demo fixtures, mirror the actual hessische Stundentafel so screenshots, E2E flows, and user demos feel grounded rather than random. Reference (researched 2026-04-22):
  - *Stundentafel Klasse 1/2:* 21 Pflichtstunden (Deutsch 6, Mathematik 5, Sachunterricht 2, Religion/Ethik 2, Kunst/Werken/Musik 3, Sport 3) plus 2 Stunden Förderunterricht/AGs.
  - *Stundentafel Klasse 3/4:* 25 Pflichtstunden (Deutsch 5, Mathematik 5, Sachunterricht 4, Fremdsprache 2, Religion/Ethik 2, Kunst/Werken/Musik 4, Sport 3) plus 2 Stunden Förderunterricht/AGs. Über alle vier Jahrgänge also 92 Wochenstunden gesamt.
  - *Lehrer-Pflichtstunden (Grundschule):* 28 Wochenstunden Vollzeit, ab 01.02.2026 reduziert auf 27,5. Teilzeit wird anteilig als Bruch geführt (typische Werte: 14/28, 18/28, 21/28). Lebensarbeitszeitkonto: 0,5 Stunden pro Woche Gutschrift bis zum 60. Lebensjahr (anteilig bei Teilzeit).
  - *WeekScheme-Zeitraster (typisch):* Unterrichtsbeginn 7:45 bis 8:15, Unterrichtsstunde = 45 Minuten. Zwei Hofpausen (je 15 bis 20 Minuten, nach der 2. und nach der 4. Stunde) plus eine kurze Frühstückspause im Klassenraum (ca. 10 Minuten). Tagesende 11:30 bis 13:20 im Halbtag, bis 14:55 im Ganztag. Ganztagsschulen ergänzen eine Mittagspause von 45 bis 60 Minuten.
  - *Quellen:* Hessisches Kultusministerium, Hessischer Bildungsserver, GEW Hessen Pflichtstundenverordnung.
  - *Weiterer Rechercheauftrag vor dem Seeden:* Die obigen Zahlen decken nur den Pflichtunterricht und das Zeitraster ab. Zusätzliche reale Randbedingungen sollten ebenfalls recherchiert und als Constraints im Mock berücksichtigt werden, u.a.: maximale Klassengröße Grundschule Hessen (Klassenobergrenze laut VO), Klassenlehrer-Prinzip (Klassenlehrer*in unterrichtet üblicherweise Deutsch, Mathe, Sachunterricht in der eigenen Klasse), Fachlehrer-Einsatz (Religion, Sport, Musik, Englisch, Kunst häufig Fachlehrer), Religion/Ethik parallel in unterschiedlichen Räumen (ev./kath./Ethik), Schwimmunterricht (meist Klasse 3, auswärtige Halle, Doppelstunde inkl. Wegezeit), Raumtypen und Eignung (Turnhalle für Sport, Musikraum, Kunstraum, Computerraum; Grundschule grundsätzlich Klassenraum-Prinzip), Doppelbesetzung/Förderstunden in Klasse 1/2, Pausen-/Aufsichtspflichten, Vertretungsreserve, Koppelstunden (Doppelstunden sinnvoll vs. nicht sinnvoll pro Fach), Lage der Fächer am Tag (Hauptfächer eher früh, Sport nicht direkt nach dem Essen), Lehrerarbeitszeitmodell (Teilzeit-Tage blockweise vs. über die Woche verteilt). Agent soll vor der Mock-Erzeugung diese Punkte nachrecherchieren und die Ergebnisse als zusätzliche Seeding-Constraints hier ergänzen.
- **MFA / TOTP / passkeys.** Not needed for current threat model. Add if user base or sensitivity grows.
- **Email-based password reset.** Requires email sending infrastructure. Add when email is needed for other features.
- **OAuth / OIDC / social login.** Not needed for closed system.
- **Self-service registration.** Not needed for closed system.
- **Bulk import/export.** CSV or JSON import for teachers, rooms, subjects. Useful but not needed for MVP.
- **Cross-entity validation.** E.g., lesson's teacher must be qualified for the lesson's subject. Currently not enforced at API level — solver catches it.

## CI / repo automation

- **Drift-check mode for `repo:apply-settings`.** The readback-and-diff logic in `scripts/apply-github-settings.sh` is factored into its own block, so exposing a `--check` flag (readback without apply) is a small addition. Wire it into `audit.yml` as a nightly drift-check job once the first real drift incident justifies the noise; the auto-issue-on-failure path (as of PR #audit-issue-on-failure) already takes care of routing failures to a tracking issue.
- **Dependabot for the Python/uv ecosystem.** Dependabot doesn't natively understand `uv.lock` as of mid-2025; the `pip` adapter desyncs the lockfile and violates the `uv add`-only rule. Revisit when dependabot ships first-class uv support, or switch to Renovate (which already supports uv).

## Testing

- **Session-scoped event loop may cause timing interference at scale.** The `asyncio_default_fixture_loop_scope = "session"` setting (introduced for the Chunk G DB fixtures) means all async tests and fixtures share a single event loop for the entire pytest session. This prevents asyncpg "Future attached to a different loop" errors with session-scoped fixtures but means one slow or stalled async test can delay all subsequent tests in the session. Not a problem with the current 16-test suite, but worth revisiting if the test suite grows large or if tests with long async timeouts are added.

### E2E (Playwright)

- **Entity coverage beyond Subjects.** Each remaining entity CRUD spec (Rooms, Teachers, WeekSchemes, SchoolClasses, Stundentafel, Lesson) should add its own Playwright flow when it lands.
- **Cross-browser matrix.** Firefox and WebKit are disabled for now (Chromium only). Enable when external users appear.
- **Accessibility audits inside Playwright.** `@axe-core/playwright` integration is deferred; track separately.
- **Visual regression.** Percy / Chromatic / Playwright snapshot tooling. Defer until design churn slows.
- **Parallel workers + per-worker DBs.** Currently Playwright runs single-worker against a shared DB. Move to per-worker schemas once CI time matters.
- **Session cleanup in `/__test__/reset`.** The reset endpoint preserves the `sessions` table so storageState stays valid; revisit if tests start needing clean session state.
- **Nightly extended run.** Slower flows, broader data scenarios. Add when the suite is large enough to justify tiering.
- **Test-only router hardening.** Currently gated by `settings.env == "test"`; an additional network-level guard (e.g., bind `/__test__` to localhost only) is possible if the surface grows.
- **Integration test for conditional mount.** `include_testing_router_if_enabled` has unit tests but no integration test that actually imports `main` with `KZ_ENV=dev` and asserts `/__test__/*` returns 404. Add if a future refactor risks breaking the wiring silently.
- **Shell-exported `KZ_ENV=dev` defeats pytest router mounting.** The `os.environ.setdefault` in conftest no-ops if the shell already has `KZ_ENV` set. A shell-exported `KZ_ENV=dev` would silently skip mounting the testing router, and router tests would fail with 404. Add a warning in conftest or switch to `pytest-env` if this bites anyone.
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
- **`solver/CLAUDE.md` once solver conventions accumulate.** The Rust workspace currently relies on the root `.claude/CLAUDE.md` for its rules (no-bare-catchalls with Rust framing lives there). Add a `solver/CLAUDE.md` when `solver-core` or `solver-py` grow their own conventions (fixture patterns, clippy escape-hatch policy, PyO3 binding style).
- **Split `frontend/CLAUDE.md` into topic files under `.claude/rules/`.** The frontend file is currently 112 lines. When it exceeds ~150 lines or starts topic-mixing, split into `.claude/rules/frontend-hooks.md`, `frontend-forms.md`, `frontend-testing.md`, etc. with `paths: ["frontend/**/*"]` frontmatter. Not yet warranted for a project this size.

## Auth maintenance

- **Session cleanup cron.** `mise run auth:cleanup-sessions` exists as manual task. Automate via cron or background scheduler when session volume justifies it.
- **Per-IP rate limiting.** Defer to reverse proxy (Caddy) or external service. Current limiter is per-email only.
- **Password breach check (HIBP).** Offline blocklist is the baseline. Online k-anonymity check against HIBP API is a nice-to-have.
- **Audit log.** `last_login_at` is the only tracking. Full audit trail is a separate concern.

## Production readiness

- **Production DB configuration.** Connection pooling at scale, read
  replicas, `statement_timeout`, `pg_stat_statements`. All prod
  concerns, out of scope until the deployment spec.
- **Move Postgres init-SQL source into server-infra.** `server-infra/docker-compose.yml` mounts `/home/pascal/Code/Klassenzeit/docker/postgres/init-databases.sql` via an absolute host path, coupling the two repos by path rather than by contract. Move the file into the server-infra tree and update the mount source. Priority: low (only affects cold VPS setups).

## Project metadata

- **License.** Deferred — no `license` field in `Cargo.toml`, no `LICENSE` file. Revisit when the project's distribution model (open source vs proprietary vs SaaS) is clearer.
