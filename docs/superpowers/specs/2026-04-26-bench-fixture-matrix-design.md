# Bench-fixture matrix (sprint item 6)

**Date:** 2026-04-26
**Status:** Design approved (brainstorm `/tmp/kz-brainstorm/brainstorm.md`), plan pending.

**Scope adjustment after planning (2026-04-26):** Ship the `demo_grundschule_zweizuegig` fixture and the multi-fixture bench infrastructure (rename, row-per-fixture TSV, `soft_score` column) in this PR. Defer `demo_gesamtschule` to a discrete follow-up PR. The original brainstorm Q1 picked "one PR with both fixtures"; the writing-plans phase quantified the cost (50-teacher / 240-entry assignment table, plus the matched Rust mirror, plus risk that the MVP greedy solver cannot solve a Sek I-scale instance cleanly without iteration) and made the cost / risk asymmetric enough to split. The infrastructure ships once and amortises across this PR and the Gesamtschule follow-up; the zweizügige fixture (8 classes, 196 placements) is enough on its own to give items 7 to 9 a second size to read against.

## Problem

The solver-quality sprint (active in `docs/superpowers/OPEN_THINGS.md`) has shipped tidy items 1, 2, 4, 5, and now 3 (auto-assign teachers, PR #137). Item 6 is the last tidy item before the algorithm phase (PRs 7 to 9: FFD ordering, Doppelstunden, soft constraints + LAHC).

The current criterion bench (`solver/solver-core/benches/solver_grundschule.rs`) targets one Grundschule-shaped fixture (2 classes, 8 teachers, 5 rooms, 15 lessons, 45 placements). At that scale the MVP greedy solver runs in ~40 µs per solve and emits zero hard violations. Items 7 to 9 are expected to make the solver materially smarter; the 20% regression budget (`solver/CLAUDE.md` "Bench workflow") reads on this single 45-placement fixture, which means:

1. We cannot tell whether a clever-on-small / dumb-on-big regression is hidden inside an algorithm change.
2. We cannot bench Doppelstunden support (PR 8) because no fixture has `preferred_block_size > 1` lessons.
3. We cannot meaningfully measure soft-score quality (PR 9) on 45 placements where greedy already produces a feasible schedule.

This PR closes that gap by adding two larger fixtures, mirroring them in the Python `klassenzeit_backend.seed` package so the demo and dev paths can use them too, and rewiring the bench harness + record script to a multi-fixture format.

## Goal

One PR that:

1. Adds Python seed package `demo_grundschule_zweizuegig` (8 classes / 12 teachers / 11 rooms / 196 placements) with pre-assigned `teacher_id` per Lesson as authored data.
2. Adds Typer CLI command `seed-grundschule-zweizuegig` mirroring the existing `seed-grundschule` shape; rejects `settings.env == "prod"`.
3. Adds a Rust bench fixture builder for zweizügig, registered as a second `bench_function` inside the existing criterion group.
4. Renames the bench file `solver_grundschule.rs` → `solver_fixtures.rs` and updates the matching `[[bench]] name` and the `--bench` flag in `scripts/record_solver_bench.sh`.
5. Reshapes the bench's stderr emission from key/value lines (one fixture) to TSV header + rows (N fixtures) inside the same `---SOLVER-BENCH-BASELINE---` fence; `record_solver_bench.sh` parses rows and renders one markdown row each.
6. Adds a `soft_score` column reserved at value `0` for the MVP solver (PR 9 fills it in).
7. Refreshes `BASELINE.md` on the recording host (AMD Ryzen 7 3700X) so the committed numbers reflect grundschule + zweizuegig measurements.

After this PR, `mise run bench:record` produces a two-row baseline; the algorithm-phase PRs (7 to 9) read against two points of measurement instead of one; and the OPEN_THINGS sprint section shows item 6 partially shipped (zweizuegig leg done, gesamtschule leg open as a follow-up).

## Non-goals

- **Synthetic generator at 100+ classes.** OPEN_THINGS marks it optional; deferred to a follow-up when items 7 to 9 surface a concrete need.
- **`/__test__/seed-*` endpoints for the new fixtures.** No e2e test consumes them today; add when an e2e test wants them.
- **Sek II / Oberstufe in the Gesamtschule fixture.** Schema does not honestly represent Kurse / Wahlpflicht / LK-GK splitting; modelling it as "5 uniform classes" lies about scheduling difficulty.
- **Doppelstunden lessons in any fixture.** PR 8 in OPEN_THINGS adds them with the matching solver support.
- **A new ADR.** No new dependency, toolchain, or subsystem; this is fixture data on existing primitives.
- **Tightening the bench-runtime assertions across fixtures into a shared helper.** Each fixture's literal counts are part of its drift-detection signal; lifting them into a shared utility weakens it.

## Existing surface (reference)

- `backend/src/klassenzeit_backend/seed/demo_grundschule.py` (259 lines): one-shot seed coroutine with `_PERIODS`, `_SUBJECTS`, `_TEACHERS`, `_ROOMS`, `_SCHOOL_CLASSES` tuples + grade-keyed `_HOURS` dicts. The new seeds extend this pattern.
- `backend/src/klassenzeit_backend/cli.py:147-171`: `_run_seed_grundschule` + `seed_grundschule` Typer command. New seeds add a parallel pair each.
- `solver/solver-core/benches/solver_grundschule.rs` (207 lines): criterion bench with hand-coded `grundschule_fixture()`, `iter_custom` sample collection, fenced TSV emission. Renamed and extended.
- `scripts/record_solver_bench.sh`: parses one fenced block of key/value lines into one markdown row. Reshaped to parse rows.
- `solver/solver-core/benches/BASELINE.md`: one-row markdown table + host-info footer. Extended to multi-row.

## Approach

### Fixture shapes

**`demo_grundschule_zweizuegig` (Python + Rust mirror).**

- 8 classes: 1a, 1b, 2a, 2b, 3a, 3b, 4a, 4b. Stundentafeln 1 to 4 reused unchanged from `demo_grundschule`.
- 9 subjects (D, M, SU, RE, E, KU, MU, SP, FÖ); same as einzügig.
- 11 rooms: 8 Klassenräume (1a to 4b) + 1 Turnhalle + 1 Musikraum + 1 Kunstraum.
- 12 teachers: 8 Klassenlehrer (each qualified for D, M, SU, plus one of {KU, E}) + 4 specialists (RE/MU split, SP, KU/FÖ, FÖ-only). `max_hours_per_week`: mostly 28, two Halbtags-specialists at 14 and 18.
- Expected lessons after `generate-lessons`: 68 rows (4 grade-1/2 classes × 8 subjects each + 4 grade-3/4 classes × 9 subjects each; grades 3/4 add Englisch). Total `hours_per_week` summed = **196 placements** (4 × 23 + 4 × 26).

**`demo_gesamtschule` (deferred to follow-up PR).** Originally in scope; planning revealed the cost (50-teacher pool, 240-entry assignment table, matched Rust mirror) and the risk (MVP greedy may not solve cleanly without seed iteration) outweigh shipping in this PR. Tracked as a follow-up OPEN_THINGS item once items 7 to 9 (FFD / LAHC) start consuming the bench output and the value of a third size becomes concrete.

**Pre-assigned teacher_ids.** The zweizügige fixture carries literal `teacher_id` per Lesson encoded as a `(class_name, subject_short) → teacher_short_code` lookup dict at module load. Authored deterministically via the scarcity-first heuristic (subjects with the fewest qualified teachers claim capacity first), but the result is hard-coded so bench numbers stay stable as `auto_assign_teachers_for_lessons` evolves.

### Rust bench mirror

- Rename `solver/solver-core/benches/solver_grundschule.rs` → `solver/solver-core/benches/solver_fixtures.rs`. Update `[[bench]] name` in `solver/solver-core/Cargo.toml` and `--bench` flag in `scripts/record_solver_bench.sh`.
- Two fixture builders ship in this PR (`grundschule_fixture`, `zweizuegig_fixture`); the file is named `solver_fixtures.rs` so the Gesamtschule follow-up adds a third builder without another rename. Each returns a `Problem`; compact tables (hours per class index, teacher allocations, room suitabilities) drive nested-loop construction. The existing `assert_eq!(lessons.len(), N)` line per fixture catches drift against the matching Python literal.
- Bench harness loops over `[("grundschule", grundschule_fixture()), ("zweizuegig", zweizuegig_fixture())]`, calling `group.bench_function(name, ...)` per fixture. Single criterion group, single `iter_custom`-collected `Mutex<HashMap<&str, Vec<Duration>>>` keyed by fixture name.
- Sample size 200 per fixture (current default). Zweizügige's per-iter cost is ~196 µs at 1M placements/sec, comfortable at 200 samples.

### Output format

**Bench stderr.** Inside the existing `---SOLVER-BENCH-BASELINE---` ... `---END---` fence:

```text
fixture\tsamples\tp1_us\tp50_us\tp99_us\tplacements_per_sec\ttotal_placements\ttotal_hard_violations\tsoft_score
grundschule\t200\t40\t41\t51\t1077999\t45\t0\t0
zweizuegig\t200\tXXX\tXXX\tXXX\tXXX\t196\t0\t0
```

**`record_solver_bench.sh`.** Read the fenced block, take the first line as header, the rest as data rows. Render one markdown row per data row. Footer (host, kernel, rustc, date) unchanged.

**`BASELINE.md`.** Multi-row markdown table with `| Fixture | Samples | p1 | p50 | p99 | Placements/sec | Placements | Hard violations | Soft score |`.

### Tests

- `backend/tests/seed/test_demo_grundschule_zweizuegig_shape.py`: entity counts (12 teachers, 11 rooms, 8 classes, 4 reused Stundentafeln, 35 time-blocks), FK integrity (every Klassenlehrer's qualifications cover D + M + SU), spot checks (each Klassenraum suits exactly the einzügige `_KLASSENRAUM_SUITABLE_SUBJECTS` set).
- `backend/tests/seed/test_demo_grundschule_zweizuegig_solvability.py`: seed → generate-lessons per class → pin teacher_id from `_TEACHER_ASSIGNMENTS_ZWEIZUEGIG` → run solver via `solver_io.solve_problem` → assert `len(placements) == 196` and `hard_violations == 0`. The literal 196 is shared with the Rust bench's `assert_eq!`.
- Rollback test: not duplicated. The savepoint discipline tested in `test_demo_grundschule_rollback.py` is a session-fixture property, generic to any seed.

### Drift detection

- Python solvability test asserts `placements_count == EXPECTED_PLACEMENTS_<FIXTURE>` against a literal int.
- Rust bench fixture builder asserts `lessons.len() == EXPECTED_LESSONS_<FIXTURE>` against the same literal.
- Comments in both files cross-reference each other ("matches `tests/seed/test_demo_*_solvability.py`" / "matches `solver-core/benches/solver_fixtures.rs::*_fixture`").

### CLI surface

- `klassenzeit-backend seed-grundschule-zweizuegig` (analogous to existing). Rejects `settings.env == "prod"` via the existing `_check_not_prod` helper.
- `seed-gesamtschule` ships with the deferred Gesamtschule fixture in the follow-up PR.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| MVP solver cannot solve `demo_grundschule_zweizuegig` cleanly | Low | Zweizügige is structurally the einzügige fixture doubled; einzügige solves cleanly, headroom is ~33%. If a violation surfaces, rebalance one teacher's qualification mix. |
| Bench numbers shift across recording-host changes | Inherent | Existing convention: footer in `BASELINE.md` records CPU, kernel, rustc. 20% regression budget reads against the same host. No new mitigation. |
| Python seed and Rust fixture drift over time | Medium long-term | Literal placement-count assertion in both; cross-reference comments; bench-runtime panic if `solution.placements.len()` differs from `expected_hours`. |
| Bench harness output format change breaks `mise run bench` consumers | Low | Only consumer is `record_solver_bench.sh`, owned in this PR. No external readers. |

## Implementation order

1. **`refactor(solver-core): rename solver_grundschule bench to solver_fixtures`.** Pure rename: file, `[[bench]] name`, `record_solver_bench.sh`. Same fixture, same bench numbers.
2. **`refactor(solver-core,scripts): row-per-fixture TSV format in bench output and record script`.** Bench emits TSV header + one data row inside the fenced block; `record_solver_bench.sh` parses rows and renders multi-row markdown. Single fixture for now; format supports many.
3. **`feat(seed): demo_grundschule_zweizuegig seed package`.** Python seed + shape test + solvability test + Typer command. TDD: red on shape test (missing module), green on implementation; same cycle for solvability.
4. **`feat(solver-core): zweizuegig bench fixture`.** Rust mirror, registered in the criterion group. Bench-runtime asserts use literals shared with the Python solvability test.
5. **`chore(solver-core): record bench baseline across two fixtures`.** `mise run bench:record` on AMD Ryzen 7 3700X; check in regenerated `BASELINE.md`.

Documentation updates from `/autopilot` step 6 (`OPEN_THINGS.md` deferral note for Gesamtschule, auto-memory, autopilot.md if anything surfaces) ride along on the open commit at finalization time.

## Acceptance

- `mise run bench` runs two benches; output shows one criterion group with two named functions.
- `mise run bench:record` produces a two-row `BASELINE.md` with non-zero placements per row, zero hard violations per row, soft_score = 0 per row.
- `uv run klassenzeit-backend seed-grundschule-zweizuegig` against a fresh dev DB seeds 8 classes, 12 teachers, 11 rooms; running `generate-lessons` then `POST /schedule` yields a feasible timetable with 196 placements.
- Existing bench numbers (Grundschule: ~40 µs p50, ~1M placements/sec) within 5% of pre-PR values, since the Grundschule fixture is unchanged.
- All existing tests pass (no regression in `mise run test:py`, `mise run test:rust`, `mise run fe:test`).
- `mise run lint` clean.
- `OPEN_THINGS.md` updated: item 6 marked partially shipped (zweizuegig leg) with date and PR ref; gesamtschule leg captured as a new follow-up entry in the sprint or "Acknowledged deferrals" section.
