# Playwright E2E Grundschule smoke test

**Date:** 2026-04-24
**Status:** Design approved, plan pending.

## Problem

The prototype sprint in `docs/superpowers/OPEN_THINGS.md` has shipped the solver MVP (PR #118, #120), placement persistence (PR #121), the frontend schedule view (PR #124), and the Hessen Grundschule demo seed (PR #126). The remaining sprint step is a Playwright end-to-end smoke test: one spec that exercises the full demo flow a stakeholder would walk through ("log in, see a realistic Grundschule, click Generate, see a timetable") so future regressions in any link of that chain fail CI on a pushable branch.

Today the pieces are covered in isolation (backend pytest proves the seed solves with zero violations, Vitest covers the schedule page's render logic, `subjects.spec.ts` covers one CRUD flow), but nothing asserts the demo works end-to-end through a real browser.

## Goal

One PR that:

1. Adds two test-only HTTP endpoints under the existing `/__test__/*` mount (gated on `settings.env == "test"`):
   - `POST /__test__/seed-grundschule` wraps `seed_demo_grundschule`.
   - `POST /__test__/assign-teachers-grundschule` applies a valid greedy teacher assignment derived from the seed's qualifications and hour caps.
2. Lifts the existing `TEACHER_ASSIGNMENTS` map and its apply-helper out of `backend/tests/seed/test_demo_grundschule_solvability.py` into the production `klassenzeit_backend.seed.demo_grundschule` module so both the pytest test and the new test endpoint share one source of truth.
3. Adds pytest integration tests for the two new endpoints.
4. Adds a single Playwright spec `frontend/e2e/flows/grundschule-smoke.spec.ts` that drives the happy path end-to-end for one class.
5. Closes out the "E2E smoke test" sprint bullet in `docs/superpowers/OPEN_THINGS.md`.

After this PR, `mise run e2e` exercises the entire demo flow; a regression that breaks seed, generate-lessons, solver invocation, placement persistence, or grid render fails the Playwright job.

## Non-goals

- **Auto-assign teachers during generate-lessons.** Already tracked under OPEN_THINGS "Auto-assign teachers during generate-lessons (or in the solver)". Until that lands, the smoke test uses a back-channel endpoint to pin teachers rather than clicking 33 Radix Selects through the UI.
- **Entity CRUD coverage beyond Subjects.** Per-entity Playwright flows (Rooms, Teachers, WeekSchemes, SchoolClasses, Stundentafel, Lesson) remain deferred under OPEN_THINGS.
- **Running the schedule flow for all four classes.** The seeded Grundschule solves all four with zero violations at the API layer (`test_seeded_grundschule_solvability`); duplicating that in Playwright adds slowness without new failure modes.
- **Login UI inside the spec.** Existing `admin.setup.ts` logs in once per worker and saves storageState; the smoke spec uses it. `smoke.spec.ts` already covers the authenticated landing page.
- **Firefox / WebKit coverage.** OPEN_THINGS "Cross-browser matrix" remains deferred.
- **Visual regression.** OPEN_THINGS already tracks three approaches; none blocks this step.
- **Pinning Playwright locale explicitly.** OPEN_THINGS already tracks the follow-up; Chromium's default `en-US` is sufficient for the test.
- **Adding auth to `/__test__/*`.** The mount gate is the security boundary; adding auth to only the new endpoints would create inconsistency with `/__test__/reset`.
- **An ADR.** No load-bearing architectural decision; the test uses existing patterns (test-only router, Playwright fixtures, `request.post` back-channel).

## Design

### Backend: test-only endpoints

Both endpoints are added to `klassenzeit_backend/testing/router.py` alongside the existing `/reset` endpoint. The mount conditional in `klassenzeit_backend/testing/mount.py` already gates on `settings.env == "test"`; the new routes inherit that gate for free.

#### `POST /__test__/seed-grundschule`

```python
@testing_router.post("/seed-grundschule", status_code=status.HTTP_204_NO_CONTENT)
async def testing_seed_grundschule(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Seed a Hessen Grundschule into the current session and commit."""
    await seed_demo_grundschule(session)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Contract:

- 204 on success, no body.
- Caller owns the reset order: the auto-`resetBackend` fixture in `frontend/e2e/fixtures/test.ts` truncates all entity tables, then the spec explicitly POSTs seed.
- On duplicate (seed already applied without a prior reset), the seed raises `sqlalchemy.exc.IntegrityError` which surfaces as 500. The Playwright spec's auto-reset prevents this in practice.

#### `POST /__test__/assign-teachers-grundschule`

```python
@testing_router.post("/assign-teachers-grundschule", status_code=status.HTTP_204_NO_CONTENT)
async def testing_assign_teachers_grundschule(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Pin teacher_id on every seeded Lesson per TEACHER_ASSIGNMENTS."""
    await assign_teachers_for_demo_grundschule_lessons(session)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Contract:

- 204 on success, no body.
- Expects lessons already generated for the seeded classes. If called before `generate-lessons`, the helper does nothing (no lesson rows to update). No 4xx because the helper is idempotent under that condition; a misordered test would fail on the later schedule assertion, not here.
- The helper is `async def assign_teachers_for_demo_grundschule_lessons(session: AsyncSession) -> None` in `klassenzeit_backend.seed.demo_grundschule`. Implementation is the existing body of `_assign_teachers_for_demo_grundschule_lessons` from `backend/tests/seed/test_demo_grundschule_solvability.py`, dropped-underscore, unchanged behavior.

### Backend: refactor `TEACHER_ASSIGNMENTS` into the seed package

Today the map and helper live in the pytest test file. The new endpoint cannot import them from there (pytest `--import-mode=importlib` plus the "no src-imports-tests" direction). Move both into `backend/src/klassenzeit_backend/seed/demo_grundschule.py` as a behavior-preserving tidy commit (per `.claude/CLAUDE.md`'s "structural and behavioral change never ship in the same commit"):

```python
# klassenzeit_backend.seed.demo_grundschule

TEACHER_ASSIGNMENTS: dict[tuple[str, str], str] = {
    ("1a", "D"): "MUE",
    # … (unchanged from test file)
}

async def assign_teachers_for_demo_grundschule_lessons(session: AsyncSession) -> None:
    """Pin teacher_id on every seeded Lesson per TEACHER_ASSIGNMENTS."""
    # … (body unchanged)
```

Update `backend/tests/seed/test_demo_grundschule_solvability.py` to import the map and helper from the seed module. Drop the local copies and the `_assign_teachers_for_demo_grundschule_lessons` docstring (now on the public helper).

### Backend: pytest integration tests

New file `backend/tests/testing/test_testing_router.py` (directory new):

- `test_seed_grundschule_endpoint_returns_204_and_creates_rows`: POST the endpoint, assert 204, assert `select(count(SchoolClass))` returns 4, `select(count(Teacher))` returns 6.
- `test_assign_teachers_grundschule_endpoint_pins_teacher_ids`: seed, call `generate-lessons` for one class, POST the endpoint, assert `select(Lesson).where(teacher_id.is_not(None))` covers every seeded lesson for that class.

Both tests reuse the existing `db_session` + `client` fixtures. `backend/tests/testing/__init__.py` is empty.

### Frontend: Playwright spec

New file `frontend/e2e/flows/grundschule-smoke.spec.ts`.

Flow:

1. Navigate to `/school-classes`. The `resetBackend` auto-fixture has already truncated.
2. `request.post('http://localhost:8000/__test__/seed-grundschule')` to seed.
3. Reload the school-classes page (or navigate away and back) so TanStack Query refetches and shows the seeded classes.
4. Click the "Generate lessons" button on the 1a row, confirm the dialog. Wait for the success toast.
5. `request.post('http://localhost:8000/__test__/assign-teachers-grundschule')`.
6. Fetch the 1a class ID via `request.get('http://localhost:8000/api/classes')`, pick the one where `name === "1a"`.
7. Navigate to `/schedule?class=<1a-id>`.
8. Click "Generate schedule" (the empty-state primary action). Wait.
9. Assert `.kz-ws-grid` is visible, at least one `[data-variant="period"]` cell exists, and at least one cell contains "Deutsch".

Key Playwright patterns:

- Use `test` from `../fixtures/test` so `resetBackend` fires.
- Use `page.getByRole("button", { name: "Generate lessons" })` scoped to the 1a row.
- The confirm dialog has its own Generate button; scope with `page.getByRole("dialog").getByRole("button", { name: "Generate" })`.
- Wait on the grid cell directly (`await expect(page.locator('[data-variant="period"]').first()).toBeVisible()`).
- No explicit `waitForResponse`; TanStack Query's mutation plus auto-invalidation handles refetch timing, and Playwright's auto-waiting on locator assertions is sufficient.

### Frontend: fixtures and URLs

Add `schoolClasses: "/school-classes"` and `schedule: "/schedule"` to `frontend/e2e/support/urls.ts` if not already there. Check before editing.

No new fixtures in `e2e/fixtures/test.ts`. The single spec body owns the seed calls.

### Docs

- Remove the "E2E smoke test" bullet from the "Prototype sprint" section of `docs/superpowers/OPEN_THINGS.md`.
- Update the sprint-header paragraph to say the sprint is complete.
- Do not add a follow-up about "teacher assignment via back-channel" because "Auto-assign teachers during generate-lessons" already tracks the real gap.
- Update `docs/architecture/overview.md` only if adding the new endpoints changes the subsystem diagram. Expected answer: no.
- No ADR (per Non-goals).
- No README update: `mise run e2e` already documents the E2E command.

### Error paths and flake budget

- **Seed endpoint 500 on duplicate.** Guarded by the auto-reset fixture. If a future test skips reset, the 500 surfaces as a clear Playwright failure.
- **Solver latency.** The seeded 1a has ~21 hours; measured solver time against this seed is well under 1 second on CI hardware. Playwright's default 30 s expect timeout absorbs any spike.
- **TanStack Query cache after seed.** The school-classes page cached `[]` on first load. After seed, the cache must invalidate. Easiest: navigate away and back (e.g., to dashboard and back to school-classes) or use `page.reload()`. Spec will use `page.reload()` after the seed call.
- **Radix Select interaction.** The schedule page's class picker is a Radix Select and needs `hasPointerCapture` stubs; those already exist in `tests/setup.ts` but that is Vitest-only. Playwright drives a real Chromium so the stubs are irrelevant. The toolbar spec reads 1a directly from the URL (`/schedule?class=<id>`), bypassing the Select entirely.

### Testing strategy

- **Backend**: red pytest test for each endpoint, then green implementation.
- **Frontend**: the Playwright spec is the assertion of last resort. No Vitest equivalent (Vitest would have to mock MSW around seed + generate-lessons + schedule, which is the opposite of what an E2E smoke test is for).

### Commit split

Per `/autopilot` Conventional Commits:

1. `refactor(backend): lift TEACHER_ASSIGNMENTS into seed package`: behavior-preserving move.
2. `test(backend): cover seed-grundschule and assign-teachers-grundschule endpoints`: red test file; tests fail with 404 because routes do not exist yet.
3. `feat(backend): add /__test__/seed-grundschule and /__test__/assign-teachers-grundschule`: green.
4. `test(frontend): add grundschule-smoke playwright spec`: full flow. Passes on first green.
5. `docs(superpowers): close out prototype sprint in OPEN_THINGS`: remove the E2E bullet, mark sprint complete.

## Success criteria

- `mise run test:py` green including the two new endpoint tests.
- `mise run e2e` green on Chromium (repeat 3 times on CI hardware to confirm no flake).
- `mise run lint` clean.
- `docs/superpowers/OPEN_THINGS.md` no longer lists the E2E smoke step.
- PR #126's `TEACHER_ASSIGNMENTS` map remains the single source of truth for the valid greedy assignment; no duplication.

## Open questions

None resolved during brainstorming; all trade-offs are documented in `/tmp/kz-brainstorm/brainstorm.md` (Q1 through Q13).
