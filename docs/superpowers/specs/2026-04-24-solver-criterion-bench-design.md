# Criterion benchmark harness for the solver

**Date:** 2026-04-24
**Status:** Design approved (autopilot autonomous mode).

## Problem

The solver sprint on `docs/superpowers/OPEN_THINGS.md` (active "solver quality + tidy" sprint) calls out three algorithm PRs that each change the hot path: FFD ordering (#7), Doppelstunden support (#8), LAHC with soft constraints (#9). Each of those PRs needs a "before / after" speed number to cite in its body so reviewers can tell whether the change regressed the solver.

Today there is no usable harness. `mise run bench` is wired to `cargo bench -p solver-core`, but `solver-core/Cargo.toml` has no `criterion` dev-dep and no `[[bench]]` target, so the task compiles nothing and exits instantly. There is also no committed baseline file, so "before" is whatever the algo-PR author decides to paste.

The harness is an OPEN_THINGS P0 item and a prerequisite for every algorithm-phase PR. It is also tidy-first in the project-CLAUDE.md sense: it makes subsequent feature work (the three algo PRs) cheaper and safer.

## Goal

One PR that:

1. Adds `criterion` as a dev-dependency of `solver-core` via the workspace `Cargo.toml`.
2. Adds `solver/solver-core/benches/solver_grundschule.rs`, a criterion bench that builds a Hessen-Grundschule-shaped `Problem` once and runs `solve(&problem)` 200 times via `iter_custom`, recording per-iteration `Duration`s.
3. Computes p1, p50, p99 latency and placements-per-second in-bench and prints them to stderr at the end of the run.
4. Ships `scripts/record_solver_bench.sh` that re-runs the bench, captures stderr, and regenerates `solver/solver-core/benches/BASELINE.md`.
5. Adds a `mise run bench:record` task that invokes the script so the entry point is discoverable next to `mise run bench`.
6. Writes the first `BASELINE.md` with the MVP greedy numbers on the recording host, with a footer recording CPU, kernel, rustc version, and date.
7. Documents the "refresh on intentional algorithm changes, otherwise do not touch" workflow in `solver/CLAUDE.md`, and checks off sprint item #1 in `OPEN_THINGS.md`.

After this PR, any algo-phase PR body shows a `BASELINE.md` diff next to its test diff, and `mise run bench` is a real regression-detection command (not a placeholder).

## Non-goals

- **Benchmarks in CI.** GitHub's shared runners are too noisy for a 20% regression budget. Running `mise run bench` on the repo's self-hosted runner (`iuno-klassenzeit`) plus a "bench drift" issue-opener is a separate follow-up, scoped in a dedicated PR with its own workflow and artefact-handling story.
- **More than one fixture.** Sprint item #6 (`[P2]` benchmark-fixture matrix) is the right home for `demo_grundschule_zweizuegig` and `demo_gesamtschule`, including pre-assigned teacher ids for determinism.
- **Fixture deduplication with `tests/grundschule_smoke.rs`.** The bench file carries its own ~50-line fixture builder with a prose pointer to the test source of truth. Sharing properly would need a `dev-fixtures` feature flag on `solver-core`; the payoff lands with sprint item #6, not here.
- **New solver behaviour.** No algorithm change, no public API change, no new violation variants. Pure tooling.
- **An ADR.** No load-bearing architectural decision. Criterion is the standard Rust benchmark harness and the harness choice is documented in this spec.
- **Windows / macOS host support for the record script.** The project's dev target is Linux; the script reads `/proc/cpuinfo` and `uname -r`. A Darwin code path goes in only when a maintainer actually needs it.

## Design

### Package layout

```
solver/solver-core/benches/
  solver_grundschule.rs   # criterion bench, ~180 lines
  BASELINE.md             # committed baseline numbers + host footer
scripts/
  record_solver_bench.sh  # thin wrapper: run bench, regenerate BASELINE.md
```

`solver/solver-core/Cargo.toml` grows a `[dev-dependencies] criterion = ...` line inherited from the workspace root, plus a `[[bench]] name = "solver_grundschule" harness = false` stanza so criterion can own the `main`.

### Bench file shape

The bench file contains, in order:

1. A `grundschule_fixture()` function that builds a `solver_core::types::Problem` exactly the shape `tests/grundschule_smoke.rs::grundschule()` builds (2 classes, 8 teachers, 5 rooms, 8 subjects, one lesson per (class, subject) with non-zero hours, gym suitable for Sport only). Prose comment at the top points at the test file as the source of truth and mentions sprint item #6.
2. A `compute_percentiles(samples: &mut [Duration]) -> (Duration, Duration, Duration)` helper that sorts in place and indexes at `(0.01, 0.50, 0.99) * N`. No external stats crate.
3. A `bench_grundschule(c: &mut Criterion)` criterion entry point. Uses `BenchmarkGroup` with `sample_size(200)` and `SamplingMode::Flat`, `iter_custom` closure, collects per-iteration `Duration`s, then after `group.finish()` computes the percentiles and prints a block of the following shape to stderr:

    ```
    ---SOLVER-BENCH-BASELINE---
    fixture	grundschule
    samples	200
    p1_us	XXX
    p50_us	XXX
    p99_us	XXX
    placements_per_sec	XXX
    total_placements	XX
    total_hard_violations	0
    ---END---
    ```

    Tab-separated, fenced by markers so `scripts/record_solver_bench.sh` can grep the block without depending on criterion's own output format.

4. `criterion_group!` + `criterion_main!` at the bottom.

### Record script

`scripts/record_solver_bench.sh` in bash (same style as `scripts/apply-github-settings.sh`):

1. `cargo bench -p solver-core --bench solver_grundschule 2> /tmp/kz-bench.stderr`
2. Parse the fenced block from `/tmp/kz-bench.stderr`.
3. Read host info: CPU model from `/proc/cpuinfo`, kernel from `uname -r`, rustc version from `rustc --version`, current date in ISO-8601.
4. Render `solver/solver-core/benches/BASELINE.md` from a heredoc template (single H1, one table per fixture, one footer block).
5. Exit non-zero if the fenced block was missing from stderr.

The script is idempotent: two runs on the same host overwrite the same file; the only diff is whatever timing jitter criterion produced.

`mise.toml` gains:

```toml
[tasks."bench:record"]
description = "Re-run the solver bench and regenerate BASELINE.md"
run = "./scripts/record_solver_bench.sh"
```

`mise run bench` stays as-is (invokes criterion's default output; handy for the "am I faster than yesterday?" inner loop).

### BASELINE.md format

```markdown
# Solver bench baseline

| Fixture | Samples | p1 (µs) | p50 (µs) | p99 (µs) | Placements/sec | Placements | Hard violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| grundschule | 200 | 123 | 456 | 789 | 123456 | 42 | 0 |

Refreshed 2026-04-24 on <CPU model>, Linux <kernel>, <rustc --version>.

Refresh with `mise run bench:record`. Do not hand-edit.
Refresh only when the PR intentionally changes solver performance; an accidental diff here is a review gate, not a feature.
```

### Documentation

`solver/CLAUDE.md` gains a short "Bench workflow" block after the testing-command map:

- `mise run bench`: run the criterion bench, see timings vs. the on-disk criterion baseline (local `target/criterion/` only).
- `mise run bench:record`: run the bench and overwrite `solver/solver-core/benches/BASELINE.md`. Run this if and only if your PR intentionally changes solver performance. The 20% regression budget called out in OPEN_THINGS applies against the committed file, not a personal baseline.
- The bench does not run in CI. Algo-phase PRs cite `BASELINE.md` diffs in their PR body.

`docs/superpowers/OPEN_THINGS.md` sprint item #1 gets checked off with a pointer to `solver/solver-core/benches/BASELINE.md`.

## Test strategy

### What we test

- **Bench compiles and runs.** `cargo bench -p solver-core --bench solver_grundschule` exits zero and prints the fenced block. Verified by running `scripts/record_solver_bench.sh` end-to-end in the PR branch.
- **Percentile helper.** Unit-tested in `#[cfg(test)] mod tests` inside the bench file itself (criterion benches are binary crates; `#[cfg(test)]` works the same as in a lib target). Cases: empty slice (panics by contract, not exercised), single sample (all three percentiles equal), sorted three-sample slice, unsorted ten-sample slice, 200-sample synthetic slice with known p1/p50/p99 positions.
- **Fixture build.** The bench's `grundschule_fixture()` asserts the resulting `Problem` has 40 lessons (same invariant the test fixture holds). Cheap invariant check, catches copy-paste drift while the duplicate exists.
- **Record-script stability.** Manual: run `mise run bench:record` twice, verify the only diff on `BASELINE.md` is number-shaped (not structural). Documented in the plan checklist.

### What we deliberately do not test

- **The actual timing numbers in CI.** Shared runner variance makes any numeric assertion flaky; the whole point of `BASELINE.md` is to dodge that.
- **Cross-platform (macOS, Windows) for the record script.** Linux is the dev target.

## Commit split

1. `docs: add solver criterion bench design spec` — this file.
2. `docs: add solver criterion bench implementation plan` — `docs/superpowers/plans/2026-04-24-solver-criterion-bench.md`.
3. `build(solver-core): add criterion dev-dependency` — workspace `Cargo.toml` + `solver-core/Cargo.toml`, no bench yet.
4. `test(solver-core): red bench target for grundschule` — `benches/solver_grundschule.rs` with the `[[bench]]` stanza, percentile helper + its failing unit tests, and a `panic!` inside `bench_grundschule` so criterion compiles the binary but a bench run fails loudly. Red step per TDD.
5. `perf(solver-core): implement grundschule criterion bench harness` — green step. Fills in the fixture builder, `iter_custom`, percentile computation, fenced-output block. Bench succeeds.
6. `build(mise): wire bench:record task and refresh script` — `scripts/record_solver_bench.sh`, `mise.toml` task, `chmod +x` checked in.
7. `docs(solver): record MVP criterion baseline` — `solver/solver-core/benches/BASELINE.md`.
8. `docs(solver): document bench workflow and close sprint item 1` — `solver/CLAUDE.md` + `docs/superpowers/OPEN_THINGS.md` edits.

## Risks and open questions

- **Criterion output format drift.** The fenced `---SOLVER-BENCH-BASELINE---` block is our contract, not criterion's; the script only reads our markers. Safe against criterion version bumps.
- **`cargo machete` false-positive on `criterion`.** `cargo machete` sometimes misreads benches as dead code. Verify with `mise run lint:rust` at the end of commit 5 and add `package.metadata.cargo-machete` hint if it trips.
- **`#![deny(missing_docs)]` leakage.** The crate-root attribute applies to the library crate; benches compile as a separate binary with their own root. Confirm at commit 4 that missing-docs does not break the bench binary; add doc comments anyway as a matter of style (solver rule).
- **Fixture drift.** The duplicate fixture in the bench can drift from `tests/grundschule_smoke.rs::grundschule()` without either test failing. Mitigated by (a) a prose comment in the bench file, (b) PR 6 removing the duplicate. If PR 6 slips past the sprint, revisit after 3 months.
