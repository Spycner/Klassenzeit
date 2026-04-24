# E2E Grundschule smoke test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single Playwright spec that drives the full Hessen Grundschule demo flow end-to-end (seed, generate lessons, assign teachers, generate schedule, assert grid), backed by two new test-only HTTP endpoints.

**Architecture:** Two back-channel endpoints on the existing `/__test__/*` mount replace the parts of the demo flow that are impractical to drive via the UI (bulk seed, 33-lesson teacher assignment). The Playwright spec clicks through the remaining UI actions (generate-lessons for one class, generate-schedule, grid assertion). The existing `TEACHER_ASSIGNMENTS` map moves from the pytest test file into the production seed package so both the pytest test and the new endpoint share one source of truth.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), Playwright with Chromium (frontend), pytest + httpx for backend integration tests.

---

## File Structure

**Backend changes:**
- Modify: `backend/src/klassenzeit_backend/seed/demo_grundschule.py`. Append `TEACHER_ASSIGNMENTS` constant and `assign_teachers_for_demo_grundschule_lessons` async function.
- Modify: `backend/src/klassenzeit_backend/testing/router.py`. Add two new endpoints.
- Modify: `backend/tests/seed/test_demo_grundschule_solvability.py`. Import the constant and helper from the seed module; drop the local copies.
- Modify: `backend/tests/testing/test_router.py`. Append two new tests (one per endpoint).

**Frontend changes:**
- Create: `frontend/e2e/flows/grundschule-smoke.spec.ts`. The new E2E spec.
- Modify: `frontend/e2e/support/urls.ts`. Add `schoolClasses` and `schedule` URL constants (check first if they already exist).

**Docs:**
- Modify: `docs/superpowers/OPEN_THINGS.md`. Remove the last sprint step, update the sprint header to "shipped".

No new files beyond the spec.

---

## Task 1: Lift `TEACHER_ASSIGNMENTS` into the seed package

**Files:**
- Modify: `backend/src/klassenzeit_backend/seed/demo_grundschule.py` (append new symbols).
- Modify: `backend/tests/seed/test_demo_grundschule_solvability.py` (replace local copies with imports).

This is a behavior-preserving refactor. Pytest must be green before and after with the same assertions.

- [ ] **Step 1: Baseline green**

Run: `mise run test:py -- tests/seed/test_demo_grundschule_solvability.py -v`

Expected: one pass (`test_seeded_grundschule_solves_with_zero_violations`). Record the elapsed time for sanity comparison after the refactor.

- [ ] **Step 2: Append `TEACHER_ASSIGNMENTS` and the helper to `demo_grundschule.py`**

Add these imports at the top of `backend/src/klassenzeit_backend/seed/demo_grundschule.py` (merge with existing imports, alphabetical within `from` groups):

```python
from sqlalchemy import select, update

from klassenzeit_backend.db.models.lesson import Lesson
```

Append at the end of the file:

```python
TEACHER_ASSIGNMENTS: dict[tuple[str, str], str] = {
    ("1a", "D"): "MUE",
    ("1a", "M"): "MUE",
    ("1a", "SU"): "MUE",
    ("1a", "RE"): "BEC",
    ("1a", "KU"): "MUE",
    ("1a", "MU"): "BEC",
    ("1a", "SP"): "HOF",
    ("1a", "FÖ"): "BEC",
    ("2a", "D"): "SCH",
    ("2a", "M"): "SCH",
    ("2a", "SU"): "SCH",
    ("2a", "RE"): "BEC",
    ("2a", "KU"): "SCH",
    ("2a", "MU"): "BEC",
    ("2a", "SP"): "HOF",
    ("2a", "FÖ"): "BEC",
    ("3a", "D"): "WEB",
    ("3a", "M"): "WEB",
    ("3a", "SU"): "WEB",
    ("3a", "E"): "WEB",
    ("3a", "RE"): "BEC",
    ("3a", "KU"): "MUE",
    ("3a", "MU"): "BEC",
    ("3a", "SP"): "HOF",
    ("3a", "FÖ"): "HOF",
    ("4a", "D"): "FIS",
    ("4a", "M"): "FIS",
    ("4a", "SU"): "FIS",
    ("4a", "E"): "FIS",
    ("4a", "RE"): "BEC",
    ("4a", "KU"): "SCH",
    ("4a", "MU"): "BEC",
    ("4a", "SP"): "HOF",
    ("4a", "FÖ"): "HOF",
}
"""Valid greedy teacher assignment for the seeded Grundschule.

Each (class, subject) maps to one qualified teacher whose aggregate hours
stay within ``max_hours_per_week``. If the seed's teacher qualifications
or hour caps change, regenerate this mapping against the feasibility
analysis in ``docs/superpowers/specs/2026-04-24-grundschule-seed-design.md``.
"""


async def assign_teachers_for_demo_grundschule_lessons(session: AsyncSession) -> None:
    """Pin ``teacher_id`` on every seeded Lesson per ``TEACHER_ASSIGNMENTS``.

    The solver treats lessons with ``teacher_id IS NULL`` as absent from the
    problem (see ``scheduling/solver_io.py``). The production demo flow
    expects the user to assign teachers manually between ``generate-lessons``
    and ``POST /schedule``; this helper does the equivalent for tests and
    the test-only HTTP endpoint.

    The caller owns the transaction; this coroutine only mutates the session.
    """
    rows = (
        await session.execute(
            select(Lesson.id, SchoolClass.name, Subject.short_name)
            .join(SchoolClass, SchoolClass.id == Lesson.school_class_id)
            .join(Subject, Subject.id == Lesson.subject_id)
        )
    ).all()
    teacher_id_by_short_code = {
        row[0]: row[1]
        for row in (await session.execute(select(Teacher.short_code, Teacher.id))).all()
    }
    for lesson_id, class_name, subject_short in rows:
        short_code = TEACHER_ASSIGNMENTS[(class_name, subject_short)]
        teacher_id = teacher_id_by_short_code[short_code]
        await session.execute(
            update(Lesson).where(Lesson.id == lesson_id).values(teacher_id=teacher_id)
        )
```

(Note: `SchoolClass`, `Subject`, and `Teacher` are already imported at the top of the existing module. Only `Lesson` is new.)

- [ ] **Step 3: Replace local copies in the pytest test**

Edit `backend/tests/seed/test_demo_grundschule_solvability.py`:

1. Remove the `TEACHER_ASSIGNMENTS` constant (lines 35-70 of the current file) and the `_assign_teachers_for_demo_grundschule_lessons` function (lines 73-95).
2. Remove the now-unused imports `from sqlalchemy import select, update` if no other reference survives. Keep `from sqlalchemy import select` if other test code still uses it (the file does for the `select(SchoolClass)` call; verify by grep).
3. Remove `from klassenzeit_backend.db.models.lesson import Lesson` if no other reference survives; `from klassenzeit_backend.db.models.subject import Subject` has other use, keep it.
4. Update the import: `from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule, assign_teachers_for_demo_grundschule_lessons`.
5. Replace the call site on line 127 (`await _assign_teachers_for_demo_grundschule_lessons(db_session)`) with `await assign_teachers_for_demo_grundschule_lessons(db_session)`.

- [ ] **Step 4: Re-run the solvability test**

Run: `mise run test:py -- tests/seed/test_demo_grundschule_solvability.py -v`

Expected: one pass, same assertion output.

- [ ] **Step 5: Run the full backend suite**

Run: `mise run test:py`

Expected: green.

- [ ] **Step 6: Lint + typecheck**

Run: `mise run lint`

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/seed/demo_grundschule.py backend/tests/seed/test_demo_grundschule_solvability.py
git commit -m "$(cat <<'EOF'
refactor(backend): lift TEACHER_ASSIGNMENTS into seed package

Move the valid greedy teacher assignment map and its apply helper from
the pytest test file into the production seed module so both the
pytest test and the upcoming /__test__/assign-teachers-grundschule
endpoint share one source of truth.

Behavior-preserving: the solvability test still imports the same
symbols, just from the new location.
EOF
)"
```

---

## Task 2: Add `POST /__test__/seed-grundschule` endpoint

**Files:**
- Modify: `backend/src/klassenzeit_backend/testing/router.py` (append endpoint + import).
- Modify: `backend/tests/testing/test_router.py` (append one test).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/testing/test_router.py` (after `test_reset_preserves_users_and_sessions`):

```python
from sqlalchemy import func

from klassenzeit_backend.db.models import Room as _Room
from klassenzeit_backend.db.models import SchoolClass, Teacher


async def test_seed_grundschule_creates_expected_rows(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST /__test__/seed-grundschule seeds a Hessen Grundschule."""
    response = await client.post("/__test__/seed-grundschule")
    assert response.status_code == 204

    db_session.expire_all()

    class_count = (await db_session.execute(select(func.count()).select_from(SchoolClass))).scalar_one()
    teacher_count = (await db_session.execute(select(func.count()).select_from(Teacher))).scalar_one()
    room_count = (await db_session.execute(select(func.count()).select_from(_Room))).scalar_one()

    assert class_count == 4
    assert teacher_count == 6
    assert room_count == 7
```

(The `_Room` alias avoids shadowing any future imports and keeps the existing `Subject`-and-`User` top-level import list readable; the alias is local because `Room` is not currently imported in this file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test:py -- tests/testing/test_router.py::test_seed_grundschule_creates_expected_rows -v`

Expected: FAIL with a 404 on the POST (endpoint not yet defined).

- [ ] **Step 3: Implement the endpoint**

Edit `backend/src/klassenzeit_backend/testing/router.py`. Add this import alongside the existing imports:

```python
from klassenzeit_backend.seed.demo_grundschule import seed_demo_grundschule
```

Append this endpoint after `testing_reset`:

```python
@testing_router.post("/seed-grundschule", status_code=status.HTTP_204_NO_CONTENT)
async def testing_seed_grundschule(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Seed a Hessen Grundschule into the current session and commit.

    Returns 204 with no body. The caller (Playwright fixture) is expected
    to truncate first via ``/__test__/reset``; calling this endpoint
    twice without a reset in between will raise ``IntegrityError``.
    """
    await seed_demo_grundschule(session)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mise run test:py -- tests/testing/test_router.py::test_seed_grundschule_creates_expected_rows -v`

Expected: PASS.

- [ ] **Step 5: Run the full testing router file**

Run: `mise run test:py -- tests/testing/test_router.py -v`

Expected: all tests pass (health, reset, new seed).

- [ ] **Step 6: Lint**

Run: `mise run lint`

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/testing/router.py backend/tests/testing/test_router.py
git commit -m "$(cat <<'EOF'
feat(backend): add /__test__/seed-grundschule endpoint

Wraps seed_demo_grundschule for the Playwright E2E smoke flow.
Mount-gated on KZ_ENV=test via the existing testing/mount.py
conditional. Caller truncates via /__test__/reset first.
EOF
)"
```

---

## Task 3: Add `POST /__test__/assign-teachers-grundschule` endpoint

**Files:**
- Modify: `backend/src/klassenzeit_backend/testing/router.py` (append endpoint + import).
- Modify: `backend/tests/testing/test_router.py` (append one test).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/testing/test_router.py`:

```python
from klassenzeit_backend.db.models import Lesson


async def test_assign_teachers_grundschule_pins_every_lesson(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_user,
    login_as,
) -> None:
    """POST /__test__/assign-teachers-grundschule sets teacher_id on every Lesson.

    Requires lessons already generated; drives the full seed to
    generate-lessons to assign chain through the real API.
    """
    # Seed via the new endpoint (Task 2 already proves its correctness).
    seed_resp = await client.post("/__test__/seed-grundschule")
    assert seed_resp.status_code == 204

    # Need an admin user to call generate-lessons.
    await create_test_user(email="admin-assign@test.com", role="admin")
    await login_as("admin-assign@test.com", "testpassword123")

    # Generate lessons for all four classes so the assignment covers the full map.
    db_session.expire_all()
    class_rows = (
        (await db_session.execute(select(SchoolClass).order_by(SchoolClass.grade_level)))
        .scalars()
        .all()
    )
    for school_class in class_rows:
        gen_resp = await client.post(f"/api/classes/{school_class.id}/generate-lessons")
        assert gen_resp.status_code == 201, gen_resp.text

    assign_resp = await client.post("/__test__/assign-teachers-grundschule")
    assert assign_resp.status_code == 204

    db_session.expire_all()
    unassigned = (
        await db_session.execute(select(func.count()).select_from(Lesson).where(Lesson.teacher_id.is_(None)))
    ).scalar_one()
    assert unassigned == 0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test:py -- tests/testing/test_router.py::test_assign_teachers_grundschule_pins_every_lesson -v`

Expected: FAIL with 404 on the assign-teachers-grundschule POST.

- [ ] **Step 3: Implement the endpoint**

Edit `backend/src/klassenzeit_backend/testing/router.py`. Extend the existing seed import:

```python
from klassenzeit_backend.seed.demo_grundschule import (
    assign_teachers_for_demo_grundschule_lessons,
    seed_demo_grundschule,
)
```

Append after `testing_seed_grundschule`:

```python
@testing_router.post("/assign-teachers-grundschule", status_code=status.HTTP_204_NO_CONTENT)
async def testing_assign_teachers_grundschule(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    """Apply ``TEACHER_ASSIGNMENTS`` to every Lesson currently in the DB.

    Returns 204 with no body. No-op if no lessons exist. The caller is
    expected to have seeded via ``/__test__/seed-grundschule`` and called
    ``POST /api/classes/{id}/generate-lessons`` first.
    """
    await assign_teachers_for_demo_grundschule_lessons(session)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mise run test:py -- tests/testing/test_router.py::test_assign_teachers_grundschule_pins_every_lesson -v`

Expected: PASS.

- [ ] **Step 5: Run the full testing suite**

Run: `mise run test:py -- tests/testing/ -v`

Expected: all tests pass.

- [ ] **Step 6: Lint**

Run: `mise run lint`

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/klassenzeit_backend/testing/router.py backend/tests/testing/test_router.py
git commit -m "$(cat <<'EOF'
feat(backend): add /__test__/assign-teachers-grundschule endpoint

Applies the TEACHER_ASSIGNMENTS map from the seed package to every
Lesson in the current DB. Used by the Playwright E2E smoke flow after
generate-lessons and before POST /schedule, replacing 33 Radix-Select
UI clicks that would dominate test runtime.
EOF
)"
```

---

## Task 4: Add the Playwright smoke spec

**Files:**
- Modify: `frontend/e2e/support/urls.ts`. Add `schoolClasses` and `schedule`.
- Create: `frontend/e2e/flows/grundschule-smoke.spec.ts`.

- [ ] **Step 1: Extend the URLS helper**

Read `frontend/e2e/support/urls.ts`. Add entries if missing:

```typescript
export const URLS = {
  login: "/login",
  dashboard: "/",
  subjects: "/subjects",
  schoolClasses: "/school-classes",
  schedule: "/schedule",
} as const;
```

- [ ] **Step 2: Write the spec**

Create `frontend/e2e/flows/grundschule-smoke.spec.ts`:

```typescript
import { expect, test } from "../fixtures/test";
import { URLS } from "../support/urls";

const BACKEND_URL = "http://localhost:8000";

interface SchoolClassListRow {
  id: string;
  name: string;
}

test.describe("Grundschule smoke", () => {
  test("seed, generate lessons, assign teachers, generate schedule, grid renders", async ({
    page,
    request,
  }) => {
    // The resetBackend auto-fixture has already truncated before this test starts.
    const seedResp = await request.post(`${BACKEND_URL}/__test__/seed-grundschule`);
    expect(seedResp.ok(), await seedResp.text()).toBeTruthy();

    // Navigate to the school-classes page so the user can click "Generate lessons".
    await page.goto(URLS.dashboard);
    await page.getByRole("link", { name: "School classes", exact: true }).click();

    // The seeded classes should now appear in the table.
    const row1a = page.getByRole("row", { name: /1a/ });
    await expect(row1a).toBeVisible();

    // Click the "Generate lessons" button in the 1a row, confirm in the dialog.
    await row1a.getByRole("button", { name: "Generate lessons" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Generate lessons" })
      .click();

    // Wait for the success toast so the mutation has resolved.
    await expect(page.getByText(/lessons created/i).first()).toBeVisible();

    // Back-channel: assign teachers to all generated lessons in one call.
    const assignResp = await request.post(`${BACKEND_URL}/__test__/assign-teachers-grundschule`);
    expect(assignResp.ok(), await assignResp.text()).toBeTruthy();

    // Fetch the 1a class ID so we can deep-link the schedule page.
    const classesResp = await request.get(`${BACKEND_URL}/api/classes`);
    expect(classesResp.ok(), await classesResp.text()).toBeTruthy();
    const classes = (await classesResp.json()) as SchoolClassListRow[];
    const class1a = classes.find((c) => c.name === "1a");
    expect(class1a, "seeded class 1a is present").toBeDefined();

    await page.goto(`${URLS.schedule}?class=${class1a!.id}`);

    // The schedule page renders the empty state until the solver runs.
    await page.getByRole("button", { name: "Generate schedule" }).click();

    // The grid must render with at least one period cell showing Deutsch.
    await expect(page.locator(".kz-ws-grid")).toBeVisible();
    await expect(page.locator('[data-variant="period"]').first()).toBeVisible();
    await expect(page.locator('[data-variant="period"]').getByText("Deutsch").first()).toBeVisible();
  });
});
```

Notes for the implementing engineer:
- The "Generate lessons" button label appears both on the row action and in the confirm dialog. The first click opens the dialog; the second click inside `getByRole("dialog")` submits. Scope both carefully.
- The "lessons created" toast text comes from `schoolClasses.generateLessons.created` in `frontend/src/i18n/locales/en.json`. The actual copy is "Created {{count}} lessons.". The regex `/lessons created/i` will miss that (word order differs in English). Verify the exact copy in the locales file and adjust the matcher to `/created \d+ lessons/i` or use `getByText("Created", { exact: false })`. Fix before committing.
- The `schedule?class=<id>` deep-link bypasses the Radix Select class picker per spec Q11.
- Do not pin Playwright locale; Chromium defaults to `en-US`.

- [ ] **Step 3: Verify the toast copy**

Run: `grep -n "generateLessons\|lessons" frontend/src/i18n/locales/en.json | head`

Inspect the `schoolClasses.generateLessons.created` key. If it reads `"Created {{count}} lessons."`, change the regex in the spec to `/created\s+\d+\s+lessons/i`. If the key reads something else, use the exact copy. Commit only after the regex matches the rendered string.

- [ ] **Step 4: Run the spec**

Run: `mise run e2e -- -g "Grundschule smoke"`

Expected: PASS. If the test fails on the toast assertion, revisit Step 3 and fix the regex. If it fails on `.kz-ws-grid` being invisible, the schedule solver likely returned violations; check the backend log for the POST `/api/classes/{id}/schedule` response body.

- [ ] **Step 5: Run the full e2e suite to make sure nothing else broke**

Run: `mise run e2e`

Expected: all specs pass.

- [ ] **Step 6: Lint**

Run: `mise run lint`

Expected: green. Biome will flag any unused imports or `const` vs `let` issues; fix inline.

- [ ] **Step 7: Commit**

```bash
git add frontend/e2e/flows/grundschule-smoke.spec.ts frontend/e2e/support/urls.ts
git commit -m "$(cat <<'EOF'
test(frontend): add grundschule-smoke playwright spec

One end-to-end spec that drives the prototype demo flow: seed via the
new /__test__/seed-grundschule endpoint, click generate-lessons on
class 1a, assign teachers via /__test__/assign-teachers-grundschule,
click generate-schedule, assert the grid renders with a Deutsch cell.

Closes the remaining Prototype sprint step in OPEN_THINGS.md.
EOF
)"
```

---

## Task 5: Close out the sprint step in docs

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`.

- [ ] **Step 1: Rewrite the sprint section**

Open `docs/superpowers/OPEN_THINGS.md`, locate the "Prototype sprint" section. Replace:

```markdown
Steps 1 (PyO3 binding + `POST /api/classes/{id}/schedule` compute endpoint), 2 (placement persistence: `scheduled_lessons` table, per-class upsert on POST, `GET /api/classes/{id}/schedule`), 3 (frontend `/schedule` route with class picker, `kz-ws-grid` week grid, and Generate action), and 4 (`uv run klassenzeit-backend seed-grundschule` Typer command that creates an einzügige Hessen Grundschule demo, see [`docs/superpowers/specs/2026-04-24-grundschule-seed-design.md`](specs/2026-04-24-grundschule-seed-design.md)) shipped. Remaining step:

1. **E2E smoke test.** One Playwright spec that hits `/login`, invokes the seed via a `/__test__/seed-grundschule` endpoint that wraps `seed_demo_grundschule`, clicks through generate-lessons, assigns teachers for the generated lessons, generates the schedule, and asserts the grid renders. Teacher auto-assignment is out of scope for this step; see "Auto-assign teachers during generate-lessons" under "Acknowledged, not in scope this sprint".
```

with:

```markdown
All five sprint steps shipped: PyO3 binding + compute endpoint, placement persistence, frontend `/schedule` route, `seed-grundschule` Typer command, and the Playwright E2E smoke spec (`frontend/e2e/flows/grundschule-smoke.spec.ts`). The demo flow (log in, see the Grundschule, click Generate, see a timetable) is end-to-end covered by CI. Follow-ups are tracked under "Acknowledged, not in scope this sprint" and the topical Backlog sections below.
```

- [ ] **Step 2: Verify no dangling references to the removed step**

Run: `grep -n "E2E smoke test" docs/superpowers/OPEN_THINGS.md`

Expected: empty (no match). If any match remains, it is either a follow-up note in another section (leave it) or leftover copy (delete it).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/OPEN_THINGS.md
git commit -m "$(cat <<'EOF'
docs(superpowers): close out prototype sprint in OPEN_THINGS

All five sprint steps have shipped; the Playwright smoke spec landed
as the last one. Rewrite the sprint paragraph to reflect completion.
EOF
)"
```

---

## Self-review

**Spec coverage.** Every section of `docs/superpowers/specs/2026-04-24-e2e-grundschule-smoke-design.md` has at least one task:
- "Backend: refactor `TEACHER_ASSIGNMENTS`" → Task 1.
- "Backend: test-only endpoints" → Tasks 2 and 3.
- "Backend: pytest integration tests" → Tasks 2 (seed) and 3 (assign), both red-green.
- "Frontend: Playwright spec" + "Frontend: fixtures and URLs" → Task 4.
- "Docs" → Task 5.
- Commit split → each Task is one Conventional-Commits entry matching the spec's list.

**Placeholder scan.** Searched for TBD/TODO/"implement later"/"add appropriate"/"similar to Task". None present. Every step either shows exact code or an exact command.

**Type consistency.** Cross-task references all resolve:
- `TEACHER_ASSIGNMENTS` and `assign_teachers_for_demo_grundschule_lessons` defined in Task 1, used in Tasks 1, 3 (as imports).
- `/__test__/seed-grundschule` defined in Task 2, referenced in Task 3 (Step 1 test body) and Task 4 (spec body).
- `/__test__/assign-teachers-grundschule` defined in Task 3, referenced in Task 4.
- `URLS.schoolClasses` / `URLS.schedule` defined in Task 4 Step 1, referenced in Task 4 Step 2.
- No type or function-name drift between tasks.

**Ambiguity.** The Task 4 Step 3 "verify the toast copy" is an explicit gate before committing; the engineer reads the locale file and adjusts the regex inline. That is the single place the plan instructs reading-then-deciding rather than executing fixed code; it is clearly scoped.
