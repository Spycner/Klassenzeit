//! Runs the `#[test]` functions defined inside `benches/percentile.rs`.
//! The criterion bench binary uses `harness = false` and cannot host
//! libtest-discovered tests; this integration target does so.

#[path = "../benches/percentile.rs"]
mod percentile;
