use bitvec::prelude::*;
use criterion::{criterion_group, criterion_main, Criterion};
use klassenzeit_scheduler::constraints::IncrementalState;
use klassenzeit_scheduler::construction::{construct, construct_with_state};
use klassenzeit_scheduler::local_search::{self, LahcConfig};
use klassenzeit_scheduler::planning::*;

fn make_bench_facts(num_classes: usize) -> (ProblemFacts, Vec<PlanningLesson>) {
    let num_teachers = num_classes * 2;
    let num_subjects = 8;
    let num_rooms = 3;
    let periods_per_day = 6;
    let days = 5;
    let num_timeslots = days * periods_per_day;

    let teachers: Vec<TeacherFact> = (0..num_teachers)
        .map(|t| {
            let mut available_slots = bitvec![1; num_timeslots];
            // Block ~20% of slots (deterministic pattern)
            for s in 0..num_timeslots {
                if (t * 7 + s * 13) % 5 == 0 {
                    available_slots.set(s, false);
                }
            }
            let mut qualified_subjects = bitvec![0; num_subjects];
            for s in 0..num_subjects {
                if (t + s) % 3 != 0 {
                    qualified_subjects.set(s, true);
                }
            }
            let mut preferred_slots = bitvec![0; num_timeslots];
            for s in 0..num_timeslots {
                if (t * 3 + s * 7) % 5 != 0 {
                    preferred_slots.set(s, true);
                }
            }
            TeacherFact {
                max_hours: 24,
                available_slots,
                qualified_subjects,
                preferred_slots,
            }
        })
        .collect();

    let rooms: Vec<RoomFact> = (0..num_rooms)
        .map(|r| {
            let mut suitable_subjects = bitvec![0; num_subjects];
            for s in 0..num_subjects {
                if (r + s) % 2 == 0 {
                    suitable_subjects.set(s, true);
                }
            }
            RoomFact {
                capacity: Some(30),
                suitable_subjects,
            }
        })
        .collect();

    let facts = ProblemFacts {
        timeslots: (0..num_timeslots)
            .map(|i| Timeslot {
                day: (i / periods_per_day) as u8,
                period: (i % periods_per_day) as u8,
            })
            .collect(),
        teachers,
        classes: (0..num_classes)
            .map(|i| ClassFact {
                student_count: Some(25),
                class_teacher_idx: Some(i % (num_classes * 2)),
                available_slots: bitvec![1; num_timeslots],
            })
            .collect(),
        rooms,
        subjects: (0..num_subjects)
            .map(|s| SubjectFact {
                needs_special_room: s < num_rooms,
            })
            .collect(),
    };

    // Generate lessons: each class gets 3-4 hours of each of 4 subjects
    let mut lessons = Vec::new();
    let mut id = 0;
    for class_idx in 0..num_classes {
        for subj_idx in 0..4.min(num_subjects) {
            let hours = 3 + (class_idx + subj_idx) % 2;
            let teacher_idx = (0..facts.teachers.len())
                .find(|&t| facts.teachers[t].qualified_subjects[subj_idx])
                .unwrap_or(0);
            for _ in 0..hours {
                lessons.push(PlanningLesson {
                    id,
                    subject_idx: subj_idx,
                    teacher_idx,
                    class_idx,
                    timeslot: None,
                    room: None,
                });
                id += 1;
            }
        }
    }

    (facts, lessons)
}

fn bench_construct_small(c: &mut Criterion) {
    let (facts, lessons) = make_bench_facts(6);
    c.bench_function("construct_6_classes", |b| {
        b.iter(|| {
            let mut l = lessons.clone();
            construct(&mut l, &facts);
        })
    });
}

fn bench_construct_medium(c: &mut Criterion) {
    let (facts, lessons) = make_bench_facts(15);
    c.bench_function("construct_15_classes", |b| {
        b.iter(|| {
            let mut l = lessons.clone();
            construct(&mut l, &facts);
        })
    });
}

fn bench_evaluate_assign(c: &mut Criterion) {
    let (facts, mut lessons) = make_bench_facts(6);
    let mut state = IncrementalState::new(&facts);
    for i in 0..lessons.len().saturating_sub(1) {
        let slot = i % facts.timeslots.len();
        state.assign(&mut lessons[i], slot, None, &facts);
    }
    let last = &lessons[lessons.len() - 1];
    c.bench_function("evaluate_assign_delta", |b| {
        b.iter(|| {
            state.evaluate_assign(last, 5, None, &facts);
        })
    });
}

fn bench_solve_small(c: &mut Criterion) {
    let (facts, lessons) = make_bench_facts(6);

    let config = LahcConfig {
        max_seconds: 5,
        max_idle_ms: 3_000,
        seed: Some(42),
        ..Default::default()
    };

    c.bench_function("solve_6_classes_5s", |b| {
        b.iter(|| {
            let mut l = lessons.clone();
            let mut state = IncrementalState::new(&facts);
            construct_with_state(&mut l, &facts, &mut state);
            local_search::optimize(&mut l, &facts, &mut state, &config);
        })
    });
}

criterion_group!(
    benches,
    bench_construct_small,
    bench_construct_medium,
    bench_evaluate_assign,
    bench_solve_small,
);
criterion_main!(benches);
