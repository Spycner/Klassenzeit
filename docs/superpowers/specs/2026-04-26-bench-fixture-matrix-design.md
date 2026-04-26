# Bench-fixture matrix (sprint item 6)

**Date:** 2026-04-26
**Status:** Design approved (brainstorm `/tmp/kz-brainstorm/brainstorm.md`), plan pending.

## Problem

The solver-quality sprint (active in `docs/superpowers/OPEN_THINGS.md`) has shipped tidy items 1, 2, 4, 5, and now 3 (auto-assign teachers, PR #137). Item 6 is the last tidy item before the algorithm phase (PRs 7 to 9: FFD ordering, Doppelstunden, soft constraints + LAHC).

The current criterion bench (`solver/solver-core/benches/solver_grundschule.rs`) targets one Grundschule-shaped fixture (2 classes, 8 teachers, 5 rooms, 15 lessons, 45 placements). At that scale the MVP greedy solver runs in ~40 µs per solve and emits zero hard violations. Items 7 to 9 are expected to make the solver materially smarter; the 20% regression budget (`solver/CLAUDE.md` "Bench workflow") reads on this single 45-placement fixture, which means:

1. We cannot tell whether a clever-on-small / dumb-on-big regression is hidden inside an algorithm change.
2. We cannot bench Doppelstunden support (PR 8) because no fixture has `preferred_block_size > 1` lessons.
3. We cannot meaningfully measure soft-score quality (PR 9) on 45 placements where greedy already produces a feasible schedule.

This PR closes that gap by adding two larger fixtures, mirroring them in the Python `klassenzeit_backend.seed` package so the demo and dev paths can use them too, and rewiring the bench harness + record script to a multi-fixture format.

## Goal

One PR that:

1. Adds Python seed packages `demo_grundschule_zweizuegig` (8 classes / 12 teachers / 11 rooms / 196 placements) and `demo_gesamtschule` (24 classes, 6 grades × 4 Züge, ~50 teachers, 31 rooms, ~720 placements). Each fixture ships pre-assigned `teacher_id` per Lesson as authored data.
2. Adds Typer CLI commands `seed-grundschule-zweizuegig` and `seed-gesamtschule` mirroring the existing `seed-grundschule` shape; rejects `settings.env == "prod"`.
3. Adds Rust bench fixture builders mirroring the Python data shape, registered as additional `bench_function` calls inside the existing criterion group.
4. Renames the bench file `solver_grundschule.rs` → `solver_fixtures.rs` and updates the matching `[[bench]] name` and the `--bench` flag in `scripts/record_solver_bench.sh`.
5. Reshapes the bench's stderr emission from key/value lines (one fixture) to TSV header + rows (N fixtures) inside the same `---SOLVER-BENCH-BASELINE---` fence; `record_solver_bench.sh` parses rows and renders one markdown row each.
6. Adds a `soft_score` column reserved at value `0` for the MVP solver (PR 9 fills it in).
7. Refreshes `BASELINE.md` on the recording host (AMD Ryzen 7 3700X) so the committed numbers reflect the multi-fixture truth.

After this PR, `mise run bench:record` produces a three-row baseline; the algorithm-phase PRs (7 to 9) read against three points of measurement instead of one; and the OPEN_THINGS sprint section shows item 6 shipped with all six tidy items behind us.

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

**`demo_gesamtschule` (Python + Rust mirror).**

- 24 classes: 5a/b/c/d, 6a/b/c/d, 7a/b/c/d, 8a/b/c/d, 9a/b/c/d, 10a/b/c/d. Six new Stundentafeln (one per grade).
- 14 subjects: D, M, E, F (grade 7+), Bio, Ch (grade 7+), Ph (grade 7+), Geo, G, Pol, Rel/Eth, Mu, Ku, Sp.
- 31 rooms: 24 Klassenräume + 2 Turnhallen + 1 Bio-Lab + 1 Ch-Lab + 1 Ph-Lab + 1 Musikraum + 1 Kunstraum.
- 50 teachers: ~24 generalists qualified for 3 to 4 of {D, M, E, Geo, G, Pol}; ~12 science specialists qualified for 1 to 2 of {Bio, Ch, Ph}; ~6 language specialists for {F}; ~4 aesthetic teachers for {Mu, Ku}; ~4 Sport teachers. Mostly `max_hours_per_week = 26`; Teilzeit at 14, 18, 21 sprinkled.
- Expected total placements: ~720 (24 classes × ~30 hours/week).
- WeekScheme grid: 5 days × 8 periods (8 to 15:30 with breaks), giving 40 time-blocks × 31 rooms = 1240 (room, time) slots, comfortable headroom for 720 placements.

**Pre-assigned teacher_ids.** Both fixtures carry literal `teacher_id` per Lesson encoded as `(grade, Zug, subject) → teacher_index` lookup tables at module load. Authored deterministically via the scarcity-first heuristic from `auto_assign_teachers_for_lessons` (subjects with the fewest qualified teachers claim capacity first), but the result is hard-coded so bench results stay stable as `auto_assign_teachers_for_lessons` evolves.

### Rust bench mirror

- Rename `solver/solver-core/benches/solver_grundschule.rs` → `solver/solver-core/benches/solver_fixtures.rs`. Update `[[bench]] name` in `solver/solver-core/Cargo.toml` and `--bench` flag in `scripts/record_solver_bench.sh`.
- Each fixture builder (`grundschule_fixture`, `zweizuegig_fixture`, `gesamtschule_fixture`) returns a `Problem`. Compact tables (hours per (grade, subject), teacher allocations, room suitabilities) drive nested-loop construction; the existing `assert_eq!(lessons.len(), N)` line per fixture catches drift against the matching Python literal.
- Bench harness loops over `[("grundschule", grundschule_fixture()), ("zweizuegig", zweizuegig_fixture()), ("gesamtschule", gesamtschule_fixture())]`, calling `group.bench_function(name, ...)` per fixture. Single criterion group, single `iter_custom`-collected `Mutex<HashMap<&str, Vec<Duration>>>` keyed by fixture name.
- Sample size 200 per fixture (current default). Fall back to a per-fixture override if Gesamtschule's per-iter cost blows the budget; document the asymmetry in `BASELINE.md` if it does.

### Output format

**Bench stderr.** Inside the existing `---SOLVER-BENCH-BASELINE---` ... `---END---` fence:

```text
fixture\tsamples\tp1_us\tp50_us\tp99_us\tplacements_per_sec\ttotal_placements\ttotal_hard_violations\tsoft_score
grundschule\t200\t40\t41\t51\t1077999\t45\t0\t0
zweizuegig\t200\tXXX\tXXX\tXXX\tXXX\t196\t0\t0
gesamtschule\t200\tXXX\tXXX\tXXX\tXXX\t720\t0\t0
```

**`record_solver_bench.sh`.** Read the fenced block, take the first line as header, the rest as data rows. Render one markdown row per data row. Footer (host, kernel, rustc, date) unchanged.

**`BASELINE.md`.** Multi-row markdown table with `| Fixture | Samples | p1 | p50 | p99 | Placements/sec | Placements | Hard violations | Soft score |`.

### Tests

- `backend/tests/seed/test_demo_grundschule_zweizuegig_shape.py`: entity counts (12 teachers, 11 rooms, 8 classes, 4 reused Stundentafeln, 11 + 5 + 5 + ... time-blocks), FK integrity (every Klassenlehrer's qualifications cover their assigned class's Stundentafel), spot checks (each Klassenraum suits exactly the einzügige `_KLASSENRAUM_SUITABLE_SUBJECTS` set).
- `backend/tests/seed/test_demo_grundschule_zweizuegig_solvability.py`: seed → assign-teachers no-op (already pre-assigned) → run solver via `solver_io.solve_problem` → assert `len(placements) == 196` and `hard_violations == 0`.
- `backend/tests/seed/test_demo_gesamtschule_shape.py`: analogous, with cross-grade qualification spot checks.
- `backend/tests/seed/test_demo_gesamtschule_solvability.py`: analogous; the literal placement count is the source of truth for both this test and the Rust bench's `assert_eq!`.
- Rollback test: not duplicated. The savepoint discipline tested in `test_demo_grundschule_rollback.py` is a session-fixture property, generic to any seed.

### Drift detection

- Python solvability test asserts `placements_count == EXPECTED_PLACEMENTS_<FIXTURE>` against a literal int.
- Rust bench fixture builder asserts `lessons.len() == EXPECTED_LESSONS_<FIXTURE>` against the same literal.
- Comments in both files cross-reference each other ("matches `tests/seed/test_demo_*_solvability.py`" / "matches `solver-core/benches/solver_fixtures.rs::*_fixture`").

### CLI surface

- `klassenzeit-backend seed-grundschule-zweizuegig` (analogous to existing).
- `klassenzeit-backend seed-gesamtschule` (analogous to existing).
- Both reject `settings.env == "prod"` via the existing `_check_not_prod` helper.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| MVP solver cannot solve `demo_gesamtschule` cleanly under greedy-first-fit | Medium | Tighten / loosen teacher allocation in the seed until MVP yields zero hard violations. If still infeasible, replace the strict assertion with `hard_violations < threshold` and document the gap. Worst case: defer Gesamtschule to a follow-up PR, ship zweizügig only. |
| Bench numbers shift across recording-host changes | Inherent | Existing convention: footer in `BASELINE.md` records CPU, kernel, rustc. 20% regression budget reads against the same host. No new mitigation. |
| Python seed and Rust fixture drift over time | Medium long-term | Literal placement-count assertion in both; cross-reference comments; PR template item "did you re-record bench?" already in `solver/CLAUDE.md`. |
| Bench harness output format change breaks `mise run bench` consumers | Low | Only consumer is `record_solver_bench.sh`, owned in this PR. No external readers. |
| PR size (estimated ~1500 lines) discourages reviewer | Medium | Seven-commit chain with the first two as pure refactors; reviewer can read 1 and 2 quickly and focus on data + empirics in 3, 5, 7. |
| Gesamtschule sample size too high (per-iter cost too slow at 200 samples) | Low | Per-fixture sample-size override in the criterion group; document asymmetry in `BASELINE.md`. Back-of-envelope says ~720 µs/iter at 1M placements/sec, so 200 samples ≈ 144 ms total — fine. |

## Implementation order

1. **`refactor(solver-core): rename solver_grundschule bench to solver_fixtures`.** Pure rename: file, `[[bench]] name`, `record_solver_bench.sh`. Same fixture, same bench numbers.
2. **`refactor(solver-core,scripts): row-per-fixture TSV format in bench output and record script`.** Bench emits TSV header + one data row inside the fenced block; `record_solver_bench.sh` parses rows and renders multi-row markdown. Single fixture for now; format supports many.
3. **`feat(seed): demo_grundschule_zweizuegig seed package`.** Python seed + shape test + solvability test + Typer command. TDD: red on shape test (missing module), green on implementation; same cycle for solvability.
4. **`feat(solver-core): zweizuegig bench fixture`.** Rust mirror, registered in the criterion group. Bench-runtime asserts use literals shared with the Python solvability test.
5. **`feat(seed): demo_gesamtschule seed package`.** Python seed + shape test + solvability test + Typer command. Same TDD cycle. If MVP cannot solve cleanly, this is where the iteration happens (additional commits 5a, 5b on the branch).
6. **`feat(solver-core): gesamtschule bench fixture`.** Rust mirror; same shared-literal pattern.
7. **`chore(solver-core): record bench baseline across three fixtures`.** `mise run bench:record` on AMD Ryzen 7 3700X; check in regenerated `BASELINE.md`.

Documentation updates from `/autopilot` step 6 (`OPEN_THINGS.md`, auto-memory, autopilot.md if anything surfaces) ride along on the open commit at finalization time.

## Acceptance

- `mise run bench` runs three benches; output shows one criterion group with three named functions.
- `mise run bench:record` produces a three-row `BASELINE.md` with non-zero placements per row, zero hard violations per row, soft_score = 0 per row.
- `uv run klassenzeit-backend seed-grundschule-zweizuegig` against a fresh dev DB seeds 8 classes, 12 teachers, 11 rooms; running `generate-lessons` then `POST /schedule` yields a feasible timetable with 196 placements.
- `uv run klassenzeit-backend seed-gesamtschule` against a fresh dev DB seeds 24 classes, 50 teachers, 31 rooms; the schedule view at `/schedule` renders without breakage.
- Existing bench numbers (Grundschule: ~40 µs p50, ~1M placements/sec) within 5% of pre-PR values, since the Grundschule fixture is unchanged.
- All existing tests pass (no regression in `mise run test:py`, `mise run test:rust`, `mise run fe:test`).
- `mise run lint` clean.
- `OPEN_THINGS.md` updated: item 6 marked shipped with date and PR ref; sprint header note updated to reflect tidy phase complete.
