# Many-to-many Lesson ↔ SchoolClass + lesson_group_id + dreizügige seed

**Sprint:** Realer Schulalltag + better scheduler (data + schema phase, P0).

**Closes (in `docs/superpowers/OPEN_THINGS.md`):** items 2, 3, 4.

**ADR:** [0021: many-to-many lesson school classes](../../adr/0021-multi-class-lessons.md) — added in this PR.

## Goal

Replace `Lesson.school_class_id` (single FK) with a `lesson_school_classes` join table so a single Lesson can serve multiple Klassen at once. Add an optional `lesson_group_id` column for co-placed lesson groups. Land a dreizügige Grundschule seed (12 classes) that exercises the parallel-Religion pattern: each Jahrgang has three multi-class lessons (kath / ev / Ethik) sharing one `lesson_group_id`. The lesson-group co-placement constraint and the new `LessonGroupSplit` violation kind are deferred to the algorithm-phase PR; this PR generalises the existing per-class hard constraint (no class double-booked at the same time-block) so a multi-class lesson blocks every class in its set.

## Non-goals

- Lesson-group co-placement constraint in the solver. Deferred to the algorithm-phase PR.
- `ViolationKind::LessonGroupSplit` enum variant. Lands with the constraint that emits it.
- Frontend UI for `lesson_group_id`. Backend persists it; admin does not see or edit it. Filed under follow-ups.
- LAHC Change move handling for cross-class or grouped lessons. The existing block-skip guard stays; cross-class single-block lessons are eligible for the move because the existing per-class hard-constraint generalises naturally.
- Cross-Jahrgang Religion groups (1+2 share one Religion group). Per-Jahrgang only. Filed under acknowledged deferrals.

## Architecture changes

### Database

New table `lesson_school_classes` with composite PK `(lesson_id, school_class_id)`, both columns FK with `ON DELETE CASCADE`. No surrogate UUID PK; the composite suffices because no row metadata is stored.

`lessons` table changes:
- Drop column `school_class_id`.
- Drop unique constraint `(school_class_id, subject_id)`.
- Add column `lesson_group_id: UUID NULL`, indexed for the future solver join.

Migration backfills every existing Lesson with one row in `lesson_school_classes` (its current `school_class_id`) before dropping the column. The migration is non-reversible without data loss because the multi-class topology is not encodable in a single FK; `downgrade()` raises a `NotImplementedError`-style assertion. This is acceptable for a prototype with one auto-deployed staging environment and no public schema.

### ORM model

New `LessonSchoolClass` association object in `db/models/lesson_school_class.py`:

```python
class LessonSchoolClass(Base):
    __tablename__ = "lesson_school_classes"
    lesson_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True)
    school_class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("school_classes.id", ondelete="CASCADE"), primary_key=True)
```

`Lesson` model changes:
- Remove `school_class_id` column.
- Remove `__table_args__ = (UniqueConstraint("school_class_id", "subject_id"),)`.
- Add `lesson_group_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)`.

The class membership is queried explicitly via `select(LessonSchoolClass).where(LessonSchoolClass.lesson_id.in_(lesson_ids))` in `build_problem_json` and the route response builder. We do not declare a SQLAlchemy `relationship()` for this initially; the few callers each issue an explicit batched query and walk a `dict[lesson_id, list[class_id]]`. This matches the rest of the codebase, which avoids lazy-load magic (`backend/CLAUDE.md` "explicit beats lazy" rationale).

### Pydantic / API

`LessonCreate`:
- `school_class_id: uuid.UUID` becomes `school_class_ids: list[uuid.UUID] = Field(min_length=1)`. A `model_validator` rejects duplicate IDs in the input list. Field validators on `LessonCreate` carry the schema-prefixed name pattern (`_lesson_school_class_ids_unique`) per the unique-function-names rule.

`LessonUpdate`:
- Adds an optional `school_class_ids: list[uuid.UUID] | None = Field(default=None, min_length=1)` so admins can edit the membership without recreating the lesson.

`LessonResponse`:
- `school_class: LessonClassResponse` becomes `school_classes: list[LessonClassResponse]` (sorted by `name` for stable test assertions).
- `lesson_group_id: uuid.UUID | None` is added.

`POST /api/lessons` creates the Lesson and the membership rows in one transaction. The dropped `(school_class_id, subject_id)` UNIQUE is replaced by a route-level pre-insert check: any existing Lesson whose `school_class_ids` intersects the input AND `subject_id` matches → 409. The check runs as one SQL query; emits the existing `409` error so the frontend's existing handler keeps working.

`PATCH /api/lessons/{id}` accepts `school_class_ids`; replaces the membership rows in one transaction (`DELETE WHERE lesson_id = :id; INSERT ...`).

`DELETE /api/lessons/{id}` cascades via the FK.

`GET /api/lessons?class_id=:uuid` filter semantics widen: returns lessons whose `school_class_ids` contain the input class. Implementation: `select(Lesson).join(LessonSchoolClass).where(LessonSchoolClass.school_class_id == class_id)`. Existing single-class consumers see no behaviour change.

`solver_io.py` updates symmetrically. `class_lesson_ids` (the per-class filter passed into `filter_solution_for_class`) flips from `lesson.school_class_id == requested_class.id` to "lessons whose membership rows include the requested class". `involved_class_ids` (used to load classes for the cross-week-scheme check) flips from `{lesson.school_class_id for lesson in lessons}` to a set comprehension over the eagerly-loaded membership map. The Pydantic `LessonResponse` builder loads its `school_classes` list from the same map.

### Solver wire format

`solver-core::types::Lesson`:
- `school_class_id: SchoolClassId` becomes `school_class_ids: Vec<SchoolClassId>`.
- New `lesson_group_id: Option<Uuid>` (uses `crate::ids::LessonGroupId` newtype mirroring the existing `LessonId` / `RoomId` pattern; ADR locks the wrapping decision).

`validate_structural` adds: every Lesson's `school_class_ids` is non-empty, every `class_id` resolves into the `school_classes` set, and the Vec contains no duplicates. Failure → `Err(Error::Input(...))`.

The greedy `try_place_block` blocking check changes:

```rust
// before
if state.used_teacher.contains(&(teacher, tb.id))
    || state.used_class.contains(&(class, tb.id))
    || idx.teacher_blocked(teacher, tb.id)
{ continue 'outer; }

// after
if state.used_teacher.contains(&(teacher, tb.id))
    || lesson.school_class_ids.iter().any(|c| state.used_class.contains(&(*c, tb.id)))
    || idx.teacher_blocked(teacher, tb.id)
{ continue 'outer; }
```

Symmetric change at placement time: insert one `(class_id, tb.id)` per class in `school_class_ids` into `state.used_class`, and update `state.class_positions` for each class.

The class-gap soft-score scoring partition is per-`(class_id, day_of_week)`; for a multi-class lesson placed once, each member class gets the same hour added to its day-partition. The score delta for the placement sums over each class's contribution. This is consistent with single-class behaviour (Vec of length 1 → one contribution).

LAHC's Change move generalises the same way. Block-placement skip stays unchanged. The RNG-budget invariant holds (still two `random_range` calls per iteration).

### Solver-py

No public surface change. Pass-through. The hand-maintained `.pyi` stub at `solver/solver-py/python/klassenzeit_solver/__init__.pyi` is unchanged because it types the JSON-blob signatures, not the inner Lesson shape.

### Frontend

`frontend/src/features/lessons/schema.ts`:

```typescript
export const LessonFormSchema = z.object({
  school_class_ids: z.array(z.string().min(1)).min(1, "lessons.form.errors.classesRequired"),
  subject_id: z.string().min(1, "Subject is required"),
  teacher_id: z.string().min(1, "Teacher is required"),
  hours_per_week: z.number().int().min(1, "Hours must be at least 1"),
  preferred_block_size: z.number().int().min(1).max(2),
});
```

`frontend/src/features/lessons/lessons-dialogs.tsx`:
- Replace the single `Select` for `school_class_id` with a stacked checkbox list inside the dialog. Use shadcn `Checkbox` primitives wrapped in `FormField` with a custom controller. Vertical scroll on the list (max-height clamp) so 12+ classes don't blow up the dialog.
- Wire `defaultValues.school_class_ids` from `lesson?.school_classes.map(c => c.id) ?? []`.

`frontend/src/features/lessons/lessons-page.tsx`:
- The class-name table cell renders `lesson.school_classes.map(c => c.name).join(", ")`.

`frontend/src/i18n/locales/{en,de}.json`:
- New keys `lessons.form.classes` (label), `lessons.form.classesRequired` (validation), `lessons.columns.classes` (table header singular form already covers the multi case in en; de needs `Klassen` instead of `Klasse`).

Frontend types regenerate via `mise run fe:types` once the backend lands.

### Demo seed: dreizügige Grundschule

New module `backend/src/klassenzeit_backend/seed/demo_grundschule_dreizuegig.py`. Reuses `_PERIODS`, `_DAYS_MON_TO_FRI`, `_KLASSENRAUM_SUITABLE_SUBJECTS`, the `_RoomSpec` / `_TeacherSpec` / `_SchoolClassSpec` types from `demo_grundschule.py` per the documented cross-module pattern.

**Subject changes (cross-cutting all three seeds, applied in one commit before the dreizuegig seed lands):**

- The current `_SUBJECTS` entry `_SubjectSpec("Religion / Ethik", "RE", "chart-4")` is replaced by three entries:
    - `_SubjectSpec("Religion (kath.)", "RK", "chart-4")`
    - `_SubjectSpec("Religion (ev.)", "RE", "chart-4")`
    - `_SubjectSpec("Ethik", "ETH", "chart-4")`
- `_GRADE_1_2_HOURS` and `_GRADE_3_4_HOURS` drop the combined `"RE": 2` row and add `"ETH": 2` (the einzuegig and zweizuegig demos give every class Ethik because all three Religion-subjects map equivalently in single-Zug schools without parallel groups).
- `_KLASSENRAUM_SUITABLE_SUBJECTS` adds `"RK"`, `"RE"`, `"ETH"` (Religionsraum is optional; Klassenräume host Religion in real Hessen Grundschule).
- Teacher quals in `_TEACHERS` (einzuegig) and `_TEACHERS_ZWEIZUEGIG` updated: anyone qualified for the old `RE` is now qualified for one or more of `RK`, `RE`, `ETH` (Eva Becker covers RE+ETH, etc.). Authoritative mapping is in the seed file.

**Dreizügige-specific data:**

- 12 classes: `1a/1b/1c, 2a/2b/2c, 3a/3b/3c, 4a/4b/4c`.
- Two-Zug teachers grow to 18 (six per Jahrgang, two Religion teachers per Jahrgang covering kath/ev/Ethik plus Sport / Förder).
- Rooms: 12 Klassenräume + 1 Turnhalle + 1 Sportplatz + 1 Musikraum + 1 Kunstraum + 1 Religionsraum = 17 rooms. (Estimate; revisit if greedy fails to place. The Religionsraum is optional via `_KLASSENRAUM_SUITABLE_SUBJECTS`.)
- Three multi-class Religion lessons per Jahrgang, each spanning the three Klassen of that grade (e.g. Jahrgang 1: RK across 1a+1b+1c, RE across 1a+1b+1c, ETH across 1a+1b+1c). All three share one `lesson_group_id` per Jahrgang. `hours_per_week=2`, `preferred_block_size=1`.
- `_TEACHER_ASSIGNMENTS_DREIZUEGIG: dict[tuple[str, str], str]` pins teacher allocation. Plus a parallel `_RELIGION_LESSONS_DREIZUEGIG` data structure that the seed coroutine consumes to insert the multi-class lessons directly (bypasses Stundentafel because Religion is no longer in the Stundentafel for this seed).

The seed coroutine flow:
1. WeekScheme + TimeBlocks (identical pattern to einzuegig).
2. Subjects (the new RK/RE/ETH split shared with the others).
3. Stundentafel + StundentafelEntry (without Religion rows).
4. SchoolClass × 12.
5. Teacher × 18 + TeacherQualification rows (using the new RK/RE/ETH quals).
6. Room × 17 + RoomSubjectSuitability rows.
7. **Insert three Religion Lessons per Jahrgang directly:** for each Jahrgang, generate one `lesson_group_id` UUID; insert three `Lesson(subject_id, teacher_id, hours_per_week=2, preferred_block_size=1, lesson_group_id=group_uuid)` rows; for each Lesson, insert three `LessonSchoolClass` rows (one per Klasse in the Jahrgang).

The Stundentafel-driven `generate-lessons` route call (issued by the solvability test) produces the non-Religion lessons. The cross-class Religion lessons are pre-seeded.

### Bench fixture

New `dreizuegig_fixture()` in `solver/solver-core/benches/solver_fixtures.rs`. Mirrors the Python's class / teacher / subject layout. Uses the `_TEACHER_ASSIGNMENTS_DREIZUEGIG` table copied as a Rust `&[(class_idx, subject_idx, teacher_idx)]` slice to keep the Lesson-to-teacher map deterministic across both sides.

The cross-class Religion lessons are appended at the end of the `lessons` Vec with `school_class_ids` containing three SchoolClassIds and `lesson_group_id: Some(group_uuid)`. The fixture computes lesson count and asserts `assert_eq!(lessons.len(), N)` against a literal.

`mise run bench:record` refreshes BASELINE.md to add a `dreizuegig` row plus refreshed `grundschule` and `zweizuegig` rows. The 20% regression budget applies to `grundschule` and `zweizuegig`; `dreizuegig` is new and seeds the new baseline.

## Tests added

- **`solver-core` unit tests** in `solve.rs::tests`:
    - `multi_class_lesson_blocks_each_class_independently`: build a Problem with one Lesson serving two classes; place; verify both classes' partitions get the placement and a second Lesson for one of those classes cannot use the same time-block.
    - `validate_structural_rejects_empty_school_class_ids`.
    - `validate_structural_rejects_unknown_school_class_id_in_set`.
    - `validate_structural_rejects_duplicate_school_class_ids`.
- **`solver-core` deserialisation tests** in `types.rs::tests`:
    - `lesson_accepts_school_class_ids_with_one_element`.
    - `lesson_accepts_school_class_ids_with_three_elements`.
    - `lesson_round_trips_lesson_group_id_when_present_and_when_none`.
- **Backend unit / route tests** in `backend/tests/scheduling/`:
    - `test_lesson_create_requires_non_empty_school_class_ids`.
    - `test_lesson_create_rejects_duplicate_school_class_ids`.
    - `test_lesson_create_409_when_subject_overlaps_with_existing_class_membership`.
    - `test_lesson_patch_replaces_school_class_membership`.
    - `test_lesson_get_returns_school_classes_array_sorted_by_name`.
    - `test_list_lessons_filters_by_class_id_returns_multi_class_lessons_when_class_member`.
- **Backend solvability test** in `backend/tests/seed/test_demo_grundschule_dreizuegig_solvability.py`: end-to-end seed → generate-lessons-per-class → POST /schedule, asserts violations are zero on the cross-class Religion lessons.
- **Backend Pydantic tests** in `backend/tests/scheduling/test_solver_io.py`:
    - `test_build_problem_json_emits_school_class_ids_array_for_multi_class_lesson`.
- **Frontend Vitest** in `frontend/src/features/lessons/lessons-dialogs.test.tsx`:
    - `test renders checkbox list with all classes from useSchoolClasses`.
    - `test rejects submit with no class selected`.
    - `test seeds checkbox state from existing lesson.school_classes`.
- **Frontend Vitest** in `frontend/src/features/lessons/lessons-page.test.tsx`:
    - `test renders comma-joined class names for multi-class lesson row`.

No Playwright spec changes: the einzuegig grundschule-smoke flow keeps working unchanged because each einzuegig Lesson has exactly one class and the wire shape is `school_class_ids: [single_uuid]`.

## Commit split

Each commit is independently green, follows TDD, and runs in its own subagent.

1. **`feat(solver-core): generalise hard-constraint to multi-class lessons + lesson_group_id`.** Field rename, validate_structural changes, try_place_block / lahc.rs class-blocking generalisation, all unit tests above. No bench or seed yet.
2. **`feat(solver-py): solver-py round-trips multi-class school_class_ids and lesson_group_id`.** Tiny: a regression test that serialises a multi-class Problem JSON, calls `solve_json_with_config(json, None)`, checks the response. The binding itself doesn't change (it's a JSON pass-through), but the test pins the wire format.
3. **`feat(backend): lesson_school_classes join + lesson_group_id col + multi-class routes / Pydantic / solver_io`.** Bundles the schema migration, ORM model, route handlers, response builders, `build_problem_json` change, `LessonCreate` / `LessonResponse` updates. Bundling because the schema and the route flip together: a stand-alone schema-only commit would leave the route layer compile-broken, and the TDD red-test-with-missing-module workaround from `backend/CLAUDE.md` (stub modules raising `NotImplementedError`) does not extend cleanly to "drop a column and rewrite five route handlers in the same step".
4. **`feat(frontend): multi-class checkbox group in lesson form + Zod + i18n + types regen`.** Only after commit 3 because `mise run fe:types` reads from the live FastAPI app.
5. **`feat(seed): replace combined RE subject with RK/RE/ETH trio across all three seeds`.** The cross-cutting subject change. Updates `demo_grundschule.py`, `demo_grundschule_zweizuegig.py`, their solvability tests, and the existing `_TEACHER_ASSIGNMENTS_*` dicts. Also updates the bench fixture's grundschule and zweizuegig stubs accordingly.
6. **`feat(seed): dreizuegige Grundschule seed with Religion trio + lesson_group_id`.** New seed module + new solvability test + CLI Typer command if there is one (verify; if not, skip).
7. **`feat(bench): add dreizuegige fixture + refresh BASELINE.md`.** Bench fixture mirror + `mise run bench:record` output.
8. **`docs: ADR 0021: many-to-many lesson school classes`.** Last commit; doc-only.

## Risks and mitigations

- **The greedy fails to place the dreizügige cross-class Religion lessons** because three classes don't share enough free slots. Mitigation: the seed iterates room counts and teacher capacity until the solvability test passes. Trial-and-error inside one PR is acceptable for a synthetic fixture; we'd file a real product blocker if the same pattern appeared in customer data.
- **Bench regresses on `grundschule` or `zweizuegig` by more than 20%.** Cause would be a bad implementation of `school_class_ids.iter().any(...)` or an accidental allocation in the hot path. Mitigation: profile if BASELINE.md drifts; the most likely fix is replacing the `Vec<SchoolClassId>` with a `SmallVec<[SchoolClassId; 1]>` because >99% of lessons are single-class. This is filed as a contingency, not a promise; first measure, then optimise.
- **Migration backfill fails on staging.** The staging DB has the einzuegig demo seeded plus whatever the test runs added. Mitigation: the migration's data step inserts one row per existing Lesson before dropping the column; staging's post-deploy `__test__/reset` endpoint clears state before the next deploy. If the migration fails, manually re-run after wiping with `db:reset`.
- **The `lesson_group_id` column is unused by the solver in this PR.** Solver wire format includes it, validate_structural accepts it, but no constraint emits a violation around it yet. Risk: a confused reviewer asks "what's the point". Mitigation: ADR records it; the algorithm-phase PR's spec links back here.

## Definition of done

- All tests above pass: `mise run test` (Rust + Python + Vitest).
- `mise run lint` passes.
- `mise run e2e` passes (existing einzuegig flow unaffected).
- `mise run bench` reports `grundschule` and `zweizuegig` p50 within 20% of the prior committed BASELINE; `dreizuegig` row added.
- ADR 0021 lands; OPEN_THINGS items 2, 3, 4 close; "Surface lesson_group_id in lesson edit" follow-up files; "Block-aware LAHC for multi-class lessons" follow-up files.
- PR opens green via `mise exec -- git push`; automerge set with `gh pr merge <pr> --auto --squash`.
