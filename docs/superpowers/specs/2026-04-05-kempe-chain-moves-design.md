# Kempe Chain Moves — Design Spec

## Problem

The LAHC+Tabu solver with Change and Swap moves hits a ceiling on all test instances (4/8/16 classes). The tuning sweep confirmed this is a neighborhood limitation, not a cycling issue — simple moves cannot reach solution regions that require coordinated multi-lesson rearrangements.

## Solution

Add Resource-Pair Kempe Chain moves as a third move type. A Kempe chain swaps a connected cluster of lessons between two timeslots, following shared resource links (teacher, class, room). This reaches solution regions inaccessible to Change and Swap.

## Chain Construction

1. **Pick seed**: Random assigned lesson `L` at timeslot `ts_a`
2. **Pick target**: Random different timeslot `ts_b`
3. **Build chain via BFS**:
   - Start with `L` in the `ts_a → ts_b` set
   - Find all lessons at `ts_b` that share a resource (teacher, class, or room) with any lesson in the `ts_a → ts_b` set — add them to the `ts_b → ts_a` set
   - Find all lessons at `ts_a` that share a resource with any lesson in the `ts_b → ts_a` set — add them to the `ts_a → ts_b` set
   - Repeat until no new lessons are added (fixed point)
4. **Max chain size**: Cap at 20 lessons. If chain grows beyond this, abort (skip the move). Prevents degenerate cases on dense instances.
5. **Result**: Two disjoint sets of lessons to swap between the two timeslots.

Resources used for conflict linkage:
- **Teacher**: lessons share the same `teacher_idx`
- **Class**: lessons share the same `class_idx`
- **Room**: lessons share the same `room` (only when both have `Some(room_idx)`)

## Move Execution

Atomic batch operation using existing incremental scoring:

1. Unassign all chain members (both sets)
2. For each lesson in `ts_a → ts_b` set: assign to `ts_b` with room handling (see below)
3. For each lesson in `ts_b → ts_a` set: assign to `ts_a` with room handling (see below)
4. Evaluate score, accept/reject as one move

### Room Handling

When a lesson moves to a new timeslot:

- If `needs_special_room == false`: keep `room = None`, no issue
- If `needs_special_room == true`: keep the same room if it has capacity at the new timeslot (check `room_at_slot` count < `max_concurrent_at_slot`). Otherwise pick a random compatible room with available capacity.
- If no compatible room is available: **abort the entire chain** — unassign all, reassign to originals, skip the move.

Room capacity checks happen after all unassigns (so freed capacity is visible) but during the sequential assign phase.

## LAHC + Tabu Integration

### Move Selection Probability

- 40% Change
- 40% Swap
- 20% Kempe

Kempe chains are more expensive per iteration (multiple unassign/assign calls), so lower probability keeps throughput high. This is a constant, not a config parameter.

### Tabu Entry

New variant:

```rust
TabuEntry::Kempe {
    seed_lesson_idx: usize,
    target_timeslot: usize,
}
```

Records the seed lesson + target timeslot direction. Prevents the same seed from generating the same chain direction repeatedly. Aspiration override still applies (accept if new best regardless of tabu).

After acceptance, record the **reverse** as tabu: seed lesson + original timeslot (forbid returning).

### Undo

New variant:

```rust
UndoInfo::Kempe {
    moves: Vec<(usize, usize, Option<usize>)>,  // (lesson_idx, old_timeslot, old_room)
}
```

Undo = unassign all chain members, reassign each to its stored `(old_timeslot, old_room)`.

### Stats

Add to `SolveStats`:
- `kempe_attempted: u64`
- `kempe_accepted: u64`

## Testing

### Property-based tests (proptest)

1. **Score consistency**: Apply Kempe chain, verify `state.score() == full_evaluate(lessons, facts)` — incremental scoring stays in sync across multi-lesson moves
2. **Undo correctness**: Apply chain, undo it, verify score returns to original value and all lessons are at original positions
3. **Chain closure**: Every resource conflict between the two timeslots is captured — no lesson outside the chain shares a teacher/class/room with a chain lesson at the target timeslot

### Unit tests

4. **Small deterministic case**: 2 teachers, 2 classes, 2 timeslots — manually verify chain includes correct lessons and swap produces expected state
5. **Abort on no room**: Lesson with `needs_special_room` can't find a room at target timeslot — verify chain aborted, state unchanged
6. **Max chain size cap**: Dense instance where chain exceeds 20 — verify rejection, state unchanged

### Benchmarks

7. Run existing 4/8/16-class instances with Kempe enabled vs Change+Swap only, compare best scores after fixed time. Validates whether Kempe breaks through the ceiling.

## Code Changes

All changes in `scheduler/` crate:

| File | Change |
|------|--------|
| `src/local_search.rs` | Add `kempe_chain()` function, `TabuEntry::Kempe` variant, `UndoInfo::Kempe` variant, integrate into solver loop |
| `src/types.rs` | Add `kempe_attempted`, `kempe_accepted` to `SolveStats` |
| `tests/proptest_scoring.rs` | Add Kempe-specific property tests |
| `tests/kempe_unit.rs` | New file for deterministic unit tests |
| `benches/` | Add Kempe-enabled benchmark variant |

## Non-Goals

- Configurable move probability (hardcode 40/40/20)
- Kempe chains across more than 2 timeslots (ejection chains — future work)
- Adaptive chain size cap (fixed at 20)
