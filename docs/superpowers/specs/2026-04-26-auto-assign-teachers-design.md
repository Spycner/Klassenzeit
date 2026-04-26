# Auto-assign teachers during generate-lessons

**Date:** 2026-04-26
**Status:** Design approved (autopilot autonomous mode), plan pending.

## Problem

`POST /api/classes/{class_id}/generate-lessons` (`backend/src/klassenzeit_backend/scheduling/routes/lessons.py:243-304`) creates one `Lesson` per missing Stundentafel subject for the class, with `teacher_id=None`. The solver invariant from `backend/CLAUDE.md` (referencing `scheduling/solver_io.py:build_problem_json`) is that lessons with `teacher_id IS NULL` are filtered out of the solver problem entirely; without a teacher pinned, the solver returns zero placements with zero violations.

The Grundschule demo therefore needs an explicit "pin teachers" step between generate-lessons and `POST /schedule`. Production has no such step yet, so the smoke spec uses a back-channel: `frontend/e2e/flows/grundschule-smoke.spec.ts:41` posts to `/__test__/assign-teachers-grundschule`, a test-only endpoint backed by a hand-curated `TEACHER_ASSIGNMENTS` mapping in `backend/src/klassenzeit_backend/seed/demo_grundschule.py:263-298`. The solvability test `backend/tests/seed/test_demo_grundschule_solvability.py:58` does the same via direct helper call.

`docs/superpowers/OPEN_THINGS.md`'s active sprint > tidy phase > item 3 names the gap:

> **Auto-assign teachers during generate-lessons.** `[P1]` Extend `POST /api/classes/{id}/generate-lessons` to pick a qualified teacher per subject while respecting `max_hours_per_week`. Simple heuristic (first qualified teacher with spare capacity); becomes a richer pre-pass once FFD lands. Closes the back-channel-teacher gap surfaced by the Grundschule smoke spec so the demo drops one click. Production code path only; benchmark fixtures author teachers deliberately (see PR 6).

## Goal

Land one backend PR on branch `feat/auto-assign-teachers`. Five commits:

1. **Red test.** Integration test in `backend/tests/scheduling/test_lessons.py` asserts that `POST /api/classes/{id}/generate-lessons` returns lessons with non-null `teacher` when a qualified teacher with spare capacity exists.
2. **Helper + endpoint wiring (green).** New module `backend/src/klassenzeit_backend/scheduling/teacher_assignment.py` with one pure helper. Route loads the snapshot, calls the helper, applies assignments. One structured log line on success.
3. **Helper unit tests.** Per-helper coverage in `backend/tests/scheduling/test_teacher_assignment.py`: deterministic order, capacity overflow, no candidate leaves NULL, multiple lessons share a teacher up to cap, inactive teachers excluded, idempotency on re-run.
4. **Cleanup.** Drop `assign_teachers_for_demo_grundschule_lessons`, `TEACHER_ASSIGNMENTS`, the `/__test__/assign-teachers-grundschule` endpoint and its test, the solvability test's manual call, and the smoke spec's back-channel request.
5. **Docs.** Mark OPEN_THINGS item 3 ✅ shipped; add a follow-up note for "X teachers auto-assigned" toast polish.

## Non-goals

- **A dedicated `POST /api/classes/{id}/auto-assign-teachers` endpoint.** Would re-introduce a click in the demo flow that the goal exists to drop. If a re-assign-only entry point becomes useful later (a teacher leaves, capacity changes), file it as a follow-up with a real triggering use case.
- **Klassenlehrer-style or load-balanced heuristic.** First-qualified-by-short-code is an intentional placeholder. Sprint PR 7 (FFD ordering + `SolveConfig`) and PR 9 (LAHC + soft constraints) will replace this pre-pass with a richer ordering. Over-engineering now negotiates against that work.
- **Re-assignment of existing pinned lessons.** The endpoint's contract is "create what's missing". Don't extend that to "rebalance what's there". A user who wants a re-balance can delete the lessons and call generate-lessons again.
- **Sweeping null-teacher lessons that pre-existed.** Mildly tempting (it would heal a half-pinned class) but silently mutates state the user might have intentionally left blank. Out of scope.
- **Per-time-block availability.** `TeacherAvailability` is a slot-based status; capacity here is the weekly hour bucket on `Teacher.max_hours_per_week`. The solver still consumes per-slot availability separately.
- **A new ADR.** First-qualified-by-short-code is one paragraph of justification; it fits in the PR body. The decision is also explicitly time-bounded: sprint PR 7 supersedes it. ADRs are for load-bearing decisions; this is a placeholder.
- **Schema changes.** No new columns, no migration. `Lesson.teacher_id` is already nullable; `Teacher.max_hours_per_week` already exists.
- **Frontend changes.** The endpoint's response shape doesn't change. Existing UI already renders `teacher` when present. The "Generate lessons" toast copy stays.

## Design

### Helper module

New file `backend/src/klassenzeit_backend/scheduling/teacher_assignment.py`. One public function:

```python
def auto_assign_teachers_for_lessons(
    lessons: list[Lesson],
    teachers: list[Teacher],
    qualified_teacher_ids_by_subject: dict[uuid.UUID, set[uuid.UUID]],
    capacity_used_by_teacher: dict[uuid.UUID, int],
) -> dict[uuid.UUID, uuid.UUID]:
    """Assign one qualified teacher per lesson respecting weekly hour caps.

    Pure function: takes a fully-loaded snapshot, returns a mapping
    {lesson_id: teacher_id} for the lessons that received an assignment.
    Lessons with no eligible candidate are absent from the returned dict.

    Args:
        lessons: New lessons to assign. Order is significant (assignments
            run in this order, so list ordering controls priority on
            tight capacity).
        teachers: Active teachers, ordered by ``(short_code, id)``.
        qualified_teacher_ids_by_subject: For each lesson's subject_id,
            the set of teacher_ids qualified for that subject.
        capacity_used_by_teacher: Hours already committed per teacher
            across the whole school. Mutated locally; the caller's copy
            is unaffected.
    """
```

The function:

1. Copies `capacity_used_by_teacher` to a local dict so the caller's snapshot is not mutated.
2. Sorts `lessons` in ascending order of qualified-teacher count for the lesson's subject (`len(qualified_teacher_ids_by_subject.get(lesson.subject_id, set()))`), with input order as the stable tiebreak. This scarcity-first ordering ensures subjects with a single qualified teacher claim that teacher's capacity before broader subjects fill it greedily.
3. For each `lesson` in the sorted order:
   1. Look up `qualified = qualified_teacher_ids_by_subject.get(lesson.subject_id, set())`.
   2. Walk `teachers` in order. For the first `teacher` where `teacher.id in qualified` and `(teacher.max_hours_per_week - capacity_used_by_teacher[teacher.id]) >= lesson.hours_per_week`:
      - Record `assignments[lesson.id] = teacher.id`.
      - Increment `capacity_used_by_teacher[teacher.id]` by `lesson.hours_per_week`.
      - Stop scanning teachers for this lesson.
   3. If no teacher matches, the lesson is left unassigned (absent from `assignments`).
4. Return `assignments`.

The function is deterministic given a fixed input ordering. It does not perform I/O, does not raise on missing teachers, and does not touch `Lesson.teacher_id` directly; that is the caller's responsibility.

Why scarcity-first instead of pure input-order: the route's lesson list comes from `select(StundentafelEntry).order_by(StundentafelEntry.subject_id)`, which is deterministic for a fixed DB state but the subject UUIDs are random across runs and across schools. A pure input-order walk would let a subject with many qualified teachers (say `D` with four candidates) consume the only teacher qualified for a single-candidate subject (say `RE` with one) before the single-candidate lesson is processed. On the seeded Grundschule that surfaces as a non-deterministic failure: BEC is the sole RE/MU teacher and shares FÖ with HOF; if FÖ is iterated before RE/MU, BEC's 18h cap fills with FÖ greedily and RE/MU classes lose their only candidate. Scarcity-first removes the dependency on subject UUID order. Sprint PR 7 (FFD ordering) replaces the heuristic wholesale; this is the placeholder version of the same idea.

### Route wiring

`generate_lessons_from_stundentafel` in `backend/src/klassenzeit_backend/scheduling/routes/lessons.py` is extended in three places:

1. After creating the new `Lesson` rows (existing code, the `for entry in entries: ... db.add(lesson)` loop) and `await db.flush()`, load the teacher snapshot:

   ```python
   teachers_result = await db.execute(
       select(Teacher).where(Teacher.is_active.is_(True)).order_by(Teacher.short_code, Teacher.id)
   )
   teachers = list(teachers_result.scalars().all())
   ```

2. Build the qualification map and the capacity-used map in two queries:

   ```python
   quals_result = await db.execute(select(TeacherQualification.subject_id, TeacherQualification.teacher_id))
   qualified_teacher_ids_by_subject: dict[uuid.UUID, set[uuid.UUID]] = {}
   for subject_id, teacher_id in quals_result.all():
       qualified_teacher_ids_by_subject.setdefault(subject_id, set()).add(teacher_id)

   used_result = await db.execute(
       select(Lesson.teacher_id, func.sum(Lesson.hours_per_week))
       .where(Lesson.teacher_id.is_not(None))
       .group_by(Lesson.teacher_id)
   )
   capacity_used_by_teacher: dict[uuid.UUID, int] = {row[0]: int(row[1] or 0) for row in used_result.all()}
   for teacher in teachers:
       capacity_used_by_teacher.setdefault(teacher.id, 0)
   ```

3. Call the helper, apply the assignments to the new lessons in memory, then commit:

   ```python
   assignments = auto_assign_teachers_for_lessons(
       lessons=created,
       teachers=teachers,
       qualified_teacher_ids_by_subject=qualified_teacher_ids_by_subject,
       capacity_used_by_teacher=capacity_used_by_teacher,
   )
   for lesson in created:
       teacher_id = assignments.get(lesson.id)
       if teacher_id is not None:
           lesson.teacher_id = teacher_id
   ```

The existing `await db.commit()` at the bottom of the route persists both the lesson creation and the teacher assignment in one transaction. The existing `_build_lesson_response` call already populates the `teacher` field when `teacher_id` is non-null.

### Logging

One structured info log on the success path, mirroring `solver.solve.done`:

```python
logger = logging.getLogger(__name__)
...
logger.info(
    "generate_lessons.done",
    extra={
        "school_class_id": str(class_id),
        "lessons_created": len(created),
        "teachers_assigned": len(assignments),
    },
)
```

The log fires after `db.commit()` so the line reflects persisted state. Discrepancies between `lessons_created` and `teachers_assigned` are the production signal that the heuristic could not pin every lesson, a useful tripwire for under-provisioned schools.

### Error handling

- No new error path. The helper never raises; the route never raises a new HTTP error from the heuristic.
- An empty `teachers` list (no active teachers in the school) yields an empty assignment map; every lesson stays NULL. Same outcome as today's behavior.
- A subject with no qualified teachers produces no assignment for that lesson. Same outcome as today's behavior.
- The function does not need a transaction lock; concurrent generate-lessons calls for two different classes can race, and last-writer-wins is acceptable. Concurrency hardening for the per-class case is already deferred under "Acknowledged deferrals" in OPEN_THINGS.

### Tests

#### Helper unit tests: `backend/tests/scheduling/test_teacher_assignment.py`

A new test file. The helper is pure, so tests construct lightweight ORM instances (no DB session) and assert on the returned dict.

Cases:

1. **Happy path.** One lesson, one qualified teacher with spare capacity. Assignment lands.
2. **Deterministic order across short_codes.** Two qualified teachers tied on capacity; the one with the lexicographically earlier `short_code` wins.
3. **Stable tiebreak on id.** Two qualified teachers with identical `short_code` (constructed for the test, not realistic). The helper picks the lower `id`.
4. **Capacity overflow forces fallback.** First qualified teacher has 2h spare, lesson needs 3h; helper falls through to the next qualified teacher.
5. **No qualified teacher.** Subject has no qualified teachers; lesson is absent from the returned map.
6. **No spare capacity anywhere.** All qualified teachers are at cap; lesson is absent.
7. **Inactive teachers excluded.** An inactive teacher who would otherwise be picked is not in the input list (the route filters before calling the helper); the test mirrors that contract.
8. **Multiple lessons share a teacher up to cap.** Three lessons of 5h each; one teacher with cap 28h, used 0h. All three land on the same teacher (used grows 5 → 10 → 15).
9. **In-flight capacity tracking.** Same teacher, three lessons of 10h each, cap 25, used 0. First two land; third lesson exceeds remaining 5h and is unassigned.
10. **Pre-existing capacity counts.** Teacher cap 28, `capacity_used_by_teacher={teacher.id: 26}`. A 3h lesson skips this teacher (only 2h spare); a 2h lesson lands.
11. **Caller's snapshot is not mutated.** Pass a frozen-style copy in; assert it equals the pre-call snapshot after the helper returns.

#### Endpoint integration tests: `backend/tests/scheduling/test_lessons.py`

Add three tests near the existing `test_generate_lessons_*` suite:

- `test_generate_lessons_assigns_qualified_teacher`: one class, one Stundentafel entry, one qualified teacher with spare capacity. The response's lesson has `teacher` populated with the right id.
- `test_generate_lessons_leaves_teacher_null_when_no_qualified_teacher`: one class with a Stundentafel entry whose subject has no qualified teachers in the school. The response's lesson has `teacher: null`. Status 201.
- `test_generate_lessons_respects_existing_teacher_capacity`: pre-create one Lesson (different class) for a teacher up to cap minus 1h, then generate-lessons with a 2h lesson for that subject. Assert the route picks a different qualified teacher.

The existing `test_generate_lessons_from_stundentafel` and `test_generate_lessons_skips_existing` tests stay; their assertions about `len(body)` and `subject_ids` are unaffected by the new `teacher` field.

#### Solvability test: `backend/tests/seed/test_demo_grundschule_solvability.py`

Drop the `assign_teachers_for_demo_grundschule_lessons` import and call. Add an assertion after the four `generate-lessons` calls that no lesson in the DB has `teacher_id IS NULL`:

```python
unassigned_count = (
    await db_session.execute(
        select(func.count()).select_from(Lesson).where(Lesson.teacher_id.is_(None))
    )
).scalar_one()
assert unassigned_count == 0, "auto-assign left some lessons unassigned"
```

The scarcity-first heuristic covers every Grundschule seed lesson (single-qual subjects RE/MU/SP claim BEC and HOF first; broader subjects fall through to the four classroom teachers). The assertion is the empirical guard for any future seed change that trims caps or qualifications below feasibility.

#### Smoke spec: `frontend/e2e/flows/grundschule-smoke.spec.ts`

Delete the back-channel block:

```ts
// REMOVED:
const assignResp = await request.post(`${BACKEND_URL}/__test__/assign-teachers-grundschule`);
expect(assignResp.ok(), await assignResp.text()).toBeTruthy();
```

The existing post-condition (`Deutsch` shows up in 1a's grid after `Generate schedule`) is robust to any valid teacher assignment; the auto-assign result will produce a different but equally valid solver input. No other changes to the spec.

### Cleanup deletions

After commit 4:

- `backend/src/klassenzeit_backend/seed/demo_grundschule.py`: delete `TEACHER_ASSIGNMENTS` (lines 263-305) and `assign_teachers_for_demo_grundschule_lessons` (lines 308-335). Drop the `update`-import that is now unused.
- `backend/src/klassenzeit_backend/testing/router.py`: delete the `/__test__/assign-teachers-grundschule` route (lines 67-79) and its `assign_teachers_for_demo_grundschule_lessons` import.
- `backend/tests/testing/test_router.py`: delete the test that drove the deleted endpoint.
- `backend/tests/seed/test_demo_grundschule_solvability.py`: drop the `assign_teachers_for_demo_grundschule_lessons` import and the `await assign_teachers_for_demo_grundschule_lessons(db_session)` line.
- `frontend/e2e/flows/grundschule-smoke.spec.ts`: drop the back-channel `request.post` block.

`vulture` is the safety net: any leftover symbol becomes a lint failure on commit 4's pre-push run.

### Behavior preservation

The endpoint's response shape stays `list[LessonResponse]`; the only observable change is that the `teacher` field is populated when an assignment was found. Existing tests that assert on `len(body)` or `subject_ids` pass unmodified.

The Grundschule demo smoke flow now needs zero back-channel calls between seed and `Generate schedule`. The solver still receives a fully-pinned problem because every lesson in the seed has a qualified teacher with spare capacity (per the hand-checked walk).

## Implementation order

Branch: `feat/auto-assign-teachers`. Five commits.

1. `test(backend): red test for teacher auto-assignment in generate-lessons`. One integration test asserting non-null `teacher` on a generated lesson when a qualified teacher exists. Test fails (route still returns NULL teacher).
2. `feat(backend): auto-assign qualified teacher in generate-lessons`. New `scheduling/teacher_assignment.py` helper plus the route changes (snapshot loading, helper call, structured log line). Greens commit 1's test.
3. `test(backend): unit tests for auto_assign_teachers_for_lessons`. Eleven helper-level cases.
4. `refactor(backend): drop back-channel teacher-assignment helper, route, and dict`. Five deletions listed above. `vulture` clean.
5. `docs: mark OPEN_THINGS auto-assign-teachers shipped, file toast follow-up`. Single edit to `docs/superpowers/OPEN_THINGS.md`. No README, no overview.md, no ADR.

Each commit is lint-clean and test-clean on its own. The pre-push hook runs the full suite; broken commits never reach origin.

## Risks

- **Heuristic differs from `TEACHER_ASSIGNMENTS`.** The solver produces a different (but valid) Grundschule schedule. Mitigation: the smoke spec asserts only "Deutsch in 1a's grid", which is robust. The solvability test asserts "zero NULLs after generate-lessons" plus "zero violations from `POST /schedule`", which captures correctness without pinning the exact distribution.
- **Future seed change leaves NULLs.** If a contributor later trims a teacher's qualifications or caps such that the heuristic can no longer cover the seed's lesson-hours, the solvability test fails. This is intentional: the test should fail when the seed becomes infeasible under the production heuristic. The failure is the right tripwire.
- **`vulture` flags leftover symbols.** Mitigated by commit 4 making the deletions atomic. If a symbol is missed, the pre-push catches it.
- **Pre-commit `ty check` and the red-test starting state.** `backend/CLAUDE.md` notes `ty` blocks a "red test that imports a not-yet-created module" pattern (`unresolved-import` gate, no per-file carve-outs). Mitigation: commit 1 imports nothing new; it asserts on the existing endpoint's response shape, which is the simplest red. Commit 2 introduces the new module; the test goes green in the same commit.
- **Concurrency.** Two simultaneous generate-lessons calls for two different classes both compute spare capacity from the same snapshot, both assign the same teacher beyond cap. Mitigation: out of scope. The class-level concurrency hardening is already deferred in OPEN_THINGS' "Acknowledged deferrals" (advisory lock note).

## Follow-ups (not this PR)

- **Toast polish.** "X teachers auto-assigned" copy on the existing "Generate lessons" success toast. Adds clarity but needs an i18n key in en/de and a count from the response. File under OPEN_THINGS' product-capabilities section.
- **Re-assign-only endpoint.** A dedicated `POST /api/classes/{id}/auto-assign-teachers` for the case where a user later deletes / re-creates lessons or wants to re-balance. File only when a real workflow demands it.
- **Klassenlehrer preference.** Sprint PR 7 (FFD ordering) is the natural place to add a soft preference for a teacher already assigned to other lessons in this class. The first-qualified placeholder is replaced wholesale at that point.
- **Concurrency hardening.** The advisory lock + per-class isolation noted in OPEN_THINGS' "Acknowledged deferrals" applies here too. Add when a real demo-traffic incident surfaces.
- **Per-time-block hour caps.** `TeacherAvailability` could be consulted for slot-level eligibility during this pre-pass. Today the solver does that work; pushing it into the assignment heuristic is an optimization filed under sprint PR 9 (LAHC + soft constraints).
