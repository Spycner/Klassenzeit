use std::time::Instant;

use clap::Parser;
use serde::Serialize;

use klassenzeit_scheduler::instances;
use klassenzeit_scheduler::local_search::LahcConfig;
use klassenzeit_scheduler::solve_with_config;

#[derive(Parser)]
#[command(
    name = "benchmark",
    about = "Run solver benchmarks across test instances"
)]
struct Args {
    /// Number of seeds per instance
    #[arg(long, default_value_t = 10)]
    seeds: u64,

    /// Max seconds per solve
    #[arg(long, default_value_t = 30)]
    max_seconds: u64,

    /// LAHC fitness list length
    #[arg(long, default_value_t = 500)]
    list_length: usize,

    /// Tabu tenure, 0 to disable
    #[arg(long, default_value_t = 7)]
    tabu_tenure: usize,

    /// Output JSON to stdout instead of table to stderr
    #[arg(long)]
    json: bool,
}

#[derive(Serialize)]
struct BenchmarkResults {
    instances: Vec<InstanceResult>,
}

#[derive(Serialize)]
struct InstanceResult {
    name: String,
    seeds: u64,
    runs: Vec<RunResult>,
    summary: InstanceSummary,
}

#[derive(Serialize)]
struct RunResult {
    seed: u64,
    hard_violations: u32,
    soft_score: f64,
    feasible: bool,
    construction_ms: u64,
    local_search_ms: u64,
    iterations: u64,
    iterations_per_sec: f64,
    best_found_at_iteration: u64,
    time_to_best_ms: f64,
    score_history: Vec<(u64, i64, i64)>,
}

#[derive(Serialize)]
struct InstanceSummary {
    feasible_count: u64,
    hard_avg: f64,
    soft_avg: f64,
    soft_best: f64,
    soft_worst: f64,
    ttb_avg_ms: f64,
    iterations_per_sec_avg: f64,
}

type InstanceBuilder = fn() -> klassenzeit_scheduler::types::ScheduleInput;

fn main() {
    let args = Args::parse();

    let instance_builders: Vec<(&str, InstanceBuilder)> = vec![
        ("small-4cls", instances::small_4_classes),
        ("realistic-8cls", instances::realistic_8_classes),
        ("stress-16cls", instances::stress_16_classes),
    ];

    let mut all_results = Vec::new();

    for (name, builder) in &instance_builders {
        eprint!("{:<20} ", name);
        let mut runs = Vec::new();

        for seed in 0..args.seeds {
            let input = builder();
            let config = LahcConfig {
                list_length: args.list_length,
                max_seconds: args.max_seconds,
                max_idle_ms: args.max_seconds * 1000,
                seed: Some(seed),
                history_sample_interval: 100,
                tabu_tenure: args.tabu_tenure,
            };

            let start = Instant::now();
            let output = solve_with_config(input, config);
            let _elapsed = start.elapsed();

            let stats = output.stats.unwrap_or_default();
            let feasible = output.score.hard_violations == 0;
            let iterations_per_sec = stats.iterations_per_sec;
            let ttb_ms = if iterations_per_sec > 0.0 {
                stats.best_found_at_iteration as f64 / iterations_per_sec * 1000.0
            } else {
                0.0
            };

            runs.push(RunResult {
                seed,
                hard_violations: output.score.hard_violations,
                soft_score: output.score.soft_score,
                feasible,
                construction_ms: stats.construction_ms,
                local_search_ms: stats.local_search_ms,
                iterations: stats.iterations,
                iterations_per_sec,
                best_found_at_iteration: stats.best_found_at_iteration,
                time_to_best_ms: ttb_ms,
                score_history: stats.score_history,
            });

            eprint!(".");
        }
        eprintln!();

        let feasible_count = runs.iter().filter(|r| r.feasible).count() as u64;
        let hard_avg = runs
            .iter()
            .map(|r| -(r.hard_violations as f64))
            .sum::<f64>()
            / runs.len() as f64;
        let soft_avg = runs.iter().map(|r| r.soft_score).sum::<f64>() / runs.len() as f64;
        let soft_best = runs
            .iter()
            .map(|r| r.soft_score)
            .fold(f64::NEG_INFINITY, f64::max);
        let soft_worst = runs
            .iter()
            .map(|r| r.soft_score)
            .fold(f64::INFINITY, f64::min);
        let ttb_avg = runs.iter().map(|r| r.time_to_best_ms).sum::<f64>() / runs.len() as f64;
        let ips_avg = runs.iter().map(|r| r.iterations_per_sec).sum::<f64>() / runs.len() as f64;

        let summary = InstanceSummary {
            feasible_count,
            hard_avg,
            soft_avg,
            soft_best,
            soft_worst,
            ttb_avg_ms: ttb_avg,
            iterations_per_sec_avg: ips_avg,
        };

        all_results.push(InstanceResult {
            name: name.to_string(),
            seeds: args.seeds,
            runs,
            summary,
        });
    }

    if args.json {
        let results = BenchmarkResults {
            instances: all_results,
        };
        println!("{}", serde_json::to_string_pretty(&results).unwrap());
    } else {
        eprintln!();
        eprintln!(
            "Config: list_length={}, tabu_tenure={}, max_seconds={}",
            args.list_length, args.tabu_tenure, args.max_seconds
        );
        eprintln!(
            "{:<20} {:>5}   {:>8}  {:>9}  {:>9} {:>10} {:>11}   {:>9}   {:>12}",
            "Instance",
            "Seeds",
            "Feasible",
            "Hard(avg)",
            "Soft(avg)",
            "Soft(best)",
            "Soft(worst)",
            "TTB(avg)",
            "Iter/sec"
        );
        eprintln!("{}", "-".repeat(105));
        for inst in &all_results {
            let s = &inst.summary;
            eprintln!(
                "{:<20} {:>5}   {:>4}/{:<4} {:>9.1}  {:>9.1} {:>10.0} {:>11.0}   {:>7.0}ms   {:>10.0}",
                inst.name,
                inst.seeds,
                s.feasible_count,
                inst.seeds,
                s.hard_avg,
                s.soft_avg,
                s.soft_best,
                s.soft_worst,
                s.ttb_avg_ms,
                s.iterations_per_sec_avg,
            );
        }
        eprintln!();
    }
}
