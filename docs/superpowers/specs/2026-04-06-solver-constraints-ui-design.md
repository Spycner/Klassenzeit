# Solver Constraints UI — Design

**Backlog item:** 1e (folds in 4a Teacher availability UI and 4b Room suitability UI)
**Date:** 2026-04-06
**Status:** Approved, ready for planning

## Goal

Give school admins a frontend for configuring how the solver trades off competing objectives. Today the 4 soft constraints have hardcoded penalties in `scheduler/src/constraints.rs`, and the 9 hard constraints are strict-only. There is no way to tune either from the UI, and when no hard-feasible solution exists the worker returns `status: failed` with no timetable.

This spec covers:

1. Introducing configurable constraint weights into the scheduler.
2. Persisting per-school weights and hard→soft toggles in the backend.
3. A new **Scheduler** tab in school settings for editing those values.
4. A follow-up PR with editors for teacher preferred slots and room subject suitability.

## Non-goals

- Adding new soft constraints (e.g., double-hour blocks, teacher day-off). Tracked separately.
- Per-term weight overrides. Weights are school-level; a later extension can add term overrides.
- Changing the solver algorithm or LAHC parameters (`list_length`, `tabu_tenure`, etc. stay tuning-only).
- Weighting hard constraints against each other. Hard scoring is lexicographic — weighting hard values against each other is meaningless.

## Scope split

- **PR1 (this spec's primary deliverable):** scheduler `ConstraintWeights`, backend settings table + endpoints, scheduler settings tab UI.
- **PR2 (follow-up, separate plan once PR1 lands):** teacher preferred slots grid + room subject suitability matrix, with any backend availability/suitability endpoints they require.

PR1 and PR2 are independent: PR1 alone delivers the "no way to configure soft constraints" fix from the backlog; PR2 delivers the "teacher/room preferences" editors.

## Constraint inventory

### Hard constraints (9)

| # | Name | Category | Softenable? |
|---|------|----------|-------------|
| 1 | Teacher conflict (same teacher, same slot) | Structural | No |
| 2 | Class conflict | Structural | No |
| 3 | Room conflict (over per-slot capacity) | Structural | No |
| 4 | Teacher availability (blocked slot) | Business rule | Yes |
| 5 | Teacher max hours per week | Business rule | Yes |
| 6 | Teacher subject qualification | Business rule | Yes |
| 7 | Room subject suitability | Business rule | Yes |
| 8 | Room student capacity | Business rule | Yes |
| 9 | Class availability | Business rule | Yes |

Structural conflicts (1-3) stay hard unconditionally — violating them produces nonsense timetables. Business rules (4-9) can be toggled to soft with an admin-chosen penalty, so the solver can return a least-bad solution when no hard-feasible timetable exists.

### Soft constraints (4)

| # | Name | Current penalty | Default weight |
|---|------|-----------------|----------------|
| S1 | Preferred slot | -1 per lesson in non-preferred slot | 1 |
| S2 | Teacher gap | -1 per gap period | 1 |
| S3 | Subject distribution | -2 per extra lesson of same (class, subject, day) | 2 |
| S4 | Class teacher first period | -1 per day where class teacher doesn't open | 1 |

Weights multiply the base penalty. Weight `0` disables the constraint. Weight range: `0..=10` in the UI (backend accepts `0..=100` for headroom).

## Scheduler changes (`scheduler` crate)

### `ConstraintWeights` struct

New public struct in `scheduler/src/planning.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstraintWeights {
    // Soft weights (multiplier on base penalty). 0 disables.
    pub w_preferred_slot: i64,
    pub w_teacher_gap: i64,
    pub w_subject_distribution: i64,
    pub w_class_teacher_first_period: i64,

    // Hard→soft toggles. None = strict hard. Some(p) = soft penalty `p`.
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

Defaults preserve current behaviour exactly: all softs at their current base penalties, all hards strict.

### Wiring

- `ScheduleInput` gains `pub weights: ConstraintWeights` (defaults via `#[derive(Default)]`).
- `ProblemFacts` gains `pub weights: ConstraintWeights` so `IncrementalState` and `full_evaluate` can read it cheaply; populated in `mapper::to_planning`.
- `constraints.rs`: all `HardSoftScore::soft(-1)` / `-2` literals become `HardSoftScore::soft(-base * facts.weights.w_*)`. For each of the 6 softenable hard constraints, replace `HardSoftScore::hard(-1)` with a branch:

  ```rust
  match facts.weights.soften_teacher_max_hours {
      None => HardSoftScore::hard(-diff),
      Some(p) => HardSoftScore::soft(-diff * p),
  }
  ```

  This applies in both `full_evaluate` and every affected incremental delta path.
- Structural pairwise conflict emissions (teacher/class pairwise + room over-cap) stay hard unconditionally.
- `solve()` and `solve_with_config()` signatures are unchanged — they already accept `ScheduleInput` which now carries weights.

### Tests

- Extend `scheduler/tests/proptest_scoring.rs`: property — with `weights = Default`, incremental score must equal `full_evaluate` for any random move sequence (existing invariant, now parameterised by weights).
- New property: with `w_teacher_gap = 0`, `full_evaluate` never emits teacher-gap penalty for any random solution.
- New unit test: softening `teacher_max_hours` with penalty 100 converts a 1-hour overrun from `hard: -1` to `soft: -100`.
- Existing benchmarks stay green with default weights.

## Backend changes

### Migration

New file `backend/migration/src/m20250406_000001_scheduler_settings.rs`:

```sql
CREATE TABLE school_scheduler_settings (
    school_id   UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
    weights     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

One row per school. `weights` stores a partial object keyed by the field names of `ConstraintWeightsDto`; any missing key uses the default. JSONB keeps the schema flexible as we add constraints.

Migration registered in `backend/migration/src/lib.rs`. SeaORM entity generated via `sea-orm-cli` into `backend/src/models/_entities/school_scheduler_settings.rs`.

### DTO and mapping

New module `backend/src/services/scheduler_settings.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConstraintWeightsDto {
    #[serde(default = "default_one")]  pub w_preferred_slot: i64,
    #[serde(default = "default_one")]  pub w_teacher_gap: i64,
    #[serde(default = "default_two")]  pub w_subject_distribution: i64,
    #[serde(default = "default_one")]  pub w_class_teacher_first_period: i64,
    #[serde(default)] pub soften_teacher_availability: Option<i64>,
    #[serde(default)] pub soften_teacher_max_hours: Option<i64>,
    #[serde(default)] pub soften_teacher_qualification: Option<i64>,
    #[serde(default)] pub soften_room_suitability: Option<i64>,
    #[serde(default)] pub soften_room_capacity: Option<i64>,
    #[serde(default)] pub soften_class_availability: Option<i64>,
}
```

- `impl From<ConstraintWeightsDto> for klassenzeit_scheduler::planning::ConstraintWeights`
- `load(db, school_id) -> ConstraintWeightsDto`: fetches row, deserialises JSONB, returns defaults if no row.
- `upsert(db, school_id, dto)`: validates ranges (soft weights `0..=100`, hard soften penalties `1..=100_000` when `Some`), writes row.

### Endpoints

New controller `backend/src/controllers/scheduler_settings.rs`, mounted under `/api/schools/{school_id}`:

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/scheduler-settings` | member | `{ weights: ConstraintWeightsDto }` |
| PUT | `/scheduler-settings` | **admin** | `{ weights: ConstraintWeightsDto }` (merged, validated, echoed back) |

Both use the existing `SchoolContext` extractor for tenant scoping. PUT validation returns `422` with field-level errors on out-of-range values.

### Solve path integration

`services::scheduler::load_schedule_input()` gains an extra call to `scheduler_settings::load()` and populates `ScheduleInput.weights`. No change to the worker or controller call sites — weights ride inside the input struct.

### Backend tests

- Unit test in `scheduler_settings.rs`: round-trip `ConstraintWeightsDto ↔ ConstraintWeights`.
- Integration test in `backend/tests/requests/scheduler_settings.rs`:
  - GET returns defaults when no row.
  - PUT as admin persists and GET returns updated values.
  - PUT as non-admin returns 403.
  - PUT with out-of-range weight returns 422.
- Extend `backend/tests/requests/scheduler.rs`: set `w_teacher_gap = 0` via PUT, trigger solve, assert `soft_score` is ≥ the baseline run.

## Frontend changes (PR1)

### New tab

`frontend/src/app/[locale]/schools/[id]/settings/components/scheduler-tab.tsx`, registered in `settings/page.tsx` alongside the existing tabs.

### Layout

Three sections, each a collapsible card:

**A. Soft constraint weights** — 4 rows, one per soft constraint:

- Left: label + one-line description (i18n).
- Right: number input `min=0 max=10 step=1`, default from fetch.
- Helper text "Disabled" when value is 0.

**B. Hard constraint relaxation** — 6 rows, one per softenable hard constraint:

- Left: label + description.
- Middle: radio group "Strict" / "Allow with penalty".
- Right: number input for penalty (`min=1 max=100000 step=1`, default 100), disabled + greyed when "Strict" is selected.

**C. Actions** — "Reset to defaults" button + "Save" button. Discard-changes confirmation if navigating away dirty.

### State management

- Fetch with React Query (`useQuery(['scheduler-settings', schoolId])`).
- Form state with react-hook-form + Zod schema matching `ConstraintWeightsDto`.
- Submit via `useMutation` → PUT → invalidate query on success → toast on success/error.
- No debounced autosave — explicit Save matches the other settings tabs.

### i18n

New keys under `messages/{de,en}.json` → `settings.scheduler.*`:

- `tab_label`
- `section_soft`, `section_hard`, `section_actions`
- Per-constraint: `<key>.label`, `<key>.description`
- `save`, `reset_defaults`, `saved_toast`, `disabled_hint`

### Tests

`frontend/src/__tests__/scheduler-tab.test.tsx`:

- Renders default values when backend returns empty weights.
- Changing a soft input and saving issues a PUT with the merged payload.
- Toggling "Allow with penalty" enables the penalty input; toggling back to "Strict" disables and strips the penalty from the submitted payload.
- Reset button restores defaults without saving until Save is clicked.

## Frontend changes (PR2 — follow-up outline)

Called out here so the planning doc for PR1 can stop at PR1's boundary.

### Teacher preferred slots

- Sub-route `/schools/[id]/settings/teachers/[teacherId]/availability` or a modal launched from the teachers tab (decision deferred to PR2's plan).
- Weekly grid (days × non-break periods). Each cell cycles Available → Preferred → Blocked on click.
- Backend endpoints: `GET /api/schools/{school_id}/teachers/{teacher_id}/availabilities` and `PUT` with full state. Stored in existing `teacher_availabilities` table (has `availability_type` column — `blocked`, `preferred`, and absence = `available`).

### Room subject suitability

- Sub-route or modal from the rooms tab.
- Matrix: rows = subjects, toggle per row.
- Backend: `GET`/`PUT /api/schools/{school_id}/rooms/{room_id}/suitabilities`. Stored in existing `room_subject_suitabilities` table.

## Data flow

```
User edits tab  → PUT /scheduler-settings  → school_scheduler_settings.weights (JSONB)
                                                          │
                                           GET on solve trigger
                                                          ▼
                                load_schedule_input() reads settings
                                                          ▼
                              ScheduleInput.weights → mapper::to_planning
                                                          ▼
                                       ProblemFacts.weights
                                                          ▼
                           constraints.rs reads weights for every score delta
```

## Error handling

- Backend: invalid weight → `422` with `{"errors": {"w_teacher_gap": "must be between 0 and 100"}}`.
- Backend: no settings row → return defaults, do not auto-create (first PUT creates it).
- Frontend: GET failure → error state in tab with Retry button; does not block other settings tabs.
- Frontend: PUT failure → toast + preserve local form state so user can retry.
- Solver: weight=0 on a soft is valid (disabled). A softened hard with penalty ≤ 0 is rejected server-side.

## Migration safety

- All new fields default to the current hardcoded behaviour. Existing schools need no data migration — they get defaults on first GET.
- `ConstraintWeights::default()` must remain a pure function returning the exact values above; violating that is a breaking change to existing benchmark baselines.
- A regression benchmark run (`scheduler/src/bin/benchmark.rs`) with default weights must match pre-PR output within noise. Captured in PR description.

## Open questions

None blocking. Deferred for later:

- Per-term weight overrides (would require adding `term_id` to the settings table).
- Exposing LAHC tuning knobs (`list_length`, `tabu_tenure`) in the UI — currently power-user territory, not for 1e.
- A "Why is this slot non-preferred?" diagnostic overlay in the generated timetable view — belongs with 2d (Conflict resolution UI).
