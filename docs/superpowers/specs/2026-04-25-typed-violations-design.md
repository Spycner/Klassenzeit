# Typed solver violation taxonomy

**Date:** 2026-04-25
**Status:** Design approved (autopilot autonomous mode).

## Problem

The active "solver quality + tidy" sprint on `docs/superpowers/OPEN_THINGS.md` calls out the structured violation taxonomy as the next P0 after the criterion bench harness (PR #129). Today, `solver-core` exposes a two-variant `ViolationKind` enum (`NoQualifiedTeacher`, `UnplacedLesson`) and a free-form `message: String` per violation. The four real causes the solver distinguishes today (no qualified teacher, teacher over their weekly cap, no free time block for the (teacher, class) pair, no suitable room) collapse into the single `UnplacedLesson` variant plus a string the frontend currently shows as-is. The frontend i18n catalog has one key, `schedule.violations.item: "{{subject}} (hour {{hour}}): {{message}}"`, which interpolates the Rust-built English string straight into the rendered list. That breaks three things at once: the German UI ships English copy inside an otherwise-German row; the rendered text cannot be grouped, counted, or filtered; and a downstream "fix this violation" action has nothing typed to dispatch on.

The wire-contract change is also a hard prerequisite for sprint algorithm-phase work. PR 7 (FFD ordering + `SolveConfig`) and PR 9 (LAHC soft constraints) will both want to count violations by kind, and PR 8 (Doppelstunden) plans to add an `UnplacedBlock { size }` variant on top of this taxonomy. Doing the typed-variants work now keeps each algorithm PR focused on its algorithm, not on string-formatting cleanups.

## Goal

One PR that:

1. Replaces `solver_core::ViolationKind { NoQualifiedTeacher, UnplacedLesson }` with `{ NoQualifiedTeacher, TeacherOverCapacity, NoFreeTimeBlock, NoSuitableRoom }`, removing `UnplacedLesson` entirely.
2. Drops `message: String` from `solver_core::Violation`. The remaining fields are `kind`, `lesson_id`, `hour_index`.
3. Mirrors the change on the FastAPI surface: `ViolationResponse.kind: Literal[...]` updated, `message` field deleted, OpenAPI schema regenerated for the frontend.
4. Switches the frontend `ScheduleStatus` rendering off the free-form string and onto a typed-key helper analogous to `frontend/src/i18n/day-keys.ts`. Adds one i18n key per kind in `en.json` and `de.json`. Looks up subject, teacher, and class names from the existing entity queries (`useLessons`, `useSchoolClasses`); no new HTTP endpoint, no new MSW handler beyond fixture reshape.
5. Files ADR 0012 documenting the wire-contract change and why we deferred the v2-aligned richer enum.
6. Closes OPEN_THINGS active-sprint tidy-phase item 2 and points the roadmap memory at item 3 (auto-assign teachers during generate-lessons).

After this PR, the schedule view in either locale renders four distinct, fully-translated reasons; `BASELINE.md` numbers are unchanged (the bench fixture solves cleanly and produces zero violations); and the wire format is ready for sprint PR 8 to add `UnplacedBlock { size }` without touching any of the four kinds shipped here.

## Non-goals

- **Mirroring archive/v2's full enum.** v2 carries 11 hard variants (TeacherConflict, RoomCapacity, RoomTooSmall, etc.) plus 4 soft variants (TeacherGap, SubjectClustered, NotPreferredSlot, ClassTeacherFirstPeriod). The greedy solver does not produce most of those today (it pre-checks and skips rather than placing then diagnosing); the soft variants need an objective function (sprint PR 9). Adding them now ships dead variants and dead i18n strings.
- **Per-variant associated data on the wire** (`TeacherOverCapacity { capacity: u8 }`, `NoSuitableRoom { tried_room_count: usize }`). Pydantic discriminated-union plumbing and TS narrowing would be paid before any frontend renderer needs the extra context. The capacity number for `TeacherOverCapacity` is reachable through the existing `useTeachers()` query keyed by `teacher_id`. Revisit when a renderer actually needs structured detail.
- **A `severity: Severity` field.** v2 had it; we add it when LAHC ships and there are soft violations to dim or color differently. Hard violations are all "must fix"; severity adds no signal.
- **Persisting violations across solve runs.** Already a separate OPEN_THINGS deferral. The PR's GET `/api/classes/{id}/schedule` shape stays placements-only.
- **Cross-class violation grouping.** Today the response is per-class; a "whole-school" view is a separate sprint item.
- **Frontend per-violation actions** ("assign a different teacher", "drop a hour", "swap rooms"). Out of scope; this PR makes that future work cheaper by giving each row a typed `kind` to dispatch on.
- **Updating archive/v2 references.** The branch is read-only. `solver/CLAUDE.md`'s pointer to v2's "richer violation taxonomy" stays accurate; it remains a reference for future work.

## Design

### Wire shape

```jsonc
{
  "placements": [/* unchanged */],
  "violations": [
    {"kind": "no_qualified_teacher",  "lesson_id": "uuid", "hour_index": 0},
    {"kind": "teacher_over_capacity", "lesson_id": "uuid", "hour_index": 1},
    {"kind": "no_free_time_block",    "lesson_id": "uuid", "hour_index": 0},
    {"kind": "no_suitable_room",      "lesson_id": "uuid", "hour_index": 0}
  ]
}
```

Three fields per violation, identical shape across all four kinds. Snake_case `kind` matches the existing `serde(rename_all = "snake_case")` setting on `ViolationKind`.

### Rust solver-core changes

`solver/solver-core/src/types.rs`:

```rust
/// Discriminator for `Violation`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViolationKind {
    /// The lesson's assigned teacher lacks the subject qualification.
    NoQualifiedTeacher,
    /// Placing this hour would push the teacher past `max_hours_per_week`.
    TeacherOverCapacity,
    /// No time block has both the (teacher, class) pair free.
    NoFreeTimeBlock,
    /// No room is suitable for the subject and free in any free time block.
    NoSuitableRoom,
}

/// A single hard-constraint violation recorded by the solver.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Violation {
    /// Kind of violation.
    pub kind: ViolationKind,
    /// Lesson the violation is about.
    pub lesson_id: LessonId,
    /// Zero-based hour index within the lesson.
    pub hour_index: u8,
}
```

`solver/solver-core/src/solve.rs`: rename `unplaced_reason()` to `unplaced_kind()`, return type changes from `String` to `ViolationKind`. The body keeps the same three-branch decision tree:

```rust
fn unplaced_kind(
    problem: &Problem,
    lesson: &Lesson,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    used_teacher: &HashSet<(TeacherId, TimeBlockId)>,
    used_class: &HashSet<(SchoolClassId, TimeBlockId)>,
    used_room: &HashSet<(RoomId, TimeBlockId)>,
    hours_by_teacher: &HashMap<TeacherId, u8>,
) -> ViolationKind {
    let current = hours_by_teacher.get(&lesson.teacher_id).copied().unwrap_or(0);
    let max = teacher_max.get(&lesson.teacher_id).copied().unwrap_or(0);
    if current >= max {
        return ViolationKind::TeacherOverCapacity;
    }
    let any_slot_open = problem.time_blocks.iter().any(|tb| {
        !used_teacher.contains(&(lesson.teacher_id, tb.id))
            && !used_class.contains(&(lesson.school_class_id, tb.id))
            && !idx.teacher_blocked(lesson.teacher_id, tb.id)
    });
    if !any_slot_open {
        return ViolationKind::NoFreeTimeBlock;
    }
    ViolationKind::NoSuitableRoom
}
```

Note the four-way string tail collapses to three: when a free `(teacher, class)` slot exists but no placement happened, by elimination no room covered the subject in any free slot. That is `NoSuitableRoom`.

The `solve()` callers in `solve.rs` and the `pre_solve_violations()` callers in `validate.rs` drop the `message:` field from their `Violation { ... }` struct literals. Both functions still emit one violation per affected lesson-hour; the cardinality and ordering are preserved.

### solver-py binding

Zero source change. `solver-py/src/lib.rs` exposes `solve_json(problem: &str) -> PyResult<String>` which round-trips JSON through `solver_core::solve_json`. The new shape rides through unchanged. Hand-maintained `.pyi` stubs at `solver/solver-py/python/klassenzeit_solver/__init__.pyi` describe the JSON return as `str`; no signature change.

### Backend Pydantic schema

`backend/src/klassenzeit_backend/scheduling/schemas/schedule.py`:

```python
class ViolationResponse(BaseModel):
    """One hard-constraint violation emitted by the solver."""

    kind: Literal[
        "no_qualified_teacher",
        "teacher_over_capacity",
        "no_free_time_block",
        "no_suitable_room",
    ]
    lesson_id: UUID
    hour_index: int = Field(ge=0)
```

`message: str` deleted. `ScheduleResponse` and `ScheduleReadResponse` unchanged at the field level (`ScheduleReadResponse` already has no `violations`). The `ViolationResponse.model_validate(filtered)` call site in the route handler still works: Pydantic ignores extra fields by default, and there are no extra fields to ignore once the Rust output drops `message`.

### Frontend

**Helper.** New `frontend/src/i18n/violation-keys.ts` mirroring `day-keys.ts`:

```ts
import type { components } from "@/lib/api-types";

type ViolationKind = components["schemas"]["ViolationResponse"]["kind"];

export function violationItemKey(
  kind: ViolationKind,
):
  | "schedule.violations.noQualifiedTeacher"
  | "schedule.violations.teacherOverCapacity"
  | "schedule.violations.noFreeTimeBlock"
  | "schedule.violations.noSuitableRoom" {
  switch (kind) {
    case "no_qualified_teacher": return "schedule.violations.noQualifiedTeacher";
    case "teacher_over_capacity": return "schedule.violations.teacherOverCapacity";
    case "no_free_time_block": return "schedule.violations.noFreeTimeBlock";
    case "no_suitable_room": return "schedule.violations.noSuitableRoom";
  }
}
```

The exhaustive `switch` is the discriminator the typed catalog needs. Adding a new `ViolationKind` triggers a TypeScript error at the helper, which is the right place to surface it.

**Renderer.** `frontend/src/features/schedule/schedule-status.tsx` switches the row body to:

```tsx
import { violationItemKey } from "@/i18n/violation-keys";
// ...
{violations?.map((v) => {
  const lesson = lessonById.get(v.lesson_id);
  return (
    <li key={`${v.lesson_id}:${v.hour_index}:${v.kind}`}>
      {t(violationItemKey(v.kind), {
        subject: lesson?.subject.name ?? t("schedule.cellDeletedLesson"),
        hour: v.hour_index + 1,
        teacher: lesson?.teacher?.last_name ?? t("schedule.cellDeletedLesson"),
        class: lesson?.school_class.name ?? t("schedule.cellDeletedLesson"),
      })}
    </li>
  );
})}
```

The `lessonById: Map<string, Lesson>` already exists in `schedule-page.tsx`; the page passes it down to `ScheduleStatus` instead of (or alongside) the existing `subjectNameByLessonId`. Renaming the prop to `lessonById` and dropping the `subjectNameByLessonId` map is a one-line tidy-pass that the same commit can absorb (it is part of the rendering change, not a separate structural refactor).

**i18n catalog.** `frontend/src/i18n/locales/en.json`:

```jsonc
"violations": {
  "title": "Issues",
  "noQualifiedTeacher": "{{subject}} (hour {{hour}}): {{teacher}} is not qualified for this subject.",
  "teacherOverCapacity": "{{subject}} (hour {{hour}}): {{teacher}} would exceed their max weekly hours.",
  "noFreeTimeBlock": "{{subject}} (hour {{hour}}): no free slot for {{teacher}} and {{class}}.",
  "noSuitableRoom": "{{subject}} (hour {{hour}}): no suitable room is available."
}
```

`schedule.violations.title` stays. `schedule.violations.item` deleted. DE catalog mirrors the same key set with grammar-correct German copy:

```jsonc
"violations": {
  "title": "Probleme",
  "noQualifiedTeacher": "{{subject}} (Stunde {{hour}}): {{teacher}} ist für dieses Fach nicht qualifiziert.",
  "teacherOverCapacity": "{{subject}} (Stunde {{hour}}): {{teacher}} würde die Wochenhöchststundenzahl überschreiten.",
  "noFreeTimeBlock": "{{subject}} (Stunde {{hour}}): kein freier Slot für {{teacher}} und {{class}}.",
  "noSuitableRoom": "{{subject}} (Stunde {{hour}}): kein passender Raum verfügbar."
}
```

Existing DE `Nicht eingeplante Stunden` translates more literally to "Unplaced hours"; the new title `Probleme` ("Issues") covers all four kinds, including pre-solve `NoQualifiedTeacher` which is not unplaced-by-greedy. Match the EN key.

**MSW fixtures.** `frontend/tests/msw-handlers.ts` exports `violationsByClassId: Record<string, Violation[]>`. Reshape to use new kinds and drop `message`:

```ts
export const violationsByClassId: Record<string, Violation[]> = {
  [classId1]: [
    { kind: "teacher_over_capacity", lesson_id: lessonId, hour_index: 0 },
    { kind: "no_suitable_room", lesson_id: lessonId, hour_index: 1 },
  ],
};
```

### Tests

**Rust:**

- `solver/solver-core/src/types.rs`: extend `violation_kind_serialises_in_snake_case` to cover all four kinds. Update `solution_round_trips_with_placements_and_violations` to drop the `message` field from the constructed `Violation`.
- `solver/solver-core/src/solve.rs`: rename `teacher_max_hours_cap_emits_unplaced_violation` to `teacher_max_hours_cap_emits_teacher_over_capacity`; assert `kind == ViolationKind::TeacherOverCapacity`. Drop the `.message.contains("max_hours_per_week")` assertion. Rename `room_unsuitable_for_subject_is_skipped` assertion to `kind == ViolationKind::NoSuitableRoom`. Add a new test `no_free_time_block_when_class_has_only_one_filled_slot` that places one lesson, then tries a second lesson in the same `(teacher, class)` pair on a single-slot week to force a `NoFreeTimeBlock` emission.
- `solver/solver-core/src/validate.rs`: update `pre_solve_emits_violations_per_hour_for_unqualified_teacher` to drop the `message` field from constructed values.
- `solver/solver-core/tests/properties.rs`: pattern matches `UnplacedLesson | NoQualifiedTeacher` becomes `NoQualifiedTeacher | TeacherOverCapacity | NoFreeTimeBlock | NoSuitableRoom`.
- `solver/solver-core/tests/grundschule_smoke.rs`: zero-violations assertion stays true; field references that name `message` go away.

**Backend:** `backend/tests/scheduling/test_routes_schedule.py` (and any sibling). Search for `"message"` and `"unplaced_lesson"` in this directory; update every assertion. The solvability test at `backend/tests/seed/test_demo_grundschule_solvability.py` asserts zero hard violations and stays unchanged.

**Frontend:**

- `frontend/src/features/schedule/schedule-status.test.tsx` (new file if it does not exist; if it does, extend). One row per kind, asserts the rendered English copy through `getByText`.
- `frontend/src/i18n/violation-keys.test.ts` (new): exhaustive switch covers every kind, returns the right typed key. Mirrors `day-keys.test.ts`.
- `frontend/src/features/schedule/schedule-page.test.tsx`: any test that asserts on the previous `{{message}}` text must update.

**Playwright:** `frontend/e2e/flows/grundschule-smoke.spec.ts` asserts `.kz-ws-grid` is visible and at least one Deutsch cell renders. No violation-text assertion. No spec change.

### Logging

`solver_io.run_solve` emits `solver.solve.done` with `placements_total` and `violations_total`. Optional follow-up (not this PR): add `violations_by_kind: dict[str, int]` to the structured log so production can detect a sudden spike in `teacher_over_capacity` without redeploying. File as a follow-up note in OPEN_THINGS, not a sprint item.

## Migration and rollout

This is a forward-only wire-contract change. Both the producer (Rust solver via solver-py) and consumer (frontend) ship in the same PR. Staging redeploys on master push (`.github/workflows/deploy-images.yml`); the next deploy after merge serves the new shape end-to-end. There are no external API consumers and no persisted violation rows, so the only state that survives a deploy is `scheduled_lessons` placements (untouched by this PR).

## Risks

- **`#![deny(missing_docs)]`** at the `solver-core` crate root requires `///` doc comments on every new variant. The variant docs in the `Design` section above are ready to copy in.
- **Pre-commit hook running `cargo machete`.** No new crate deps; safe.
- **`mise run lint`** runs `cargo fmt`, `clippy`, `vulture`, `ruff`, `ty`, `biome`, `actionlint`, `cargo machete`. The change reduces (does not add) string-handling code, so vulture and clippy should be quieter, not noisier.
- **Frontend coverage ratchet** (50% floor, 73% baseline). Adding `violation-keys.ts` plus its test boosts coverage; the `schedule-status.tsx` change replaces one rendering branch with four, and the new tests add four assertions, so the file's covered-line ratio rises. Should not require a `mise run fe:cov:update-baseline`.
- **TanStack Query cache after change.** `useGenerateClassSchedule` writes the new schedule into the cache via `setQueryData`. The cached value's shape changes (no `message` on violation rows), but the cache lives only for a session; no migration needed.
- **`scripts/check_unique_fns.py`** rejects duplicate function names. `violationItemKey` is unique repo-wide; new Rust test functions (`no_free_time_block_when_class_has_only_one_filled_slot`) carry kind-specific names per the rule.

## Commit split

Five commits on a single feature branch (`feat/typed-violations`):

1. `feat(solver-core)!: typed violation taxonomy, drop message field`. Updates `types.rs`, `solve.rs`, `validate.rs`, all unit + integration tests. The `!` flags the breaking change. solver-py needs no edit.
2. `feat(backend)!: typed violations on /schedule, drop message field`. Updates `schemas/schedule.py` Literal + drops `message`. Updates backend tests asserting on `violations[*]`.
3. `chore(frontend): regenerate api-types for typed violations`. Single-file `mise run fe:types` output.
4. `feat(frontend): typed violation rendering with per-kind i18n keys`. Adds `frontend/src/i18n/violation-keys.ts` + its test, updates `schedule-status.tsx`, threads `lessonById` through `schedule-page.tsx`, updates `frontend/src/i18n/locales/{en,de}.json`, updates `frontend/tests/msw-handlers.ts`, updates schedule tests.
5. `docs: typed violation taxonomy follow-ups`. Adds `docs/adr/0012-typed-solver-violations.md` and indexes it in `docs/adr/README.md`. Updates `docs/superpowers/OPEN_THINGS.md` (mark item 2 done, add log-by-kind follow-up). Updates auto-memory roadmap entry to point at item 3.

Subagent dispatch (per `superpowers:subagent-driven-development`): commits 1 through 5 share state across crates; agents run sequentially. Each agent reads the prior commit's diff to anchor on the new wire shape and produces the next commit's diff (without committing on its own; the main session commits).
