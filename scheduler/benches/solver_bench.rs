use criterion::{criterion_group, criterion_main, Criterion};
use klassenzeit_scheduler::constraints::IncrementalState;
use klassenzeit_scheduler::construction::construct_with_state;
use klassenzeit_scheduler::instances;
use klassenzeit_scheduler::local_search::{self, LahcConfig};
use klassenzeit_scheduler::mapper;

fn bench_construct_small(c: &mut Criterion) {
    let input = instances::small_4_classes();
    let (solution, _) = mapper::to_planning(&input);
    c.bench_function("construct_small_4cls", |b| {
        b.iter(|| {
            let mut lessons = solution.lessons.clone();
            let mut state = IncrementalState::new(&solution.facts);
            construct_with_state(&mut lessons, &solution.facts, &mut state);
        })
    });
}

fn bench_construct_realistic(c: &mut Criterion) {
    let input = instances::realistic_8_classes();
    let (solution, _) = mapper::to_planning(&input);
    c.bench_function("construct_realistic_8cls", |b| {
        b.iter(|| {
            let mut lessons = solution.lessons.clone();
            let mut state = IncrementalState::new(&solution.facts);
            construct_with_state(&mut lessons, &solution.facts, &mut state);
        })
    });
}

fn bench_construct_stress(c: &mut Criterion) {
    let input = instances::stress_16_classes();
    let (solution, _) = mapper::to_planning(&input);
    c.bench_function("construct_stress_16cls", |b| {
        b.iter(|| {
            let mut lessons = solution.lessons.clone();
            let mut state = IncrementalState::new(&solution.facts);
            construct_with_state(&mut lessons, &solution.facts, &mut state);
        })
    });
}

fn bench_solve_small(c: &mut Criterion) {
    let input = instances::small_4_classes();
    let config = LahcConfig {
        max_seconds: 10,
        max_idle_ms: 5_000,
        seed: Some(42),
        ..Default::default()
    };
    let (base_solution, _) = mapper::to_planning(&input);

    c.bench_function("solve_small_4cls_10s", |b| {
        b.iter(|| {
            let mut lessons = base_solution.lessons.clone();
            let mut state = IncrementalState::new(&base_solution.facts);
            construct_with_state(&mut lessons, &base_solution.facts, &mut state);
            local_search::optimize(&mut lessons, &base_solution.facts, &mut state, &config);
        })
    });
}

fn bench_solve_realistic(c: &mut Criterion) {
    let input = instances::realistic_8_classes();
    let config = LahcConfig {
        max_seconds: 10,
        max_idle_ms: 5_000,
        seed: Some(42),
        ..Default::default()
    };
    let (base_solution, _) = mapper::to_planning(&input);

    c.bench_function("solve_realistic_8cls_10s", |b| {
        b.iter(|| {
            let mut lessons = base_solution.lessons.clone();
            let mut state = IncrementalState::new(&base_solution.facts);
            construct_with_state(&mut lessons, &base_solution.facts, &mut state);
            local_search::optimize(&mut lessons, &base_solution.facts, &mut state, &config);
        })
    });
}

fn bench_evaluate_assign(c: &mut Criterion) {
    let input = instances::realistic_8_classes();
    let (mut solution, _) = mapper::to_planning(&input);
    let mut state = IncrementalState::new(&solution.facts);

    for i in 0..solution.lessons.len().saturating_sub(1) {
        let slot = i % solution.facts.timeslots.len();
        state.assign(&mut solution.lessons[i], slot, None, &solution.facts);
    }
    let last = &solution.lessons[solution.lessons.len() - 1];

    c.bench_function("evaluate_assign_delta_realistic", |b| {
        b.iter(|| {
            state.evaluate_assign(last, 5, None, &solution.facts);
        })
    });
}

criterion_group!(
    benches,
    bench_construct_small,
    bench_construct_realistic,
    bench_construct_stress,
    bench_solve_small,
    bench_solve_realistic,
    bench_evaluate_assign,
);
criterion_main!(benches);
