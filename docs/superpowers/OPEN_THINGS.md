# Open Things

Running log of items deferred or noted as tech debt during spec/plan work. The top sections reflect the current sprint; the backlog below is everything else, grouped by concern. Within each group, items are ordered by importance.

Items trace back to the specs that introduced them: the [project scaffolding design](specs/2026-04-11-project-scaffolding-design.md), the [frontend theming / i18n / ratchet design](specs/2026-04-17-frontend-theming-i18n-design.md), the [entity CRUD pages batch 1 design](specs/2026-04-17-frontend-entity-crud-pages-design.md), and the [frontend design implementation](specs/2026-04-19-frontend-design-implementation-design.md).

## Prototype sprint: end-to-end "enter a school, click generate, see a timetable"

Goal: user logs in, enters a small Hessen Grundschule, clicks Generate, sees a timetable. Ordered so each step unblocks the next. Scoped as hard constraints only; soft constraints and heuristics are a later concern.

1. **Solver MVP in `solver-core`.** Greedy first-fit placement that respects hard constraints (teacher qualifications, teacher availability, room suitability, no teacher / class / room double-booking). Deterministic, pure Rust, unit-tested. Returns `Vec<Placement { lesson_id, time_block_id, room_id }>` or an explicit "infeasible at step X" error. The solver is the product; today `solver/solver-core/src/lib.rs` is a 28-line `reverse_chars` stub.
2. **PyO3 binding + backend endpoint.** `solver-py` exposes `solve(problem_json) -> result_json`; backend adds `POST /api/school-classes/{id}/schedule` that loads entities, shapes them into the solver's input, runs the solver off the event loop (`asyncio.to_thread`), and returns the placement. No persistence yet; just round-trip.
3. **Placement persistence.** Add a `scheduled_lesson` table (or extend `lesson` with `time_block_id` / `room_id` columns, depending on whether schedule history should survive re-solves); wire `POST /schedule` to upsert; add `GET /api/school-classes/{id}/schedule`.
4. **Schedule view in the frontend.** New `/schedule` route (or a tab on the class detail) showing a week grid with class / teacher / room filters. Reuses the `kz-ws-grid` CSS that WeekSchemes already uses. Renders a skeleton or empty state until the backend returns a placement; no placeholder data that looks real (see `frontend/CLAUDE.md`).
5. **Realistic Hessen Grundschule seed.** A one-shot `uv run python -m klassenzeit_backend.seed.demo_grundschule` that creates the week scheme, Stundentafeln for grades 1 to 4, plausible teachers / rooms, and a pair of classes ready to generate lessons + schedule. Also feeds the Playwright E2E. Reference figures captured below.
6. **E2E smoke test.** One Playwright spec that hits `/login`, runs the seed via a test-only endpoint, clicks through generate-lessons + generate-schedule, and asserts the grid renders.

### Hessen Grundschule reference data (for step 5)

Researched 2026-04-22. Mirrors the actual hessische Stundentafel so screenshots, E2E flows, and demos feel grounded rather than random.

- *Stundentafel Klasse 1/2:* 21 Pflichtstunden (Deutsch 6, Mathematik 5, Sachunterricht 2, Religion/Ethik 2, Kunst/Werken/Musik 3, Sport 3) plus 2 Stunden Förderunterricht/AGs.
- *Stundentafel Klasse 3/4:* 25 Pflichtstunden (Deutsch 5, Mathematik 5, Sachunterricht 4, Fremdsprache 2, Religion/Ethik 2, Kunst/Werken/Musik 4, Sport 3) plus 2 Stunden Förderunterricht/AGs. Über alle vier Jahrgänge also 92 Wochenstunden gesamt.
- *Lehrer-Pflichtstunden (Grundschule):* 28 Wochenstunden Vollzeit, ab 01.02.2026 reduziert auf 27,5. Teilzeit wird anteilig als Bruch geführt (typische Werte: 14/28, 18/28, 21/28). Lebensarbeitszeitkonto: 0,5 Stunden pro Woche Gutschrift bis zum 60. Lebensjahr (anteilig bei Teilzeit).
- *WeekScheme-Zeitraster (typisch):* Unterrichtsbeginn 7:45 bis 8:15, Unterrichtsstunde = 45 Minuten. Zwei Hofpausen (je 15 bis 20 Minuten, nach der 2. und nach der 4. Stunde) plus eine kurze Frühstückspause im Klassenraum (ca. 10 Minuten). Tagesende 11:30 bis 13:20 im Halbtag, bis 14:55 im Ganztag. Ganztagsschulen ergänzen eine Mittagspause von 45 bis 60 Minuten.
- *Quellen:* Hessisches Kultusministerium, Hessischer Bildungsserver, GEW Hessen Pflichtstundenverordnung.
- *Weiterer Rechercheauftrag vor dem Seeden:* Die obigen Zahlen decken nur den Pflichtunterricht und das Zeitraster ab. Zusätzliche reale Randbedingungen sollten ebenfalls recherchiert und als Constraints im Mock berücksichtigt werden, u.a.: maximale Klassengröße Grundschule Hessen (Klassenobergrenze laut VO), Klassenlehrer-Prinzip (Klassenlehrer*in unterrichtet üblicherweise Deutsch, Mathe, Sachunterricht in der eigenen Klasse), Fachlehrer-Einsatz (Religion, Sport, Musik, Englisch, Kunst häufig Fachlehrer), Religion/Ethik parallel in unterschiedlichen Räumen (ev./kath./Ethik), Schwimmunterricht (meist Klasse 3, auswärtige Halle, Doppelstunde inkl. Wegezeit), Raumtypen und Eignung (Turnhalle für Sport, Musikraum, Kunstraum, Computerraum; Grundschule grundsätzlich Klassenraum-Prinzip), Doppelbesetzung/Förderstunden in Klasse 1/2, Pausen-/Aufsichtspflichten, Vertretungsreserve, Koppelstunden (Doppelstunden sinnvoll vs. nicht sinnvoll pro Fach), Lage der Fächer am Tag (Hauptfächer eher früh, Sport nicht direkt nach dem Essen), Lehrerarbeitszeitmodell (Teilzeit-Tage blockweise vs. über die Woche verteilt). Agent soll vor der Mock-Erzeugung diese Punkte nachrecherchieren und die Ergebnisse als zusätzliche Seeding-Constraints hier ergänzen.

## Pay down alongside the sprint

Debt the sprint itself will touch, so cheaper to pay upfront than retrofit.

- **Write `solver/CLAUDE.md` before step 1.** The Rust workspace currently relies on the root `.claude/CLAUDE.md` (no-bare-catchalls with Rust framing lives there). With real solver code landing in `solver-core` / `solver-py`, capture fixture patterns, error handling (catch-specific, propagate), PyO3 binding style, and clippy escape-hatch policy as local rules before the first scheduling PR.
- **Extract `dayShortKey(n: number)` helper before step 4.** Multiple features (`week-schemes-page.tsx`, `teacher-availability-grid.tsx`, `time-blocks-table.tsx`) cast a numeric day index back to a `0 | 1 | 2 | 3 | 4` literal to satisfy typed i18n. Move the cast into a single helper (e.g. `i18n/day-keys.ts` exporting `dayShortKey(n: number)` returning the typed literal or throwing on out-of-range) so the new schedule view uses it from day one instead of adding a fourth cast, and the `frontend/CLAUDE.md` "No `as Foo` assertions" rule holds at call sites. Surfaced during PR #116 review.
- **Decide cross-entity validation strategy before step 2.** Today the lesson-teacher qualification and lesson-teacher availability links are not enforced at API level; the solver would catch them. Once the solver is real, its "infeasible" response is what the user sees, and that response has to discriminate between "the problem has no solution" and "you never added that qualification." Pick one before landing step 2: (a) validate at lesson-create time (409); (b) pre-solve check that returns a human-readable "missing qualification for X on Y" before running the solver; (c) rely on the solver to emit structured reasons and render them. Prefer (b) for the prototype: cheapest, forgiving UX, no coupling at write time.
- **Structured logging around the solve boundary.** Not the whole backend this sprint, but wrap the solver call with `logger.info` entries that capture input shape, runtime, and outcome. A solver that silently fails or times out with no trace is the single worst thing to ship, and the fix is two lines. The broader JSON-logging initiative stays deferred under Toolchain below.

## Acknowledged, not in scope this sprint

Items the sprint will brush against but deliberately leaves alone.

- **Repository / unit-of-work layer.** Routes currently take `AsyncSession` directly. Step 2's handler will load 7 to 8 entity types in one call and probably duplicate some of the existing CRUD queries. The earlier guidance ("add when it hurts") still applies; if step 2's handler grows past ~80 lines, file the pain as a follow-up rather than detouring mid-sprint.
- **`active` flag on WeekScheme.** Matters only if a school has multiple week schemes with one "live" scheme. For the prototype, a class points at one `week_scheme_id` directly, which is enough. Revisit when the readiness checklist or a schedule-switcher needs it.
- **Auto-infer WeekScheme time-block position + validate ordering.** UX polish that does not affect the solver or the schedule view. Today the time-blocks form asks users to type a period number, and nothing prevents overlapping or out-of-order periods on the same day. Change to: drop the `position` input; backend assigns `position` as the chronological rank (by `start_time`) among blocks on the same day, renumbering siblings in one transaction on insert/edit; validate that consecutive pairs on the same day sorted by `start_time` satisfy `start_time >= previous end_time`, returning 422 on overlap. Frontend mirrors the check and maps 422 to a form root error, following the existing 409-duplicate pattern. DB column and `(day, position)` uniqueness stay as-is. Reported during frontend small-fixups session.

## Backlog

Everything below is queued for later. Ordered roughly by importance within each group.

### Product capabilities

- **Deep-linked entity edit.** The Dashboard "Recently edited" tile links to the entity's list page without opening the edit dialog for that row. Add a `?edit=<id>` search param (validated by Zod in `validateSearch`) on each CRUD page, and teach the list component to open the matching dialog on mount. Defer until a second use case demands bookmarkable edits.
- **Duplicate a Stundentafel.** Creating a variant means re-adding every subject entry by hand, which is tedious. Add `POST /stundentafeln/{id}/duplicate` that clones the tafel plus all entries in one transaction, auto-suffixing the name (`"{orig} (Kopie)"`, then `"(Kopie 2)"`, `"(Kopie 3)"` on collision). Frontend: a "Duplizieren" / "Duplicate" button in the row's action cell next to Edit/Delete; on success toast + navigate to edit the new tafel. Reported during frontend small-fixups session.
- **Extract a shared `EntityListTable` primitive.** Every entity page (Subjects, Rooms, Teachers, SchoolClasses, Stundentafeln, Lessons) duplicates the same `<div className="overflow-x-auto rounded-xl border bg-card"><Table>…` shell with Name/... columns and Edit/Delete action cell. PR #116's code review caught that an `overflow-hidden` wrapper clipped action buttons on narrow viewports and needed the same fix applied to all six pages. Collapsing to `<EntityListTable columns={…} rows={…} renderRow={…} actions={…} />` would let cross-entity polish (mobile overflow, sticky headers, hover states, keyboard navigation) land once instead of six times. Surfaced during PR #116 review.
- **Lint rule for `useEffect` derived-state syncs.** `frontend/CLAUDE.md` forbids `useEffect(() => setX(fromProp), [fromProp])` for derived state, but the rule is enforced by review discipline only. `teacher-availability-grid.tsx` and `teacher-qualifications-editor.tsx` still ship the forbidden pattern (seeding a draft state from `detail.data`). Write a tiny Biome plugin, eslint-plugin-react-hooks rule, or a bespoke `scripts/check_use_effect_sync.ts` that flags `useEffect` bodies that are pure `setState(f(dep))`. Surfaced during PR #116 review.
- **Audit toast error fallbacks for copy reuse.** Several `toast.error(err instanceof Error ? err.message : t("x.action"))` call sites used the button-label key as the error fallback, rendering "Save availability" as an error string. PR #116 added `saveError` keys and fixed the two known sites, but a systematic `rg "toast.error\\(.*t\\(.*\\.save"` pass before the next release would catch any stragglers. Consider a `mutationErrorKey(entity, action)` helper that returns the right key by convention so call sites can't pick the wrong one. Surfaced during PR #116 review.
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
- **Production deployment.** Docker, reverse proxy, secrets management. Staging already auto-deploys via `.github/workflows/deploy-images.yml`; this item is the prod pathway specifically.
- **Data migrations / seed data framework.** Schema migrations only for now. Add when there's real data to seed beyond the prototype's one-shot `demo_grundschule` script.
- **MFA / TOTP / passkeys.** Not needed for current threat model. Add if user base or sensitivity grows.
- **Email-based password reset.** Requires email sending infrastructure. Add when email is needed for other features.
- **OAuth / OIDC / social login.** Not needed for closed system.
- **Self-service registration.** Not needed for closed system.
- **Bulk import/export.** CSV or JSON import for teachers, rooms, subjects. Useful but not needed for MVP.

### CI / repo automation

- **Drift-check mode for `repo:apply-settings`.** The readback-and-diff logic in `scripts/apply-github-settings.sh` is factored into its own block, so exposing a `--check` flag (readback without apply) is a small addition. Wire it into `audit.yml` as a nightly drift-check job once the first real drift incident justifies the noise; the auto-issue-on-failure path (as of PR #audit-issue-on-failure) already takes care of routing failures to a tracking issue.
- **Dependabot for the Python/uv ecosystem.** Dependabot doesn't natively understand `uv.lock` as of mid-2025; the `pip` adapter desyncs the lockfile and violates the `uv add`-only rule. Revisit when dependabot ships first-class uv support, or switch to Renovate (which already supports uv).

### Testing

- **Session-scoped event loop may cause timing interference at scale.** The `asyncio_default_fixture_loop_scope = "session"` setting (introduced for the Chunk G DB fixtures) means all async tests and fixtures share a single event loop for the entire pytest session. This prevents asyncpg "Future attached to a different loop" errors with session-scoped fixtures but means one slow or stalled async test can delay all subsequent tests in the session. Not a problem with the current 16-test suite, but worth revisiting if the test suite grows large or if tests with long async timeouts are added.

#### E2E (Playwright)

- **Entity coverage beyond Subjects.** Each remaining entity CRUD spec (Rooms, Teachers, WeekSchemes, SchoolClasses, Stundentafel, Lesson) should add its own Playwright flow when it lands. The prototype sprint's step 6 adds one end-to-end schedule flow; per-entity specs remain deferred.
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

### Toolchain & build friction

- **`ty` preview status.** Astral's type checker is pre-1.0; spec uses it anyway to keep the Python toolchain Astral-consistent. Revisit if it proves unstable.
- **`pytest-xdist` parallelization for DB tests.** Sub-millisecond rollback teardown makes sequential runs fine at current suite size. Worker-ID-keyed test databases become worthwhile once the suite is big enough to matter.
- **`pytest-postgresql` or `testcontainers-python` as an alternative to compose-based test infra.** Revisit if onboarding friction emerges.
- **Structured logging (rest of backend).** The prototype sprint wraps the solver boundary with `logger.info` calls; broader JSON logging across the FastAPI app and test output still needs a library choice, a schema, and wiring. `solver-py` logging gets the same treatment once the Rust worker is real.
- **Split `frontend/CLAUDE.md` into topic files under `.claude/rules/`.** The frontend file is currently 112 lines. When it exceeds ~150 lines or starts topic-mixing, split into `.claude/rules/frontend-hooks.md`, `frontend-forms.md`, `frontend-testing.md`, etc. with `paths: ["frontend/**/*"]` frontmatter. Not yet warranted for a project this size.

### Auth maintenance

- **Session cleanup cron.** `mise run auth:cleanup-sessions` exists as manual task. Automate via cron or background scheduler when session volume justifies it.
- **Per-IP rate limiting.** Defer to reverse proxy (Caddy) or external service. Current limiter is per-email only.
- **Password breach check (HIBP).** Offline blocklist is the baseline. Online k-anonymity check against HIBP API is a nice-to-have.
- **Audit log.** `last_login_at` is the only tracking. Full audit trail is a separate concern.

### Production readiness

- **Production DB configuration.** Connection pooling at scale, read replicas, `statement_timeout`, `pg_stat_statements`. All prod concerns, out of scope until the deployment spec.
- **Move Postgres init-SQL source into server-infra.** `server-infra/docker-compose.yml` mounts `/home/pascal/Code/Klassenzeit/docker/postgres/init-databases.sql` via an absolute host path, coupling the two repos by path rather than by contract. Move the file into the server-infra tree and update the mount source. Priority: low (only affects cold VPS setups).

### Project metadata

- **License.** Deferred. No `license` field in `Cargo.toml`, no `LICENSE` file. Revisit when the project's distribution model (open source vs proprietary vs SaaS) is clearer.
