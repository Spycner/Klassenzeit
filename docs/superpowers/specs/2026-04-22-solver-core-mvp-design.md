# Solver MVP in `solver-core`

**Date:** 2026-04-22
**Status:** Design approved, plan pending.

## Problem

`solver/solver-core/src/lib.rs` is a 28-line `reverse_chars` stub. Step 1 of the prototype sprint in `docs/superpowers/OPEN_THINGS.md` is the greedy first-fit placement algorithm that turns the backend's lesson + constraint data into a timetable. Until it exists, the backend cannot generate schedules, the schedule view cannot render them, the Grundschule seed has nothing to render against, and the sprint's end-to-end flow (enter a school, click generate, see a timetable) remains blocked at its very first step.

The solver is the product. Without it everything else in the sprint is scaffolding.

## Goal

Ship a pure-Rust solver that accepts a typed `Problem`, validates it, and returns a `Solution` containing placements plus a `Vec<Violation>` describing any lesson-hours the greedy could not place. Exposed at two levels:

- `pub fn solve(problem: &Problem) -> Result<Solution, Error>` as the canonical typed algorithm surface, used by Rust unit and integration tests and (eventually) by any in-process Rust caller.
- `pub fn solve_json(json: &str) -> Result<String, Error>` as a thin JSON adapter, called by `solver-py` in step 2 of the sprint.

The algorithm respects six hard constraints: teacher qualification, teacher availability, teacher `max_hours_per_week` cap, room subject suitability, room availability whitelist, and no teacher / class / room double-booking in the same time block. Deterministic under identical input, zero reliance on a clock, zero reliance on `rand::thread_rng()`.

## Non-goals

- **Soft constraints / objective function.** OPEN_THINGS defers soft preferences explicitly. The greedy has nothing to optimise.
- **Backtracking / CSP search.** Pure greedy no-retry. The first time a lesson-hour has no viable slot, it becomes an `UnplacedLesson` violation and the algorithm moves on.
- **First-Fit Decreasing (most-constrained-first) sort.** A known improvement over pure input-order greedy; its own follow-up PR so the MVP stays small and the determinism story stays simple.
- **Local search / LAHC / Kempe moves.** The `archive/v2` scheduler's optimisation phase is a separate algorithm; it enters once the greedy MVP is shown to ship.
- **Indexed (bitmap) internal representation.** `Vec<bool>` per teacher / per room is a real speedup for inner-loop probing but only matters under tens of thousands of placement attempts per solve; not the MVP's scale.
- **Multi-hour lesson blocks (`preferred_block_size > 1`).** Placing N consecutive time blocks on the same day is its own algorithmic concern (contiguous-window search, day boundary handling) and gets its own PR. The MVP rejects inputs with `preferred_block_size > 1`.
- **PyO3 binding.** `solver-py` keeps the existing `reverse_chars` stub; step 2 of the sprint replaces it when it adds the real `solve_json` wrapper and the FastAPI endpoint.
- **Backend integration, placement persistence, schedule view, seed, E2E smoke.** All are sprint steps 2 through 6; each gets its own spec and PR.
- **Performance tuning.** No `criterion` benchmarks this PR. Benchmarks land when step 2's HTTP endpoint makes latency observable.

## Design

### Public API surface

Two `pub fn`s in the `solver_core` crate root:

```rust
pub fn solve(problem: &Problem) -> Result<Solution, Error>;
pub fn solve_json(json: &str) -> Result<String, Error>;
```

`solve` is the canonical algorithm entrypoint. Rust callers (unit tests, property tests, integration tests, future in-process consumers) construct a typed `Problem` and match on a typed `Solution`. `solve_json` is a five-line adapter: `serde_json::from_str` into `Problem`, call `solve`, `serde_json::to_string` on the resulting `Solution`. It exists so `solver-py` can call a single function with `py.allow_threads(|| solver_core::solve_json(s))` and not know about the internal types.

Module layout inside the crate:

```
solver/solver-core/src/
├── lib.rs      # `pub use` public symbols + `mod` declarations; `reverse_chars` stays until step 2
├── error.rs    # `pub enum Error { Input(String) }` with `#[non_exhaustive]` + thiserror
├── ids.rs      # newtype IDs wrapping uuid::Uuid with `#[serde(transparent)]`
├── types.rs    # Problem, Solution, Placement, Violation, ViolationKind, entity structs
├── validate.rs # structural validation + pre-solve NoQualifiedTeacher check
├── index.rs    # private Indexed struct built from Problem
├── solve.rs    # greedy first-fit algorithm
└── json.rs     # solve_json adapter + tagged JSON error envelope
```

### Entity IDs

Per-entity newtypes wrapping `uuid::Uuid`, each with `#[serde(transparent)]`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct LessonId(pub Uuid);
```

and similarly `TeacherId`, `RoomId`, `TimeBlockId`, `SubjectId`, `SchoolClassId`. `Copy` + `Eq` + `Hash` gives cheap hashmap probes; `#[serde(transparent)]` keeps the wire format as a plain JSON string.

Rationale: newtypes prevent ID-category confusion at compile time. Passing a `TeacherId` where a `RoomId` is expected is a compile error, not a runtime bug.

### Problem shape

Flat collections that mirror the backend's SQL join tables:

```rust
pub struct Problem {
    pub time_blocks: Vec<TimeBlock>,
    pub teachers: Vec<Teacher>,
    pub rooms: Vec<Room>,
    pub subjects: Vec<Subject>,
    pub school_classes: Vec<SchoolClass>,
    pub lessons: Vec<Lesson>,
    pub teacher_qualifications: Vec<TeacherQualification>,
    pub teacher_blocked_times: Vec<TeacherBlockedTime>,
    pub room_blocked_times: Vec<RoomBlockedTime>,
    pub room_subject_suitabilities: Vec<RoomSubjectSuitability>,
}

pub struct TimeBlock { pub id: TimeBlockId, pub day_of_week: u8, pub position: u8 }
pub struct Teacher  { pub id: TeacherId, pub max_hours_per_week: u8 }
pub struct Room     { pub id: RoomId }
pub struct Subject     { pub id: SubjectId }
pub struct SchoolClass { pub id: SchoolClassId }
pub struct Lesson {
    pub id: LessonId,
    pub school_class_id: SchoolClassId,
    pub subject_id: SubjectId,
    pub teacher_id: TeacherId,
    pub hours_per_week: u8,
}

pub struct TeacherQualification     { pub teacher_id: TeacherId, pub subject_id: SubjectId }
pub struct TeacherBlockedTime       { pub teacher_id: TeacherId, pub time_block_id: TimeBlockId }
pub struct RoomBlockedTime          { pub room_id: RoomId,       pub time_block_id: TimeBlockId }
pub struct RoomSubjectSuitability   { pub room_id: RoomId,       pub subject_id: SubjectId }
```

All structs derive `Debug`, `Clone`, `Serialize`, `Deserialize`. `#[serde(rename_all = "snake_case")]` on the root `Problem` so the wire format matches backend SQL column names.

Notes on the flat shape:

- Teacher availability comes in as a blocked-times list, not an available-times list. Default (no entry for `(teacher, time_block)`) means "available". The backend transforms its multi-valued `status` column at the boundary: `status == "available"` drops out of the list; anything else (e.g. `"blocked"`, `"preferred"`) enters the list as `TeacherBlockedTime`. The solver does not know about status semantics.
- Room availability is a blocked-times list too. The backend's `RoomAvailability` model is a whitelist; at the boundary it flips to its complement (blocked = every `(room, time_block)` not on the whitelist) or stays empty (room has no entries = universally available, matching the opt-in editor UX).
- Room suitability follows the existing M:N convention. If a room has at least one `RoomSubjectSuitability` row, the room suits only the listed subjects. If the room has zero rows, it suits all subjects (the backend's "no filter" baseline).
- `preferred_block_size` is deliberately absent from `Lesson`. The MVP places one hour per slot; if a caller's JSON carries the field the deserialiser rejects it (`#[serde(deny_unknown_fields)]` on `Lesson`).
- The solver does not need `TimeBlock.start_time` / `end_time`, nor `Room.capacity` / `Room.name`, nor `Subject.name`. Those fields stay on the backend for rendering.

### Solution shape

```rust
pub struct Solution {
    pub placements: Vec<Placement>,
    pub violations: Vec<Violation>,
}

pub struct Placement {
    pub lesson_id: LessonId,
    pub time_block_id: TimeBlockId,
    pub room_id: RoomId,
}

pub struct Violation {
    pub kind: ViolationKind,
    pub lesson_id: LessonId,
    pub hour_index: u8,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViolationKind {
    NoQualifiedTeacher,
    UnplacedLesson,
}
```

One `Placement` per lesson-hour. A lesson with `hours_per_week: 4` produces up to four placements with the same `lesson_id` and distinct `time_block_id`s; downstream consumers group by `lesson_id` if they need per-lesson views. `hour_index` on a `Violation` is 0-based and lets consumers deduplicate multi-hour failures if they want to; it is always set even for `NoQualifiedTeacher` where each of the lesson's `hours_per_week` hours is reported.

Violation ordering is deterministic: all `NoQualifiedTeacher` violations first in `problem.lessons` input order, then `UnplacedLesson` violations in the order the greedy encountered them.

### Error type

```rust
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    #[error("input: {0}")]
    Input(String),
}
```

`Error::Infeasible` is not present. Placement failures live inside `Solution.violations`, not inside `Err`. `Error::Input` is reserved for structural input errors: unknown references, duplicate IDs, `hours_per_week == 0`, empty `time_blocks`, `deny_unknown_fields` rejection (covers `preferred_block_size`). `#[non_exhaustive]` preserves the ability to add variants later without a breaking change.

`solve_json` emits a tagged JSON body on the error path:

```json
{"kind": "input", "reason": "lesson abc123 references unknown teacher def456"}
```

Success emits the `Solution` JSON directly, no envelope.

Note: the illustrative code block in `solver/CLAUDE.md` still shows an `Error::Infeasible { step, reason }` variant. That block was written before Q8 of the brainstorm landed on the violations-in-output model; `solver/CLAUDE.md` will be updated in a docs pass inside this PR to drop the stale example.

### Algorithm

Pseudocode. Commit 6 turns it into Rust.

```
solve(problem):
  validate_structural(problem)?           -- Err(Error::Input) on malformed refs, dups, empty, unknown fields
  let mut violations = pre_solve_check(problem)   -- NoQualifiedTeacher violations
  let idx = Indexed::new(problem)
  let mut out = Solution { placements: vec![], violations: vec![] }
  let mut hours_by_teacher: HashMap<TeacherId, u8> = {}
  let mut used_teacher: HashSet<(TeacherId, TimeBlockId)> = {}
  let mut used_class:   HashSet<(SchoolClassId, TimeBlockId)> = {}
  let mut used_room:    HashSet<(RoomId, TimeBlockId)> = {}

  for lesson in &problem.lessons:                          -- input order
    if !idx.teacher_qualified(lesson.teacher_id, lesson.subject_id):
      for hour_index in 0..lesson.hours_per_week:
        out.violations.push(Violation { kind: NoQualifiedTeacher, lesson_id: lesson.id, hour_index, message: ... })
      continue
    for hour_index in 0..lesson.hours_per_week:
      let placed = try_place_hour(lesson, hour_index, ...)
      if !placed:
        out.violations.push(Violation { kind: UnplacedLesson, lesson_id: lesson.id, hour_index, message: ... })

  Ok(out)

try_place_hour(lesson, hour_index):
  for tb in &problem.time_blocks:                           -- input order
    if used_teacher.contains((lesson.teacher_id, tb.id))   { continue }
    if used_class.contains((lesson.school_class_id, tb.id)) { continue }
    if idx.teacher_blocked(lesson.teacher_id, tb.id)        { continue }
    if hours_by_teacher.get(lesson.teacher_id) + 1 > teacher.max_hours_per_week { continue }
    for room in &problem.rooms:                             -- input order
      if used_room.contains((room.id, tb.id))       { continue }
      if !idx.room_suits_subject(room.id, lesson.subject_id)  { continue }
      if idx.room_blocked(room.id, tb.id)            { continue }
      out.placements.push(Placement { lesson_id, tb.id, room.id })
      used_teacher.insert((lesson.teacher_id, tb.id))
      used_class.insert((lesson.school_class_id, tb.id))
      used_room.insert((room.id, tb.id))
      hours_by_teacher[lesson.teacher_id] += 1
      return true
  false
```

### Validation rules

All raise `Error::Input`:

- Every `TeacherQualification`, `TeacherBlockedTime`, `RoomBlockedTime`, `RoomSubjectSuitability`, and every `Lesson.teacher_id` / `subject_id` / `school_class_id` refers only to known IDs.
- No duplicate `TimeBlockId`, `TeacherId`, `RoomId`, `SubjectId`, `SchoolClassId`, `LessonId` inside their respective `Vec`s.
- `lesson.hours_per_week >= 1` (u8, so max is 255).
- `problem.time_blocks` is non-empty; `problem.rooms` is non-empty.
- `deny_unknown_fields` at the deserialiser surface rejects any `preferred_block_size` field.

Cross-entity validation (pre-solve, emits violations not errors):

- Every lesson's `teacher_id` has a matching `TeacherQualification` row for the lesson's `subject_id`. Failures become `NoQualifiedTeacher` violations, one per hour of the lesson.

Teacher `max_hours_per_week` is intentionally a runtime check inside the greedy rather than a pre-solve violation because it depends on how many hours got placed.

### Indexed lookup

The private `Indexed` struct is built once at the top of `solve`:

```rust
struct Indexed {
    teacher_subject: HashMap<TeacherId, HashSet<SubjectId>>,
    teacher_blocked: HashSet<(TeacherId, TimeBlockId)>,
    room_subject: HashMap<RoomId, HashSet<SubjectId>>,  // absence of key == "suits all"; empty set == "suits none"
    room_blocked: HashSet<(RoomId, TimeBlockId)>,
}
```

Four predicates: `teacher_qualified`, `teacher_blocked`, `room_suits_subject`, `room_blocked`. Each is a single `HashMap::get` / `HashSet::contains` call, O(1) amortised.

`room_suits_subject` special-cases "room with no entries in `room_subject_suitabilities`" as "suits all subjects", matching the backend's "no filter" baseline.

### Determinism

No wall-clock (no `SystemTime::now()`). No `thread_rng()`. No `DefaultHasher` driving any observable step; `HashMap` / `HashSet` are only probed, never iterated. All iteration is over `Vec` slices in caller-provided order. Two identical inputs produce byte-for-byte identical `serde_json::to_string` output; the property tests enforce this.

### Wire contract

All requests and responses use JSON. Field names are snake_case at every level (`#[serde(rename_all = "snake_case")]` on top-level structs, field names are already snake_case on the Rust side). IDs are plain strings via `#[serde(transparent)]`. A minimal round-trip example (not a test fixture):

Request:
```json
{
  "time_blocks": [{"id": "…", "day_of_week": 0, "position": 0}],
  "teachers": [{"id": "…", "max_hours_per_week": 28}],
  "rooms": [{"id": "…"}],
  "subjects": [{"id": "…"}],
  "school_classes": [{"id": "…"}],
  "lessons": [{"id": "…", "school_class_id": "…", "subject_id": "…", "teacher_id": "…", "hours_per_week": 1}],
  "teacher_qualifications": [{"teacher_id": "…", "subject_id": "…"}],
  "teacher_blocked_times": [],
  "room_blocked_times": [],
  "room_subject_suitabilities": []
}
```

Success response:
```json
{
  "placements": [{"lesson_id": "…", "time_block_id": "…", "room_id": "…"}],
  "violations": []
}
```

Input-error response (from `solve_json` only):
```json
{"kind": "input", "reason": "lesson … references unknown teacher …"}
```

## Testing

- **Unit tests** inside each module's `#[cfg(test)] mod tests`. One test per constraint: teacher not qualified, teacher double-booking avoided, class double-booking avoided, room double-booking avoided, room suitability (with and without entries), room availability whitelist (with and without entries), teacher `max_hours_per_week` cap. Plus `Error::Input` cases: unknown refs, duplicates, `hours_per_week == 0`, empty `time_blocks`, empty `rooms`, unknown `preferred_block_size`.
- **Round-trip tests** for every struct in `types.rs`: serialise to JSON with `serde_json`, deserialise, assert equality. Catches wire-format drift.
- **`solver-core/tests/properties.rs`** (proptest): generate valid random problems (3-6 classes, 5-15 teachers, 5-15 rooms, 25 time blocks, 10-40 lessons with 1-4 hours each) and assert five invariants:
  1. Every placement is feasible (teacher qualified, teacher not blocked, room suits subject, room not blocked).
  2. No double-booking (teacher, class, room) in any single time block across all placements.
  3. For each teacher, total placements do not exceed `max_hours_per_week`.
  4. Total placements + unplaced-hour violations = sum of `hours_per_week` across all lessons.
  5. Byte-identical determinism: `serde_json::to_string` of `solve(&p)` and `solve(&p)` are equal.
- **`solver-core/tests/grundschule_smoke.rs`**: one fixture shaped like the OPEN_THINGS step 5 description (two classes, grade 1/2 Stundentafel ≈ 21 lesson-hours per class, 5 rooms including a gym, 8 teachers). Asserts the greedy places every hour with zero violations.
- `PROPTEST_CASES=1024` is the target density (matches `archive/v2`). The property file sets `proptest::proptest_config!(ProptestConfig::with_cases(1024))`.
- `solver-py/tests` stays untouched (binding unchanged this PR).
- `uv run pytest` keeps passing; no backend code depends on the new solver surface yet.

## Determinism and clippy policy in new code

Direct, codified in `solver/CLAUDE.md`:

- No `#![allow(..)]` at crate root.
- No item-level `#[allow(..)]` unless paired with a `// Reason: ...` comment.
- No `SystemTime::now()` inside `solver-core`.
- No `rand::thread_rng()`; no randomisation at all in the MVP.

`mise run lint` (clippy with `-D warnings`, `cargo fmt --check`, `cargo machete`) is the CI gate. Local pre-commit enforces the same.

## Dependencies

New entries in root `Cargo.toml` `[workspace.dependencies]`:

- `serde = { version = "1", features = ["derive"] }`
- `serde_json = "1"`
- `thiserror = "2"`
- `uuid = { version = "1", features = ["serde", "v4"] }`

`solver-core/Cargo.toml` inherits each with `{ workspace = true }`. `solver-py`'s `Cargo.toml` gains nothing; the deps are unused there this PR.

## Deviations from OPEN_THINGS step 1 wording

OPEN_THINGS step 1 says:

> Returns `Vec<Placement { lesson_id, time_block_id, room_id }>` or an explicit "infeasible at step X" error.

This spec returns `Solution { placements, violations }` instead. The `archive/v2` scheduler's `ScheduleOutput { timetable, score, violations, stats }` validated the "violations in output" shape in a previous iteration, and sprint step 4 (schedule view) needs it: a partial schedule with an annotated gap list is strictly more useful than a blanket error. The PR body and this spec document the deviation.

OPEN_THINGS "Pay down alongside the sprint" item "Decide cross-entity validation strategy before step 2" picked option (b): pre-solve check emitting readable messages. The `NoQualifiedTeacher` violation implements exactly that, earning the tick.

## Rollout and follow-ups

- **`reverse_chars` stays in `solver-core` and `solver-py`.** Step 2 removes it when it adds the real `solve_json` binding. Adding a throwaway removal here would split this PR across crates for a three-day stopgap.
- **`solver/CLAUDE.md` updates in this PR.** The illustrative error block there shows `Error::Infeasible`. Drop the variant from the example so the guidance matches the code.
- **OPEN_THINGS updates.** Remove step 1 from the sprint list. Remove the qualification-pre-check item from "Pay down alongside". Add a follow-up item: "First-Fit Decreasing ordering for the greedy (most-constrained lessons first)" in the Backlog.
- **Step 2's backend endpoint** will build against `solve_json` directly; no further `solver-core` changes expected for step 2.

## Open questions

None that block implementation. The teacher-availability `status` mapping is the one design choice that could surface later (e.g. once `"preferred"` becomes a real soft signal), but the MVP's "available vs blocked" model is the right place to start and the boundary transformation keeps the solver clean.
