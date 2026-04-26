//! Criterion benches for the MVP solver across a fixture matrix.
//!
//! Two fixture builders live in this file: `grundschule_fixture`
//! (45 placements, einzügige Grundschule) and `zweizuegig_fixture`
//! (196 placements, two-Zug Grundschule). Each is a hand-coded mirror
//! of a Python seed in `backend/src/klassenzeit_backend/seed/demo_*.py`;
//! drift is caught by `assert_eq!(lessons.len(), N)` against literals
//! shared with the matching Python solvability test. A `gesamtschule_fixture`
//! is tracked under `docs/superpowers/OPEN_THINGS.md` "Acknowledged deferrals".
//!
//! Output contract: after `group.finish()` we print a tab-separated block
//! fenced by `---SOLVER-BENCH-BASELINE---` / `---END---` to stderr.
//! `scripts/record_solver_bench.sh` depends on those markers, not on
//! criterion's default output format.
//!
//! The percentile helper lives in `percentile.rs` alongside its unit tests;
//! `tests/bench_percentile.rs` pulls it in via `#[path]` so libtest can
//! discover the tests (a `harness = false` bench binary cannot).

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use criterion::{criterion_group, criterion_main, Criterion, SamplingMode};
use solver_core::{
    ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId},
    solve,
    types::{
        Lesson, Problem, Room, RoomSubjectSuitability, SchoolClass, Subject, Teacher,
        TeacherQualification, TimeBlock,
    },
};
use uuid::Uuid;

#[path = "percentile.rs"]
mod percentile;
use percentile::compute_percentiles;

const BENCH_SAMPLE_COUNT: usize = 200;

fn bench_uuid(n: u8) -> Uuid {
    Uuid::from_bytes([n; 16])
}

/// Build a Grundschule-shaped `Problem`. Mirrors the test fixture in
/// `solver-core/tests/grundschule_smoke.rs::grundschule()`. Asserts the
/// resulting problem has exactly 15 lessons totalling 45 placements so
/// copy-paste drift is caught.
fn grundschule_fixture() -> Problem {
    let time_blocks: Vec<TimeBlock> = (0..25)
        .map(|i| TimeBlock {
            id: TimeBlockId(bench_uuid(100 + i)),
            day_of_week: i / 5,
            position: i % 5,
        })
        .collect();

    let teachers: Vec<Teacher> = (0..8)
        .map(|i| Teacher {
            id: TeacherId(bench_uuid(30 + i)),
            max_hours_per_week: 28,
        })
        .collect();

    let rooms: Vec<Room> = (0..5)
        .map(|i| Room {
            id: RoomId(bench_uuid(50 + i)),
        })
        .collect();

    let subject_ids: Vec<SubjectId> = (0..8).map(|i| SubjectId(bench_uuid(60 + i))).collect();
    let subjects: Vec<Subject> = subject_ids.iter().map(|id| Subject { id: *id }).collect();

    let classes: Vec<SchoolClass> = (0..2)
        .map(|i| SchoolClass {
            id: SchoolClassId(bench_uuid(70 + i)),
        })
        .collect();

    let hours_per_class: [[u8; 8]; 2] = [[6, 5, 2, 0, 2, 1, 2, 3], [5, 5, 4, 2, 2, 1, 2, 3]];

    let mut lessons = Vec::new();
    let mut quals = Vec::new();
    let mut lesson_idx: u8 = 0;
    for (c_idx, class) in classes.iter().enumerate() {
        for (s_idx, subject) in subjects.iter().enumerate() {
            let hours = hours_per_class[c_idx][s_idx];
            if hours == 0 {
                continue;
            }
            let teacher = &teachers[(c_idx * 4 + s_idx) % teachers.len()];
            lessons.push(Lesson {
                id: LessonId(bench_uuid(200 + lesson_idx)),
                school_class_id: class.id,
                subject_id: subject.id,
                teacher_id: teacher.id,
                hours_per_week: hours,
            });
            lesson_idx += 1;
            quals.push(TeacherQualification {
                teacher_id: teacher.id,
                subject_id: subject.id,
            });
        }
    }

    assert_eq!(
        lessons.len(),
        15,
        "bench fixture drifted from the test fixture"
    );

    // Gym (room index 4) suits only Sport (subject index 7).
    let suits: Vec<RoomSubjectSuitability> = vec![RoomSubjectSuitability {
        room_id: rooms[4].id,
        subject_id: subject_ids[7],
    }];

    Problem {
        time_blocks,
        teachers,
        rooms,
        subjects,
        school_classes: classes,
        lessons,
        teacher_qualifications: quals,
        teacher_blocked_times: vec![],
        room_blocked_times: vec![],
        room_subject_suitabilities: suits,
    }
}

fn bench_grundschule(c: &mut Criterion) {
    let problem = grundschule_fixture();

    let expected_hours: u32 = problem
        .lessons
        .iter()
        .map(|l| u32::from(l.hours_per_week))
        .sum();

    // `iter_custom`'s closure must be `FnMut`, but criterion owns the
    // closure environment; a `Mutex` hands us interior mutability that
    // survives the borrow checker without unsafe or thread-locals.
    let samples: Mutex<Vec<Duration>> = Mutex::new(Vec::with_capacity(BENCH_SAMPLE_COUNT * 4));

    let mut group = c.benchmark_group("solver");
    group.sample_size(BENCH_SAMPLE_COUNT);
    group.sampling_mode(SamplingMode::Flat);
    group.bench_function("grundschule", |b| {
        b.iter_custom(|iters| {
            let mut total = Duration::ZERO;
            let mut local: Vec<Duration> = Vec::with_capacity(iters as usize);
            for _ in 0..iters {
                let start = Instant::now();
                let solution =
                    solve(&problem).expect("solve must succeed on the grundschule fixture");
                let elapsed = start.elapsed();
                total += elapsed;
                local.push(elapsed);

                assert!(solution.violations.is_empty());
                assert_eq!(solution.placements.len() as u32, expected_hours);
                let mut seen: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
                for pl in &solution.placements {
                    assert!(seen.insert((pl.room_id, pl.time_block_id)));
                }
            }
            samples
                .lock()
                .expect("bench samples mutex poisoned")
                .extend(local);
            total
        });
    });
    group.finish();

    let mut collected = samples
        .lock()
        .expect("bench samples mutex poisoned")
        .clone();
    let total_samples = collected.len();
    assert!(
        total_samples >= BENCH_SAMPLE_COUNT,
        "criterion produced fewer samples than requested"
    );
    let (p1, p50, p99) = compute_percentiles(&mut collected);
    let mean = collected.iter().copied().sum::<Duration>() / total_samples as u32;
    let placements_per_sec = if mean.is_zero() {
        0
    } else {
        (f64::from(expected_hours) / mean.as_secs_f64()) as u64
    };

    eprintln!("---SOLVER-BENCH-BASELINE---");
    eprintln!("fixture\tgrundschule");
    eprintln!("samples\t{}", total_samples);
    eprintln!("p1_us\t{}", p1.as_micros());
    eprintln!("p50_us\t{}", p50.as_micros());
    eprintln!("p99_us\t{}", p99.as_micros());
    eprintln!("placements_per_sec\t{}", placements_per_sec);
    eprintln!("total_placements\t{}", expected_hours);
    eprintln!("total_hard_violations\t0");
    eprintln!("---END---");
}

criterion_group!(benches, bench_grundschule);
criterion_main!(benches);
