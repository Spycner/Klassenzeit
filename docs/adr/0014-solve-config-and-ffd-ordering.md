# 0014: SolveConfig API and FFD ordering

- **Status:** Accepted
- **Date:** 2026-04-26

## Context

The active "solver quality + tidy" sprint planned three algorithm-phase PRs (FFD ordering, Doppelstunden, LAHC + soft constraints). All three need a way to pass tunables (`weights`, `seed`, `deadline`) into `solve` without breaking every existing call site, and the latter two need a deterministic, eligibility-aware lesson order to build on. Without a configuration carrier, each PR would either grow `solve`'s positional argument list or wrap a parallel entry point; without FFD, the bench fixtures keep relying on the scarcity-first `subject_order` workaround documented in `solver/CLAUDE.md`.

## Decision

Introduce `pub struct SolveConfig { deadline: Option<Duration>, seed: u64, weights: ConstraintWeights }` and an empty `pub struct ConstraintWeights {}` placeholder, both deriving `Default`. Add `pub fn solve_with_config(problem: &Problem, config: &SolveConfig) -> Result<Solution, Error>`. Reduce `solve(&Problem)` to a delegate over `solve_with_config(p, &SolveConfig::default())`.

Inside `solve_with_config`, sort lessons via `ordering::ffd_order(problem, idx) -> Vec<usize>`. Eligibility is the product of (count of time blocks where the lesson's teacher is not blocked) and (count of rooms suitable for the lesson's subject). Tiebreak on `LessonId` byte order. FFD is unconditional; there is no flag to disable it.

## Alternatives considered

- **Keep `solve` input-Vec ordered; add a parallel `solve_with_config` that runs FFD.** Rejected: two code paths, two mental models, and the bench fixture's workaround stays load-bearing for one of them.
- **archive/v2's `(eligible_slots, eligible_rooms, teacher_max)` tuple metric.** Rejected: the tertiary key buys nothing without per-class availability data, and the secondary key relies on room capacity that the current schema does not model.
- **Live MRV (recompute eligibility per step).** Rejected for this PR: appropriate for the local-search PR (LAHC), where the marginal cost is amortised against the swap budget; overkill for the construction phase.
- **Forgo the ADR.** Rejected: `SolveConfig` is the API surface for two more sprint PRs; documenting the constraints now keeps future contributors from re-litigating them.

## Consequences

The bench fixture's scarcity-first workaround retires. The API gains forward-compat: PR 8 (Doppelstunden) and PR 9 (LAHC + soft constraints) extend `SolveConfig` and `ConstraintWeights` without touching existing callers. `BASELINE.md` updates with FFD-aware numbers; the regression budget is unchanged. We would revisit if FFD's coarse metric proves inadequate on a fixture (e.g., the deferred `demo_gesamtschule`); the next refinement would be the v2-style tuple metric or a live MRV pass.
