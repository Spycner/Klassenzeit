# Solver Doppelstunden (`preferred_block_size > 1`) support

**Date:** 2026-04-29
**Status:** Design approved (autopilot autonomous mode).

## Problem

Sprint item #8 (P2) on `docs/superpowers/OPEN_THINGS.md`: "Hessen Grundschule uses Doppelstunden for Sport (Schwimmen), Werken, sometimes Kunst. Today the MVP rejects any lesson with `preferred_block_size > 1`."

Today:

- Pydantic constrains `preferred_block_size: int = Field(default=1, ge=1, le=2)` on `LessonCreate`, `LessonUpdate`, `StundentafelEntryCreate`, `StundentafelEntryUpdate`. Database column exists with `server_default="1"` on both `lessons` and `stundentafel_entries`.
- `backend/src/klassenzeit_backend/scheduling/solver_io.py:build_problem_json` strips `preferred_block_size` from the lesson dict it sends to the solver (no field is included in the lesson JSON object).
- `solver-core/src/types.rs:Lesson` has `#[serde(deny_unknown_fields)]` and an explicit unit test (`lesson_rejects_unknown_preferred_block_size_field`) that confirms the Rust side rejects the field outright if it is sent.
- `solve_with_config` places one hour at a time. There is no notion of "this hour belongs to a 2-hour block; please pair it with its neighbour."

A user who configures Sport at 4h/week with `preferred_block_size=2` currently gets four single-hour placements scattered across the week. The information that those hours should land as two contiguous 2-hour windows is silently discarded between the API layer and the solver.

## Goal

One PR that ships block placement end-to-end:

1. Rust `Lesson` gains `preferred_block_size: u8` (default 1, validated `>= 1`). Solver wire format is additive: existing length-1 lessons round-trip unchanged.
2. `validate_structural` rejects `preferred_block_size == 0` and `hours_per_week % preferred_block_size != 0` with `Err(Error::Input(...))`.
3. `solve_with_config` places `hours_per_week / preferred_block_size` blocks per lesson. Each block consists of `n` consecutive `(day, position)` time-blocks in one room with the lesson's teacher; positions strictly contiguous on the same day; same room across the full window; teacher and class free for every position in the window.
4. `Solution.violations` reuses existing `ViolationKind` values; one violation per failed block-instance with `hour_index` carrying the block-start offset (`0`, `n`, `2n`, ...).
5. LAHC's Change move skips block placements: an early `return false` inside `try_change_move` when `lesson.preferred_block_size > 1`. The two `random_range` draws per iteration are still consumed before the check, so determinism property test invariants hold.
6. Backend: `build_problem_json` adds `"preferred_block_size": lesson.preferred_block_size` to the lesson dict. Pydantic `LessonCreate` and `LessonUpdate` add a model-level validator that rejects `hours_per_week % preferred_block_size != 0` with 422.
7. Demo seed: `demo_grundschule.py` flips Sachunterricht (Klasse 3, 4h/week) to `preferred_block_size=2`. The Grundschule e2e smoke renders the Doppelstunde without changes (two adjacent cells, same subject/room).
8. Bench: `solver-core/benches/solver_fixtures.rs` mirrors the seed flip on the grundschule fixture. `mise run bench:record` refreshes `BASELINE.md`. The 20% regression budget applies.
9. ADR 0018 records the load-bearing decisions (atomic block placement, same-room invariant, LAHC skip).

After this PR: a Doppelstunde lesson configured in the API surfaces as two consecutive same-room placements in the schedule view; the e2e smoke exercises the path; the violation taxonomy is unchanged on the wire.

## Non-goals

- **Block-aware FFD eligibility.** Today's `ffd_order` ranks lessons by `eligibility = free-teacher-blocks * suitable-rooms`. A length-2 lesson is *more* constrained than a length-1 lesson with the same eligibility because it needs a contiguous run, not just any free slots. Folding contiguity into the eligibility computation requires precomputing per-(teacher, day) free-position runs of length `>= n`, which is non-trivial and adds state. Filed as a follow-up.
- **Block-aware LAHC Change move.** A move that picks a block placement and tries to relocate the whole window to a new contiguous start is the natural next neighbour. The determinism property test in `solver-core/tests/lahc_property.rs` relies on a fixed two-draws-per-iteration RNG budget; a block-aware Change move needs a third draw to pick the new start position, which forces a property-test rework. Out of scope; filed as a follow-up.
- **Block-aware Swap move.** Today's LAHC has no Swap move at all. The reference implementation in `archive/v2` adds one; out of scope.
- **Visual merge of adjacent same-lesson cells.** The `frontend/src/routes/schedule.tsx` grid renders one cell per `Placement` with no cross-cell awareness; teaching it that two same-`lesson_id` cells should render as one rowspan-merged unit is a polish item. Two adjacent identical cells already convey "Doppelstunde" pedagogically. Filed as a follow-up under "Product capabilities".
- **Mixed block sizes inside one lesson.** Allowing `hours_per_week=3, preferred_block_size=2` to mean "one 2-block plus one single hour" requires per-hour metadata about which hour was the remainder; the violation taxonomy and the schedule view both leak the distinction. Out of scope; users model `(Sport-Doppel, n=2, h=2)` plus `(Sport-Einzel, n=1, h=1)` as two separate lessons if they want both shapes.
- **`n > 2`.** Pydantic constrains `le=2`. The Rust algorithm in this PR is generic in `n`, but the API caps it at 2 until a real-world ask surfaces. (`n=3` would model Sport am Nachmittag at three consecutive hours; not a current customer ask.)
- **Schwimmunterricht plumbing.** External-room flag, pre-block / post-block buffer, Wegezeit. Depends on Doppelstunden landing first per OPEN_THINGS; itself a separate feature.

## Design

### Rust types (`solver-core/src/types.rs`)

`Lesson` gains one field:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lesson {
    /// Stable identifier for this lesson.
    pub id: LessonId,
    /// Receiving school class.
    pub school_class_id: SchoolClassId,
    /// Subject taught in this lesson.
    pub subject_id: SubjectId,
    /// Teacher assigned to this lesson.
    pub teacher_id: TeacherId,
    /// Number of hours of this lesson to place per week.
    pub hours_per_week: u8,
    /// Preferred block size for placement; `1` means single-hour placements,
    /// `n > 1` means each block is `n` consecutive same-day positions in one
    /// room. Solver places `hours_per_week / preferred_block_size` blocks.
    /// Must be `>= 1` and must divide `hours_per_week` evenly; otherwise
    /// `validate_structural` returns `Err(Error::Input(...))`.
    #[serde(default = "default_preferred_block_size")]
    pub preferred_block_size: u8,
}

fn default_preferred_block_size() -> u8 {
    1
}
```

The `#[serde(default = ...)]` attribute makes the field optional in JSON, so a payload omitting `preferred_block_size` deserializes as `1`. The existing `lesson_rejects_unknown_preferred_block_size_field` test is updated to assert *acceptance* of the field with value `2`, and a new test asserts the default is `1` when the field is omitted.

The flip side: a payload with `preferred_block_size: 0` parses successfully (u8 is a valid type), but `validate_structural` rejects it before solving begins.

### Validation (`solver-core/src/validate.rs`)

`validate_structural` adds two checks per lesson:

```rust
if lesson.preferred_block_size == 0 {
    return Err(Error::Input(format!(
        "lesson {}: preferred_block_size must be >= 1",
        lesson.id.0
    )));
}
if lesson.hours_per_week % lesson.preferred_block_size != 0 {
    return Err(Error::Input(format!(
        "lesson {}: hours_per_week ({}) must be divisible by preferred_block_size ({})",
        lesson.id.0, lesson.hours_per_week, lesson.preferred_block_size
    )));
}
```

These run before any placement; a malformed lesson never reaches `solve_with_config`'s placement loop.

### Block placement (`solver-core/src/solve.rs`)

`solve_with_config`'s outer loop changes from "for each hour of the lesson" to "for each block of the lesson":

```rust
let n = lesson.preferred_block_size;
let block_count = lesson.hours_per_week / n;
for block_index in 0..block_count {
    let placed = try_place_block(/* ... */);
    if !placed {
        solution.violations.push(Violation {
            kind: unplaced_block_kind(/* same lookup as today */),
            lesson_id: lesson.id,
            hour_index: block_index * n,
        });
    }
}
```

The `try_place_block` helper generalises today's `try_place_hour`. For `n == 1` it reduces to the same thing. For `n > 1`:

1. Iterate `tb_order` (pre-sorted by `(day, position, tb.id)`).
2. For each `tb_idx`, peek ahead `n - 1` indices in `tb_order` to find a candidate window: the next `n - 1` time-blocks must share `day_of_week` and have positions `tb.position + 1`, `tb.position + 2`, ..., `tb.position + (n - 1)` in order. If any neighbour is on a different day, has a non-consecutive position, or doesn't exist, skip this `tb_idx` and try the next.
3. For every time-block in the window, verify hard-feasibility: `used_teacher`, `used_class`, `teacher_blocked` all clear; teacher capacity holds for the full `n`-add (`current + n <= max`).
4. For every room in `room_order`: verify the room is free (`used_room`), suitable for the subject, not blocked, *for every time-block in the window*. The first feasible room wins the room tiebreak.
5. Score the window: sum of per-position soft-deltas. Use the same `candidate_score` logic, applied `n` times against a running `(class_positions, teacher_positions)` hypothetical (each new position raises subsequent positions' deltas).
6. Best window across all `tb_idx` wins under `(score, day, start_position, room.id)` tiebreak. The early-exit at `score == state.soft_score` from the length-1 path generalises (window-delta is non-negative so any zero-delta window is optimal).
7. Apply mutations: append `n` `Placement`s to `placements`, add `n` entries to `class_positions[(class, day)]`, `teacher_positions[(teacher, day)]`, mark `n` `(teacher, tb_id)` / `(class, tb_id)` / `(room, tb_id)` pairs in the used-* sets, bump `hours_by_teacher` by `n`, set `state.soft_score = c.score`.

The picker's tiebreak rule generalises straightforwardly to `(score, day, start_position, room.id)`. Determinism is preserved because both the day-grouping walk and the room iteration use the existing pre-sorted index lists.

For `n == 1` the loop in step 2 collapses (window length 1, no neighbours to check), step 3 reduces to one tb, step 4 reduces to today's room scan, step 5 uses today's `candidate_score`. The resulting placements and soft-score are bit-identical to today's path.

### LAHC skip (`solver-core/src/lahc.rs`)

Inside `try_change_move`, after the `let lesson = lesson_lookup[&p.lesson_id];` lookup, insert:

```rust
if lesson.preferred_block_size > 1 {
    return false;
}
```

Both `random_range` draws (`placement_idx`, `new_tb_idx`) are consumed by the caller before this check fires, so the RNG-budget invariant the determinism property test relies on holds.

### Backend (`backend/src/klassenzeit_backend/scheduling/solver_io.py`)

Inside `build_problem_json`, the lesson dict gains one field:

```python
"lessons": [
    {
        "id": str(lesson.id),
        "school_class_id": str(lesson.school_class_id),
        "subject_id": str(lesson.subject_id),
        "teacher_id": str(lesson.teacher_id),
        "hours_per_week": lesson.hours_per_week,
        "preferred_block_size": lesson.preferred_block_size,
    }
    for lesson in lessons
],
```

### Pydantic validator (`backend/src/klassenzeit_backend/scheduling/schemas/lesson.py`)

`LessonCreate` and `LessonUpdate` gain a `model_validator(mode='after')` that rejects `hours_per_week % preferred_block_size != 0`:

```python
@model_validator(mode='after')
def hours_divisible_by_block_size(self) -> 'LessonCreate':
    n = self.preferred_block_size
    if n is not None and n > 0 and self.hours_per_week % n != 0:
        raise ValueError(
            f'hours_per_week ({self.hours_per_week}) must be divisible by '
            f'preferred_block_size ({n})'
        )
    return self
```

`LessonUpdate` re-runs the check using the union of provided fields plus the existing row's fields (load the row, merge, validate). The validator lives at the route layer for `LessonUpdate` because the row state matters.

### Demo seed (`backend/src/klassenzeit_backend/seed/demo_grundschule.py`)

Sachunterricht in Klasse 3 has `hours_per_week=4`. The seed function that creates the Lesson row for that subject flips its `preferred_block_size` from `1` to `2`. The matching Stundentafel entry's `preferred_block_size` flips to `2` as well so the seed and the curriculum stay coherent.

### Bench fixture (`solver-core/benches/solver_fixtures.rs`)

The grundschule generator already mirrors the seed's lessons by hand. The Sachunterricht lesson in the fixture flips `preferred_block_size` from 1 to 2 to match the seed.

### ADR 0018

Records the four load-bearing decisions:

- Atomic block placement on the existing `Lesson` (decision Q1).
- Same room across the window (decision Q2).
- API rejection of `h % n != 0` plus solver mirror (decision Q3).
- Reuse violation taxonomy with `hour_index = block_start_offset` (decision Q4).
- LAHC skips block placements (decision Q7).

## Components touched

| File | Change |
|---|---|
| `solver/solver-core/src/types.rs` | Add `preferred_block_size: u8` to `Lesson` with `#[serde(default)]`. |
| `solver/solver-core/src/validate.rs` | Reject `n == 0` and `h % n != 0`. |
| `solver/solver-core/src/solve.rs` | Replace per-hour with per-block placement; new `try_place_block`; same-room window; new violation hour_index semantics. |
| `solver/solver-core/src/lahc.rs` | One-line guard skipping block placements. |
| `solver/solver-core/tests/properties.rs` | Property test: every block places n consecutive same-day same-room placements. |
| `solver/solver-core/tests/lahc_property.rs` | Confirm block placements are not moved by LAHC. |
| `solver/solver-core/benches/solver_fixtures.rs` | Flip Sachunterricht to `n=2` in the grundschule fixture. |
| `solver/solver-core/benches/BASELINE.md` | Refreshed via `mise run bench:record`. |
| `backend/src/klassenzeit_backend/scheduling/solver_io.py` | Include `preferred_block_size` in lesson dict. |
| `backend/src/klassenzeit_backend/scheduling/schemas/lesson.py` | Add `model_validator` for divisibility. |
| `backend/src/klassenzeit_backend/scheduling/routes/lessons.py` | Run divisibility validator in `LessonUpdate` against the merged row. |
| `backend/src/klassenzeit_backend/seed/demo_grundschule.py` | Flip Sachunterricht to `preferred_block_size=2`. |
| `backend/tests/scheduling/test_solver_io.py` | Cover block-aware lesson dict shape. |
| `backend/tests/scheduling/routes/test_lessons.py` | Cover 422 on `h % n != 0`. |
| `solver/solver-py/python/klassenzeit_solver/__init__.pyi` | No change (the binding passes JSON through; no new Python-facing field on the wrapper). |
| `docs/adr/0018-solver-doppelstunden.md` | New ADR. |
| `docs/superpowers/OPEN_THINGS.md` | Mark item 8 ✅ Shipped; add follow-ups. |

## Testing strategy

### solver-core unit tests (in `solve.rs`)

- `block_lesson_places_n_consecutive_positions_in_one_room`: lesson with `n=2, h=2`, four single-day time-blocks at positions 0..3, one room, one teacher. Exactly two placements, positions [k, k+1] consecutive, same room.
- `block_lesson_does_not_cross_day_boundary`: time-blocks split day0=[0,1], day1=[0,1]; lesson with `n=2, h=2`. The picker must not produce a placement at (day0, pos1) + (day1, pos0).
- `block_lesson_emits_one_violation_per_failed_block`: a 4-hour `n=2` lesson into a problem with no contiguous 2-window available emits 2 violations with `hour_index` 0 and 2.
- `block_lesson_uses_same_room_across_window`: two rooms, only room A has the second slot free; the picker picks a window where room A is feasible across the full window even when room B alone has the first slot.
- `validate_structural_rejects_zero_block_size` and `validate_structural_rejects_non_divisible_hours`.

### solver-core integration / property tests

- `tests/properties.rs` gains a property: for any randomly generated Problem with random `n in {1, 2}`, every placement produced has the same room as its block-mates and consecutive same-day positions.
- `tests/lahc_property.rs` gains a regression test: starting from a greedy solution that includes a block placement, LAHC's mutations leave that block untouched after a fixed iteration cap.

### backend pytest

- `tests/scheduling/routes/test_lessons.py`: 422 on `LessonCreate` with `hours_per_week=3, preferred_block_size=2`; 422 on `LessonUpdate` flipping `preferred_block_size` to a non-divisor.
- `tests/scheduling/test_solver_io.py`: `build_problem_json` includes `preferred_block_size` per lesson; the smoke path with a `n=2` lesson hits the solver and gets back two same-room placements.

### bench

- `mise run bench` confirms grundschule and zweizuegig stay within the 20% budget.
- `mise run bench:record` refreshes `BASELINE.md`. The grundschule fixture's `soft_score` may change because Sachunterricht's positions are now driven by block placement instead of per-hour placement.

## Risks and mitigations

- **Bench regression beyond 20%.** Block placement walks the room scan once per window of size n instead of once per single hour, but it also reduces the number of outer-loop iterations by a factor of n. Net effect should be at-or-near parity for the grundschule fixture (one block lesson at n=2). If the budget breaches, mitigation is to revert the seed flip in this PR (keep the algorithmic change, defer the demo flip to a follow-up so the bench stays unchanged for now).
- **Determinism property test under fixed seed.** The LAHC RNG-budget invariant must not regress. The `try_change_move` early-return is positioned *after* both `random_range` draws are consumed (the draws happen in `lahc::run`, the early-return is in `try_change_move` which is called per-iteration). Verified by reading `lahc.rs:60-63`.
- **OpenAPI types stay stable.** `preferred_block_size` is already on `LessonResponse` (type generated from Pydantic) and on `StundentafelEntryResponse`. The frontend's TypeScript types regenerate (`mise run fe:types`); the diff should be zero because the field already exists on the response shapes.
- **Stundentafel `preferred_block_size` already in API.** The DB and API layer have always carried the field; only the solver path was the bottleneck. So the only frontend-relevant change is the new 422 on odd-hours-with-n=2, which surfaces as a generic form-root error (existing `form.setError("root", ...)` shape).

## Out-of-scope (filed as follow-ups)

- Block-aware FFD eligibility.
- Block-aware LAHC Change move.
- Block-aware Swap move (no Swap move exists yet).
- Visual merge of adjacent same-lesson cells in the schedule grid.
- Mixed block sizes inside one lesson (remainder handling).
- `preferred_block_size > 2`.
- Schwimmunterricht plumbing (depends on Doppelstunden plus external-room and buffer plumbing).
