# Subject-level pedagogy preferences

**Date:** 2026-04-28
**Status:** Design approved (autopilot autonomous mode).

## Problem

Sprint item #9c on `docs/superpowers/OPEN_THINGS.md` is the "subject-level pedagogy preferences" follow-up to PR-9a (soft-score infrastructure) and PR-9b (LAHC local search). Both predecessors shipped *structural* soft constraints (`class_gap`, `teacher_gap`) but neither could express the real-world rules that motivated the sprint: "Hauptfächer früh", "Sport not first period", "Musik / Kunst dedicated rooms".

The third rule is already covered by `RoomSubjectSuitability`. The first two need new metadata on Subject plus matching soft-constraint terms in `score_solution`. Without those terms, LAHC's local search has no signal to optimise on for the per-subject pedagogy axes; the bench's `Soft score = 0/0` for grundschule reflects this exactly: the gap-only weights leave nothing for the local search to chew on once the lowest-delta greedy hits a local minimum.

Today's solver:

- `Subject` in `solver-core/src/types.rs` has a single `id` field; the matching DB model `subjects` table has `id`, `name`, `short_name`, `color`, plus timestamps.
- `ConstraintWeights` carries two fields (`class_gap`, `teacher_gap`); `solve()`'s active default is `1` for each.
- `score_solution` partitions placements by `(class, day)` and `(teacher, day)`, sums gap-hours, multiplies by weights. Per-placement contributions are zero by construction.

## Goal

One PR that ships two orthogonal subject-level soft-constraint axes with end-to-end coverage:

1. Extend the Rust `Subject` struct in `solver-core/src/types.rs` with `prefer_early_periods: bool` and `avoid_first_period: bool`. Both are required (not `Option`); JSON wire format extends the `subjects` array entries.
2. Extend `ConstraintWeights` with `prefer_early_period: u32` and `avoid_first_period: u32`. Both default to `0` in `ConstraintWeights::default()`. `solve()`'s active defaults extend to weight `1` for each new axis.
3. Add per-placement scoring terms to `score_solution`: linear in `tb.position` for prefer-early subjects, binary on `tb.position == 0` for avoid-first-period subjects.
4. Extend LAHC delta evaluation in `solver-core/src/lahc.rs` with a small `subject_preference_score(subject, tb, weights) -> u32` helper, symmetric for insert / remove. Allocation-free.
5. Add the matching DB columns on `subjects` via Alembic migration with `server_default=text("false")`. SQLAlchemy ORM model gains the two `Mapped[bool]` columns.
6. Extend Pydantic `SubjectCreate`, `SubjectUpdate`, `SubjectResponse` with the two boolean fields. Update `solver_io.build_problem_json` to emit them in the `subjects` array.
7. Update demo seeds: `demo_grundschule.py` and `demo_grundschule_zweizuegig.py` mark Mathematik and Deutsch with `prefer_early_periods=true` and Sport with `avoid_first_period=true`. Bench fixture `solver_fixtures.rs` mirrors the same booleans.
8. Frontend ships two checkboxes inside the subject edit dialog (no new table column), matching Zod schema fields, four i18n keys per locale, regenerated OpenAPI types, Vitest coverage.
9. ADR 0017 records the load-bearing decisions (two booleans not an enum, direct fields not a join table, linear vs. binary scoring shapes, active default weight 1).
10. OPEN_THINGS sprint item #9c marked closed; bench `BASELINE.md` refreshed only if the diff exceeds 20% per fixture.

After this PR: schools mark subjects with pedagogy flags through the existing CRUD UI; LAHC's local search has new axes to chase; the bench measures non-zero `Soft score` driven by per-subject preferences and proves LAHC can reduce them.

## Non-goals

- **Third or fourth axis.** "Avoid last period", "prefer afternoon", "must be twice a week", "must be different teachers across hours of the same lesson" all stay deferred. The two axes shipped here are the ones with concrete real-world demand from the seed research.
- **Subject preferences as a per-class override.** A subject's flags apply uniformly across every Lesson that subject appears in. A class-level "this class wants Sport last period" override is out of scope; revisit if a customer school surfaces it.
- **Configurable weight knobs per subject.** All flagged subjects pay the same weight per axis. A "this Hauptfach is more important than that one" knob would be a `u32` weight on Subject instead of a bool; defer until anyone asks.
- **Frontend rendering of `soft_score` on the schedule view.** The number is exposed by the API today but unrendered. Surfacing it cohabits a different PR (likely a "schedule quality" dashboard).
- **Doppelstunden (`preferred_block_size > 1`).** Sprint PR-8, still P2.
- **Promote `SolveConfig.max_iterations` to a production knob.** Tracked separately; this PR doesn't touch the LAHC config surface.
- **Subject color or short-name changes.** The migration only adds columns; it doesn't refactor the existing schema.
- **i18n overhaul.** Four new keys per locale extend the existing `subjects.fields.*` namespace; the broader Zod-error translation work stays deferred.

## Design

### `Subject` extension in `solver-core/src/types.rs`

```rust
/// A subject (the thing being taught in a lesson).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Subject {
    /// Stable identifier for this subject.
    pub id: SubjectId,
    /// When true, the scoring function adds `tb.position * weights.prefer_early_period`
    /// per placement of any lesson teaching this subject. Use for "Hauptfächer früh".
    pub prefer_early_periods: bool,
    /// When true, the scoring function adds `weights.avoid_first_period` per placement
    /// of any lesson teaching this subject that lands at `tb.position == 0`. Use for
    /// "Sport nicht in der ersten Stunde".
    pub avoid_first_period: bool,
}
```

Both fields are required, not `Option<bool>`; backend always emits them. The JSON wire format change is additive: a Rust `solver-core` consumer ahead of an old backend would fail at deserialise (`deny_unknown_fields` is on the struct, but the new fields are on the *struct itself*, so an old backend would simply omit them and deserialise would fail with `missing field`). PR ships backend + Rust together so no consumer sees a mismatched contract.

### `ConstraintWeights` extension

`solver-core/src/types.rs`:

```rust
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConstraintWeights {
    /// Penalty per gap-hour in any class's day.
    pub class_gap: u32,
    /// Penalty per gap-hour in any teacher's day.
    pub teacher_gap: u32,
    /// Linear penalty per placement of a `prefer_early_periods` subject:
    /// `tb.position * prefer_early_period`. Zero when the subject's flag is false
    /// or when this weight is zero.
    pub prefer_early_period: u32,
    /// Constant penalty per placement of an `avoid_first_period` subject at
    /// `tb.position == 0`. Zero when the subject's flag is false, the weight is
    /// zero, or the placement isn't at position 0.
    pub avoid_first_period: u32,
}
```

`Default` derives all four to `0`. `solve()`'s active defaults extend:

```rust
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    solve_with_config(
        problem,
        &SolveConfig {
            weights: ConstraintWeights {
                class_gap: 1,
                teacher_gap: 1,
                prefer_early_period: 1,
                avoid_first_period: 1,
            },
            deadline: Some(Duration::from_millis(200)),
            ..SolveConfig::default()
        },
    )
}
```

### `score_solution` extension

`solver-core/src/score.rs` adds a per-placement loop after the existing partition logic:

```rust
pub fn score_solution(
    problem: &Problem,
    placements: &[Placement],
    weights: &ConstraintWeights,
) -> u32 {
    if weights.class_gap == 0
        && weights.teacher_gap == 0
        && weights.prefer_early_period == 0
        && weights.avoid_first_period == 0
    {
        return 0;
    }

    let tb_lookup: HashMap<TimeBlockId, &TimeBlock> =
        problem.time_blocks.iter().map(|tb| (tb.id, tb)).collect();
    let lesson_lookup: HashMap<LessonId, &Lesson> =
        problem.lessons.iter().map(|l| (l.id, l)).collect();
    let subject_lookup: HashMap<SubjectId, &Subject> =
        problem.subjects.iter().map(|s| (s.id, s)).collect();

    // ... existing gap-counting partition logic over by_class_day / by_teacher_day ...

    let subject_preference: u32 = placements
        .iter()
        .map(|p| {
            let lesson = lesson_lookup[&p.lesson_id];
            let subject = subject_lookup[&lesson.subject_id];
            let tb = tb_lookup[&p.time_block_id];
            subject_preference_score(subject, tb, weights)
        })
        .sum();

    weights.class_gap.saturating_mul(class_gaps)
        + weights.teacher_gap.saturating_mul(teacher_gaps)
        + subject_preference
}

/// Per-placement subject-preference score. Returns
/// `tb.position * weights.prefer_early_period` (linear) when the subject's
/// `prefer_early_periods` flag is set, plus `weights.avoid_first_period`
/// (binary) when the `avoid_first_period` flag is set and `tb.position == 0`.
pub(crate) fn subject_preference_score(
    subject: &Subject,
    tb: &TimeBlock,
    weights: &ConstraintWeights,
) -> u32 {
    let mut score = 0u32;
    if subject.prefer_early_periods {
        score = score.saturating_add(
            u32::from(tb.position).saturating_mul(weights.prefer_early_period),
        );
    }
    if subject.avoid_first_period && tb.position == 0 {
        score = score.saturating_add(weights.avoid_first_period);
    }
    score
}
```

The helper is `pub(crate)` so `solve.rs` (lowest-delta greedy) and `lahc.rs` (delta evaluation) can call it directly without re-implementing the math.

### LAHC delta evaluation

`solver-core/src/lahc.rs` already maintains running per-partition state for `class_gap` and `teacher_gap`. The new axes contribute a flat per-placement value, so the LAHC delta calculation simply adds:

```rust
// In the move-evaluation block (paraphrased):
let removed_subject_pref = subject_preference_score(&subject_lookup[&lesson.subject_id], &old_tb, weights);
let added_subject_pref   = subject_preference_score(&subject_lookup[&lesson.subject_id], &new_tb, weights);
let subject_pref_delta = added_subject_pref as i64 - removed_subject_pref as i64;
```

The delta is folded into the existing `delta` accumulator. Allocation-free; the same `subject_lookup: HashMap<SubjectId, &Subject>` built once in `solve_with_config` is passed by reference into the LAHC loop.

`solve.rs`'s lowest-delta greedy adds the same call inside `try_place_hour`'s candidate loop:

```rust
let candidate_pref = subject_preference_score(subject, tb, weights);
// candidate_score becomes (existing gap math) + candidate_pref
```

Because `subject_preference_score` depends only on `subject` and `tb`, not on `room`, the value can be hoisted out of the inner room loop the same way Q&A's hoisting note for PR-9a does for `class_old` / `teacher_old`.

### DB migration

New Alembic revision: `op.add_column` for both flags on `subjects`. Both columns are `Boolean`, NOT NULL, `server_default=sa.text("false")`. Existing rows get `false`; ORM `default=False` so application-side inserts that don't pass the field default consistently.

```python
def upgrade() -> None:
    op.add_column(
        "subjects",
        sa.Column(
            "prefer_early_periods",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "subjects",
        sa.Column(
            "avoid_first_period",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

def downgrade() -> None:
    op.drop_column("subjects", "avoid_first_period")
    op.drop_column("subjects", "prefer_early_periods")
```

The `server_default` stays on the column after the migration; this is intentional. SQLAlchemy 2.0 best practice is to keep the default at the DB level so ad-hoc `INSERT` statements (psql, alembic data-fixups, future test seeds) get the same default the ORM does. The ORM `default=False` mirrors it for the SQLA insert path.

### ORM model

`backend/src/klassenzeit_backend/db/models/subject.py`:

```python
class Subject(Base):
    """A school subject (e.g. Mathematik, Deutsch, Sport)."""

    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(String(100), unique=True)
    short_name: Mapped[str] = mapped_column(String(10), unique=True)
    color: Mapped[str] = mapped_column(String(16))
    prefer_early_periods: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
    )
    avoid_first_period: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )
```

### Pydantic schema

`backend/src/klassenzeit_backend/scheduling/schemas/subject.py`:

```python
class SubjectCreate(BaseModel):
    name: str
    short_name: str
    color: str = Field(pattern=COLOR_PATTERN)
    prefer_early_periods: bool = False
    avoid_first_period: bool = False


class SubjectUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    color: str | None = Field(default=None, pattern=COLOR_PATTERN)
    prefer_early_periods: bool | None = None
    avoid_first_period: bool | None = None


class SubjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    short_name: str
    color: str
    prefer_early_periods: bool
    avoid_first_period: bool
    created_at: datetime
    updated_at: datetime
```

### `solver_io` JSON shape

`backend/src/klassenzeit_backend/scheduling/solver_io.py:build_problem_json` emits:

```python
"subjects": [
    {
        "id": str(s.id),
        "prefer_early_periods": s.prefer_early_periods,
        "avoid_first_period": s.avoid_first_period,
    }
    for s in subjects
],
```

### Demo seed updates

`backend/src/klassenzeit_backend/seed/demo_grundschule.py`:

- `Mathematik`, `Deutsch`: `prefer_early_periods=True`, `avoid_first_period=False`.
- `Sport`: `prefer_early_periods=False`, `avoid_first_period=True`.
- All other subjects: both flags `False`.

`demo_grundschule_zweizuegig.py` imports `_SUBJECTS` from `demo_grundschule.py`, so the change propagates automatically. If `_SUBJECTS` is a NamedTuple, the literal extends; if it's a list of dicts, the dicts grow two keys.

`solver/solver-core/benches/solver_fixtures.rs` mirrors the same booleans on the fixture's `Subject` entries (Mathematik / Deutsch flagged for prefer-early, Sport flagged for avoid-first).

### Frontend

`frontend/src/features/subjects/schema.ts`:

```ts
export const SubjectSchema = z.object({
  name: z.string().min(1),
  short_name: z.string().min(1),
  color: z.string().regex(COLOR_PATTERN),
  prefer_early_periods: z.boolean().default(false),
  avoid_first_period: z.boolean().default(false),
});
```

`frontend/src/features/subjects/subjects-dialogs.tsx` adds two `<Checkbox>` rows (with `react-hook-form` `Controller` wrappers) in the create / edit dialog body. Order: after the color picker. Layout: each checkbox on its own row with label + help text under it, mirroring the existing FK-dropdown styling.

`frontend/src/i18n/locales/en.json` adds:

```json
"preferEarlyPeriods": {
  "label": "Prefer early periods",
  "help": "Schedule lessons of this subject earlier in the day when possible (e.g. Hauptfächer)."
},
"avoidFirstPeriod": {
  "label": "Avoid the first period",
  "help": "Avoid scheduling lessons of this subject at the very first period (e.g. Sport)."
}
```

`de.json` mirrors with German copy. Both keys nest under `subjects.fields`.

`frontend/src/api/types.gen.ts` regenerates via `mise run fe:types`. Existing Subjects table view does not gain a new column.

### Tests

| Layer | Test | Where |
|---|---|---|
| Unit | `subject_preference_score`: returns 0 when both flags off; returns `tb.position * weight` when prefer-early flag is on; returns `weight` only at position 0 when avoid-first flag is on; returns sum when both flags on at position 0 | `solver-core/src/score.rs` (inline) |
| Unit | `score_solution`: existing 8 tests pass under default-zero subject weights; new test "score_with_subject_preferences_off_equals_pre_9c_score" round-trips through PR-9b's gap-only behaviour | `solver-core/src/score.rs` (inline) |
| Unit | `solve_with_config`: existing tests pass under active-default `(1,1,1,1)` weights; new test "places prefer-early subject toward earlier position when greedy can choose" and "skips position 0 for avoid-first subject when an alternative exists" | `solver-core/src/solve.rs` (inline) |
| Property | `score_solution` linearity in `tb.position` for prefer-early subjects; `score_solution` equals `weights.avoid_first_period` count of position-0 placements among avoid-first subjects | `solver-core/tests/score_property.rs` |
| Property | LAHC determinism property still holds with the new axes (RNG draw count invariant) | `solver-core/tests/lahc_property.rs` |
| Bench | `BASELINE.md` regenerated only if `mise run bench` shows >20% drift; soft-score column gains a non-zero number for both fixtures | `solver-core/benches/solver_fixtures.rs`, `BASELINE.md` |
| Backend | `SubjectCreate`, `SubjectUpdate`, `SubjectResponse` round-trip the two new fields; default-zero on missing | `backend/tests/scheduling/test_subjects_routes.py` |
| Backend | `build_problem_json` emits the new keys for each subject | `backend/tests/scheduling/test_solver_io.py` |
| Backend | Alembic migration upgrade + downgrade test | `backend/tests/migrations/test_subject_preferences.py` |
| Frontend | Subject create dialog renders two checkboxes; toggling and saving sends both fields | `frontend/src/features/subjects/subjects-dialogs.test.tsx` |
| Frontend | Subject edit dialog hydrates from the API response | same file |

CI runs `mise run test` (Rust + Python + frontend) plus `mise run lint`. Bench is local-only.

## Risks and mitigations

- **20% perf budget breach.** New per-placement scoring loop adds `O(placements)` work on top of the existing partition cost. Mitigation: hoist the `subject_lookup` build to the top of `score_solution`; hoist the `subject_preference_score` evaluation out of `try_place_hour`'s room loop (depends only on `tb`, not on `room`); run `mise run bench` mid-implementation; if zweizuegig p50 breaches +20% over the post-LAHC baseline, optimise before refreshing `BASELINE.md`.
- **Wire format breakage.** Adding `prefer_early_periods` / `avoid_first_period` to a `#[serde(deny_unknown_fields)]` `Subject` struct forces every deserialiser to know the field. Mitigation: backend Pydantic and Rust types ship in the same PR; OpenAPI types regenerate. No persisted Problem JSON exists today.
- **Migration drift on existing rows.** `server_default=text("false")` covers the legacy rows. Mitigation: integration test runs the migration and checks `prefer_early_periods` / `avoid_first_period` are False on a row inserted before the migration.
- **LAHC determinism regression.** The RNG draw count must stay invariant across iterations, including across the new feasibility branches. Mitigation: PR-9b's `lahc_property.rs` already enforces this; the new code path adds delta math but no new `random_range` calls.
- **Frontend i18n drift.** Four new keys per locale; the existing `vulture` / `biome` tooling doesn't catch missing translations. Mitigation: Vitest assertion that the German-locale render shows the German copy (smoke-checks the catalog is wired).
- **Subjects-dialogs.tsx grows long.** Already hosts color picker plus FK-style fields; adding two checkboxes pushes it. Mitigation: if the file crosses ~250 lines after this PR, file a follow-up to extract a `<SubjectPreferencesFieldset>` component (out of scope).

## Migration / rollout

Alembic migration creates two columns. `mise run db:migrate` (local) and the staging deployment's `migrate` one-shot container (per `deploy/compose.yaml`) handle the upgrade automatically. No environment variable changes. No staging-specific rollout step beyond CI green plus automerge.

After merge, `staging.klassenzeit` auto-redeploys; the migration runs; the next "Generate" click runs the LAHC with subject preferences active. `Sport` placed at 08:00 in old schedules will get re-placed at 09:00+ on the next solve; `Mathematik` placed in the afternoon will likely move toward the morning. The schedule view shows the same UI; only the soft-score number changes.

## Follow-ups (out of this PR)

- **Frontend rendering of `soft_score`.** The number is exposed by the API today but unrendered. Add a "Schedule quality" badge or section on `/schedule` once a real complaint motivates it.
- **Per-class subject preference overrides.** A class wanting "Sport last period despite the global avoid-first flag" needs a `school_class_subject_preference` table. Defer until requested.
- **Configurable per-subject weights.** Replace booleans with `u32` weights when a school wants to express "Mathematik is more strongly early than Deutsch". Defer.
- **Third axis: avoid last period.** Symmetric to `avoid_first_period`. Defer until a school complains about Hauptfächer in the last slot.
- **Subjects table column for the flags.** A check-mark indicator next to each subject in the list view. Defer until users say they can't see at-a-glance which subjects are flagged.
- **Promote `solver.solve.done` log entry to carry `prefer_early_period_score` / `avoid_first_period_score` breakdowns.** Aggregate metrics for production monitoring; tracked alongside the existing `violations_by_kind` log enrichment pattern.
