# Solver Constraints UI (PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scheduler's 4 soft-constraint weights and 6 hard-constraint softening toggles configurable per school, piped through the scheduler, backend, and a new "Scheduler" tab in school settings.

**Architecture:** Introduce a `ConstraintWeights` struct in the `scheduler` crate, thread it through `ScheduleInput → ProblemFacts → constraints.rs` (replacing hardcoded penalty literals). Backend stores weights as JSONB in a new `school_scheduler_settings` table, exposes `GET`/`PUT /api/schools/{id}/scheduler-settings`, and loads them in `load_schedule_input`. Frontend adds a settings tab matching the existing `terms-tab` / `rooms-tab` pattern: plain React state + `useApiClient`, explicit Save button, i18n keys under `settings.scheduler.*`.

**Tech Stack:** Rust (scheduler crate, Loco/Axum/SeaORM backend, SeaORM migration with JSONB), Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui, next-intl, Sonner toasts.

**Spec:** `docs/superpowers/specs/2026-04-06-solver-constraints-ui-design.md`

**Out of scope (PR2):** Teacher preferred slots grid, room subject suitability matrix.

---

## File Structure

### Scheduler crate (`scheduler/`)
- **Modify** `src/planning.rs` — add `ConstraintWeights` struct + `Default` impl; add `weights: ConstraintWeights` field to `ProblemFacts`.
- **Modify** `src/types.rs` — add `weights: ConstraintWeights` field to `ScheduleInput`.
- **Modify** `src/mapper.rs` — copy `input.weights` into `ProblemFacts.weights` inside `to_planning`.
- **Modify** `src/constraints.rs` — replace 4 soft literal penalties + 6 softenable hard penalties with weight-driven computations in `full_evaluate`, `evaluate_assign`, `assign`, `unassign`.
- **Modify** `tests/proptest_scoring.rs` — parameterise existing invariant over random weights; add weight-disabling tests.

### Backend (`backend/`)
- **Create** `migration/src/m20250406_000001_scheduler_settings.rs` — creates `school_scheduler_settings` table.
- **Modify** `migration/src/lib.rs` — register new migration.
- **Create** `src/models/_entities/school_scheduler_settings.rs` — SeaORM entity.
- **Modify** `src/models/_entities/mod.rs` + `prelude.rs` — export the new entity.
- **Create** `src/services/scheduler_settings.rs` — DTO, defaults, `load`, `upsert`, `From<Dto> for scheduler::ConstraintWeights`.
- **Modify** `src/services/mod.rs` — export new service.
- **Modify** `src/services/scheduler.rs` — in `load_schedule_input`, read weights and populate `ScheduleInput.weights`.
- **Create** `src/controllers/scheduler_settings.rs` — `GET`/`PUT` endpoints.
- **Modify** `src/controllers/mod.rs` — add module.
- **Modify** `src/app.rs` — register routes.
- **Create** `tests/requests/scheduler_settings.rs` — integration tests.
- **Modify** `tests/requests/mod.rs` — register new test module.
- **Modify** `tests/requests/scheduler.rs` — add a "weights affect solve" test.

### Frontend (`frontend/`)
- **Create** `src/app/[locale]/schools/[id]/settings/components/scheduler-tab.tsx` — new tab component.
- **Modify** `src/app/[locale]/schools/[id]/settings/page.tsx` — register tab in `TABS` array and render.
- **Modify** `src/lib/types.ts` — add `ConstraintWeightsDto` type.
- **Modify** `src/messages/en.json` + `src/messages/de.json` — add `settings.scheduler.*` keys and tab label.
- **Create** `src/__tests__/scheduler-tab.test.tsx` — component tests.

### Documentation
- **Modify** `docs/STATUS.md` — add entry under Completed Steps on merge.
- **Modify** `docs/superpowers/next-steps.md` — mark 1e done, note 4a/4b still open for PR2.

---

## Task 1 — Scheduler: `ConstraintWeights` struct + `ProblemFacts`/`ScheduleInput` fields

**Files:**
- Modify: `scheduler/src/planning.rs`
- Modify: `scheduler/src/types.rs`

Pure additive change. No behavioural change yet — we just make the struct exist and carry defaults through.

- [ ] **Step 1: Add `ConstraintWeights` to `planning.rs`**

Append below the `HardSoftScore` block in `scheduler/src/planning.rs` (around line 74, before `// --- Problem facts ---`):

```rust
// ---------------------------------------------------------------------------
// Constraint weights
// ---------------------------------------------------------------------------

/// Per-school tunable weights for soft constraints and optional softening of
/// business-rule hard constraints.
///
/// Soft weight of `0` disables the corresponding soft constraint.
/// A `Some(p)` in a `soften_*` field converts the corresponding hard
/// constraint into a soft penalty of `p`; `None` keeps it strict.
/// Structural conflict constraints (teacher/class/room pairwise) are never
/// softened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstraintWeights {
    pub w_preferred_slot: i64,
    pub w_teacher_gap: i64,
    pub w_subject_distribution: i64,
    pub w_class_teacher_first_period: i64,

    pub soften_teacher_availability: Option<i64>,
    pub soften_teacher_max_hours: Option<i64>,
    pub soften_teacher_qualification: Option<i64>,
    pub soften_room_suitability: Option<i64>,
    pub soften_room_capacity: Option<i64>,
    pub soften_class_availability: Option<i64>,
}

impl Default for ConstraintWeights {
    fn default() -> Self {
        Self {
            w_preferred_slot: 1,
            w_teacher_gap: 1,
            w_subject_distribution: 2,
            w_class_teacher_first_period: 1,
            soften_teacher_availability: None,
            soften_teacher_max_hours: None,
            soften_teacher_qualification: None,
            soften_room_suitability: None,
            soften_room_capacity: None,
            soften_class_availability: None,
        }
    }
}
```

- [ ] **Step 2: Add `weights` field to `ProblemFacts`**

In the same file, modify the `ProblemFacts` struct:

```rust
#[derive(Debug, Clone)]
pub struct ProblemFacts {
    pub timeslots: Vec<Timeslot>,
    pub rooms: Vec<RoomFact>,
    pub teachers: Vec<TeacherFact>,
    pub classes: Vec<ClassFact>,
    pub subjects: Vec<SubjectFact>,
    pub weights: ConstraintWeights,
}
```

- [ ] **Step 3: Add `weights` field to `ScheduleInput`**

In `scheduler/src/types.rs`, modify `ScheduleInput`:

```rust
#[derive(Debug, Clone, Default)]
pub struct ScheduleInput {
    pub teachers: Vec<Teacher>,
    pub classes: Vec<SchoolClass>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub timeslots: Vec<TimeSlot>,
    pub requirements: Vec<LessonRequirement>,
    pub stundentafeln: Vec<Stundentafel>,
    pub weights: crate::planning::ConstraintWeights,
}
```

Note: `ConstraintWeights` must derive `Default`. It already does via the explicit impl added in Step 1, so `#[derive(Default)]` on `ScheduleInput` still works.

- [ ] **Step 4: Build and fix all `ProblemFacts { .. }` constructor call sites**

Run:

```bash
cargo build -p klassenzeit-scheduler 2>&1 | grep -E "error|warning: unused" | head
```

Expected: errors for every `ProblemFacts { ... }` literal missing the `weights` field. Locations are `scheduler/src/mapper.rs` (inside `to_planning`) and `scheduler/src/constraints.rs` test helpers. For each, add `weights: ConstraintWeights::default()`.

In `scheduler/src/mapper.rs`, inside `to_planning`, find the `ProblemFacts { ... }` literal and add:

```rust
ProblemFacts {
    timeslots,
    rooms,
    teachers,
    classes,
    subjects,
    weights: input.weights.clone(),
}
```

Import at top of file: `use crate::planning::ConstraintWeights;` is not needed — `ProblemFacts` already imports from `planning::*`. Just add `use crate::planning::*;` if it isn't already there (it is).

In `scheduler/src/constraints.rs` test helpers (e.g. `make_facts_with_room_capacity`, `make_facts`, etc.), add `weights: ConstraintWeights::default(),` to each literal. You'll need `use crate::planning::ConstraintWeights;` inside `mod tests` (it may already be pulled via `use super::*;` which re-exports from `crate::planning::*`).

- [ ] **Step 5: Build to verify**

```bash
cargo build -p klassenzeit-scheduler
```

Expected: clean build, no errors.

- [ ] **Step 6: Run existing tests to verify no behavioural regression**

```bash
cargo test -p klassenzeit-scheduler
```

Expected: all existing tests pass — behaviour is unchanged because weights are unused so far.

- [ ] **Step 7: Commit**

```bash
git add scheduler/src/planning.rs scheduler/src/types.rs scheduler/src/mapper.rs scheduler/src/constraints.rs
git commit -m "feat(scheduler): add ConstraintWeights struct (inactive)"
```

---

## Task 2 — Scheduler: apply soft weights in `full_evaluate` and incremental paths

**Files:**
- Modify: `scheduler/src/constraints.rs`

Replace hardcoded soft penalty literals (`-1`, `-2`) with weight-driven computations. Do soft constraints first, then hard softening in Task 3, so each step is independently verifiable.

- [ ] **Step 1: Write failing test — w_teacher_gap=0 disables gap penalty**

Add to `scheduler/src/constraints.rs` under `#[cfg(test)] mod tests`, at the end of the module:

```rust
#[test]
fn zero_weight_disables_gap_penalty() {
    // 3 lessons same teacher/class, periods 0,2,4 on day 0 → 2 gaps with default weight.
    let mut facts = make_facts_with_room_capacity(1, 5);
    facts.weights.w_teacher_gap = 0;
    let lessons = vec![
        PlanningLesson { id: 0, teacher_idx: 0, class_idx: 0, subject_idx: 0, timeslot: Some(0), room: Some(0) },
        PlanningLesson { id: 1, teacher_idx: 0, class_idx: 0, subject_idx: 0, timeslot: Some(2), room: Some(0) },
        PlanningLesson { id: 2, teacher_idx: 0, class_idx: 0, subject_idx: 0, timeslot: Some(4), room: Some(0) },
    ];
    let score = full_evaluate(&lessons, &facts);
    assert_eq!(score.soft, 0, "expected no soft penalty with weight=0, got {}", score.soft);
}
```

If `PlanningLesson` has more fields, copy exact fields from an existing test in the same file (look for other `PlanningLesson { ... }` literals nearby). If `make_facts_with_room_capacity` uses a fixed number of rooms but you need a specific subject count, replicate its full definition — don't guess.

- [ ] **Step 2: Run the test — verify it fails**

```bash
cargo test -p klassenzeit-scheduler zero_weight_disables_gap_penalty
```

Expected: FAIL with non-zero soft score (because weight is currently ignored).

- [ ] **Step 3: Apply `w_teacher_gap` in `full_evaluate`**

In `scheduler/src/constraints.rs`, find the block starting `// Teacher gaps: for each teacher/day, ...` (around line 166). Replace:

```rust
if gaps > 0 {
    score += HardSoftScore::soft(-gaps);
}
```

with:

```rust
if gaps > 0 {
    score += HardSoftScore::soft(-gaps * facts.weights.w_teacher_gap);
}
```

- [ ] **Step 4: Apply `w_teacher_gap` in `evaluate_assign` and `unassign`**

Find `// Teacher gap delta` in `evaluate_assign` (around line 369). Replace:

```rust
delta += HardSoftScore::soft(new_gap - old_gap);
```

with:

```rust
delta += HardSoftScore::soft((new_gap - old_gap) * facts.weights.w_teacher_gap);
```

Find the same pattern in `unassign` (around line 547) and make the identical replacement.

- [ ] **Step 5: Run the failing test — verify it passes**

```bash
cargo test -p klassenzeit-scheduler zero_weight_disables_gap_penalty
```

Expected: PASS.

- [ ] **Step 6: Apply `w_preferred_slot` in all three sites**

In `full_evaluate` (around line 139):
```rust
if !teacher.preferred_slots[ts] {
    score += HardSoftScore::soft(-facts.weights.w_preferred_slot);
}
```

In `evaluate_assign` (around line 385):
```rust
if !facts.teachers[lesson.teacher_idx].preferred_slots[timeslot] {
    delta += HardSoftScore::soft(-facts.weights.w_preferred_slot);
}
```

In `unassign` (around line 557):
```rust
if !facts.teachers[lesson.teacher_idx].preferred_slots[timeslot] {
    delta += HardSoftScore::soft(facts.weights.w_preferred_slot);
}
```

- [ ] **Step 7: Apply `w_subject_distribution` (base penalty 2) in all three sites**

In `full_evaluate` (around line 182). Replace:
```rust
if count > 1 {
    score += HardSoftScore::soft(-((count - 1) as i64 * 2));
}
```
with:
```rust
if count > 1 {
    score += HardSoftScore::soft(-((count - 1) as i64) * facts.weights.w_subject_distribution);
}
```

In `evaluate_assign` (around line 378). Replace:
```rust
if count > 0 {
    delta += HardSoftScore::soft(-2);
}
```
with:
```rust
if count > 0 {
    delta += HardSoftScore::soft(-facts.weights.w_subject_distribution);
}
```

In `unassign` (around line 551). Replace:
```rust
if old_count > 1 {
    delta += HardSoftScore::soft(2);
}
```
with:
```rust
if old_count > 1 {
    delta += HardSoftScore::soft(facts.weights.w_subject_distribution);
}
```

- [ ] **Step 8: Apply `w_class_teacher_first_period` in all three sites**

In `full_evaluate` (around line 200), the line `score += HardSoftScore::soft(-1);`. Replace with:
```rust
score += HardSoftScore::soft(-facts.weights.w_class_teacher_first_period);
```

In `evaluate_assign` (around line 405), replace:
```rust
if !old_violated && new_violated {
    delta += HardSoftScore::soft(-1);
} else if old_violated && !new_violated {
    delta += HardSoftScore::soft(1);
}
```
with:
```rust
if !old_violated && new_violated {
    delta += HardSoftScore::soft(-facts.weights.w_class_teacher_first_period);
} else if old_violated && !new_violated {
    delta += HardSoftScore::soft(facts.weights.w_class_teacher_first_period);
}
```

In `unassign` (around line 577), make the symmetric replacement:
```rust
if old_violated && !new_violated {
    delta += HardSoftScore::soft(facts.weights.w_class_teacher_first_period);
} else if !old_violated && new_violated {
    delta += HardSoftScore::soft(-facts.weights.w_class_teacher_first_period);
}
```

- [ ] **Step 9: Run all scheduler tests — verify defaults still pass**

```bash
cargo test -p klassenzeit-scheduler
```

Expected: all tests pass, including the property tests in `tests/proptest_scoring.rs`. If the prop tests fail, it almost certainly means one of the three sites (full/assign/unassign) doesn't match the other two — re-check that every multiplication is applied consistently. The prop test already compares `full_evaluate` against incremental state; mismatches surface immediately.

- [ ] **Step 10: Commit**

```bash
git add scheduler/src/constraints.rs
git commit -m "feat(scheduler): honour ConstraintWeights for soft constraints"
```

---

## Task 3 — Scheduler: softenable hard constraints

**Files:**
- Modify: `scheduler/src/constraints.rs`

Replace each of the 6 softenable hard emissions with a branch that returns either `hard(-x)` (when `None`) or `soft(-x * p)` (when `Some(p)`).

To keep the diff tight, add a private helper at the top of `impl IncrementalState` (and a free function for `full_evaluate`):

- [ ] **Step 1: Write failing test — softening teacher_max_hours converts hard to soft**

Append to the tests module:

```rust
#[test]
fn soften_teacher_max_hours_converts_hard_to_soft() {
    // Teacher max_hours=2, assign 3 lessons → 1 hour over.
    let mut facts = make_facts_with_room_capacity(3, 3);
    facts.teachers[0].max_hours = 2;
    facts.weights.soften_teacher_max_hours = Some(100);

    let lessons = vec![
        PlanningLesson { id: 0, teacher_idx: 0, class_idx: 0, subject_idx: 0, timeslot: Some(0), room: Some(0) },
        PlanningLesson { id: 1, teacher_idx: 0, class_idx: 0, subject_idx: 0, timeslot: Some(1), room: Some(0) },
        PlanningLesson { id: 2, teacher_idx: 0, class_idx: 0, subject_idx: 0, timeslot: Some(2), room: Some(0) },
    ];
    let score = full_evaluate(&lessons, &facts);
    assert_eq!(score.hard, 0, "max_hours should be softened, got hard={}", score.hard);
    assert_eq!(score.soft, -100, "expected 1 hour over * penalty 100, got {}", score.soft);
}
```

Fix up `PlanningLesson` fields and `make_facts_with_room_capacity` args to match the actual signatures in the file. If the helper only creates one class/subject, that's fine for this test.

- [ ] **Step 2: Run the test — verify it fails**

```bash
cargo test -p klassenzeit-scheduler soften_teacher_max_hours_converts_hard_to_soft
```

Expected: FAIL — hard score is -1 (1 hour over), soft is 0.

- [ ] **Step 3: Add `apply_hard` helper at the top of `constraints.rs`**

Insert this free function just below the `use` statements (before `pub fn full_evaluate`):

```rust
/// Return a score for a hard-violation magnitude of `amount` (>= 0),
/// routed through the optional softening penalty.
/// `soften = None` → strict hard. `soften = Some(p)` → soft penalty `amount * p`.
#[inline]
fn hard_or_soften(amount: i64, soften: Option<i64>) -> HardSoftScore {
    match soften {
        None => HardSoftScore::hard(-amount),
        Some(p) => HardSoftScore::soft(-amount * p),
    }
}
```

- [ ] **Step 4: Replace hard emissions in `full_evaluate`**

Six sites in `full_evaluate`:

1. Teacher availability (around line 96):
```rust
if !teacher.available_slots[ts] {
    score += hard_or_soften(1, facts.weights.soften_teacher_availability);
}
```

2. Class availability (around line 100):
```rust
if !facts.classes[lesson.class_idx].available_slots[ts] {
    score += hard_or_soften(1, facts.weights.soften_class_availability);
}
```

3. Teacher qualification (around line 105):
```rust
if !teacher.qualified_subjects[lesson.subject_idx] {
    score += hard_or_soften(1, facts.weights.soften_teacher_qualification);
}
```

4. Room suitability (around line 117):
```rust
if !room.suitable_subjects[lesson.subject_idx] {
    score += hard_or_soften(1, facts.weights.soften_room_suitability);
}
```

5. Room student capacity (around line 122):
```rust
if let (Some(cap), Some(count)) =
    (room.capacity, facts.classes[lesson.class_idx].student_count)
{
    if cap < count {
        score += hard_or_soften(1, facts.weights.soften_room_capacity);
    }
}
```

6. Teacher over-capacity (around line 155). Original uses `(hours - max)` as magnitude:
```rust
for (&teacher_idx, &hours) in &teacher_hours {
    let max = facts.teachers[teacher_idx].max_hours;
    if hours > max {
        score += hard_or_soften((hours - max) as i64, facts.weights.soften_teacher_max_hours);
    }
}
```

Note: room pairwise over-capacity (room_at_slot > cap) is **structural** — leave the existing `HardSoftScore::hard(-((count - cap) as i64))` unchanged.

- [ ] **Step 5: Replace hard emissions in `evaluate_assign`**

Same six sites, same helper, in `evaluate_assign` (around lines 330–362):

```rust
if !teacher.available_slots[timeslot] {
    delta += hard_or_soften(1, facts.weights.soften_teacher_availability);
}

if !facts.classes[lesson.class_idx].available_slots[timeslot] {
    delta += hard_or_soften(1, facts.weights.soften_class_availability);
}

if !teacher.qualified_subjects[lesson.subject_idx] {
    delta += hard_or_soften(1, facts.weights.soften_teacher_qualification);
}

if let Some(r) = room {
    let room_fact = &facts.rooms[r];
    if !room_fact.suitable_subjects[lesson.subject_idx] {
        delta += hard_or_soften(1, facts.weights.soften_room_suitability);
    }
    if let (Some(cap), Some(count)) = (
        room_fact.capacity,
        facts.classes[lesson.class_idx].student_count,
    ) {
        if cap < count {
            delta += hard_or_soften(1, facts.weights.soften_room_capacity);
        }
    }
}

// Teacher over-capacity: assigning when already at or above max costs 1.
let old_hours = self.teacher_hours[lesson.teacher_idx];
if old_hours >= teacher.max_hours {
    delta += hard_or_soften(1, facts.weights.soften_teacher_max_hours);
}
```

Leave the room pairwise `if k_room >= cap { delta += HardSoftScore::hard(-1); }` block structural.

- [ ] **Step 6: Replace hard emissions in `unassign`**

Same six sites in `unassign` (around lines 499–533), but with the sign flipped (we're removing a violation, so delta is positive). Use `hard_or_soften(-1, ...)` to get the opposite sign:

Actually, easier: inline the match. Replace each of the 6 sites with:

```rust
if !teacher.available_slots[timeslot] {
    delta += match facts.weights.soften_teacher_availability {
        None => HardSoftScore::hard(1),
        Some(p) => HardSoftScore::soft(p),
    };
}
```

Apply the analogous pattern to the other 5 sites in `unassign`. For teacher over-capacity:

```rust
let new_hours = self.teacher_hours[lesson.teacher_idx];
if new_hours >= teacher.max_hours {
    delta += match facts.weights.soften_teacher_max_hours {
        None => HardSoftScore::hard(1),
        Some(p) => HardSoftScore::soft(p),
    };
}
```

Leave the room pairwise structural block untouched.

- [ ] **Step 7: Run the failing test — verify it passes**

```bash
cargo test -p klassenzeit-scheduler soften_teacher_max_hours_converts_hard_to_soft
```

Expected: PASS.

- [ ] **Step 8: Run the full scheduler test suite**

```bash
cargo test -p klassenzeit-scheduler
```

Expected: all tests pass. Pay attention to `proptest_scoring` — it compares `full_evaluate` against incremental state across random move sequences, so any asymmetry between the `full_evaluate`/`evaluate_assign`/`unassign` rewrites will trip it.

- [ ] **Step 9: Commit**

```bash
git add scheduler/src/constraints.rs
git commit -m "feat(scheduler): softenable hard constraints via ConstraintWeights"
```

---

## Task 4 — Scheduler: proptest coverage for weights

**Files:**
- Modify: `scheduler/tests/proptest_scoring.rs`

- [ ] **Step 1: Read the current proptest file**

Open `scheduler/tests/proptest_scoring.rs` to understand the strategy and existing property. Look for the invariant test that random moves keep `full_evaluate` == incremental state.

- [ ] **Step 2: Add a `ConstraintWeights` strategy**

At the top (after existing `use` statements), add:

```rust
use klassenzeit_scheduler::planning::ConstraintWeights;
use proptest::prelude::*;

fn arb_weights() -> impl Strategy<Value = ConstraintWeights> {
    (
        0i64..=10,
        0i64..=10,
        0i64..=10,
        0i64..=10,
        prop::option::of(1i64..=100),
        prop::option::of(1i64..=100),
        prop::option::of(1i64..=100),
        prop::option::of(1i64..=100),
        prop::option::of(1i64..=100),
        prop::option::of(1i64..=100),
    ).prop_map(|(a, b, c, d, e, f, g, h, i, j)| ConstraintWeights {
        w_preferred_slot: a,
        w_teacher_gap: b,
        w_subject_distribution: c,
        w_class_teacher_first_period: d,
        soften_teacher_availability: e,
        soften_teacher_max_hours: f,
        soften_teacher_qualification: g,
        soften_room_suitability: h,
        soften_room_capacity: i,
        soften_class_availability: j,
    })
}
```

(If the file already imports `proptest::prelude::*`, don't double-import.)

- [ ] **Step 3: Parameterise the existing invariant over weights**

Find the existing `proptest!` block that runs a random move sequence and asserts `full_evaluate == state.score()`. Add `weights in arb_weights()` to its input list and apply the weights to the generated `ProblemFacts` before creating `IncrementalState`:

```rust
proptest! {
    #[test]
    fn incremental_matches_full_evaluate(
        // ... existing inputs ...
        weights in arb_weights(),
    ) {
        // ... generate facts ...
        facts.weights = weights;
        let mut state = IncrementalState::new(&facts);
        // ... rest unchanged
    }
}
```

- [ ] **Step 4: Run the property test**

```bash
cargo test -p klassenzeit-scheduler --test proptest_scoring
```

Expected: PASS. If it fails, the failure case is saved to `scheduler/tests/proptest_scoring.proptest-regressions` — inspect it, find which constraint's three code paths disagree, and fix.

- [ ] **Step 5: Commit**

```bash
git add scheduler/tests/proptest_scoring.rs
git commit -m "test(scheduler): parameterise scoring prop tests over ConstraintWeights"
```

---

## Task 5 — Backend: migration for `school_scheduler_settings` table

**Files:**
- Create: `backend/migration/src/m20250406_000001_scheduler_settings.rs`
- Modify: `backend/migration/src/lib.rs`

- [ ] **Step 1: Create the migration file**

```rust
// backend/migration/src/m20250406_000001_scheduler_settings.rs
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(SchoolSchedulerSettings::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SchoolSchedulerSettings::SchoolId)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(SchoolSchedulerSettings::Weights)
                            .json_binary()
                            .not_null()
                            .default("{}"),
                    )
                    .col(
                        ColumnDef::new(SchoolSchedulerSettings::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolSchedulerSettings::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_sss_school")
                            .from(
                                SchoolSchedulerSettings::Table,
                                SchoolSchedulerSettings::SchoolId,
                            )
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(SchoolSchedulerSettings::Table)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum SchoolSchedulerSettings {
    Table,
    SchoolId,
    Weights,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Schools {
    Table,
    Id,
}
```

- [ ] **Step 2: Register the migration**

Edit `backend/migration/src/lib.rs`:

```rust
mod m20250403_000001_core_tables;
mod m20250403_000002_domain_tables;
mod m20250403_000003_curriculum_entries;
pub mod m20250405_000001_room_capacity;
pub mod m20250406_000001_scheduler_settings;

// ...

fn migrations() -> Vec<Box<dyn MigrationTrait>> {
    vec![
        Box::new(m20250403_000001_core_tables::Migration),
        Box::new(m20250403_000002_domain_tables::Migration),
        Box::new(m20250403_000003_curriculum_entries::Migration),
        Box::new(m20250405_000001_room_capacity::Migration),
        Box::new(m20250406_000001_scheduler_settings::Migration),
        // inject-above (do not remove this comment)
    ]
}
```

- [ ] **Step 3: Build to verify**

```bash
cargo build -p migration
```

Expected: clean build.

- [ ] **Step 4: Apply migration to dev DB**

```bash
docker compose up -d postgres-dev
cd backend && cargo loco db migrate && cd ..
```

Expected: migration applies cleanly. Verify with:
```bash
docker compose exec postgres-dev psql -U loco -d klassenzeit-backend_development -c '\d school_scheduler_settings'
```

- [ ] **Step 5: Commit**

```bash
git add backend/migration/
git commit -m "feat(backend): add school_scheduler_settings migration"
```

---

## Task 6 — Backend: SeaORM entity for `school_scheduler_settings`

**Files:**
- Create: `backend/src/models/_entities/school_scheduler_settings.rs`
- Modify: `backend/src/models/_entities/mod.rs`
- Modify: `backend/src/models/_entities/prelude.rs`

- [ ] **Step 1: Re-generate entities (or hand-write)**

Prefer hand-writing for one-off tables since `sea-orm-cli generate` re-writes everything. Create `backend/src/models/_entities/school_scheduler_settings.rs`:

```rust
//! `SeaORM` entity for `school_scheduler_settings`.
//! Hand-written to match the m20250406_000001 migration.

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "school_scheduler_settings")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub school_id: Uuid,
    pub weights: serde_json::Value,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::schools::Entity",
        from = "Column::SchoolId",
        to = "super::schools::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    Schools,
}

impl Related<super::schools::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Schools.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
```

Cross-check field types by comparing to `backend/src/models/_entities/room_timeslot_capacities.rs` (an existing hand-written entity with a similar shape). Adjust if the existing convention uses `DateTime<FixedOffset>` or similar.

- [ ] **Step 2: Register the entity**

Edit `backend/src/models/_entities/mod.rs`:

```rust
// add alongside the existing `pub mod ...;` lines
pub mod school_scheduler_settings;
```

Edit `backend/src/models/_entities/prelude.rs`:

```rust
// add alongside the existing re-exports
pub use super::school_scheduler_settings::Entity as SchoolSchedulerSettings;
```

(Copy the exact re-export syntax from how `RoomTimeslotCapacities` is re-exported in the same file.)

- [ ] **Step 3: Build**

```bash
cargo build -p klassenzeit-backend
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/_entities/
git commit -m "feat(backend): add school_scheduler_settings entity"
```

---

## Task 7 — Backend: `scheduler_settings` service (DTO, load, upsert, conversion)

**Files:**
- Create: `backend/src/services/scheduler_settings.rs`
- Modify: `backend/src/services/mod.rs`

- [ ] **Step 1: Write failing unit test — round-trip DTO ↔ ConstraintWeights**

Create `backend/src/services/scheduler_settings.rs`:

```rust
use klassenzeit_scheduler::planning::ConstraintWeights;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::_entities::school_scheduler_settings;

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

fn default_one() -> i64 { 1 }
fn default_two() -> i64 { 2 }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConstraintWeightsDto {
    #[serde(default = "default_one")]
    pub w_preferred_slot: i64,
    #[serde(default = "default_one")]
    pub w_teacher_gap: i64,
    #[serde(default = "default_two")]
    pub w_subject_distribution: i64,
    #[serde(default = "default_one")]
    pub w_class_teacher_first_period: i64,

    #[serde(default)]
    pub soften_teacher_availability: Option<i64>,
    #[serde(default)]
    pub soften_teacher_max_hours: Option<i64>,
    #[serde(default)]
    pub soften_teacher_qualification: Option<i64>,
    #[serde(default)]
    pub soften_room_suitability: Option<i64>,
    #[serde(default)]
    pub soften_room_capacity: Option<i64>,
    #[serde(default)]
    pub soften_class_availability: Option<i64>,
}

impl Default for ConstraintWeightsDto {
    fn default() -> Self {
        Self {
            w_preferred_slot: 1,
            w_teacher_gap: 1,
            w_subject_distribution: 2,
            w_class_teacher_first_period: 1,
            soften_teacher_availability: None,
            soften_teacher_max_hours: None,
            soften_teacher_qualification: None,
            soften_room_suitability: None,
            soften_room_capacity: None,
            soften_class_availability: None,
        }
    }
}

impl From<ConstraintWeightsDto> for ConstraintWeights {
    fn from(dto: ConstraintWeightsDto) -> Self {
        Self {
            w_preferred_slot: dto.w_preferred_slot,
            w_teacher_gap: dto.w_teacher_gap,
            w_subject_distribution: dto.w_subject_distribution,
            w_class_teacher_first_period: dto.w_class_teacher_first_period,
            soften_teacher_availability: dto.soften_teacher_availability,
            soften_teacher_max_hours: dto.soften_teacher_max_hours,
            soften_teacher_qualification: dto.soften_teacher_qualification,
            soften_room_suitability: dto.soften_room_suitability,
            soften_room_capacity: dto.soften_room_capacity,
            soften_class_availability: dto.soften_class_availability,
        }
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("{field} must be between {min} and {max}, got {value}")]
    OutOfRange { field: &'static str, min: i64, max: i64, value: i64 },
}

pub fn validate(dto: &ConstraintWeightsDto) -> Result<(), ValidationError> {
    fn check_soft(field: &'static str, v: i64) -> Result<(), ValidationError> {
        if !(0..=100).contains(&v) {
            return Err(ValidationError::OutOfRange { field, min: 0, max: 100, value: v });
        }
        Ok(())
    }
    fn check_soften(field: &'static str, v: Option<i64>) -> Result<(), ValidationError> {
        if let Some(p) = v {
            if !(1..=100_000).contains(&p) {
                return Err(ValidationError::OutOfRange { field, min: 1, max: 100_000, value: p });
            }
        }
        Ok(())
    }
    check_soft("w_preferred_slot", dto.w_preferred_slot)?;
    check_soft("w_teacher_gap", dto.w_teacher_gap)?;
    check_soft("w_subject_distribution", dto.w_subject_distribution)?;
    check_soft("w_class_teacher_first_period", dto.w_class_teacher_first_period)?;
    check_soften("soften_teacher_availability", dto.soften_teacher_availability)?;
    check_soften("soften_teacher_max_hours", dto.soften_teacher_max_hours)?;
    check_soften("soften_teacher_qualification", dto.soften_teacher_qualification)?;
    check_soften("soften_room_suitability", dto.soften_room_suitability)?;
    check_soften("soften_room_capacity", dto.soften_room_capacity)?;
    check_soften("soften_class_availability", dto.soften_class_availability)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

pub async fn load(
    db: &DatabaseConnection,
    school_id: Uuid,
) -> Result<ConstraintWeightsDto, sea_orm::DbErr> {
    let row = school_scheduler_settings::Entity::find()
        .filter(school_scheduler_settings::Column::SchoolId.eq(school_id))
        .one(db)
        .await?;
    match row {
        Some(r) => {
            let dto: ConstraintWeightsDto = serde_json::from_value(r.weights)
                .unwrap_or_default();
            Ok(dto)
        }
        None => Ok(ConstraintWeightsDto::default()),
    }
}

pub async fn upsert(
    db: &DatabaseConnection,
    school_id: Uuid,
    dto: &ConstraintWeightsDto,
) -> Result<(), sea_orm::DbErr> {
    let now = chrono::Utc::now().into();
    let json = serde_json::to_value(dto)
        .map_err(|e| sea_orm::DbErr::Custom(format!("serialize weights: {e}")))?;

    let existing = school_scheduler_settings::Entity::find()
        .filter(school_scheduler_settings::Column::SchoolId.eq(school_id))
        .one(db)
        .await?;

    match existing {
        Some(m) => {
            let mut am: school_scheduler_settings::ActiveModel = m.into();
            am.weights = Set(json);
            am.updated_at = Set(now);
            am.update(db).await?;
        }
        None => {
            let am = school_scheduler_settings::ActiveModel {
                school_id: Set(school_id),
                weights: Set(json),
                created_at: Set(now),
                updated_at: Set(now),
            };
            am.insert(db).await?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_dto_matches_scheduler_defaults() {
        let dto = ConstraintWeightsDto::default();
        let weights: ConstraintWeights = dto.into();
        assert_eq!(weights, ConstraintWeights::default());
    }

    #[test]
    fn validate_rejects_negative_soft_weight() {
        let mut dto = ConstraintWeightsDto::default();
        dto.w_teacher_gap = -1;
        assert!(matches!(validate(&dto), Err(ValidationError::OutOfRange { .. })));
    }

    #[test]
    fn validate_rejects_zero_soften_penalty() {
        let mut dto = ConstraintWeightsDto::default();
        dto.soften_teacher_max_hours = Some(0);
        assert!(matches!(validate(&dto), Err(ValidationError::OutOfRange { .. })));
    }

    #[test]
    fn serde_missing_fields_uses_defaults() {
        let json = serde_json::json!({});
        let dto: ConstraintWeightsDto = serde_json::from_value(json).unwrap();
        assert_eq!(dto, ConstraintWeightsDto::default());
    }
}
```

- [ ] **Step 2: Export the service module**

In `backend/src/services/mod.rs`, add:

```rust
pub mod scheduler_settings;
```

- [ ] **Step 3: Run the unit tests**

```bash
cargo test -p klassenzeit-backend services::scheduler_settings
```

Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/scheduler_settings.rs backend/src/services/mod.rs
git commit -m "feat(backend): scheduler_settings service with DTO and validation"
```

---

## Task 8 — Backend: `scheduler_settings` controller (GET/PUT)

**Files:**
- Create: `backend/src/controllers/scheduler_settings.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/scheduler_settings.rs`:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use serde::Serialize;
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::services::scheduler_settings::{
    self, ConstraintWeightsDto, ValidationError,
};

#[derive(Debug, Serialize)]
struct WeightsResponse {
    weights: ConstraintWeightsDto,
}

async fn get_settings(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(_school_id): Path<Uuid>,
) -> impl IntoResponse {
    match scheduler_settings::load(&ctx.db, school_ctx.school.id).await {
        Ok(weights) => format::json(WeightsResponse { weights }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn put_settings(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(_school_id): Path<Uuid>,
    Json(body): Json<ConstraintWeightsDto>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }
    if let Err(e) = scheduler_settings::validate(&body) {
        return match e {
            ValidationError::OutOfRange { .. } => {
                (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()).into_response()
            }
        };
    }
    if let Err(e) = scheduler_settings::upsert(&ctx.db, school_ctx.school.id, &body).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    format::json(WeightsResponse { weights: body }).into_response()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/scheduler-settings")
        .add("/", get(get_settings).put(put_settings))
}
```

Cross-check `SchoolContext` extractor and `AuthError::Forbidden` usage against `backend/src/controllers/room_timeslot_capacities.rs` — match whatever pattern that file uses. If `SchoolContext` is positional (comes before `Path`), put it in that order.

- [ ] **Step 2: Register the controller module**

In `backend/src/controllers/mod.rs`, add:

```rust
pub mod scheduler_settings;
```

(Keep the module list alphabetised as in the existing file.)

- [ ] **Step 3: Register the route**

In `backend/src/app.rs`, find the chained `.add_route(...)` calls around line 62 and add:

```rust
.add_route(controllers::scheduler_settings::routes())
```

Place it next to `controllers::scheduler::routes()`.

- [ ] **Step 4: Build**

```bash
cargo build -p klassenzeit-backend
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/scheduler_settings.rs backend/src/controllers/mod.rs backend/src/app.rs
git commit -m "feat(backend): GET/PUT scheduler-settings endpoints"
```

---

## Task 9 — Backend: integration tests for `scheduler_settings` endpoints

**Files:**
- Create: `backend/tests/requests/scheduler_settings.rs`
- Modify: `backend/tests/requests/mod.rs`

Integration tests need a running Postgres and the `loco` user. Ensure `just test-db-setup` has been run.

- [ ] **Step 1: Inspect an existing request test for the patterns**

Read `backend/tests/requests/room_timeslot_capacities.rs` (if exists) or `backend/tests/requests/rooms.rs` to identify:
- How the test boots the app (`testing::boot_test`, `loco_rs::testing`, `request` helper?)
- How a test school + admin auth header is set up (likely a helper in `mod.rs`)
- The JSON assertion style

If the patterns differ from what I show below, copy them — don't invent new patterns.

- [ ] **Step 2: Write the test file**

Create `backend/tests/requests/scheduler_settings.rs`. The skeleton below assumes Loco's `request` testing helper and a shared `testing::auth_admin` helper:

```rust
use insta::assert_json_snapshot;
use klassenzeit_backend::app::App;
use loco_rs::testing::prelude::*;
use serde_json::json;

use super::prepare_school_with_admin;  // hypothetical helper from mod.rs; replace with actual

#[tokio::test]
#[serial_test::serial]
async fn get_returns_defaults_when_no_row() {
    request::<App, _, _>(|request, ctx| async move {
        let (school_id, admin_token) = prepare_school_with_admin(&ctx).await;

        let resp = request
            .get(&format!("/api/schools/{school_id}/scheduler-settings"))
            .add_header("Authorization", &format!("Bearer {admin_token}"))
            .await;

        assert_eq!(resp.status_code(), 200);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["weights"]["w_teacher_gap"], 1);
        assert_eq!(body["weights"]["w_subject_distribution"], 2);
        assert_eq!(body["weights"]["soften_teacher_max_hours"], serde_json::Value::Null);
    })
    .await;
}

#[tokio::test]
#[serial_test::serial]
async fn put_as_admin_persists_and_get_reflects() {
    request::<App, _, _>(|request, ctx| async move {
        let (school_id, admin_token) = prepare_school_with_admin(&ctx).await;

        let body = json!({
            "w_preferred_slot": 3,
            "w_teacher_gap": 5,
            "w_subject_distribution": 2,
            "w_class_teacher_first_period": 1,
            "soften_teacher_max_hours": 100,
            "soften_teacher_availability": null,
            "soften_teacher_qualification": null,
            "soften_room_suitability": null,
            "soften_room_capacity": null,
            "soften_class_availability": null
        });

        let resp = request
            .put(&format!("/api/schools/{school_id}/scheduler-settings"))
            .add_header("Authorization", &format!("Bearer {admin_token}"))
            .json(&body)
            .await;
        assert_eq!(resp.status_code(), 200);

        let get_resp = request
            .get(&format!("/api/schools/{school_id}/scheduler-settings"))
            .add_header("Authorization", &format!("Bearer {admin_token}"))
            .await;
        let got: serde_json::Value = get_resp.json();
        assert_eq!(got["weights"]["w_teacher_gap"], 5);
        assert_eq!(got["weights"]["soften_teacher_max_hours"], 100);
    })
    .await;
}

#[tokio::test]
#[serial_test::serial]
async fn put_as_non_admin_returns_forbidden() {
    request::<App, _, _>(|request, ctx| async move {
        let (school_id, member_token) = prepare_school_with_member(&ctx).await;
        let resp = request
            .put(&format!("/api/schools/{school_id}/scheduler-settings"))
            .add_header("Authorization", &format!("Bearer {member_token}"))
            .json(&json!({ "w_teacher_gap": 2 }))
            .await;
        assert_eq!(resp.status_code(), 403);
    })
    .await;
}

#[tokio::test]
#[serial_test::serial]
async fn put_out_of_range_returns_422() {
    request::<App, _, _>(|request, ctx| async move {
        let (school_id, admin_token) = prepare_school_with_admin(&ctx).await;
        let resp = request
            .put(&format!("/api/schools/{school_id}/scheduler-settings"))
            .add_header("Authorization", &format!("Bearer {admin_token}"))
            .json(&json!({ "w_teacher_gap": 999 }))
            .await;
        assert_eq!(resp.status_code(), 422);
    })
    .await;
}
```

**Important:** Before writing this file, open `backend/tests/requests/mod.rs` and an existing test file to confirm:
- The exact helper name (`prepare_school_with_admin`, `setup_school_with_admin`, `create_test_school`, etc.).
- The exact auth pattern (JWT bearer? Mock extractor? Test feature flag?).
- Whether `#[serial_test::serial]` is needed.

If no shared helper exists, copy whatever setup code other request tests use inline.

- [ ] **Step 3: Register the test module**

In `backend/tests/requests/mod.rs`, add `pub mod scheduler_settings;` (or `mod scheduler_settings;` — match existing style).

- [ ] **Step 4: Run the tests**

```bash
just backend-test  # runs test-db-setup + cargo test -p klassenzeit-backend --test mod
```

Expected: 4 new tests pass. If they fail because the helper names I guessed don't exist, replace them with whatever the other request tests use.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/requests/scheduler_settings.rs backend/tests/requests/mod.rs
git commit -m "test(backend): integration tests for scheduler-settings endpoints"
```

---

## Task 10 — Backend: pipe weights into `load_schedule_input`

**Files:**
- Modify: `backend/src/services/scheduler.rs`

- [ ] **Step 1: Load weights in `load_schedule_input`**

At the end of `load_schedule_input` (in `backend/src/services/scheduler.rs`), before the `Ok(sched::ScheduleInput { ... })` return, add:

```rust
let weights = crate::services::scheduler_settings::load(db, school_id)
    .await
    .unwrap_or_default()
    .into();
```

Then in the return expression, add `weights,`:

```rust
Ok(sched::ScheduleInput {
    teachers: sched_teachers,
    classes: sched_classes,
    rooms: sched_rooms,
    subjects: sched_subjects,
    timeslots: sched_timeslots,
    requirements,
    stundentafeln: vec![],
    weights,
})
```

Note: `.unwrap_or_default()` on the `Result` would swallow real DB errors. Use proper propagation:

```rust
let weights: klassenzeit_scheduler::planning::ConstraintWeights =
    crate::services::scheduler_settings::load(db, school_id).await?.into();
```

- [ ] **Step 2: Build**

```bash
cargo build -p klassenzeit-backend
```

Expected: clean build.

- [ ] **Step 3: Add an "effect on solve" test**

Append to `backend/tests/requests/scheduler.rs` (or create a new test in `scheduler_settings.rs`, whichever is simpler):

```rust
#[tokio::test]
#[serial_test::serial]
async fn weights_zero_removes_soft_penalty_in_solve() {
    // This test is illustrative — adjust to match the existing solve-trigger
    // setup in the file. The goal: assert that disabling w_teacher_gap yields
    // soft_score >= the baseline run (penalty is 0 or absent).
    //
    // If no small solve fixture is easy here, skip this test and leave a
    // comment pointing to proptest_scoring.rs which already covers the
    // scheduler-side guarantee.
}
```

If wiring a real solve in an integration test is heavy, skip this test — the scheduler-side property test already proves the weight propagation is correct. Leave a one-line comment in `scheduler_settings.rs` saying so.

- [ ] **Step 4: Run backend tests**

```bash
just backend-test
```

Expected: all tests pass including the new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/scheduler.rs backend/tests/requests/
git commit -m "feat(backend): load constraint weights into ScheduleInput"
```

---

## Task 11 — Frontend: `ConstraintWeightsDto` type + API client helpers

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Inspect existing type file**

```bash
head -80 frontend/src/lib/types.ts
```

Note the existing export style (named `type` vs `interface`, camelCase vs snake_case).

- [ ] **Step 2: Add the DTO type**

Append to `frontend/src/lib/types.ts`:

```ts
export type ConstraintWeightsDto = {
  w_preferred_slot: number;
  w_teacher_gap: number;
  w_subject_distribution: number;
  w_class_teacher_first_period: number;
  soften_teacher_availability: number | null;
  soften_teacher_max_hours: number | null;
  soften_teacher_qualification: number | null;
  soften_room_suitability: number | null;
  soften_room_capacity: number | null;
  soften_class_availability: number | null;
};

export type SchedulerSettingsResponse = {
  weights: ConstraintWeightsDto;
};

export const DEFAULT_CONSTRAINT_WEIGHTS: ConstraintWeightsDto = {
  w_preferred_slot: 1,
  w_teacher_gap: 1,
  w_subject_distribution: 2,
  w_class_teacher_first_period: 1,
  soften_teacher_availability: null,
  soften_teacher_max_hours: null,
  soften_teacher_qualification: null,
  soften_room_suitability: null,
  soften_room_capacity: null,
  soften_class_availability: null,
};
```

Field names stay snake_case to match the backend JSON exactly (no casing mismatch bugs).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(frontend): ConstraintWeightsDto type"
```

---

## Task 12 — Frontend: i18n keys for scheduler settings tab

**Files:**
- Modify: `frontend/src/messages/en.json`
- Modify: `frontend/src/messages/de.json`

- [ ] **Step 1: Add English keys**

In `frontend/src/messages/en.json`, locate the `"settings": {` object and add a `"scheduler"` sub-object. Also add `"scheduler"` to the tab labels object if one exists (check for `"tabs": { ... }`):

```json
"scheduler": {
  "tab_label": "Scheduler",
  "section_soft": "Soft constraint weights",
  "section_soft_description": "Higher weights prioritise the constraint. Set to 0 to disable.",
  "section_hard": "Hard constraint relaxation",
  "section_hard_description": "Allow the solver to violate a rule with the given penalty when no strict solution exists.",
  "section_actions": "Actions",
  "save": "Save",
  "saving": "Saving…",
  "reset_defaults": "Reset to defaults",
  "saved_toast": "Scheduler settings saved",
  "error_toast": "Failed to save scheduler settings",
  "disabled_hint": "Disabled",
  "strict": "Strict",
  "allow_with_penalty": "Allow with penalty",
  "constraints": {
    "preferred_slot": {
      "label": "Preferred slot",
      "description": "Penalise teaching in slots not marked as preferred."
    },
    "teacher_gap": {
      "label": "Teacher gaps",
      "description": "Penalise free periods between lessons on the same day."
    },
    "subject_distribution": {
      "label": "Subject distribution",
      "description": "Penalise teaching the same subject twice on one day."
    },
    "class_teacher_first_period": {
      "label": "Class teacher first period",
      "description": "Prefer the class teacher to teach the first period of each day."
    },
    "teacher_availability": {
      "label": "Teacher availability",
      "description": "Teacher blocked this slot."
    },
    "teacher_max_hours": {
      "label": "Teacher max hours",
      "description": "Teacher exceeds their weekly hour budget."
    },
    "teacher_qualification": {
      "label": "Teacher qualification",
      "description": "Teacher is not qualified for the subject."
    },
    "room_suitability": {
      "label": "Room suitability",
      "description": "Room is not suitable for the subject."
    },
    "room_capacity": {
      "label": "Room capacity",
      "description": "Room is too small for the class."
    },
    "class_availability": {
      "label": "Class availability",
      "description": "Class blocked this slot."
    }
  }
}
```

- [ ] **Step 2: Add German keys**

Mirror the structure in `frontend/src/messages/de.json` with German translations. Reasonable defaults:

```json
"scheduler": {
  "tab_label": "Planung",
  "section_soft": "Weiche Randbedingungen",
  "section_soft_description": "Höhere Gewichte priorisieren die Randbedingung. 0 deaktiviert sie.",
  "section_hard": "Harte Randbedingungen lockern",
  "section_hard_description": "Verletzung mit der angegebenen Strafe erlauben, wenn keine strikte Lösung existiert.",
  "section_actions": "Aktionen",
  "save": "Speichern",
  "saving": "Speichere…",
  "reset_defaults": "Auf Standard zurücksetzen",
  "saved_toast": "Planungseinstellungen gespeichert",
  "error_toast": "Planungseinstellungen konnten nicht gespeichert werden",
  "disabled_hint": "Deaktiviert",
  "strict": "Strikt",
  "allow_with_penalty": "Mit Strafe erlauben",
  "constraints": {
    "preferred_slot": {
      "label": "Bevorzugte Stunden",
      "description": "Unterricht in nicht bevorzugten Stunden bestrafen."
    },
    "teacher_gap": {
      "label": "Lehrer-Freistunden",
      "description": "Freistunden zwischen Unterrichtsstunden am selben Tag bestrafen."
    },
    "subject_distribution": {
      "label": "Fächerverteilung",
      "description": "Zwei Stunden desselben Fachs am selben Tag bestrafen."
    },
    "class_teacher_first_period": {
      "label": "Klassenlehrer erste Stunde",
      "description": "Klassenlehrer sollte die erste Stunde unterrichten."
    },
    "teacher_availability": {
      "label": "Lehrerverfügbarkeit",
      "description": "Lehrer hat diese Stunde blockiert."
    },
    "teacher_max_hours": {
      "label": "Maximale Lehrerstunden",
      "description": "Lehrer überschreitet sein Wochenstundenkontingent."
    },
    "teacher_qualification": {
      "label": "Lehrerqualifikation",
      "description": "Lehrer ist für das Fach nicht qualifiziert."
    },
    "room_suitability": {
      "label": "Raumeignung",
      "description": "Raum ist für das Fach nicht geeignet."
    },
    "room_capacity": {
      "label": "Raumkapazität",
      "description": "Raum ist zu klein für die Klasse."
    },
    "class_availability": {
      "label": "Klassenverfügbarkeit",
      "description": "Klasse hat diese Stunde blockiert."
    }
  }
}
```

- [ ] **Step 3: Run frontend type-check**

```bash
cd frontend && bun run typecheck
```

Expected: no errors. If next-intl strict mode flags missing keys between locales, fix the mismatch.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/messages/en.json frontend/src/messages/de.json
git commit -m "i18n(frontend): scheduler settings tab keys"
```

---

## Task 13 — Frontend: `SchedulerTab` component

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/scheduler-tab.tsx`

- [ ] **Step 1: Write the component**

Follow the pattern of `terms-tab.tsx`: plain React state, `useApiClient`, `useTranslations`, Sonner toasts, explicit Save button.

```tsx
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useApiClient } from "@/hooks/use-api-client";
import {
  DEFAULT_CONSTRAINT_WEIGHTS,
  type ConstraintWeightsDto,
  type SchedulerSettingsResponse,
} from "@/lib/types";

type SoftKey =
  | "w_preferred_slot"
  | "w_teacher_gap"
  | "w_subject_distribution"
  | "w_class_teacher_first_period";

type SoftenKey =
  | "soften_teacher_availability"
  | "soften_teacher_max_hours"
  | "soften_teacher_qualification"
  | "soften_room_suitability"
  | "soften_room_capacity"
  | "soften_class_availability";

const SOFT_KEYS: SoftKey[] = [
  "w_preferred_slot",
  "w_teacher_gap",
  "w_subject_distribution",
  "w_class_teacher_first_period",
];

const SOFTEN_KEYS: SoftenKey[] = [
  "soften_teacher_availability",
  "soften_teacher_max_hours",
  "soften_teacher_qualification",
  "soften_room_suitability",
  "soften_room_capacity",
  "soften_class_availability",
];

const SOFT_I18N: Record<SoftKey, string> = {
  w_preferred_slot: "preferred_slot",
  w_teacher_gap: "teacher_gap",
  w_subject_distribution: "subject_distribution",
  w_class_teacher_first_period: "class_teacher_first_period",
};

const SOFTEN_I18N: Record<SoftenKey, string> = {
  soften_teacher_availability: "teacher_availability",
  soften_teacher_max_hours: "teacher_max_hours",
  soften_teacher_qualification: "teacher_qualification",
  soften_room_suitability: "room_suitability",
  soften_room_capacity: "room_capacity",
  soften_class_availability: "class_availability",
};

const DEFAULT_SOFTEN_PENALTY = 100;

export function SchedulerTab() {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.scheduler");
  const tc = useTranslations("constraints");

  const [weights, setWeights] = useState<ConstraintWeightsDto>(
    DEFAULT_CONSTRAINT_WEIGHTS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get<SchedulerSettingsResponse>(
        `/api/schools/${schoolId}/scheduler-settings`,
      )
      .then((resp) => setWeights(resp.weights))
      .catch(() => toast.error(t("error_toast")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const resp = await apiClient.put<
        ConstraintWeightsDto,
        SchedulerSettingsResponse
      >(
        `/api/schools/${schoolId}/scheduler-settings`,
        weights,
      );
      setWeights(resp.weights);
      toast.success(t("saved_toast"));
    } catch {
      toast.error(t("error_toast"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setWeights(DEFAULT_CONSTRAINT_WEIGHTS);

  const setSoft = (key: SoftKey, value: number) =>
    setWeights((w) => ({ ...w, [key]: value }));

  const setSoftenMode = (key: SoftenKey, strict: boolean) =>
    setWeights((w) => ({
      ...w,
      [key]: strict ? null : DEFAULT_SOFTEN_PENALTY,
    }));

  const setSoftenPenalty = (key: SoftenKey, penalty: number) =>
    setWeights((w) => ({ ...w, [key]: penalty }));

  if (loading) {
    return <div className="p-4">{t("saving")}</div>;
  }

  return (
    <div className="flex flex-col gap-8 p-4" data-testid="scheduler-tab">
      {/* Soft constraint weights */}
      <section>
        <h3 className="text-lg font-semibold">{t("section_soft")}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("section_soft_description")}
        </p>
        <div className="flex flex-col gap-3">
          {SOFT_KEYS.map((key) => {
            const name = SOFT_I18N[key];
            const value = weights[key];
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label htmlFor={key}>{t(`constraints.${name}.label`)}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t(`constraints.${name}.description`)}
                  </p>
                </div>
                <Input
                  id={key}
                  data-testid={`soft-${key}`}
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  className="w-24"
                  value={value}
                  onChange={(e) =>
                    setSoft(key, Number.parseInt(e.target.value, 10) || 0)
                  }
                />
                {value === 0 && (
                  <span className="text-xs text-muted-foreground w-20">
                    {t("disabled_hint")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Hard constraint softening */}
      <section>
        <h3 className="text-lg font-semibold">{t("section_hard")}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("section_hard_description")}
        </p>
        <div className="flex flex-col gap-4">
          {SOFTEN_KEYS.map((key) => {
            const name = SOFTEN_I18N[key];
            const value = weights[key];
            const strict = value === null;
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label>{t(`constraints.${name}.label`)}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t(`constraints.${name}.description`)}
                  </p>
                </div>
                <RadioGroup
                  value={strict ? "strict" : "allow"}
                  onValueChange={(v) => setSoftenMode(key, v === "strict")}
                  className="flex gap-4"
                  data-testid={`mode-${key}`}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="strict" id={`${key}-strict`} />
                    <Label htmlFor={`${key}-strict`}>{t("strict")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="allow" id={`${key}-allow`} />
                    <Label htmlFor={`${key}-allow`}>
                      {t("allow_with_penalty")}
                    </Label>
                  </div>
                </RadioGroup>
                <Input
                  data-testid={`penalty-${key}`}
                  type="number"
                  min={1}
                  max={100000}
                  step={1}
                  className="w-28"
                  disabled={strict}
                  value={value ?? DEFAULT_SOFTEN_PENALTY}
                  onChange={(e) =>
                    setSoftenPenalty(
                      key,
                      Number.parseInt(e.target.value, 10) || DEFAULT_SOFTEN_PENALTY,
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={saving}>
          {t("reset_defaults")}
        </Button>
      </div>
    </div>
  );
}
```

Verify the actual `useApiClient` method signatures against `hooks/use-api-client.ts` — if its `put` method takes only one type parameter or a different shape, adjust.

- [ ] **Step 2: Verify shadcn/ui `RadioGroup` is available**

```bash
ls frontend/src/components/ui/ | grep radio
```

If `radio-group.tsx` is missing, add it via shadcn:
```bash
cd frontend && bunx --bun shadcn@latest add radio-group
```

- [ ] **Step 3: Run typecheck**

```bash
cd frontend && bun run typecheck
```

Expected: no errors. Fix any type mismatches from the `useApiClient` signature guess.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/components/scheduler-tab.tsx frontend/src/components/ui/radio-group.tsx 2>/dev/null || true
git commit -m "feat(frontend): SchedulerTab component"
```

---

## Task 14 — Frontend: register tab in settings page

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/page.tsx`

- [ ] **Step 1: Add to TABS array + import**

At the top:

```tsx
import { SchedulerTab } from "./components/scheduler-tab";
```

Modify the `TABS` constant:

```tsx
const TABS = [
  "terms",
  "classes",
  "subjects",
  "teachers",
  "rooms",
  "timeslots",
  "scheduler",
] as const;
```

Find the rendering switch (likely a `{activeTab === "terms" && <TermsTab />}` chain). Add:

```tsx
{activeTab === "scheduler" && <SchedulerTab />}
```

If the tab labels are rendered in a map loop, verify the i18n key lookup still works for `scheduler` (the `tab_label` key we added maps to it, or the `settings.tabs.scheduler` key — whichever the existing loop reads).

- [ ] **Step 2: Run the frontend**

```bash
cd frontend && bun run dev
```

Manually load `/en/schools/<an id>/settings?tab=scheduler` and verify the tab renders and loads defaults. Shut down with Ctrl+C.

- [ ] **Step 3: Typecheck**

```bash
cd frontend && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/settings/page.tsx
git commit -m "feat(frontend): register scheduler tab in settings page"
```

---

## Task 15 — Frontend: component tests for `SchedulerTab`

**Files:**
- Create: `frontend/src/__tests__/scheduler-tab.test.tsx`

- [ ] **Step 1: Inspect an existing component test**

```bash
ls frontend/src/__tests__/
```

Open one that tests a settings tab (if any) to copy the render helper, api-client mock, and `next-intl` test provider setup.

- [ ] **Step 2: Write the test file**

Skeleton (adjust to the project's actual test harness — Vitest? Bun test?):

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SchedulerTab } from "@/app/[locale]/schools/[id]/settings/components/scheduler-tab";

// Mock useApiClient
const mockGet = vi.fn();
const mockPut = vi.fn();
vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => ({ get: mockGet, put: mockPut }),
}));

// Mock next/navigation params
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "school-1" }),
}));

// Stub next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Stub toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("SchedulerTab", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it("renders defaults when backend returns empty weights", async () => {
    mockGet.mockResolvedValue({
      weights: {
        w_preferred_slot: 1,
        w_teacher_gap: 1,
        w_subject_distribution: 2,
        w_class_teacher_first_period: 1,
        soften_teacher_availability: null,
        soften_teacher_max_hours: null,
        soften_teacher_qualification: null,
        soften_room_suitability: null,
        soften_room_capacity: null,
        soften_class_availability: null,
      },
    });
    render(<SchedulerTab />);
    await waitFor(() => {
      expect(screen.getByTestId("soft-w_teacher_gap")).toHaveValue(1);
      expect(screen.getByTestId("soft-w_subject_distribution")).toHaveValue(2);
    });
  });

  it("saves updated soft weight via PUT", async () => {
    mockGet.mockResolvedValue({
      weights: {
        w_preferred_slot: 1,
        w_teacher_gap: 1,
        w_subject_distribution: 2,
        w_class_teacher_first_period: 1,
        soften_teacher_availability: null,
        soften_teacher_max_hours: null,
        soften_teacher_qualification: null,
        soften_room_suitability: null,
        soften_room_capacity: null,
        soften_class_availability: null,
      },
    });
    mockPut.mockResolvedValue({
      weights: {
        w_preferred_slot: 1,
        w_teacher_gap: 5,
        w_subject_distribution: 2,
        w_class_teacher_first_period: 1,
        soften_teacher_availability: null,
        soften_teacher_max_hours: null,
        soften_teacher_qualification: null,
        soften_room_suitability: null,
        soften_room_capacity: null,
        soften_class_availability: null,
      },
    });
    render(<SchedulerTab />);
    await waitFor(() => screen.getByTestId("soft-w_teacher_gap"));

    fireEvent.change(screen.getByTestId("soft-w_teacher_gap"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/api/schools/school-1/scheduler-settings",
        expect.objectContaining({ w_teacher_gap: 5 }),
      );
    });
  });

  it("toggling allow-with-penalty enables penalty input", async () => {
    mockGet.mockResolvedValue({
      weights: {
        w_preferred_slot: 1,
        w_teacher_gap: 1,
        w_subject_distribution: 2,
        w_class_teacher_first_period: 1,
        soften_teacher_availability: null,
        soften_teacher_max_hours: null,
        soften_teacher_qualification: null,
        soften_room_suitability: null,
        soften_room_capacity: null,
        soften_class_availability: null,
      },
    });
    render(<SchedulerTab />);
    await waitFor(() => screen.getByTestId("penalty-soften_teacher_max_hours"));

    const penaltyInput = screen.getByTestId("penalty-soften_teacher_max_hours");
    expect(penaltyInput).toBeDisabled();

    fireEvent.click(screen.getByLabelText("allow_with_penalty", { selector: "#soften_teacher_max_hours-allow" }));

    await waitFor(() => {
      expect(penaltyInput).not.toBeDisabled();
    });
  });
});
```

Cross-check the test runner name (`bun test`, `vitest`, `jest`) and adjust imports. If component tests live somewhere other than `src/__tests__/`, place the file to match existing convention.

- [ ] **Step 3: Run the tests**

```bash
cd frontend && bun test scheduler-tab
```

Expected: 3 tests pass. If the useApiClient `put` signature or i18n mock shape doesn't match, fix.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/__tests__/scheduler-tab.test.tsx
git commit -m "test(frontend): SchedulerTab component tests"
```

---

## Task 16 — Full verification and docs update

- [ ] **Step 1: Run all checks**

```bash
just check
just test
just backend-test
```

Expected: clean. Fix any lint/format issues the repo hooks flag.

- [ ] **Step 2: Update `docs/STATUS.md`**

Insert under "Completed Steps" (after Kempe Chain Moves):

```markdown
### Solver Constraints UI (PR1: Weights + Softening)
- Spec: `superpowers/specs/2026-04-06-solver-constraints-ui-design.md`
- Plan: `superpowers/plans/2026-04-06-solver-constraints-ui.md`
- `ConstraintWeights` in scheduler crate, threaded into `ScheduleInput`/`ProblemFacts`
- `school_scheduler_settings` table + `GET`/`PUT /api/schools/{id}/scheduler-settings`
- Scheduler tab in school settings UI (weights + hard→soft toggles)
- PR2 (teacher preferred slots + room suitability editors) tracked as 4a/4b
```

Update the "Next Up" list: remove `1e` and replace with `4a/4b (preferred slots + room suitability editors)`.

- [ ] **Step 3: Update `docs/superpowers/next-steps.md`**

- Move item 1e row into the "Done" section with the PR link placeholder.
- Leave 4a/4b as `idea`, add a note that PR2 of solver-constraints-ui will implement them.

- [ ] **Step 4: Commit docs**

```bash
git add docs/
git commit -m "docs: mark 1e PR1 complete, update next-steps"
```

- [ ] **Step 5: Open the PR**

Per CLAUDE.md workflow:
```bash
git push -u origin <branch>
gh pr create --title "feat(1e): solver constraint weights + softening UI (PR1)" --body "$(cat <<'EOF'
## Summary
- `ConstraintWeights` struct in scheduler crate; all 4 soft constraints + 6 softenable hard constraints now weight-driven.
- New `school_scheduler_settings` table and `GET`/`PUT /api/schools/{id}/scheduler-settings` endpoints.
- New "Scheduler" tab in school settings UI (admin-only PUT).
- PR2 (teacher preferred slots + room suitability editors) will follow.

## Test plan
- [x] Scheduler unit tests pass (`cargo test -p klassenzeit-scheduler`)
- [x] Property tests parameterised over random weights still pass
- [x] Backend integration tests: GET/PUT/403/422
- [x] Frontend component tests for SchedulerTab
- [x] Manual: tab loads defaults, saves a change, reflects after reload
- [x] Benchmark run with default weights matches pre-PR baseline
EOF
)"
```

- [ ] **Step 6: Fix CI and merge per CLAUDE.md workflow**

Monitor with `gh pr checks` / `gh pr view --comments`. Fix failures until green, then merge.

---

## Self-Review Notes

**Spec coverage:**
- `ConstraintWeights` struct → Task 1 ✓
- Scheduler soft weight wiring → Task 2 ✓
- Softenable hard wiring → Task 3 ✓
- Proptest parameterisation → Task 4 ✓
- Migration → Task 5 ✓
- Entity → Task 6 ✓
- Service (DTO, load, upsert, validation, conversion) → Task 7 ✓
- Controller endpoints → Task 8 ✓
- Backend integration tests → Task 9 ✓
- `load_schedule_input` wiring → Task 10 ✓
- Frontend type → Task 11 ✓
- i18n → Task 12 ✓
- Component → Task 13 ✓
- Tab registration → Task 14 ✓
- Component tests → Task 15 ✓
- Docs → Task 16 ✓

**Type consistency:**
- `ConstraintWeights` field names identical in scheduler, DTO, TypeScript type.
- `hard_or_soften` helper name used consistently in Task 3.
- `DEFAULT_CONSTRAINT_WEIGHTS` constant name used consistently across Tasks 11, 13, 15.

**Known fuzziness marked for executor judgement:**
- Task 9 request-test harness (Loco's helper names vary — instructed executor to inspect existing tests before writing).
- Task 13 `useApiClient` method signatures (executor cross-checks against the hook file).
- Task 15 test runner (executor confirms vitest vs bun test from existing tests).

These are "inspect neighbour, match pattern" tasks — not placeholders. They exist because matching the existing harness exactly matters more than guessing now.
