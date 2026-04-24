//! Criterion bench for the MVP solver over a Grundschule-shaped fixture.
//!
//! The fixture builder below is a deliberate duplicate of
//! `solver-core/tests/grundschule_smoke.rs::grundschule()`. Sprint item 6
//! on `docs/superpowers/OPEN_THINGS.md` (benchmark-fixture matrix) will
//! consolidate both onto a shared builder with pre-assigned teacher ids;
//! until then this copy is the bench source of truth.
//!
//! Output contract: after `group.finish()` we print a tab-separated block
//! fenced by `---SOLVER-BENCH-BASELINE---` / `---END---` to stderr.
//! `scripts/record_solver_bench.sh` depends on those markers, not on
//! criterion's default output format.
//!
//! The percentile helper lives in `percentile.rs` alongside its unit tests;
//! `tests/bench_percentile.rs` pulls it in via `#[path]` so libtest can
//! discover the tests (a `harness = false` bench binary cannot).

use criterion::{criterion_group, criterion_main, Criterion};

#[path = "percentile.rs"]
mod percentile;

fn bench_grundschule(_c: &mut Criterion) {
    // Keep `compute_percentiles` reachable from the bench target until Task 3
    // wires it into the sampling loop; without this reference clippy's
    // `--all-targets -- -D warnings` run flags it as dead code because the
    // panic below ships before any caller.
    let _use_percentile = percentile::compute_percentiles
        as fn(
            &mut [std::time::Duration],
        ) -> (
            std::time::Duration,
            std::time::Duration,
            std::time::Duration,
        );
    panic!("bench_grundschule not yet implemented (Task 3 turns this green)");
}

criterion_group!(benches, bench_grundschule);
criterion_main!(benches);
