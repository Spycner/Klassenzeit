# 0015: Solver LAHC local-search loop with seeded RNG

- **Status:** Accepted
- **Date:** 2026-04-28

## Context

PR-9a (`feat/solver-objective-soft-constraints`) shipped the soft-constraint scoring foundation: `score_solution`, `Solution.soft_score`, `ConstraintWeights { class_gap, teacher_gap }`, and a lowest-delta greedy. Per-class soft-score is non-zero on non-trivial fixtures (zweizuegig p50 reports `soft_score = 2`).

Sprint #9 calls for "Soft constraints + objective function + LAHC". PR-9b is the local-search half: a stochastic loop that polishes the greedy's output before the schedule endpoint returns to the user. archive/v2's reference implementation (684 LOC under `scheduler/src/local_search.rs`) ships LAHC plus tabu, Kempe chains, and Swap moves; this PR rejects the latter three to keep the surface reviewable in one autopilot run.

## Decision

Plain Burke-Bykov LAHC, list length 500, single Change move (move one lesson-hour to a different time-block, reuse old room or fall back to lowest-id hard-feasible room).

API. `SolveConfig.deadline: Option<Duration>` triggers the loop; `solve()` (no-config entry) hard-codes 200ms. `SolveConfig.seed: u64` seeds a `rand::rngs::SmallRng` owned by the loop. New `SolveConfig.max_iterations: Option<u64>` exists for property-test determinism; production callers leave it `None`.

Algorithm. Generate-and-test feasibility (no precomputed feasible set). Incremental delta scoring via `score::gap_count_after_remove` plus the hoisted `score::gap_count_after_insert`. State maintained across iterations: placements, class_positions, teacher_positions, used_teacher / used_class / used_room, current_score, lahc_list[500] of recent costs. RNG draws are invariant across feasibility branches: every iteration consumes exactly two `random_range` calls (placement_idx, target_tb_idx).

## Alternatives considered

- **Tabu search.** Deferred indefinitely. archive/v2's 684 LOC for tabu plus Kempe plus Swap delivered marginal gain on the educational-timetabling problem class against the implementation cost.
- **Simulated annealing.** Adds knobs (cooling schedule, temperature) without a published advantage on this domain.
- **Step Counting Hill Climbing.** Close cousin of LAHC; LAHC chosen for archive/v2 readability continuity.
- **Always-on LAHC inside `solve_with_config` with a fixed default.** Rejected in favour of `deadline.is_some()` as the trigger so existing greedy-only callers (tests, future use cases) are not forced into LAHC.
- **Pre-filter feasible candidates per lesson.** Maintaining a feasible-set per lesson under mutation is `O(P)` per move and obviates the incremental delta. Generate-and-test with ~30% feasibility hit rate is cheaper.

## Consequences

`solve_with_config` is no longer a pure greedy entry point; callers wanting greedy-only set `deadline: None`. Determinism story: same problem plus same seed plus same `max_iterations` cap yields identical Solutions. The `solve.rs` unit tests use a `greedy_solve` helper to keep their wall-clock cheap; the production-path active default code is exercised by the integration tests (`tests/grundschule_smoke.rs`) and by the new property file (`tests/lahc_property.rs`).

`Solution.soft_score` carries the post-LAHC value. The bench prints separate greedy and lahc rows; the LAHC row asserts `soft_score <= greedy soft_score`. The 20% greedy regression budget continues to apply to the greedy row only. On the current bench fixtures both modes report identical soft scores (grundschule 0/0, zweizuegig 2/2) because the lowest-delta greedy is already in a single-Change-move local minimum at list-length 500 over 200ms; future PR-9c soft constraints (subject-level pedagogy preferences) and broader move types are the next levers for soft-score reduction.

The 200 ms default lives inside `solve()` and consumes part of the FastAPI request budget on `POST /api/classes/{id}/schedule`. If staging shows a regression, the hotfix is a one-line edit to the literal.

## Follow-ups

- PR-9c: subject-level pedagogy preferences (Hauptfächer früh, Sport not first period, Musik/Kunst dedicated rooms). Adds soft-constraint axes to `score_solution`; LAHC inherits them automatically.
- Configurable LAHC deadline via query parameter on `POST /api/classes/{id}/schedule`.
- Promote `max_iterations` to a public production knob if iteration-bounded solves become a use case.
- Add `iterations` / `accepted` / `rejected` telemetry to `Solution` if production observability needs it.
- Graduate the move to `(tb, room)` tuple change once room-aware soft constraints exist.
- Add `soft_score_before` and `soft_score_after` to the structured `solver.solve.done` log line.
