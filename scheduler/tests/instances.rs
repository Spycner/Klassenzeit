use klassenzeit_scheduler::instances;
use klassenzeit_scheduler::local_search::LahcConfig;
use klassenzeit_scheduler::solve_with_config;

fn config_with_seed(seed: u64) -> LahcConfig {
    LahcConfig {
        max_seconds: 15,
        max_idle_ms: 10_000,
        seed: Some(seed),
        ..Default::default()
    }
}

#[test]
fn small_instance_is_feasible() {
    let input = instances::small_4_classes();
    let output = solve_with_config(input, config_with_seed(42));
    assert_eq!(
        output.score.hard_violations, 0,
        "small instance should be feasible, got {} hard violations. Violations: {:?}",
        output.score.hard_violations, output.violations
    );
}

#[test]
fn realistic_instance_is_feasible() {
    let input = instances::realistic_8_classes();
    let output = solve_with_config(input, config_with_seed(42));
    assert_eq!(
        output.score.hard_violations, 0,
        "realistic instance should be feasible, got {} hard violations. Violations: {:?}",
        output.score.hard_violations, output.violations
    );
}

#[test]
fn stress_instance_produces_output() {
    let input = instances::stress_16_classes();
    let output = solve_with_config(input, config_with_seed(42));
    assert!(
        !output.timetable.is_empty(),
        "stress instance should produce some timetable entries"
    );
    let stats = output.stats.unwrap();
    assert!(stats.iterations > 0, "solver should run some iterations");
}

#[test]
fn small_instance_lesson_count() {
    let input = instances::small_4_classes();
    let total_hours: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
    assert_eq!(
        total_hours, 95,
        "small instance should have 95 total lesson hours"
    );
}

#[test]
fn realistic_instance_lesson_count() {
    let input = instances::realistic_8_classes();
    let total_hours: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
    assert_eq!(
        total_hours, 190,
        "realistic instance should have 190 total lesson hours"
    );
}

#[test]
fn stress_instance_lesson_count() {
    let input = instances::stress_16_classes();
    let total_hours: u32 = input.requirements.iter().map(|r| r.hours_per_week).sum();
    assert_eq!(
        total_hours, 380,
        "stress instance should have 380 total lesson hours"
    );
}
