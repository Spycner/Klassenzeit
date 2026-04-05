# Solver Tuning: LAHC + Tabu Hybrid

## Problem

The LAHC solver converges to the same local optimum regardless of seed. Benchmark results (5 seeds, 15s each):

| Instance | Soft (avg) | Soft (best) | Soft (worst) | TTB (avg) |
|---|---|---|---|---|
| small-4cls | -10.0 | -10 | -10 | 675ms |
| realistic-8cls | -43.0 | -43 | -43 | 2142ms |
| stress-16cls | -103.4 | -103 | -104 | 4825ms |

Zero (or near-zero) variance across seeds. Time-to-best under 5 seconds means the remaining solve time is wasted — the solver can't escape the basin.

## Solution

Add a Tabu component to the existing LAHC solver, following Timefold's recommended hybrid pattern: "a bit of Tabu — use a lower tabu size than pure Tabu Search" (pure TS tenure 15-30 for timetabling; hybrid tenure ~7-10).

Tabu acts as an additional rejection filter layered on LAHC acceptance. A move must pass both LAHC acceptance and not be tabu (unless aspiration fires).

## Design

### Tabu List

A fixed-size circular buffer (`VecDeque<TabuEntry>`) storing recently made moves. When the buffer is full, the oldest entry is evicted on push.

**TabuEntry variants:**
- `Change { lesson_idx: usize, old_timeslot: usize, old_room: Option<usize> }` — forbids moving that lesson back to its previous (timeslot, room)
- `Swap { idx_a: usize, idx_b: usize }` — stored with `min, max` ordering, forbids re-swapping the same pair

**Checking tabu status:** For a candidate move, compute what its *reverse* would be and check if that reverse is in the tabu list.
- Candidate is Change(lesson, new_ts, new_room) → reverse is Change(lesson, old_ts, old_room) → check if `(lesson, old_ts, old_room)` matches any Change entry
- Candidate is Swap(a, b) → reverse is Swap(a, b) → check if `(min(a,b), max(a,b))` matches any Swap entry

Wait — simpler framing: after executing a Change move that moved lesson L from (ts_old, room_old) to (ts_new, room_new), we record `Change { lesson_idx: L, old_timeslot: ts_old, old_room: room_old }`. This forbids any future Change move that would place lesson L back at (ts_old, room_old). The tabu check on a candidate Change(L, ts_candidate, room_candidate) checks whether (L, ts_candidate, room_candidate) matches any entry.

### Aspiration Criterion

A tabu move is accepted if it produces a score strictly better than the current global best. This prevents tabu from blocking genuinely improving moves.

### Config Changes

Add to `LahcConfig`:
```rust
pub tabu_tenure: usize,  // default: 7, set to 0 to disable tabu
```

### Solver Loop Changes

In `optimize()`, after generating a candidate move and evaluating its delta score:

1. Compute accepted score: `new_score`
2. Check if the move is tabu (its target assignment matches a tabu entry)
3. If tabu AND `new_score` is not a new global best → skip iteration (don't apply move)
4. If not tabu OR aspiration fires → proceed with normal LAHC acceptance check
5. After accepting and applying a move → push entry onto tabu list

### Parameter Sweep

Extend the benchmark binary with optional flags:
- `--tabu-tenure <N>` (default: 7)
- `--list-length <N>` (default: 500)

This enables sweep runs like:
```bash
for t in 0 5 7 10 15; do
  benchmark --seeds 10 --max-seconds 30 --tabu-tenure $t
done
```

### Testing

- **Unit test**: tabu list correctly rejects forbidden Change and Swap moves
- **Unit test**: aspiration criterion overrides tabu when new global best
- **Unit test**: tabu_tenure=0 disables tabu (behavior identical to current solver)
- **Property test**: extend existing proptest — score invariants hold with tabu enabled
- **Benchmark comparison**: run before/after with identical seeds, compare soft scores and variance

### Non-goals

- Reactive tabu (dynamic tenure adjustment)
- Kempe chain moves (only if Change+Swap still plateau after tuning)
- Ruin-and-recreate perturbation
- Any changes to the construction heuristic
- Changes to hard/soft constraint definitions

## Success Criteria

- Soft score variance > 0 across seeds (solver finds different optima)
- Average soft score improvement over baseline on all three benchmark instances
- No regression in feasibility rate or time-to-feasibility
- Solver still respects max_seconds and max_idle_ms termination

## Files Changed

- `scheduler/src/local_search.rs` — TabuEntry, tabu list logic, config field
- `scheduler/src/bin/benchmark.rs` — CLI flags for tabu_tenure and list_length
- `scheduler/tests/local_search.rs` — tabu unit tests
- `scheduler/tests/proptest_scoring.rs` — extend with tabu-enabled runs (if needed)
