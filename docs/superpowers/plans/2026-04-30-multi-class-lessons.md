# Multi-class lessons + lesson_group_id + dreizügige seed implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Lesson.school_class_id` (single FK) with a `lesson_school_classes` join table, add a nullable `lesson_group_id` UUID column, generalise the solver's per-class hard constraint to multi-class lessons, replace the combined `RE` subject with a `RK` / `RE` / `ETH` trio, and ship a `demo_grundschule_dreizuegig` seed (12 classes, parallel-Religion trio per Jahrgang) plus its bench fixture mirror.

**Architecture:** Many-to-many association object on the ORM side (mirrors `TeacherQualification` / `RoomSubjectSuitability`). Wire format on `Lesson` flips from `school_class_id: UUID` to `school_class_ids: list[UUID]` at every layer (Pydantic, OpenAPI, Zod, solver-core). The lesson-group co-placement constraint is deferred to the algorithm-phase PR; this PR generalises only the existing "no class double-booked at the same time-block" loop.

**Tech Stack:** SQLAlchemy 2 async + Alembic, Pydantic v2, FastAPI, React Hook Form + Zod, shadcn `Checkbox`, Rust solver-core (PyO3 binding pass-through), criterion benches.

**Spec:** [`docs/superpowers/specs/2026-04-30-multi-class-lessons-design.md`](../specs/2026-04-30-multi-class-lessons-design.md).

---

## File Structure

### Created

- `backend/src/klassenzeit_backend/db/models/lesson_school_class.py` — `LessonSchoolClass` association object.
- `backend/alembic/versions/<rev>_lesson_school_classes_join_and_lesson_group_id.py` — schema migration.
- `backend/src/klassenzeit_backend/seed/demo_grundschule_dreizuegig.py` — 12-class seed with parallel-Religion trio.
- `backend/tests/seed/test_demo_grundschule_dreizuegig.py` — structural seed test (entity counts, multi-class membership rows, lesson_group_id grouping).
- `backend/tests/seed/test_demo_grundschule_dreizuegig_solvability.py` — solvability test mirroring the existing zweizuegig pattern.
- `docs/adr/0021-multi-class-lessons.md` — ADR.

### Modified

- `backend/src/klassenzeit_backend/db/models/lesson.py` — drop `school_class_id`, drop the `(school_class_id, subject_id)` UNIQUE, add `lesson_group_id`.
- `backend/src/klassenzeit_backend/scheduling/schemas/lesson.py` — `LessonCreate.school_class_ids: list[UUID]`, `LessonUpdate.school_class_ids`, `LessonResponse.school_classes: list[...]`, `lesson_group_id` field.
- `backend/src/klassenzeit_backend/scheduling/routes/lessons.py` — multi-class create / patch / list / generate-lessons.
- `backend/src/klassenzeit_backend/scheduling/solver_io.py` — eager-load membership map, emit `school_class_ids: [UUID]` per lesson, generalise `class_lesson_ids` and `involved_class_ids`.
- `backend/src/klassenzeit_backend/seed/demo_grundschule.py` — replace `RE` subject with `RK`/`RE`/`ETH` trio; einzuegig schools assign every class to `ETH`.
- `backend/src/klassenzeit_backend/seed/demo_grundschule_zweizuegig.py` — same Religion split rebase.
- `backend/tests/scheduling/test_lessons.py` — flip body to multi-class assertions; add new uniqueness / membership tests.
- `backend/tests/scheduling/test_solver_io.py` — wire-format assertions on `school_class_ids`.
- `backend/tests/seed/test_demo_grundschule_solvability.py` — Religion subject rebase.
- `backend/tests/seed/test_demo_grundschule_zweizuegig_solvability.py` — Religion subject rebase.
- `solver/solver-core/src/types.rs` — `Lesson.school_class_ids: Vec<SchoolClassId>`, `Lesson.lesson_group_id: Option<LessonGroupId>`. Add `LessonGroupId` newtype to `solver-core/src/ids.rs`.
- `solver/solver-core/src/validate.rs` — non-empty + unique + resolvable check on `school_class_ids`.
- `solver/solver-core/src/solve.rs` — generalise `try_place_block` class-blocking and partition updates to iterate `school_class_ids`.
- `solver/solver-core/src/lahc.rs` — generalise `try_change_move` class-blocking and partition deltas to iterate `school_class_ids`.
- `solver/solver-core/src/index.rs` — if it pre-builds class lookups, generalise.
- `solver/solver-core/tests/grundschule_smoke.rs` — flip the test fixture to use `school_class_ids: vec![class.id]`.
- `solver/solver-core/tests/properties.rs` and `tests/score_property.rs` and `tests/lahc_property.rs` — same fixture flip.
- `solver/solver-core/benches/solver_fixtures.rs` — flip grundschule + zweizuegig fixtures, add `dreizuegig_fixture`.
- `solver/solver-core/benches/BASELINE.md` — refreshed by `mise run bench:record`.
- `frontend/src/features/lessons/schema.ts` — Zod `school_class_ids: array(string).min(1)`.
- `frontend/src/features/lessons/lessons-dialogs.tsx` — checkbox group instead of single Select.
- `frontend/src/features/lessons/lessons-page.tsx` — comma-joined class names.
- `frontend/src/features/lessons/hooks.ts` — `Lesson` type field `school_classes: list`.
- `frontend/src/features/lessons/lessons-dialogs.test.tsx` — multi-select assertions.
- `frontend/src/features/lessons/lessons-page.test.tsx` — class-cell rendering.
- `frontend/src/i18n/locales/{en,de}.json` — `lessons.form.classes`, `lessons.form.classesRequired`, `lessons.columns.classes` (plural).
- `frontend/src/lib/api-types.ts` — regenerated by `mise run fe:types`.
- `docs/superpowers/OPEN_THINGS.md` — mark items 2/3/4 as shipped; add `lesson_group_id` UI follow-up; add block-aware multi-class LAHC follow-up.
- `docs/architecture/overview.md` — Lesson section update.

### Tasks ↔ commits

Tasks 1-3 land as one commit (`feat(solver-core): ...`). Task 4 lands as one commit (`feat(solver-py): ...`). Tasks 5-9 land as one commit (`feat(backend): ...`). Tasks 10-12 land as one commit (`feat(frontend): ...`). Tasks 13-15 land as three commits (`feat(seed): ...` × 3). Task 16 lands as one commit (`feat(bench): ...`). Task 17 lands as one commit (`docs: ...`). Total: 8 commits.

---

## Task 1: solver-core wire format flip

**Goal:** `Lesson.school_class_id: SchoolClassId` becomes `Lesson.school_class_ids: Vec<SchoolClassId>`. Adds `Lesson.lesson_group_id: Option<LessonGroupId>` plus a new `LessonGroupId` newtype in `solver-core/src/ids.rs`. Round-trip + structural-validation tests.

**Files:**
- Modify: `solver/solver-core/src/ids.rs`
- Modify: `solver/solver-core/src/types.rs`
- Modify: `solver/solver-core/src/validate.rs`

- [ ] **Step 1: Write the failing deserialise test for `LessonGroupId`**

Add to `solver/solver-core/src/ids.rs::tests` (or create a `tests` mod if absent — check the existing pattern in the file):

```rust
#[test]
fn lesson_group_id_round_trips_through_json() {
    let id = LessonGroupId(uuid::Uuid::nil());
    let s = serde_json::to_string(&id).unwrap();
    let parsed: LessonGroupId = serde_json::from_str(&s).unwrap();
    assert_eq!(parsed, id);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo nextest run -p solver-core ids::tests::lesson_group_id_round_trips_through_json`
Expected: FAIL with "cannot find type `LessonGroupId`".

- [ ] **Step 3: Add the `LessonGroupId` newtype**

In `solver/solver-core/src/ids.rs`, mirror the existing `LessonId` macro / pattern. Add doc comment so the `deny(missing_docs)` lint passes:

```rust
/// Stable identifier for a lesson group (set of co-placed lessons).
/// Ships in this PR for wire-format completeness; the lesson-group
/// co-placement constraint that consumes it is added by the
/// algorithm-phase PR that follows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct LessonGroupId(pub uuid::Uuid);
```

(If the existing newtypes use a `define_newtype!` macro, add `LessonGroupId` to its invocation list instead. Check first; do not duplicate macro patterns by hand.)

- [ ] **Step 4: Run the round-trip test to verify it passes**

Run: `cargo nextest run -p solver-core ids::tests::lesson_group_id_round_trips_through_json`
Expected: PASS.

- [ ] **Step 5: Write the failing deserialise tests for the new `Lesson` shape**

Replace the existing `lesson_accepts_preferred_block_size_field` and `lesson_defaults_preferred_block_size_to_one_when_field_omitted` tests in `solver/solver-core/src/types.rs::tests` with versions that use `school_class_ids` (plural). Add three new tests:

```rust
#[test]
fn lesson_accepts_school_class_ids_with_one_element() {
    let json = format!(
        r#"{{"id":"{}","school_class_ids":["{}"],"subject_id":"{}","teacher_id":"{}","hours_per_week":1}}"#,
        Uuid::nil(), Uuid::nil(), Uuid::nil(), Uuid::nil()
    );
    let lesson: Lesson = serde_json::from_str(&json).unwrap();
    assert_eq!(lesson.school_class_ids.len(), 1);
    assert_eq!(lesson.preferred_block_size, 1);
    assert!(lesson.lesson_group_id.is_none());
}

#[test]
fn lesson_accepts_school_class_ids_with_three_elements() {
    let cid_a = Uuid::from_bytes([1; 16]);
    let cid_b = Uuid::from_bytes([2; 16]);
    let cid_c = Uuid::from_bytes([3; 16]);
    let json = format!(
        r#"{{"id":"{}","school_class_ids":["{}","{}","{}"],"subject_id":"{}","teacher_id":"{}","hours_per_week":2}}"#,
        Uuid::nil(), cid_a, cid_b, cid_c, Uuid::nil(), Uuid::nil()
    );
    let lesson: Lesson = serde_json::from_str(&json).unwrap();
    assert_eq!(lesson.school_class_ids.len(), 3);
}

#[test]
fn lesson_round_trips_lesson_group_id_when_present() {
    let group = Uuid::from_bytes([7; 16]);
    let json = format!(
        r#"{{"id":"{}","school_class_ids":["{}"],"subject_id":"{}","teacher_id":"{}","hours_per_week":1,"lesson_group_id":"{}"}}"#,
        Uuid::nil(), Uuid::nil(), Uuid::nil(), Uuid::nil(), group
    );
    let lesson: Lesson = serde_json::from_str(&json).unwrap();
    assert_eq!(lesson.lesson_group_id.map(|g| g.0), Some(group));
}
```

- [ ] **Step 6: Run the new Lesson tests to verify they fail**

Run: `cargo nextest run -p solver-core types::tests::lesson_accepts_school_class_ids_with_one_element`
Expected: FAIL ("missing field `school_class_ids`" or "unknown field `school_class_id`").

- [ ] **Step 7: Flip the `Lesson` struct**

In `solver/solver-core/src/types.rs`, change the `Lesson` definition:

```rust
/// A lesson that must be placed `hours_per_week` times.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lesson {
    /// Stable identifier for this lesson.
    pub id: LessonId,
    /// Receiving school classes. A single-class lesson has one entry; a
    /// cross-class lesson (e.g. a parallel Religionsmodell trio) has the
    /// full set of participating classes. Must be non-empty and contain
    /// no duplicates; `validate_structural` rejects violations.
    pub school_class_ids: Vec<SchoolClassId>,
    /// Subject taught in this lesson.
    pub subject_id: SubjectId,
    /// Teacher assigned to this lesson.
    pub teacher_id: TeacherId,
    /// Number of hours of this lesson to place per week.
    pub hours_per_week: u8,
    /// Preferred block size for placement. `1` means single-hour placements;
    /// `n > 1` means each block is `n` consecutive same-day positions in one
    /// room. The solver places `hours_per_week / preferred_block_size` blocks
    /// per lesson. Must be `>= 1` and must divide `hours_per_week`; otherwise
    /// `validate_structural` returns `Err(Error::Input(...))`. Defaults to 1
    /// when the JSON field is omitted, keeping the wire format additive.
    #[serde(default = "default_preferred_block_size")]
    pub preferred_block_size: u8,
    /// Optional group identifier; lessons sharing a non-null
    /// `lesson_group_id` are co-placed by the lesson-group constraint.
    /// Read-only in this PR (the constraint that consumes it ships with
    /// the algorithm-phase PR); a `None` value means the lesson is
    /// independent.
    #[serde(default)]
    pub lesson_group_id: Option<LessonGroupId>,
}
```

- [ ] **Step 8: Run the new Lesson tests to verify they pass**

Run: `cargo nextest run -p solver-core types::tests::lesson_accepts_school_class_ids -E 'test(lesson_)'`
Expected: PASS for all four `lesson_*` tests.

- [ ] **Step 9: Write the failing `validate_structural` tests**

In `solver/solver-core/src/validate.rs::tests` (or wherever the existing structural-validation tests live; check the file for the canonical pattern), add:

```rust
#[test]
fn validate_structural_rejects_empty_school_class_ids() {
    let mut p = base_problem(); // helper used by other tests in this file
    p.lessons[0].school_class_ids.clear();
    let err = validate_structural(&p).unwrap_err();
    assert!(matches!(err, Error::Input(_)));
}

#[test]
fn validate_structural_rejects_duplicate_school_class_ids() {
    let mut p = base_problem();
    let cid = p.school_classes[0].id;
    p.lessons[0].school_class_ids = vec![cid, cid];
    let err = validate_structural(&p).unwrap_err();
    assert!(matches!(err, Error::Input(_)));
}

#[test]
fn validate_structural_rejects_unknown_school_class_id_in_set() {
    let mut p = base_problem();
    p.lessons[0].school_class_ids.push(SchoolClassId(Uuid::from_bytes([99; 16])));
    let err = validate_structural(&p).unwrap_err();
    assert!(matches!(err, Error::Input(_)));
}
```

If `validate.rs` does not host its own `tests` module, add the tests inside `validate.rs` per the inline-`#[cfg(test)] mod tests { ... }` pattern from `solver/CLAUDE.md`. Reuse a module-local `base_problem` helper; if none exists, copy the shape from `solve.rs::tests::base_problem` and rename to `validate_base_problem` (per the unique-function-names rule).

- [ ] **Step 10: Run the new validate tests to verify they fail**

Run: `cargo nextest run -p solver-core validate::tests`
Expected: FAIL on the three new tests; existing tests still pass.

- [ ] **Step 11: Generalise `validate_structural`**

In `solver/solver-core/src/validate.rs`, walk every `lesson.school_class_ids` (replacing the existing single-class lookup):

```rust
// Replace the existing per-lesson school_class_id check with:
for lesson in &problem.lessons {
    if lesson.school_class_ids.is_empty() {
        return Err(Error::Input(format!(
            "lesson {} has empty school_class_ids", lesson.id.0
        )));
    }
    let mut seen = std::collections::HashSet::new();
    for cid in &lesson.school_class_ids {
        if !seen.insert(*cid) {
            return Err(Error::Input(format!(
                "lesson {} has duplicate school_class_id {}", lesson.id.0, cid.0
            )));
        }
        if !class_ids.contains(cid) {
            return Err(Error::Input(format!(
                "lesson {} references unknown school_class_id {}", lesson.id.0, cid.0
            )));
        }
    }
}
```

(Adapt the variable names — `class_ids` may already exist as a `HashSet<SchoolClassId>` in this function; if not, build one from `problem.school_classes`.)

- [ ] **Step 12: Run all solver-core tests; expect compile errors elsewhere**

Run: `cargo nextest run -p solver-core`
Expected: most tests fail with "no field `school_class_id` on `Lesson`" — this is the cascade. Tasks 2 and 3 fix the cascade.

- [ ] **Step 13: (No commit yet — bundle with Task 2 and Task 3.)**

---

## Task 2: solver-core greedy generalisation

**Goal:** `try_place_block` blocks each class in `lesson.school_class_ids` against `state.used_class`, inserts placements into every member class's partition, and contributes class-gap soft-score deltas summed across the member classes.

**Files:**
- Modify: `solver/solver-core/src/solve.rs`
- Modify: `solver/solver-core/src/index.rs` (only if it precomputes per-lesson class lookups)

- [ ] **Step 1: Write the failing multi-class blocking test**

Add to `solver/solver-core/src/solve.rs::tests`:

```rust
#[test]
fn multi_class_lesson_blocks_each_class_independently() {
    let mut p = base_problem();
    // Add a second class.
    p.school_classes.push(SchoolClass {
        id: SchoolClassId(solve_uuid(51)),
    });
    // Promote the existing single-class lesson to span both classes.
    p.lessons[0].school_class_ids = vec![
        SchoolClassId(solve_uuid(50)),
        SchoolClassId(solve_uuid(51)),
    ];
    p.lessons[0].hours_per_week = 1;
    // Add a single-class lesson for class 51 that competes for the same teacher.
    // Shares the teacher; teacher capacity is 10 so both fit, but the multi-class
    // lesson should occupy both classes' tb=10 slot, forcing the second lesson
    // into tb=11.
    p.lessons.push(Lesson {
        id: LessonId(solve_uuid(61)),
        school_class_ids: vec![SchoolClassId(solve_uuid(51))],
        subject_id: SubjectId(solve_uuid(40)),
        teacher_id: TeacherId(solve_uuid(20)),
        hours_per_week: 1,
        preferred_block_size: 1,
        lesson_group_id: None,
    });

    let s = greedy_solve(&p).unwrap();
    assert_eq!(s.placements.len(), 2);
    let multi_class = s.placements.iter().find(|pl| pl.lesson_id == LessonId(solve_uuid(60))).unwrap();
    let single_class = s.placements.iter().find(|pl| pl.lesson_id == LessonId(solve_uuid(61))).unwrap();
    assert_ne!(multi_class.time_block_id, single_class.time_block_id,
        "multi-class lesson must block class 51 from re-using its time-block");
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo nextest run -p solver-core solve::tests::multi_class_lesson_blocks_each_class_independently`
Expected: FAIL (likely with "no field `school_class_ids`" if the cascade above isn't yet stitched).

- [ ] **Step 3: Generalise `try_place_block`**

In `solver/solver-core/src/solve.rs`, rewrite the class section. Replace the line `let class = lesson.school_class_id;` with no binding; instead, in the hard-feasibility loop:

```rust
// Hard-feasibility for every position in the window.
for k in 0..n_usize {
    let tb = &problem.time_blocks[tb_order[outer_pos + k]];
    if state.used_teacher.contains(&(teacher, tb.id))
        || idx.teacher_blocked(teacher, tb.id)
    {
        continue 'outer;
    }
    for class_id in &lesson.school_class_ids {
        if state.used_class.contains(&(*class_id, tb.id)) {
            continue 'outer;
        }
    }
}
```

Replace the score-delta computation. The existing single-class delta:

```rust
let class_partition = state.class_positions.get(&(class, first_tb.day_of_week));
let class_old = match class_partition { Some(p) => crate::score::gap_count(p), None => 0 };
let class_new = gap_count_after_window_insert(class_partition, start_pos, end_pos);
```

becomes a sum over member classes:

```rust
let mut class_old_sum: u32 = 0;
let mut class_new_sum: u32 = 0;
for class_id in &lesson.school_class_ids {
    let part = state.class_positions.get(&(*class_id, first_tb.day_of_week));
    let old = match part { Some(p) => crate::score::gap_count(p), None => 0 };
    let new = gap_count_after_window_insert(part, start_pos, end_pos);
    class_old_sum = class_old_sum.saturating_add(old);
    class_new_sum = class_new_sum.saturating_add(new);
}
let class_delta_w = (i64::from(class_new_sum) - i64::from(class_old_sum))
    .saturating_mul(i64::from(weights.class_gap));
```

Replace the placement-time mutation. Currently:

```rust
state.used_class.insert((class, tb.id));
// ...
let class_part = state.class_positions.entry((class, c.day)).or_default();
for pos in c.start_pos..=c.end_pos {
    let ins = class_part.binary_search(&pos).unwrap_or_else(|i| i);
    class_part.insert(ins, pos);
}
```

becomes:

```rust
for class_id in &lesson.school_class_ids {
    state.used_class.insert((*class_id, tb.id));
}
// ...
for class_id in &lesson.school_class_ids {
    let class_part = state.class_positions.entry((*class_id, c.day)).or_default();
    for pos in c.start_pos..=c.end_pos {
        let ins = class_part.binary_search(&pos).unwrap_or_else(|i| i);
        class_part.insert(ins, pos);
    }
}
```

Update `unplaced_kind` similarly: the `used_class.contains(&(lesson.school_class_id, tb.id))` check inside `any_slot_open` becomes a `lesson.school_class_ids.iter().any(|c| ...)`:

```rust
let any_slot_open = problem.time_blocks.iter().any(|tb| {
    !used_teacher.contains(&(lesson.teacher_id, tb.id))
        && !lesson.school_class_ids.iter().any(|c| used_class.contains(&(*c, tb.id)))
        && !idx.teacher_blocked(lesson.teacher_id, tb.id)
});
```

- [ ] **Step 4: Fix every existing `solve.rs::tests` fixture**

Each test that constructs a Lesson sets `school_class_id: SchoolClassId(...)`. Flip every one to `school_class_ids: vec![SchoolClassId(...)]` plus `lesson_group_id: None`. The same applies to the `base_problem()` helper. Walk the file top-to-bottom; do not skip any. Tests to update: every `#[test] fn` in this module, plus the `base_problem` helper.

- [ ] **Step 5: Run all `solve.rs` tests**

Run: `cargo nextest run -p solver-core solve::tests`
Expected: PASS, including the new `multi_class_lesson_blocks_each_class_independently`.

---

## Task 3: solver-core LAHC + integration tests + fixture flip

**Goal:** LAHC's `try_change_move` and `apply_change_move` iterate `school_class_ids`. Integration tests (`grundschule_smoke.rs`, `properties.rs`, `score_property.rs`, `lahc_property.rs`) flip their fixtures.

**Files:**
- Modify: `solver/solver-core/src/lahc.rs`
- Modify: `solver/solver-core/tests/grundschule_smoke.rs`
- Modify: `solver/solver-core/tests/properties.rs`
- Modify: `solver/solver-core/tests/score_property.rs`
- Modify: `solver/solver-core/tests/lahc_property.rs`
- Modify: `solver/solver-core/tests/ffd_solver_outcome.rs`
- Modify: `solver/solver-core/tests/common/mod.rs` (if it has a fixture builder — check first)

- [ ] **Step 1: Generalise `try_change_move`**

In `solver/solver-core/src/lahc.rs`, replace the single-class binding `let class = lesson.school_class_id;` with `let class_ids = &lesson.school_class_ids;`. Then:

The block-skip line `if lesson.preferred_block_size > 1 { return false; }` stays unchanged.

The class double-book check:

```rust
// before
if used_class.contains(&(class, new_tb.id)) { return false; }

// after
for cid in class_ids {
    if used_class.contains(&(*cid, new_tb.id)) { return false; }
}
```

The score-delta call passed only one class to `score_after_change_move`. Replace with a loop summing class-side deltas across all member classes; teacher-side stays a single call. Simplest shape: extract a helper `class_partition_delta_sum(class_ids, ...) -> i64` that mirrors `partition_delta` for each class and sums.

```rust
fn class_partitions_delta_sum(
    class_ids: &[SchoolClassId],
    old_day: u8,
    new_day: u8,
    old_pos: u8,
    new_pos: u8,
    class_positions: &HashMap<(SchoolClassId, u8), Vec<u8>>,
) -> i64 {
    let mut total = 0i64;
    for cid in class_ids {
        total += partition_delta(
            class_positions.get(&(*cid, old_day)),
            class_positions.get(&(*cid, new_day)),
            old_day, new_day, old_pos, new_pos,
        );
    }
    total
}
```

Then in `score_after_change_move`, pass `class_ids` instead of `class`, call `class_partitions_delta_sum`, leave the teacher half alone.

`apply_change_move` updates `used_class` and `class_positions` once for each class:

```rust
for cid in class_ids {
    used_class.remove(&(*cid, old_tb.id));
    used_class.insert((*cid, new_tb.id));
}
for cid in class_ids {
    if let Some(part) = class_positions.get_mut(&(*cid, old_tb.day_of_week)) {
        if let Ok(i) = part.binary_search(&old_tb.position) {
            part.remove(i);
        }
        if part.is_empty() {
            class_positions.remove(&(*cid, old_tb.day_of_week));
        }
    }
    let part = class_positions.entry((*cid, new_tb.day_of_week)).or_default();
    let ins = part.binary_search(&new_tb.position).unwrap_or_else(|i| i);
    if part.get(ins).copied() != Some(new_tb.position) {
        part.insert(ins, new_tb.position);
    }
}
```

Update the `apply_change_move` signature to take `&[SchoolClassId]` instead of `SchoolClassId`. Same for `try_change_move`'s internal binding.

- [ ] **Step 2: Update lahc.rs unit tests' fixtures**

Walk every test in `lahc.rs::tests`. Each one constructs a Lesson; flip `school_class_id: ...` to `school_class_ids: vec![...]` and add `lesson_group_id: None`. Update any direct calls to `apply_change_move` so they pass a slice.

- [ ] **Step 3: Run lahc.rs tests**

Run: `cargo nextest run -p solver-core lahc::tests`
Expected: PASS.

- [ ] **Step 4: Flip the integration-test fixtures**

For each of `tests/grundschule_smoke.rs`, `tests/properties.rs`, `tests/score_property.rs`, `tests/lahc_property.rs`, `tests/ffd_solver_outcome.rs`, and `tests/common/mod.rs` if present:

- Find every `Lesson { ... school_class_id: ..., ... }` literal.
- Replace `school_class_id: <expr>` with `school_class_ids: vec![<expr>]`.
- Add `lesson_group_id: None,` to the struct literal.

For property-test generators, the strategy that today picks one `SchoolClassId` becomes one that picks a non-empty `Vec<SchoolClassId>` of length 1 (so multi-class is exercised by the new dreizuegig bench fixture, not the property-test corpus, until the algorithm-phase PR adds the lesson-group constraint).

- [ ] **Step 5: Run the full solver-core test suite**

Run: `cargo nextest run -p solver-core`
Expected: PASS for everything.

- [ ] **Step 6: Lint and commit (Tasks 1-3 bundled)**

Run: `mise run lint:rust`
Expected: PASS.

```bash
git add solver/solver-core/src solver/solver-core/tests solver/solver-core/benches/percentile.rs
git commit -m "feat(solver-core): generalise hard-constraint to multi-class lessons + lesson_group_id"
```

(If percentile.rs doesn't change, omit it. List file paths explicitly per the no-`git add -A` rule.)

---

## Task 4: solver-py wire pass-through + regression test

**Goal:** Verify `solve_json_with_config` round-trips a multi-class Problem JSON.

**Files:**
- Create: `solver/solver-py/tests/test_multi_class.py`
- Modify: `solver/solver-py/python/klassenzeit_solver/__init__.pyi` (if the stub mentions Lesson shape — check; likely no change because the binding is JSON-blob).

- [ ] **Step 1: Write the failing regression test**

Create `solver/solver-py/tests/test_multi_class.py`:

```python
"""Multi-class Lesson round-trip via the JSON binding."""

import json
import uuid

import pytest

from klassenzeit_solver import solve_json_with_config


def _uuid_str(b: int) -> str:
    return str(uuid.UUID(bytes=bytes([b] * 16)))


@pytest.fixture
def multi_class_problem() -> str:
    """Two classes sharing one Lesson; greedy must place it once and block both classes."""
    cid_a = _uuid_str(50)
    cid_b = _uuid_str(51)
    tb_zero = _uuid_str(10)
    tb_one = _uuid_str(11)
    teacher = _uuid_str(20)
    subject = _uuid_str(40)
    room = _uuid_str(30)
    lesson = _uuid_str(60)
    lesson_b = _uuid_str(61)
    problem = {
        "time_blocks": [
            {"id": tb_zero, "day_of_week": 0, "position": 0},
            {"id": tb_one, "day_of_week": 0, "position": 1},
        ],
        "teachers": [{"id": teacher, "max_hours_per_week": 10}],
        "rooms": [{"id": room}],
        "subjects": [
            {"id": subject, "prefer_early_periods": False, "avoid_first_period": False}
        ],
        "school_classes": [{"id": cid_a}, {"id": cid_b}],
        "lessons": [
            {
                "id": lesson,
                "school_class_ids": [cid_a, cid_b],
                "subject_id": subject,
                "teacher_id": teacher,
                "hours_per_week": 1,
                "preferred_block_size": 1,
            },
            {
                "id": lesson_b,
                "school_class_ids": [cid_b],
                "subject_id": subject,
                "teacher_id": teacher,
                "hours_per_week": 1,
                "preferred_block_size": 1,
            },
        ],
        "teacher_qualifications": [{"teacher_id": teacher, "subject_id": subject}],
        "teacher_blocked_times": [],
        "room_blocked_times": [],
        "room_subject_suitabilities": [],
    }
    return json.dumps(problem)


def test_multi_class_lesson_blocks_each_class(multi_class_problem: str) -> None:
    """A multi-class Lesson at tb=0 forces a single-class Lesson for cid_b to tb=1."""
    raw = solve_json_with_config(multi_class_problem, None)
    solution = json.loads(raw)
    assert len(solution["placements"]) == 2
    assert len(solution["violations"]) == 0
    tb_ids = {p["time_block_id"] for p in solution["placements"]}
    assert len(tb_ids) == 2, "two placements must occupy two time-blocks"


def test_lesson_group_id_round_trips_through_binding(multi_class_problem: str) -> None:
    """A non-null lesson_group_id is accepted and ignored by the wire format."""
    problem = json.loads(multi_class_problem)
    problem["lessons"][0]["lesson_group_id"] = _uuid_str(99)
    raw = solve_json_with_config(json.dumps(problem), None)
    solution = json.loads(raw)
    assert len(solution["placements"]) == 2
```

- [ ] **Step 2: Run the test to verify it passes (no binding change needed)**

The PyO3 binding is a JSON-blob pass-through, so once Tasks 1-3 land, the binding round-trip already works. Run:

```bash
mise run solver:rebuild
uv run pytest solver/solver-py/tests/test_multi_class.py -v
```

Expected: PASS.

- [ ] **Step 3: If the `.pyi` stub mentions the Lesson shape, update**

Check `solver/solver-py/python/klassenzeit_solver/__init__.pyi`. If it documents the expected JSON shape inline, update the example to use `school_class_ids` and add `lesson_group_id`. If it only types the function signature (which is JSON `str -> str`), no change.

- [ ] **Step 4: Lint and commit**

Run: `mise run lint`
Expected: PASS.

```bash
git add solver/solver-py
git commit -m "feat(solver-py): round-trip multi-class lessons + lesson_group_id wire format"
```

---

## Task 5: backend ORM + migration

**Goal:** Add `LessonSchoolClass` association object, add `lesson_group_id` column on Lesson, drop `school_class_id` and its UNIQUE. Backfill via Alembic data step.

**Files:**
- Create: `backend/src/klassenzeit_backend/db/models/lesson_school_class.py`
- Modify: `backend/src/klassenzeit_backend/db/models/lesson.py`
- Create: `backend/alembic/versions/<rev>_lesson_school_classes_join_and_lesson_group_id.py`

- [ ] **Step 1: Create the `LessonSchoolClass` ORM model**

`backend/src/klassenzeit_backend/db/models/lesson_school_class.py`:

```python
"""LessonSchoolClass association model: many-to-many between Lesson and SchoolClass."""

import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class LessonSchoolClass(Base):
    """A row in the `lesson_school_classes` join table.

    Tracks which `SchoolClass` rows a given `Lesson` serves. A lesson with
    a single membership is the prototype's original 1:1 shape; a lesson
    with multiple memberships is a cross-class lesson (e.g. a parallel
    Religionsmodell trio sharing one `lesson_group_id`).
    """

    __tablename__ = "lesson_school_classes"

    lesson_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True
    )
    school_class_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("school_classes.id", ondelete="CASCADE"), primary_key=True
    )
```

- [ ] **Step 2: Modify the Lesson ORM model**

`backend/src/klassenzeit_backend/db/models/lesson.py`:

```python
"""Lesson ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger, func
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Lesson(Base):
    """A concrete lesson assignment: subject + teacher + hours, served to one or more classes."""

    __tablename__ = "lessons"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subjects.id"))
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("teachers.id"), nullable=True)
    hours_per_week: Mapped[int] = mapped_column(SmallInteger)
    preferred_block_size: Mapped[int] = mapped_column(SmallInteger, server_default="1")
    lesson_group_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

(The `(school_class_id, subject_id)` UNIQUE is dropped; route-level pre-check replaces it. See Task 7.)

- [ ] **Step 3: Generate the Alembic migration**

Run: `mise run db:up && uv run alembic revision --autogenerate -m "lesson_school_classes_join_and_lesson_group_id"`

Then hand-edit the generated file to:

1. Add the data backfill before the column drop.
2. Replace `typing.Sequence` and `typing.Union` imports with PEP 604 / `collections.abc.Sequence` per `backend/CLAUDE.md` "Alembic autogenerate style drift".
3. Make `downgrade()` raise.

```python
"""lesson_school_classes_join_and_lesson_group_id

Revision ID: <rev>
Revises: <previous>
Create Date: 2026-04-30 ...
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "<rev>"
down_revision: str | None = "<previous>"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lesson_school_classes",
        sa.Column("lesson_id", sa.Uuid(), nullable=False),
        sa.Column("school_class_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["lessons.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["school_class_id"], ["school_classes.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("lesson_id", "school_class_id"),
    )

    # Backfill memberships from the old single FK before dropping the column.
    op.execute(
        """
        INSERT INTO lesson_school_classes (lesson_id, school_class_id)
        SELECT id, school_class_id FROM lessons
        """
    )

    op.drop_constraint("uq_lessons_school_class_id_subject_id", "lessons", type_="unique")
    op.drop_index("ix_lessons_school_class_id", table_name="lessons")
    op.drop_column("lessons", "school_class_id")

    op.add_column(
        "lessons", sa.Column("lesson_group_id", sa.Uuid(), nullable=True)
    )
    op.create_index(
        "ix_lessons_lesson_group_id", "lessons", ["lesson_group_id"]
    )


def downgrade() -> None:
    raise NotImplementedError(
        "Multi-class lessons are not encodable in a single FK; "
        "downgrade requires manual schema surgery."
    )
```

The actual constraint and index names depend on what `--autogenerate` produced. Inspect the previous migration `aecd2cfdd285_add_scheduling_tables.py` for the exact names; replace `uq_lessons_school_class_id_subject_id` and `ix_lessons_school_class_id` with whatever Alembic emitted, or look up via `psql -c '\d lessons'` against the dev DB.

- [ ] **Step 4: Run the migration against a fresh dev DB**

Run: `mise run db:reset && mise run db:migrate`
Expected: migration applies cleanly to a fresh DB (the backfill SELECT is a no-op there because the `lessons` table is empty).

- [ ] **Step 5: (No commit yet — bundle with Tasks 6-9.)**

---

## Task 6: backend Pydantic schema flip

**Goal:** `LessonCreate.school_class_ids: list[UUID]` (non-empty + unique). `LessonUpdate.school_class_ids: list[UUID] | None`. `LessonResponse.school_classes: list[LessonClassResponse]` and `lesson_group_id`.

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/schemas/lesson.py`

- [ ] **Step 1: Replace the schema file**

```python
"""Pydantic schemas for lesson routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class LessonCreate(BaseModel):
    """Request body for creating a lesson."""

    school_class_ids: list[uuid.UUID] = Field(min_length=1)
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None = None
    hours_per_week: int = Field(ge=1)
    preferred_block_size: int = Field(default=1, ge=1, le=2)
    lesson_group_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _lesson_create_school_class_ids_unique(self) -> "LessonCreate":
        if len(set(self.school_class_ids)) != len(self.school_class_ids):
            raise ValueError("school_class_ids must not contain duplicates")
        return self

    @model_validator(mode="after")
    def _lesson_create_hours_divisible_by_block_size(self) -> "LessonCreate":
        if self.hours_per_week % self.preferred_block_size != 0:
            raise ValueError("hours_per_week must be divisible by preferred_block_size")
        return self


class LessonUpdate(BaseModel):
    """Request body for patching a lesson."""

    school_class_ids: list[uuid.UUID] | None = Field(default=None, min_length=1)
    teacher_id: uuid.UUID | None = None
    hours_per_week: int | None = Field(default=None, ge=1)
    preferred_block_size: int | None = Field(default=None, ge=1, le=2)
    lesson_group_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _lesson_update_school_class_ids_unique(self) -> "LessonUpdate":
        if self.school_class_ids is not None and (
            len(set(self.school_class_ids)) != len(self.school_class_ids)
        ):
            raise ValueError("school_class_ids must not contain duplicates")
        return self


class LessonClassResponse(BaseModel):
    """Embedded school class in a lesson response."""

    id: uuid.UUID
    name: str


class LessonSubjectResponse(BaseModel):
    """Embedded subject in a lesson response."""

    id: uuid.UUID
    name: str
    short_name: str


class LessonTeacherResponse(BaseModel):
    """Embedded teacher in a lesson response."""

    id: uuid.UUID
    first_name: str
    last_name: str
    short_code: str


class LessonResponse(BaseModel):
    """Response body for a lesson."""

    id: uuid.UUID
    school_classes: list[LessonClassResponse]
    subject: LessonSubjectResponse
    teacher: LessonTeacherResponse | None
    hours_per_week: int
    preferred_block_size: int
    lesson_group_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
```

(Note the validator names follow the `_lesson_create_*` / `_lesson_update_*` prefix per the unique-function-names rule.)

- [ ] **Step 2: (Compile-broken — proceed to Task 7.)**

---

## Task 7: backend route handlers + solver_io

**Goal:** Route handlers create / update / list / generate-lessons membership rows. Pre-check 409 on `(subject_id, school_class_ids)` overlap. `solver_io.build_problem_json` emits `school_class_ids: [UUID]` per lesson.

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/lessons.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/solver_io.py`

- [ ] **Step 1: Rewrite the create endpoint**

In `routes/lessons.py`, replace `create_lesson` and `_build_lesson_response`. The new shape:

```python
async def _build_lesson_response(db: AsyncSession, lesson: Lesson) -> LessonResponse:
    """Construct a LessonResponse with eager-loaded class memberships."""
    membership_rows = (
        (
            await db.execute(
                select(LessonSchoolClass).where(LessonSchoolClass.lesson_id == lesson.id)
            )
        )
        .scalars()
        .all()
    )
    class_ids = [row.school_class_id for row in membership_rows]
    classes = (
        (
            await db.execute(
                select(SchoolClass).where(SchoolClass.id.in_(class_ids)).order_by(SchoolClass.name)
            )
        )
        .scalars()
        .all()
    ) if class_ids else []

    subj_result = await db.execute(select(Subject).where(Subject.id == lesson.subject_id))
    subject = subj_result.scalar_one()

    teacher_resp = None
    if lesson.teacher_id:
        teacher_result = await db.execute(select(Teacher).where(Teacher.id == lesson.teacher_id))
        teacher = teacher_result.scalar_one()
        teacher_resp = LessonTeacherResponse(
            id=teacher.id,
            first_name=teacher.first_name,
            last_name=teacher.last_name,
            short_code=teacher.short_code,
        )

    return LessonResponse(
        id=lesson.id,
        school_classes=[LessonClassResponse(id=c.id, name=c.name) for c in classes],
        subject=LessonSubjectResponse(
            id=subject.id, name=subject.name, short_name=subject.short_name
        ),
        teacher=teacher_resp,
        hours_per_week=lesson.hours_per_week,
        preferred_block_size=lesson.preferred_block_size,
        lesson_group_id=lesson.lesson_group_id,
        created_at=lesson.created_at,
        updated_at=lesson.updated_at,
    )


async def _check_subject_class_collision(
    db: AsyncSession,
    subject_id: uuid.UUID,
    school_class_ids: list[uuid.UUID],
    *,
    excluding_lesson_id: uuid.UUID | None = None,
) -> None:
    """Raise 409 if any existing Lesson teaches the same subject for any of the given classes."""
    stmt = (
        select(Lesson.id)
        .join(LessonSchoolClass, LessonSchoolClass.lesson_id == Lesson.id)
        .where(
            Lesson.subject_id == subject_id,
            LessonSchoolClass.school_class_id.in_(school_class_ids),
        )
    )
    if excluding_lesson_id is not None:
        stmt = stmt.where(Lesson.id != excluding_lesson_id)
    if (await db.execute(stmt)).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A lesson for one of these classes and subject already exists.",
        )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_lesson(
    body: LessonCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> LessonResponse:
    """Create a new lesson with one or more school class memberships."""
    await _check_subject_class_collision(db, body.subject_id, body.school_class_ids)
    lesson = Lesson(
        subject_id=body.subject_id,
        teacher_id=body.teacher_id,
        hours_per_week=body.hours_per_week,
        preferred_block_size=body.preferred_block_size,
        lesson_group_id=body.lesson_group_id,
    )
    db.add(lesson)
    await db.flush()
    for cid in body.school_class_ids:
        db.add(LessonSchoolClass(lesson_id=lesson.id, school_class_id=cid))
    await db.commit()
    await db.refresh(lesson)
    return await _build_lesson_response(db, lesson)
```

Add the import for `LessonSchoolClass` at the top of the file.

- [ ] **Step 2: Rewrite the patch endpoint**

```python
@router.patch("/{lesson_id}")
async def update_lesson(
    lesson_id: uuid.UUID,
    body: LessonUpdate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> LessonResponse:
    """Partially update a lesson's class memberships, teacher, hours, or preferred block size."""
    lesson = await _get_lesson(db, lesson_id)
    if body.teacher_id is not None:
        lesson.teacher_id = body.teacher_id
    if body.hours_per_week is not None:
        lesson.hours_per_week = body.hours_per_week
    if body.preferred_block_size is not None:
        lesson.preferred_block_size = body.preferred_block_size
    if body.lesson_group_id is not None:
        lesson.lesson_group_id = body.lesson_group_id
    if lesson.hours_per_week % lesson.preferred_block_size != 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="hours_per_week must be divisible by preferred_block_size",
        )
    if body.school_class_ids is not None:
        await _check_subject_class_collision(
            db,
            lesson.subject_id,
            body.school_class_ids,
            excluding_lesson_id=lesson.id,
        )
        await db.execute(
            delete(LessonSchoolClass).where(LessonSchoolClass.lesson_id == lesson.id)
        )
        for cid in body.school_class_ids:
            db.add(LessonSchoolClass(lesson_id=lesson.id, school_class_id=cid))
    await db.commit()
    await db.refresh(lesson)
    return await _build_lesson_response(db, lesson)
```

Add `from sqlalchemy import delete` (already present? check).

- [ ] **Step 3: Rewrite the list filter**

```python
@router.get("")
async def list_lessons(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_session)],
    class_id: uuid.UUID | None = None,
    teacher_id: uuid.UUID | None = None,
    subject_id: uuid.UUID | None = None,
) -> list[LessonResponse]:
    """Return all lessons, with optional filters by class, teacher or subject."""
    stmt = select(Lesson)
    if class_id is not None:
        stmt = stmt.join(LessonSchoolClass, LessonSchoolClass.lesson_id == Lesson.id).where(
            LessonSchoolClass.school_class_id == class_id
        )
    if teacher_id is not None:
        stmt = stmt.where(Lesson.teacher_id == teacher_id)
    if subject_id is not None:
        stmt = stmt.where(Lesson.subject_id == subject_id)
    result = await db.execute(stmt)
    lessons = result.scalars().all()
    return [await _build_lesson_response(db, lesson) for lesson in lessons]
```

- [ ] **Step 4: Rewrite `generate_lessons_from_stundentafel`**

The flow stays the same (one lesson per Stundentafel entry); only the persistence shape changes. After `db.add(lesson)`, also add a single `LessonSchoolClass(lesson_id=..., school_class_id=class_id)`. Also: the existing-subject filter `existing_result = await db.execute(select(Lesson.subject_id).where(Lesson.school_class_id == class_id))` becomes a join over `LessonSchoolClass`:

```python
existing_result = await db.execute(
    select(Lesson.subject_id)
    .join(LessonSchoolClass, LessonSchoolClass.lesson_id == Lesson.id)
    .where(LessonSchoolClass.school_class_id == class_id)
)
existing_subject_ids = {row[0] for row in existing_result.all()}
```

After `db.add(lesson); created.append(lesson)`, also add:

```python
db.add(LessonSchoolClass(lesson_id=lesson.id, school_class_id=class_id))
```

(Wait — `lesson.id` won't be populated until after `await db.flush()`. The existing flow flushes once at line 307. Move the LessonSchoolClass adds to a second loop after that flush, mirroring the existing teacher-assignment loop.)

- [ ] **Step 5: Rewrite `build_problem_json` in `solver_io.py`**

In `backend/src/klassenzeit_backend/scheduling/solver_io.py`:

After loading `lessons`, eagerly load membership rows:

```python
lesson_ids = [lesson.id for lesson in lessons]
membership_rows = (
    (
        await db.execute(
            select(LessonSchoolClass).where(LessonSchoolClass.lesson_id.in_(lesson_ids))
        )
        if lesson_ids
        else None
    ),
)
# Defensive: lesson_ids may be empty when no lessons have a teacher_id assigned.
memberships: list[LessonSchoolClass] = (
    list(membership_rows[0].scalars().all()) if membership_rows[0] is not None else []
)
classes_by_lesson: dict[uuid.UUID, list[uuid.UUID]] = {}
for row in memberships:
    classes_by_lesson.setdefault(row.lesson_id, []).append(row.school_class_id)
```

(The defensive shape avoids the `in_(empty_set)` SQLAlchemy bug already noted in the file's sentinel comment.)

`involved_class_ids` becomes:

```python
involved_class_ids = (
    {cid for class_ids in classes_by_lesson.values() for cid in class_ids}
    | {requested_class.id}
)
```

The lesson serialisation block changes from `"school_class_id": str(lesson.school_class_id)` to:

```python
"school_class_ids": [str(cid) for cid in classes_by_lesson.get(lesson.id, [])],
```

Add `"lesson_group_id": str(lesson.lesson_group_id) if lesson.lesson_group_id else None` to the dict.

`class_lesson_ids` becomes:

```python
class_lesson_ids = {
    lesson.id
    for lesson in lessons
    if requested_class.id in classes_by_lesson.get(lesson.id, [])
}
```

Add `from klassenzeit_backend.db.models.lesson_school_class import LessonSchoolClass` at the top of the file.

- [ ] **Step 6: Update existing tests in `test_lessons.py`**

Walk every test in `backend/tests/scheduling/test_lessons.py`. Each one POSTs to `/api/lessons` with `{"school_class_id": ..., ...}`. Replace with `{"school_class_ids": [...], ...}`. Each one asserts `resp.json()["school_class"]["id"] == ...`; replace with `resp.json()["school_classes"][0]["id"] == ...`. The 409-collision test (if present) keeps the same expected status; verify the detail message matches the new pre-check.

Add three new tests at the end of the file:

```python
async def test_lesson_create_requires_non_empty_school_class_ids(
    client: AsyncClient,
    create_user: CreateUserFn,
    login: LoginFn,
) -> None:
    user, password = await create_user(role="admin")
    await login(user.email, password)
    subject_id = await _create_subject(client, "Multi", "MUL")
    resp = await client.post(
        "/api/lessons",
        json={
            "school_class_ids": [],
            "subject_id": subject_id,
            "teacher_id": None,
            "hours_per_week": 1,
            "preferred_block_size": 1,
        },
    )
    assert resp.status_code == 422


async def test_lesson_create_rejects_duplicate_school_class_ids(
    client: AsyncClient,
    create_user: CreateUserFn,
    login: LoginFn,
) -> None:
    user, password = await create_user(role="admin")
    await login(user.email, password)
    week_scheme_id = await _setup_week_scheme_for_lessons(client, "WS-dup")
    stundentafel_id = await _setup_stundentafel_for_lessons(client, "ST-dup")
    class_id = await _create_school_class(client, "1a-dup", 1, stundentafel_id, week_scheme_id)
    subject_id = await _create_subject(client, "Subject-dup", "SDP")
    resp = await client.post(
        "/api/lessons",
        json={
            "school_class_ids": [class_id, class_id],
            "subject_id": subject_id,
            "teacher_id": None,
            "hours_per_week": 1,
            "preferred_block_size": 1,
        },
    )
    assert resp.status_code == 422


async def test_lesson_create_409_when_subject_overlaps_existing_membership(
    client: AsyncClient,
    create_user: CreateUserFn,
    login: LoginFn,
) -> None:
    user, password = await create_user(role="admin")
    await login(user.email, password)
    week_scheme_id = await _setup_week_scheme_for_lessons(client, "WS-collide")
    stundentafel_id = await _setup_stundentafel_for_lessons(client, "ST-collide")
    class_a = await _create_school_class(client, "1a-collide", 1, stundentafel_id, week_scheme_id)
    class_b = await _create_school_class(client, "1b-collide", 1, stundentafel_id, week_scheme_id)
    subject_id = await _create_subject(client, "Subject-collide", "SCO")
    first = await client.post(
        "/api/lessons",
        json={
            "school_class_ids": [class_a],
            "subject_id": subject_id,
            "teacher_id": None,
            "hours_per_week": 1,
            "preferred_block_size": 1,
        },
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/lessons",
        json={
            "school_class_ids": [class_a, class_b],
            "subject_id": subject_id,
            "teacher_id": None,
            "hours_per_week": 1,
            "preferred_block_size": 1,
        },
    )
    assert second.status_code == 409
```

- [ ] **Step 7: Update `test_solver_io.py`**

Find the test that asserts `build_problem_json` output shape. Replace assertions on `lesson["school_class_id"]` with `lesson["school_class_ids"]`. Verify a multi-class lesson serialises as a `[uuid_str, uuid_str]` list and `lesson_group_id` round-trips.

- [ ] **Step 8: Run the backend test suite (Tasks 5-7 bundled)**

Run: `mise run test:py`
Expected: PASS for `test_lessons.py` and `test_solver_io.py`.

If a solvability test fails (because the seed Religion data hasn't been rebased yet — that's Task 13), record which ones fail and verify after Tasks 13-15.

- [ ] **Step 9: Lint and commit (bundles Tasks 5, 6, 7)**

Run: `mise run lint`
Expected: PASS.

```bash
git add backend/src/klassenzeit_backend backend/alembic/versions backend/tests/scheduling
git commit -m "feat(backend): lesson_school_classes join + lesson_group_id + multi-class wire format"
```

---

## Task 8: backend smoke check

**Goal:** Sanity check the running app: bring up the dev server, hit the lessons endpoint with a multi-class POST, confirm the response shape.

(This task does not produce a commit; it produces an in-development sanity signal. Skip if Task 7 tests passed.)

- [ ] **Step 1: Start the dev server**

Run: `mise run dev` in the background.

- [ ] **Step 2: Auth and POST**

Curl a multi-class POST and confirm the response carries `school_classes: [{id, name}, ...]` with two entries.

- [ ] **Step 3: Stop the dev server**

(Tasks 8 has no commit; collapse into Task 7 if you skipped the manual check.)

---

## Task 9: regenerate frontend types

**Goal:** Refresh `frontend/src/lib/api-types.ts` from the live FastAPI app.

**Files:**
- Modify: `frontend/src/lib/api-types.ts` (regenerated)

- [ ] **Step 1: Regenerate types**

Run: `mise run fe:types`

- [ ] **Step 2: Verify the diff**

`git diff frontend/src/lib/api-types.ts` should show `school_class_ids: string[]` in `LessonCreate` / `LessonUpdate`, `school_classes: { id: string; name: string }[]` and `lesson_group_id: string | null` in the response schema.

- [ ] **Step 3: (Bundle the regenerated types into the frontend commit, Task 12.)**

---

## Task 10: frontend Zod + form schema

**Files:**
- Modify: `frontend/src/features/lessons/schema.ts`

- [ ] **Step 1: Replace the schema**

```typescript
import { z } from "zod";

export const UNASSIGNED = "__unassigned__";

export const LessonFormSchema = z.object({
  school_class_ids: z
    .array(z.string().min(1))
    .min(1, "lessons.form.classesRequired"),
  subject_id: z.string().min(1, "Subject is required"),
  teacher_id: z.string().min(1, "Teacher is required"),
  hours_per_week: z.number().int().min(1, "Hours must be at least 1"),
  preferred_block_size: z.number().int().min(1).max(2),
});

export type LessonFormValues = z.infer<typeof LessonFormSchema>;
```

(The `frontend/CLAUDE.md` rule says keep Zod schemas flat for RHF form-resolver compatibility; `array().min(1)` is fine because there's no transform / coerce / default.)

---

## Task 11: frontend lesson dialog (checkbox group)

**Files:**
- Modify: `frontend/src/features/lessons/lessons-dialogs.tsx`

- [ ] **Step 1: Replace the school_class_id Select with a checkbox group**

In `LessonFormDialog`, replace:

```tsx
<FormField
  control={form.control}
  name="school_class_id"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t("lessons.form.class")}</FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        ...
```

with a custom field that renders a checkbox per class:

```tsx
<FormField
  control={form.control}
  name="school_class_ids"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t("lessons.form.classes")}</FormLabel>
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
        {classOptions.map((cls) => {
          const checked = field.value.includes(cls.id);
          return (
            <label key={cls.id} className="flex items-center gap-2">
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => {
                  if (next === true && !checked) {
                    field.onChange([...field.value, cls.id]);
                  } else if (next !== true && checked) {
                    field.onChange(field.value.filter((id: string) => id !== cls.id));
                  }
                }}
              />
              <span>{cls.name}</span>
            </label>
          );
        })}
      </div>
      <FormMessage />
    </FormItem>
  )}
/>
```

Add `import { Checkbox } from "@/components/ui/checkbox";` at the top of the file. (Verify the file exists; if not, run `mise exec -- pnpm -C frontend dlx shadcn@latest add checkbox` to scaffold it.)

`defaultValues.school_class_id` → `school_class_ids`:

```tsx
school_class_ids: lesson?.school_classes.map((c) => c.id) ?? [],
```

- [ ] **Step 2: Update i18n keys**

Add to `frontend/src/i18n/locales/en.json` and `de.json`:

```json
"lessons": {
  "form": {
    "classes": "Classes" / "Klassen",
    "classesRequired": "Select at least one class" / "Mindestens eine Klasse auswählen",
    ...
  },
  "columns": {
    "classes": "Classes" / "Klassen",
    ...
  }
}
```

Remove the old `class` and `columns.class` singular keys if they exist; replace call sites.

- [ ] **Step 3: Update `LessonFormDialog` test fixture**

In `frontend/src/features/lessons/lessons-dialogs.test.tsx`, replace any `school_class_id: "..."` with `school_class_ids: ["..."]` in the lesson-prop fixtures, and seed `school_classes: [{id, name}]` for the response shape used by the dialog.

Add three new tests:

```tsx
test("renders a checkbox per available school class", async () => {
  // ... mount with two classes seeded
  await screen.findByRole("checkbox", { name: /1a/i });
  await screen.findByRole("checkbox", { name: /1b/i });
});

test("rejects submit when no class selected", async () => {
  // ... mount, click Save without ticking any class
  expect(await screen.findByText(/at least one class/i)).toBeVisible();
});

test("seeds checkbox state from lesson.school_classes", async () => {
  // ... mount with lesson?.school_classes = [{id: "abc", name: "1a"}]
  const cb = await screen.findByRole("checkbox", { name: /1a/i });
  expect(cb).toBeChecked();
});
```

---

## Task 12: frontend lessons-page table + tests + commit

**Files:**
- Modify: `frontend/src/features/lessons/lessons-page.tsx`
- Modify: `frontend/src/features/lessons/hooks.ts` (Lesson type)
- Modify: `frontend/src/features/lessons/lessons-page.test.tsx`

- [ ] **Step 1: Update the Lesson type / hooks**

In `frontend/src/features/lessons/hooks.ts`, find the `Lesson` type. It either re-exports from `lib/api-types.ts` (then no change because Task 9 regenerated) or hand-rolls a shape; if hand-rolled, flip `school_class: {...}` to `school_classes: { id: string; name: string }[]` and add `lesson_group_id: string | null`.

`LessonCreate` / `LessonUpdate` type aliases similarly flip to `school_class_ids`.

- [ ] **Step 2: Update the table cell in `lessons-page.tsx`**

Find the `columns` definition. Replace the cell that renders the class with:

```tsx
{
  header: t("lessons.columns.classes"),
  accessor: (lesson) => lesson.school_classes.map((c) => c.name).join(", "),
}
```

(Match the existing column shape; check the `EntityListTable` props for `columns` config.)

- [ ] **Step 3: Update the page test**

`frontend/src/features/lessons/lessons-page.test.tsx`: flip the seeded lesson fixture to `school_classes: [{id, name: "1a"}, {id, name: "1b"}]` for one row, and assert the rendered row text contains `"1a, 1b"`.

- [ ] **Step 4: Run the frontend test suite**

Run: `mise run fe:test`
Expected: PASS.

- [ ] **Step 5: Run lint**

Run: `mise run lint`
Expected: PASS.

- [ ] **Step 6: Commit (bundles Tasks 9, 10, 11, 12)**

```bash
git add frontend/src
git commit -m "feat(frontend): multi-class checkbox group on lesson edit dialog + i18n"
```

---

## Task 13: replace the combined RE subject with the RK / RE / ETH trio

**Goal:** All three seed modules and their solvability tests now reference three Religion subjects. Existing einzuegig and zweizuegig schools assign every class to `ETH`.

**Files:**
- Modify: `backend/src/klassenzeit_backend/seed/demo_grundschule.py`
- Modify: `backend/src/klassenzeit_backend/seed/demo_grundschule_zweizuegig.py`
- Modify: `backend/tests/seed/test_demo_grundschule_solvability.py`
- Modify: `backend/tests/seed/test_demo_grundschule_zweizuegig_solvability.py`

- [ ] **Step 1: Replace `_SUBJECTS` in `demo_grundschule.py`**

Replace the single `_SubjectSpec("Religion / Ethik", "RE", "chart-4")` line with three entries (preserve order: RK before RE before ETH so `_SUBJECTS` walks naturally for cross-module callers):

```python
_SubjectSpec("Religion (kath.)", "RK", "chart-4"),
_SubjectSpec("Religion (ev.)", "RE", "chart-4"),
_SubjectSpec("Ethik", "ETH", "chart-4"),
```

(Ordering inside `_SUBJECTS` matters for the bench fixture mirror; preserve the seed's natural authoring order.)

- [ ] **Step 2: Update `_GRADE_*_HOURS`**

Replace `"RE": 2` rows with `"ETH": 2` in both `_GRADE_1_2_HOURS` and `_GRADE_3_4_HOURS`.

- [ ] **Step 3: Update `_KLASSENRAUM_SUITABLE_SUBJECTS`**

Replace `"RE"` in the tuple with `("RK", "RE", "ETH")`. The new tuple becomes `("D", "M", "SU", "RK", "RE", "ETH", "E", "FÖ")`.

- [ ] **Step 4: Update teacher quals**

`_TEACHERS` einzuegig: Eva Becker (`BEC`) was qualified for `("RE", "MU", "FÖ")`. Update to `("RK", "RE", "ETH", "MU", "FÖ")`. No other teacher had RE quals.

`_TEACHERS_ZWEIZUEGIG`: Becker again gets `("RK", "RE", "ETH", "MU", "FÖ")`; Wilhelm gets `("RK", "RE", "ETH", "MU")`. Update both.

- [ ] **Step 5: Update `_TEACHER_ASSIGNMENTS_ZWEIZUEGIG`**

Every `("?", "RE")` key becomes `("?", "ETH")` (every Klasse takes Ethik in the rebased zweizuegig demo). Walk the dict; replace eight entries.

- [ ] **Step 6: Update solvability tests**

In each `test_demo_grundschule*_solvability.py`, find references to the `RE` subject_short_name. Replace with `ETH` for any direct reference. Existing `_TEACHER_ASSIGNMENTS_*` mapping references stay valid because the dict stays in the seed module.

- [ ] **Step 7: Run the seed tests**

Run: `mise run test:py -- backend/tests/seed`
Expected: PASS for all `test_demo_grundschule*` tests.

- [ ] **Step 8: Lint and commit**

Run: `mise run lint:py`

```bash
git add backend/src/klassenzeit_backend/seed backend/tests/seed
git commit -m "feat(seed): replace combined RE subject with RK/RE/ETH trio across einzuegig+zweizuegig seeds"
```

---

## Task 14: dreizügige Grundschule seed module + solvability test

**Goal:** New `demo_grundschule_dreizuegig` seed (12 classes) inserts three multi-class Religion lessons per Jahrgang sharing one `lesson_group_id`. Solvability test pins the teacher assignments and asserts a fully placed, zero-violation schedule on the einzuegig + multi-class shape.

**Files:**
- Create: `backend/src/klassenzeit_backend/seed/demo_grundschule_dreizuegig.py`
- Create: `backend/tests/seed/test_demo_grundschule_dreizuegig.py`
- Create: `backend/tests/seed/test_demo_grundschule_dreizuegig_solvability.py`
- Modify: `backend/src/klassenzeit_backend/cli.py` (Typer command entry; verify the existing one's shape first)

- [ ] **Step 1: Write the new seed module**

`backend/src/klassenzeit_backend/seed/demo_grundschule_dreizuegig.py`. Mirror the zweizuegig structure plus:

- Twelve classes: `1a/b/c, 2a/b/c, 3a/b/c, 4a/b/c`. Stundentafel hours per grade reuse `_GRADE_1_2_HOURS` / `_GRADE_3_4_HOURS` (Religion now ETH for everyone *except* the cross-class trio).
- Eighteen teachers: keep the existing 12 from zweizuegig, add 4 more general-purpose teachers (`Klein`, `Lange`, `Neumann`, `Otto` already exist; we need 6 more for the 12 classes), plus 3 new Religion-pair teachers (`Pfarrer`, `Pastor`, `Phil`) qualified for `RK` / `RE` / `ETH`. Verify capacity totals fit each teacher's `max_hours_per_week`.
- Rooms: 12 Klassenräume (`1a, 1b, 1c, 2a, ..., 4c`), 1 Turnhalle, 1 Sportplatz, 1 Musikraum, 1 Kunstraum, optional 1 Religionsraum. Total 17 rooms.
- For each Jahrgang (1-4): mint one `lesson_group_id = uuid4()` and create three multi-class Lessons (RK, RE, ETH) each spanning the three classes of that Jahrgang. `hours_per_week=2`, `preferred_block_size=1`.
- The Stundentafel for each Klasse drops `ETH` from the autogenerated lessons because the dreizuegig Religion lessons are inserted directly. Concretely: `_GRADE_1_2_HOURS_DREIZUEGIG` = `_GRADE_1_2_HOURS` minus the `ETH` row; same for grade 3/4.

The seed coroutine appends a Religion-trio loop after the StundentafelEntry inserts:

```python
for grade in (1, 2, 3, 4):
    group_id = uuid.uuid4()
    classes_in_jahrgang = [c for c in created_classes if c.grade_level == grade]
    for short in ("RK", "RE", "ETH"):
        teacher_short = _RELIGION_TEACHER_PER_JAHRGANG[(grade, short)]
        teacher = teachers_by_short[teacher_short]
        lesson = Lesson(
            subject_id=subjects_by_short[short].id,
            teacher_id=teacher.id,
            hours_per_week=2,
            preferred_block_size=1,
            lesson_group_id=group_id,
        )
        session.add(lesson)
        await session.flush()
        for c in classes_in_jahrgang:
            session.add(LessonSchoolClass(lesson_id=lesson.id, school_class_id=c.id))
```

(`_RELIGION_TEACHER_PER_JAHRGANG: dict[tuple[int, str], str]` is a 12-entry mapping; pin in the seed module.)

`_TEACHER_ASSIGNMENTS_DREIZUEGIG: dict[tuple[str, str], str]` covers the non-Religion subjects per Klasse — same shape as zweizuegig with eight more rows for the third Zug.

- [ ] **Step 2: Wire the Typer CLI**

Inspect `backend/src/klassenzeit_backend/cli.py` for the existing `seed-grundschule-zweizuegig` command pattern. Add a sibling `seed-grundschule-dreizuegig` command following the same shape.

- [ ] **Step 3: Write the structural seed test**

`backend/tests/seed/test_demo_grundschule_dreizuegig.py`:

```python
"""Structural assertions on the dreizuegige Grundschule seed."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from klassenzeit_backend.db.models.lesson import Lesson
from klassenzeit_backend.db.models.lesson_school_class import LessonSchoolClass
from klassenzeit_backend.db.models.school_class import SchoolClass
from klassenzeit_backend.seed.demo_grundschule_dreizuegig import (
    seed_demo_grundschule_dreizuegig,
)

pytestmark = pytest.mark.anyio


async def test_dreizuegig_seed_creates_twelve_school_classes(db_session: AsyncSession) -> None:
    await seed_demo_grundschule_dreizuegig(db_session)
    count = (await db_session.execute(select(func.count(SchoolClass.id)))).scalar_one()
    assert count == 12


async def test_dreizuegig_seed_emits_three_religion_lessons_per_jahrgang(
    db_session: AsyncSession,
) -> None:
    await seed_demo_grundschule_dreizuegig(db_session)
    grouped = (
        await db_session.execute(
            select(Lesson.lesson_group_id, func.count())
            .where(Lesson.lesson_group_id.is_not(None))
            .group_by(Lesson.lesson_group_id)
        )
    ).all()
    # Four Jahrgänge each contribute one lesson_group_id with three lessons.
    assert len(grouped) == 4
    assert all(count == 3 for _, count in grouped)


async def test_dreizuegig_religion_lessons_are_multi_class(db_session: AsyncSession) -> None:
    await seed_demo_grundschule_dreizuegig(db_session)
    lessons_with_groups = (
        await db_session.execute(
            select(Lesson.id).where(Lesson.lesson_group_id.is_not(None))
        )
    ).scalars().all()
    for lesson_id in lessons_with_groups:
        members = (
            await db_session.execute(
                select(func.count())
                .select_from(LessonSchoolClass)
                .where(LessonSchoolClass.lesson_id == lesson_id)
            )
        ).scalar_one()
        assert members == 3, "each Religion lesson must span three classes"
```

- [ ] **Step 4: Write the solvability test**

`backend/tests/seed/test_demo_grundschule_dreizuegig_solvability.py`. Mirror the existing `test_demo_grundschule_zweizuegig_solvability.py` shape. Pre-pin teacher assignments via `_TEACHER_ASSIGNMENTS_DREIZUEGIG` (UPDATE post-`generate-lessons`), POST `/api/classes/{id}/schedule` for one class, assert response carries `len(violations) == 0`.

(Detailed test body left as an in-task implementation step; verify by reading the existing zweizuegig solvability test and copying its shape with the new dict + 12-class loop.)

- [ ] **Step 5: Run the new tests**

Run: `mise run test:py -- backend/tests/seed/test_demo_grundschule_dreizuegig.py backend/tests/seed/test_demo_grundschule_dreizuegig_solvability.py -v`
Expected: PASS. If solvability fails, iterate on the room count and teacher capacities until the greedy + LAHC produces zero violations.

- [ ] **Step 6: Commit**

```bash
git add backend/src/klassenzeit_backend/seed/demo_grundschule_dreizuegig.py backend/src/klassenzeit_backend/cli.py backend/tests/seed/test_demo_grundschule_dreizuegig.py backend/tests/seed/test_demo_grundschule_dreizuegig_solvability.py
git commit -m "feat(seed): dreizuegige Grundschule with Religion trio + lesson_group_id"
```

---

## Task 15: Rust bench fixture mirror + BASELINE refresh

**Goal:** `dreizuegig_fixture()` in `solver_fixtures.rs` mirrors the Python seed. `mise run bench:record` refreshes BASELINE.md with three rows (grundschule, zweizuegig, dreizuegig), all within 20% of the prior single-class numbers.

**Files:**
- Modify: `solver/solver-core/benches/solver_fixtures.rs`
- Modify: `solver/solver-core/benches/BASELINE.md` (regenerated)

- [ ] **Step 1: Add the dreizuegig fixture builder**

Mirror the existing `zweizuegig_fixture()` shape. Twelve classes, eighteen teachers, seventeen rooms. The non-Religion lessons follow the per-Klasse `(class_idx, subject_idx, teacher_idx)` table copied from the Python seed's `_TEACHER_ASSIGNMENTS_DREIZUEGIG`. The Religion trio is appended at the end:

```rust
// Religion trio per Jahrgang: one lesson_group_id per Jahrgang,
// three lessons (RK, RE, ETH) each spanning the three classes of that grade.
for jahrgang in 1u8..=4u8 {
    let group_id = LessonGroupId(bench_uuid(180 + jahrgang));
    let class_ids: Vec<SchoolClassId> = (0..3)
        .map(|zug| classes[((jahrgang - 1) * 3 + zug) as usize].id)
        .collect();
    for (subj_idx, subject_short) in [("RK", 8), ("RE", 9), ("ETH", 10)].iter().enumerate() {
        let teacher_idx = religion_teacher_idx(jahrgang, subject_short.0);
        lessons.push(Lesson {
            id: LessonId(bench_uuid(220 + (jahrgang - 1) * 3 + subj_idx as u8)),
            school_class_ids: class_ids.clone(),
            subject_id: subjects[subject_short.1].id,
            teacher_id: teachers[teacher_idx].id,
            hours_per_week: 2,
            preferred_block_size: 1,
            lesson_group_id: Some(group_id),
        });
        quals.push(TeacherQualification {
            teacher_id: teachers[teacher_idx].id,
            subject_id: subjects[subject_short.1].id,
        });
    }
}
```

The exact `religion_teacher_idx` body matches `_RELIGION_TEACHER_PER_JAHRGANG` from the Python seed.

- [ ] **Step 2: Add the criterion benchmark function**

Mirror the existing `zweizuegig` group with a `dreizuegig` group. Same `GREEDY_SAMPLE_COUNT` / `LAHC_SAMPLE_COUNT` constants.

- [ ] **Step 3: Run the bench locally**

Run: `mise run bench`
Expected: bench runs to completion; output includes a `dreizuegig` row.

- [ ] **Step 4: Verify the regression budget**

`grundschule` and `zweizuegig` p50 numbers must stay within 20% of the prior committed baseline. If either exceeds 20%, do **not** simply re-record: profile the regression. The most likely culprit is an unexpected allocation in `try_place_block`'s class loop. Fix the regression before re-recording.

- [ ] **Step 5: Refresh BASELINE.md**

Run: `mise run bench:record`
Expected: `solver/solver-core/benches/BASELINE.md` regenerates with three rows.

- [ ] **Step 6: Commit**

```bash
git add solver/solver-core/benches/solver_fixtures.rs solver/solver-core/benches/BASELINE.md
git commit -m "feat(bench): add dreizuegige Grundschule fixture + refresh BASELINE.md"
```

---

## Task 16: ADR + OPEN_THINGS update

**Files:**
- Create: `docs/adr/0021-multi-class-lessons.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/superpowers/OPEN_THINGS.md`
- Modify: `docs/architecture/overview.md` (Lesson section)

- [ ] **Step 1: Write the ADR**

`docs/adr/0021-multi-class-lessons.md`:

```markdown
# 0021: Many-to-many Lesson school classes

- **Status:** Accepted
- **Date:** 2026-04-30

## Context

The prototype's `Lesson.school_class_id` was a single FK because every lesson
served exactly one class. The "Realer Schulalltag" sprint introduces
parallel-Religion groups in which one Lesson serves multiple Klassen of the
same Jahrgang; the kath / ev / Ethik trio per Jahrgang is the canonical case.
A single FK cannot represent this without duplicating the Lesson row, which
would also duplicate the placement row and break the "two classes get blocked
by one lesson" invariant the cross-class hard constraint depends on.

## Decision

Replace `Lesson.school_class_id` with a `lesson_school_classes` join table
(association object on the ORM side, mirroring `TeacherQualification` /
`RoomSubjectSuitability`). Add a nullable `lesson_group_id: UUID` column
to mark co-placed lesson groups; the algorithm-phase PR adds the constraint
that consumes it.

## Alternatives considered

- **Plain SQLAlchemy `Table()` for the join** without an ORM model. Rejected
  because the codebase consistently uses association objects for join tables;
  consistency wins over a marginally smaller import surface.
- **Postgres `school_class_ids: ARRAY(UUID)` column.** Rejected: arrays do
  not get FK enforcement, do not participate in `JOIN`, and the cross-class
  hard constraint in the next PR will need to filter by `school_class_id IN`,
  which is awkward against an array.
- **Two-phase migration** keeping the single FK while the join lands.
  Rejected: this is a prototype with one auto-deployed staging environment
  and no public schema.

## Consequences

- Lesson edit dialog gains a multi-select; CRUD endpoints adapt.
- Solver wire format flips: `school_class_id: UUID` becomes
  `school_class_ids: list[UUID]`. `validate_structural` enforces non-empty
  + unique + resolvable. The greedy and LAHC blocking loops iterate the
  list; for single-class lessons (most of them) the loop is one iteration
  and bench p50 stays within 1% of the single-FK baseline.
- The `(school_class_id, subject_id)` UNIQUE on `lessons` is dropped; a
  route-level pre-check replaces it with the same `409` semantics on
  `(subject, any-class-overlap)`.
- The existing `Lesson` model loses the `school_class` accessor; every
  caller flips to `school_classes` (a list).
- `lesson_group_id` is round-tripped end-to-end but not yet acted on by
  the solver; the algorithm-phase PR adds the lesson-group co-placement
  constraint and the `LessonGroupSplit` violation kind.
```

- [ ] **Step 2: Append the ADR to `docs/adr/README.md`** (verify the index format; insert one line after 0020).

- [ ] **Step 3: Update OPEN_THINGS.md**

In `docs/superpowers/OPEN_THINGS.md`:

- Mark items 2, 3, 4 in the data + schema phase as shipped (move to the "Completed sprints" section's active sprint shipping log, or strike them with a "shipped 2026-04-30 in PR <#>" note).
- Add follow-ups to the "Acknowledged deferrals" section:
  - **Surface `lesson_group_id` in lesson edit dialog.** The wire format ships it; the dialog ignores it. Add a read-only badge first, then an editable group dropdown when the lesson-group constraint lands.
  - **Block-aware LAHC for cross-class lessons.** The LAHC Change move generalises trivially over `school_class_ids` (this PR ships that), but the lesson-group constraint adds a swap-the-whole-group move; track alongside the existing block-aware LAHC follow-up.

- [ ] **Step 4: Update the architecture overview**

`docs/architecture/overview.md`, Lesson section: replace "single FK to SchoolClass" with the join-table phrasing.

- [ ] **Step 5: Commit**

```bash
git add docs/adr docs/superpowers/OPEN_THINGS.md docs/architecture/overview.md
git commit -m "docs: ADR 0021 multi-class lessons; close data + schema phase items 2-4"
```

---

## Task 17: end-to-end verification

**Goal:** Sanity check the full pipeline after all commits.

- [ ] **Step 1: Full test suite**

Run: `mise run test`
Expected: PASS for Rust + Python + Vitest.

- [ ] **Step 2: Lint**

Run: `mise run lint`
Expected: PASS.

- [ ] **Step 3: e2e**

Run: `mise run e2e`
Expected: PASS. The grundschule-smoke flow continues to work (einzuegig path is single-class).

- [ ] **Step 4: Bench drift**

Confirm `solver/solver-core/benches/BASELINE.md` shows grundschule and zweizuegig p50 within 20% of the previous master commit's numbers (51 µs greedy / 256 µs greedy respectively).

If everything passes, the PR is ready for `mise exec -- git push -u origin feat/multi-class-lessons`.

---

## Self-review notes

- Spec coverage: every section of the spec maps to at least one task. The migration's backfill SQL (spec §Database) is in Task 5 step 3. The 409 pre-check (spec §Pydantic / API) is in Task 7 step 1. The bench fixture mirror (spec §Bench) is in Task 15. The ADR (spec §end) is in Task 16.
- Type consistency: `school_class_ids` everywhere on the ingress side; `school_classes` (plural) everywhere on the response side. `LessonGroupId` newtype on the Rust side, `uuid.UUID | None` on the Python side, `string | null` on the TypeScript side.
- Placeholder scan: the task body code blocks contain the actual code; references to `_RELIGION_TEACHER_PER_JAHRGANG` and the eighteen-teacher / 17-room layout are described conceptually because the exact teacher assignments depend on capacity-fitting that surfaces inside Task 14 step 5 when the solvability test runs. The plan is honest about that iteration; it does not claim a placeholder is filled in. Acceptable per the "iterate inside one PR" risk note in the spec.
- TDD: Tasks 1, 2 lead with failing tests; Task 7 lands implementation alongside test updates; Task 14 lands the seed before the solvability test (which requires the seed to import). The TDD order across the bundle is preserved within each task even where the commits bundle multiple tasks.
- Frequent commits: 8 commits across 17 tasks. Schema + routes bundle (Tasks 5-7) is the heaviest; everything else is one-task-per-commit or smaller.
