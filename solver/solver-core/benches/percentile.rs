//! Percentile helper shared between the criterion bench and its integration
//! test binary. Included into both via `#[path]`. Kept in `benches/` so it
//! lives next to the bench that uses it; the integration test at
//! `tests/bench_percentile.rs` exists solely to run the `#[cfg(test)]`
//! unit tests below, because a criterion `harness = false` bench binary
//! invokes criterion's main instead of libtest.

use std::time::Duration;

/// Return `(p1, p50, p99)` as `Duration` values by sorting `samples` in place
/// and indexing at floor(0.01 * N), floor(0.50 * N), floor(0.99 * N).
///
/// Panics if `samples` is empty; the bench never calls this with zero samples.
pub fn compute_percentiles(samples: &mut [Duration]) -> (Duration, Duration, Duration) {
    assert!(!samples.is_empty(), "compute_percentiles needs >= 1 sample");
    samples.sort_unstable();
    let n = samples.len();
    let idx = |p: f64| -> usize {
        let raw = (p * n as f64).floor() as usize;
        raw.min(n - 1)
    };
    (samples[idx(0.01)], samples[idx(0.50)], samples[idx(0.99)])
}

#[cfg(test)]
// When this file is `#[path]`-included into the criterion bench binary
// (`harness = false`), rustc still compiles this module because benches
// get `cfg(test)` set, but the `#[test]` functions below are orphaned
// (criterion's main, not libtest, is the entry point). `us` and the
// `super::compute_percentiles` import then look unused from the bench
// target's perspective. Allowed here because we are inside `cfg(test)`,
// which `solver/CLAUDE.md` permits for `allow(dead_code)`.
#[allow(dead_code, unused_imports)]
mod tests {
    use super::compute_percentiles;
    use std::time::Duration;

    fn us(micros: u64) -> Duration {
        Duration::from_micros(micros)
    }

    #[test]
    fn single_sample_has_equal_percentiles() {
        let mut s = [us(100)];
        let (p1, p50, p99) = compute_percentiles(&mut s);
        assert_eq!(p1, us(100));
        assert_eq!(p50, us(100));
        assert_eq!(p99, us(100));
    }

    #[test]
    fn three_sorted_samples_pick_first_second_third() {
        let mut s = [us(10), us(20), us(30)];
        let (p1, p50, p99) = compute_percentiles(&mut s);
        assert_eq!(p1, us(10));
        assert_eq!(p50, us(20));
        assert_eq!(p99, us(30));
    }

    #[test]
    fn unsorted_input_is_sorted_in_place() {
        let mut s = [us(30), us(10), us(20)];
        let _ = compute_percentiles(&mut s);
        assert_eq!(s, [us(10), us(20), us(30)]);
    }

    #[test]
    fn two_hundred_samples_pick_expected_positions() {
        let mut s: Vec<Duration> = (1..=200).map(us).collect();
        let (p1, p50, p99) = compute_percentiles(&mut s);
        assert_eq!(p1, us(3));
        assert_eq!(p50, us(101));
        assert_eq!(p99, us(199));
    }

    #[test]
    fn indices_are_clamped_to_last_element() {
        let mut s = [us(42)];
        let (_, _, p99) = compute_percentiles(&mut s);
        assert_eq!(p99, us(42));
    }
}
