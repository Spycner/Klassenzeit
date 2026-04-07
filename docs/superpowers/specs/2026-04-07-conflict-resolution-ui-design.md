# Conflict Resolution UI (2d) — Design

**Date:** 2026-04-07
**Status:** Draft
**Roadmap item:** Tier 2 / 2d
**Effort:** M (1-2 days)

## Problem

After the solver finishes, users see a flat collapsible list of violation strings. Two issues:

1. **The list under-reports.** `scheduler::Violation { description: String }` is only emitted by pre-validation ("no qualified teacher") and unplaced lessons in `mapper::to_output`. The 8 hard + 4 soft constraints inside `constraints::full_evaluate` only sum into the score — they never become visible violations. So a school admin staring at a "5 hard violations" badge has no way to see *which* lessons are conflicting.
2. **Even when populated, the list is not actionable.** No grouping, no link to the offending grid cell, no hint about where to go to fix the underlying configuration.

This makes the solver feel like a black box. Conflict resolution is the prerequisite for trust.

## Goals

- Surface every constraint violation the solver detects, with structured metadata.
- Group violations by constraint kind and severity (hard vs. soft).
- Click a violation → highlight the offending cell(s) in the timetable grid.
- For each kind, offer a static "how to fix" hint that deep-links into the relevant settings tab.
- No solver perf regression — diagnostics run **once** after local search, never in the hot loop.

## Non-goals

- Auto-resolve / one-click "apply suggested fix" (manual editing belongs to 2c).
- Solver-driven fix recommendations (e.g. "move this lesson to Tuesday p3"). Static per-kind hints only.
- Soft-constraint score breakdown charts.
- Cross-violation deduping. If one teacher conflict produces two lesson refs, list both.

## Design

### Layer 1 — Scheduler: structured violations + diagnose pass

Replace the existing `Violation` type in `scheduler/src/types.rs`:

```rust
pub struct Violation {
    pub kind: ViolationKind,
    pub severity: Severity,            // Hard | Soft
    pub message: String,               // human-readable, untranslated English
    pub lesson_refs: SmallVec<[LessonRef; 4]>,
    pub resources: SmallVec<[ResourceRef; 4]>,
}

pub enum Severity { Hard, Soft }

pub enum ViolationKind {
    // Hard
    TeacherConflict,
    ClassConflict,
    RoomCapacity,            // count of lessons in a room exceeds max_concurrent
    TeacherUnavailable,
    ClassUnavailable,
    TeacherOverCapacity,
    TeacherUnqualified,
    RoomUnsuitable,
    RoomTooSmall,            // student_count > room.capacity
    UnplacedLesson,
    NoQualifiedTeacher,
    // Soft
    TeacherGap,
    SubjectClustered,
    NotPreferredSlot,
    ClassTeacherFirstPeriod,
}

pub struct LessonRef {
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot_id: Uuid,
}

pub enum ResourceRef {
    Teacher(Uuid),
    Class(Uuid),
    Room(Uuid),
    Subject(Uuid),
    Timeslot(Uuid),
}
```

Add `pub fn diagnose(lessons: &[PlanningLesson], facts: &ProblemFacts) -> Vec<DiagnosedViolation>` in `constraints.rs`. Same control flow as `full_evaluate` but emits structured items keyed by planning indices instead of summing score. `mapper::to_output` then resolves indices → UUIDs to produce the public `Violation` type.

`solve_with_config` calls `diagnose` once after local search finishes. Soft kinds respect the same softening toggles as the score path: a "softened" hard constraint emits violations with `Severity::Soft`.

### Layer 2 — Backend: passthrough DTOs

`SolveResult.violations` becomes `Vec<ViolationDto>`:

```rust
pub struct ViolationDto {
    pub kind: String,         // snake_case discriminator
    pub severity: String,     // "hard" | "soft"
    pub message: String,
    pub lesson_refs: Vec<LessonRefDto>,
    pub resources: Vec<ResourceRefDto>,
}

pub struct LessonRefDto {
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot_id: Uuid,
}

#[serde(tag = "type", content = "id", rename_all = "snake_case")]
pub enum ResourceRefDto {
    Teacher(Uuid),
    Class(Uuid),
    Room(Uuid),
    Subject(Uuid),
    Timeslot(Uuid),
}
```

`to_solve_result` is updated to map the new scheduler types. The job DTO stored in the solver job table is JSONB so no migration is required — the new shape just lands on the next solve.

### Layer 3 — Frontend: ViolationsPanel + grid highlighting

#### `frontend/src/components/timetable/violations-panel.tsx` (new)

Props:
```ts
{
  violations: ViolationDto[];
  highlightedId: string | null;
  onHighlight: (v: ViolationDto | null) => void;
  refs: { teachers; classes; rooms; subjects; timeslots; locale };
}
```

Layout:
- Two tabs: **Hard (N)** / **Soft (N)** (use existing `Tabs` primitive).
- Each tab groups by `kind`. Heading shows i18n title + count badge.
- Each row: message + chips with resolved names for the resources (e.g. "👤 Frau Schmidt", "🏫 1A", "🏛 Raum 12").
- Selecting a row calls `onHighlight(v)`; the row stays visually selected.
- Each row has a **"Beheben" / "How to fix"** popover with:
  - Static per-kind hint (e.g. for `TeacherUnqualified`: "Add this subject to the teacher's qualified subjects, or assign a different teacher.")
  - One or two `<Link>` deep links into settings (e.g. teachers tab with `?focus=<teacher_id>` query — the existing tab components will need a small `useEffect` to scroll/select the focused row, see Open question 1).

#### `TimetableGrid` changes

Add optional props:
```ts
highlightedCells?: Set<string>; // key: `${day}-${period}`
highlightTone?: "error" | "warn";
```

When a cell key is in the set, render a red (hard) or amber (soft) ring around the cell with a subtle pulse.

#### `schedule/page.tsx` integration

State lift:
```ts
const [highlighted, setHighlighted] = useState<ViolationDto | null>(null);
```

When `highlighted` changes:
1. Compute `highlightedCells` from `highlighted.lesson_refs` (one entry per ref).
2. If the current `viewMode` doesn't reveal the conflict (e.g. teacher conflict in class view), pivot:
   - `TeacherConflict`, `TeacherUnavailable`, `TeacherOverCapacity`, `TeacherUnqualified`, `TeacherGap`, `NotPreferredSlot` → switch to teacher view, set `selectedEntityId` to the teacher in the first lesson_ref.
   - `RoomCapacity`, `RoomUnsuitable`, `RoomTooSmall` → room view.
   - Everything else → class view.
3. Pass `highlightedCells` to `<TimetableGrid>`.

The existing read-only `/timetable` route does **not** show violations (it shows applied lessons, which are post-apply and have no violation context). Panel only renders on the `/schedule` page when a solution is loaded.

#### i18n

New keys under `scheduler.violations`:
```
scheduler.violations.tabs.hard
scheduler.violations.tabs.soft
scheduler.violations.kind.<kind>.title
scheduler.violations.kind.<kind>.fix
scheduler.violations.fixCta
scheduler.violations.empty
```

Both `de.json` and `en.json` get the full set.

### Layer 4 — Tests

**Scheduler (`scheduler/src/constraints.rs` + `mapper.rs`):**
- For each `ViolationKind`, a unit test that builds a minimal `ScheduleInput`/`PlanningSolution` triggering exactly that constraint and asserts `diagnose()` returns one violation of the expected kind with the right resource refs.
- Invariant test: with all softening toggles off, `diagnose(lessons, facts).iter().filter(|v| v.severity == Hard).count() as i64 == -full_evaluate(lessons, facts).hard`. This guards against drift between the scoring loop and the diagnostic loop.
- Round-trip test: `mapper::to_output` produces violations whose `lesson_refs` resolve back to assigned lessons in the timetable.

**Backend (`backend/tests/scheduler/`):**
- Solve a deliberately infeasible instance (single teacher unqualified for the only required subject), assert the resulting JSON `violations[0].kind == "teacher_unqualified"` and that `resources` includes the right teacher UUID.
- Existing scheduler integration tests need `violations` payload assertions updated to the new shape.

**Frontend (`frontend/src/__tests__/`):**
- New `violations-panel.test.tsx`: renders fixture violations, asserts grouping/counts, asserts `onHighlight` fires with the right row on click, asserts the fix popover renders the per-kind hint.
- Extend `schedule-page.test.tsx`: when a fixture solution with violations loads, clicking a teacher-conflict row switches view mode to teacher and decorates the matching cells.

## Open questions

1. **Settings deep-link focus.** Existing settings tabs don't currently react to a `?focus=<id>` query. Smallest viable change: each list-style tab reads `searchParams.get("focus")` in a `useEffect` and scrolls the matching row into view + adds a temporary highlight class. Worth doing as part of this PR? **Recommendation: yes, but only for teachers/rooms/subjects tabs** — those are the deep-link targets the violation kinds actually need. Skip terms/classes for now.
2. **Pulse animation.** Could be considered noisy. Use a static thicker ring instead and only animate on initial selection (one-shot). **Recommendation: one-shot 600ms pulse on selection change, no looping.**

## Migration / rollout

- No DB migration required (job result is JSONB).
- Old in-flight solver jobs (if any) at deploy time will still produce the old payload — backend `to_solve_result` is the only place that constructs the new shape, so old jobs that haven't called it yet are fine. Any cached frontend solution from before the deploy will fail to render the new panel and should be re-generated; acceptable since solutions are ephemeral previews.

## Files touched (estimate)

- `scheduler/src/types.rs` — replace `Violation`, add `ViolationKind`, `Severity`, `LessonRef`, `ResourceRef`.
- `scheduler/src/constraints.rs` — add `diagnose()` mirroring `full_evaluate`, plus new tests.
- `scheduler/src/lib.rs` — call `diagnose()` after local search.
- `scheduler/src/mapper.rs` — index → UUID resolution for new violation type.
- `backend/src/services/scheduler.rs` — update `SolveResult`, `ViolationDto`, `to_solve_result`.
- `backend/tests/scheduler/*` — update assertions, add infeasible-instance test.
- `frontend/src/lib/types.ts` — add `ViolationDto`, `ViolationKind`, `Severity`, `LessonRef`, `ResourceRef`.
- `frontend/src/components/timetable/violations-panel.tsx` — new.
- `frontend/src/components/timetable/timetable-grid.tsx` — `highlightedCells` prop + ring decoration.
- `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx` — state lift, replace inline list with panel.
- `frontend/src/app/[locale]/schools/[id]/settings/components/{teachers,rooms,subjects}-tab.tsx` — `?focus=<id>` handling.
- `frontend/src/messages/{de,en}.json` — i18n keys.
- `frontend/src/__tests__/violations-panel.test.tsx` — new.
- `frontend/src/__tests__/schedule-page.test.tsx` — extend.

## Success criteria

- Generating a timetable on a deliberately infeasible example surfaces a structured violations panel with at least one entry per broken constraint kind.
- Clicking a hard-violation row highlights the corresponding cell(s), pivoting view mode if needed.
- "How to fix" popover deep-links into the relevant settings tab and the target row is visible/highlighted.
- All existing scheduler/backend/frontend tests pass; new tests cover each `ViolationKind`.
- `cargo bench` shows no measurable regression in solver throughput (diagnose runs once, not in the LAHC loop).
