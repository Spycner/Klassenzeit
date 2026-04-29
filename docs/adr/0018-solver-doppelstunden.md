# 0018: Solver Doppelstunden (`preferred_block_size > 1`) support

Status: Accepted (autopilot 2026-04-29).

## Context

Hessen Grundschulen run Sport (Schwimmen), Werken, sometimes Kunst, and (in Klasse 3/4) Sachunterricht as Doppelstunden: two consecutive 45-minute Unterrichtsstunden in the same room with the same teacher. The MVP solver placed every lesson hour independently and ignored `preferred_block_size`. The Pydantic schema, DB column, and CRUD UI all carried the field, so the information was discarded between API and solver. OPEN_THINGS sprint item #8 (P2): "extend a lesson with `preferred_block_size: n` and `hours_per_week: h` to need `h / n` contiguous n-block windows on the same day".

## Decision

1. **Atomic block placement on the existing `Lesson`.** `preferred_block_size: u8` lives on the Rust `Lesson` struct with `#[serde(default = "...")]` so the wire format stays additive. The solver places `h / n` blocks per lesson, each block being `n` consecutive same-day positions in one room.
2. **Same room across the n-window.** Block lessons place all `n` placements in one room; pedagogically a Doppelstunde is one continuous unit (Sport, Werken, Sachunterricht-Experiment).
3. **Reject `h % n != 0` at both layers.** Pydantic `model_validator(mode="after")` on `LessonCreate` and `EntryCreate` returns a 422 at the API boundary; route-level merge checks on `LessonUpdate` and `EntryUpdate` mirror the rule against the merged row; `validate_structural` on the Rust side returns `Err(Error::Input)` for the same reason. No runtime "violation" path for misconfiguration.
4. **Reuse the existing violation taxonomy.** One `Violation` per failed block-instance with `hour_index = block_index * n`. No new `UnplacedBlock` variant; the size is derivable from the lesson. `pre_solve_violations` also emits one per block so the per-block invariant holds across both placement and pre-solve paths.
5. **LAHC's Change move skips block placements.** A single early-return inside `try_change_move` when `lesson.preferred_block_size > 1`. Both `random_range` draws are consumed before the check, preserving the determinism property test's RNG-budget invariant.

## Consequences

- A 4-hour Sachunterricht lesson with `n=2` produces 2 Doppelstunden across the week. The schedule view shows two adjacent same-room cells per Doppelstunde; visual merge is filed as a follow-up.
- Block lessons are not optimised by LAHC. Greedy's choice for blocks is final until block-aware moves land.
- FFD eligibility ranks block lessons by `free-teacher-blocks * suitable-rooms`, ignoring contiguity. Filed as a follow-up.
- The grundschule bench fixture's Sachunterricht is flipped to `n=2` so the bench measures the new placement path. `BASELINE.md` refreshed: grundschule p50 51 → 50 µs greedy (no regression), zweizuegig p50 243 → 256 µs greedy (within budget). Soft scores unchanged on both fixtures.
- Demo seed: Sachunterricht in `demo_grundschule.py` is now flipped to `preferred_block_size=2` for all grades via a `_DOPPEL_SUBJECTS = {"SU": 2}` lookup. Both Klasse 1/2 (2h) and Klasse 3/4 (4h) cases stay divisibility-clean.

## Alternatives considered

- **Per-hour placements with a contiguity constraint.** Rejected: the lowest-delta greedy explicitly avoids backtracking; per-hour placement plus rollback recreates the architecture we removed.
- **Pre-expand to virtual length-`n` lessons.** Rejected: duplicates the lesson identity and forces the violation taxonomy to talk about virtual lessons.
- **`UnplacedBlock { size }` violation variant.** Rejected: the size is already derivable from the lesson; the variant adds taxonomy without information.
- **Block-aware LAHC Change move in this PR.** Rejected: requires a third RNG draw per iteration to pick a contiguous start position, which forces a property-test rework. Filed as a follow-up.
- **Mixed block sizes inside one lesson** (`h=3, n=2` meaning one Doppel plus one single hour). Rejected: leaks per-hour metadata into the violation taxonomy and the schedule view. Users who want both shapes model two lessons (`Sport-Doppel n=2 h=2` plus `Sport-Einzel n=1 h=1`).

## Pointers

- Spec: `docs/superpowers/specs/2026-04-29-solver-doppelstunden-design.md`.
- Plan: `docs/superpowers/plans/2026-04-29-solver-doppelstunden.md`.
- Brainstorm Q&A: posted on the PR as one comment per question.
- OPEN_THINGS sprint item: #8 (Doppelstunden, P2), marked shipped 2026-04-29.
