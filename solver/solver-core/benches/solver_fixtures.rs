//! Criterion benches for the FFD greedy solver across a fixture matrix.
//!
//! Two fixture builders live in this file: `grundschule_fixture`
//! (45 placements, einzügige Grundschule) and `zweizuegig_fixture`
//! (196 placements, two-Zug Grundschule). Each is a hand-coded mirror
//! of a Python seed in `backend/src/klassenzeit_backend/seed/demo_*.py`;
//! drift is caught by `assert_eq!(lessons.len(), N)` against literals
//! shared with the matching Python solvability test. A `gesamtschule_fixture`
//! is tracked under `docs/superpowers/OPEN_THINGS.md` "Acknowledged deferrals".
//!
//! Both fixtures iterate subjects in the natural authoring order; FFD
//! ordering inside `solve_with_config` sorts lessons by eligibility before
//! placement so the global solve succeeds regardless of input permutation.
//!
//! Output contract: after `group.finish()` we print a tab-separated block
//! fenced by `---SOLVER-BENCH-BASELINE---` / `---END---` to stderr.
//! `scripts/record_solver_bench.sh` depends on those markers, not on
//! criterion's default output format.
//!
//! The percentile helper lives in `percentile.rs` alongside its unit tests;
//! `tests/bench_percentile.rs` pulls it in via `#[path]` so libtest can
//! discover the tests (a `harness = false` bench binary cannot).

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use criterion::{criterion_group, criterion_main, Criterion, SamplingMode};
use solver_core::{
    ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId},
    solve_with_config,
    types::{
        ConstraintWeights, Lesson, Problem, Room, RoomSubjectSuitability, SchoolClass, SolveConfig,
        Subject, Teacher, TeacherQualification, TimeBlock,
    },
};
use uuid::Uuid;

#[path = "percentile.rs"]
mod percentile;
use percentile::compute_percentiles;

const GREEDY_SAMPLE_COUNT: usize = 200;
/// LAHC samples are wall-clock-bound by `LAHC_DEADLINE`, so each sample
/// costs ~200 ms. Drop sample count to keep `mise run bench` runtime sane
/// while still computing meaningful percentile bands.
const LAHC_SAMPLE_COUNT: usize = 30;
const LAHC_DEADLINE: Duration = Duration::from_millis(200);
const LAHC_SEED: u64 = 42;

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
    let subjects: Vec<Subject> = subject_ids
        .iter()
        .enumerate()
        .map(|(i, id)| Subject {
            id: *id,
            prefer_early_periods: matches!(i, 0 | 1), // index 0 = Deutsch, 1 = Mathematik
            avoid_first_period: i == 7,               // index 7 = Sport
        })
        .collect();

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
                // SU (Sachunterricht) is taught as a Doppelstunde, mirroring the
                // demo_grundschule seed; all other subjects are length-1.
                preferred_block_size: if s_idx == 2 { 2 } else { 1 },
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

/// Build a zweizügige Grundschule `Problem`. Mirrors the Python seed in
/// `backend/src/klassenzeit_backend/seed/demo_grundschule_zweizuegig.py`.
/// Asserts 68 lessons / 196 placements so copy-paste drift is caught.
fn zweizuegig_fixture() -> Problem {
    // 5 days x 7 periods = 35 time-blocks (same WeekScheme as einzuegig).
    let time_blocks: Vec<TimeBlock> = (0..35u8)
        .map(|i| TimeBlock {
            id: TimeBlockId(bench_uuid(140 + i)),
            day_of_week: i / 7,
            position: i % 7,
        })
        .collect();

    // 12 teachers; max_hours per the Python seed table.
    let teacher_max_hours: [u8; 12] = [28, 28, 28, 28, 28, 28, 28, 28, 18, 21, 14, 21];
    let teachers: Vec<Teacher> = (0..12u8)
        .map(|i| Teacher {
            id: TeacherId(bench_uuid(40 + i)),
            max_hours_per_week: teacher_max_hours[i as usize],
        })
        .collect();

    // 12 rooms: 8 Klassenraeume + Turnhalle + Sportplatz + Musikraum + Kunstraum.
    // The 12-room layout mirrors the Python seed which adds Sportplatz to relieve
    // Sport scheduling contention; see `demo_grundschule_zweizuegig.py` docstring.
    let rooms: Vec<Room> = (0..12u8)
        .map(|i| Room {
            id: RoomId(bench_uuid(56 + i)),
        })
        .collect();

    // 9 subjects: D, M, SU, RE, E, KU, MU, SP, FOE (indices 0..9).
    let subject_ids: Vec<SubjectId> = (0..9u8).map(|i| SubjectId(bench_uuid(80 + i))).collect();
    let subjects: Vec<Subject> = subject_ids
        .iter()
        .enumerate()
        .map(|(i, id)| Subject {
            id: *id,
            prefer_early_periods: matches!(i, 0 | 1), // index 0 = Deutsch, 1 = Mathematik
            avoid_first_period: i == 7,               // index 7 = Sport
        })
        .collect();

    // 8 classes: 1a..4b. Indices align with grade pairs.
    let classes: Vec<SchoolClass> = (0..8u8)
        .map(|i| SchoolClass {
            id: SchoolClassId(bench_uuid(90 + i)),
        })
        .collect();

    // hours_per_class[class_idx][subject_idx]; 0 = subject not taught in this class.
    // Subject order: D, M, SU, RE, E, KU, MU, SP, FOE.
    // Grade 1 (1a, 1b): D6 M5 SU2 RE2 E0 KU2 MU1 SP3 FOE2 = 23h
    // Grade 2 (2a, 2b): same = 23h
    // Grade 3 (3a, 3b): D5 M5 SU4 RE2 E2 KU2 MU1 SP3 FOE2 = 26h
    // Grade 4 (4a, 4b): same = 26h
    let hours_per_class: [[u8; 9]; 8] = [
        [6, 5, 2, 2, 0, 2, 1, 3, 2], // 1a
        [6, 5, 2, 2, 0, 2, 1, 3, 2], // 1b
        [6, 5, 2, 2, 0, 2, 1, 3, 2], // 2a
        [6, 5, 2, 2, 0, 2, 1, 3, 2], // 2b
        [5, 5, 4, 2, 2, 2, 1, 3, 2], // 3a
        [5, 5, 4, 2, 2, 2, 1, 3, 2], // 3b
        [5, 5, 4, 2, 2, 2, 1, 3, 2], // 4a
        [5, 5, 4, 2, 2, 2, 1, 3, 2], // 4b
    ];

    // teacher_per_class[class_idx][subject_idx] = teacher_idx; mirrors
    // _TEACHER_ASSIGNMENTS_ZWEIZUEGIG in the Python seed.
    // Teacher indices:
    //   0 MUE, 1 SCH, 2 WEB, 3 FIS, 4 KAI, 5 LAN, 6 NEU, 7 OTT,
    //   8 BEC, 9 HOF, 10 WIL, 11 RIC.
    // Use a sentinel (255) for hours-zero subjects so the lesson loop skips them.
    let teacher_per_class: [[u8; 9]; 8] = [
        [0, 0, 0, 8, 255, 0, 8, 9, 9],     // 1a
        [1, 1, 1, 10, 255, 1, 10, 11, 11], // 1b
        [2, 2, 2, 8, 255, 9, 8, 9, 8],     // 2a
        [3, 3, 3, 10, 255, 0, 10, 11, 11], // 2b
        [4, 4, 4, 8, 2, 4, 8, 9, 8],       // 3a
        [5, 5, 5, 10, 3, 5, 10, 11, 11],   // 3b
        [6, 6, 6, 8, 6, 0, 8, 9, 9],       // 4a
        [7, 7, 7, 10, 7, 1, 10, 11, 11],   // 4b
    ];

    let mut lessons = Vec::new();
    let mut quals = Vec::new();
    let mut qual_set: HashSet<(TeacherId, SubjectId)> = HashSet::new();
    let mut lesson_idx: u8 = 0;
    for c_idx in 0..classes.len() {
        for s_idx in 0..subjects.len() {
            let hours = hours_per_class[c_idx][s_idx];
            if hours == 0 {
                continue;
            }
            let t_idx = teacher_per_class[c_idx][s_idx] as usize;
            let teacher = &teachers[t_idx];
            let subject = &subjects[s_idx];
            lessons.push(Lesson {
                id: LessonId(bench_uuid(180 + lesson_idx)),
                school_class_id: classes[c_idx].id,
                subject_id: subject.id,
                teacher_id: teacher.id,
                hours_per_week: hours,
                preferred_block_size: 1,
            });
            lesson_idx += 1;
            // Deduplicate qualifications: a teacher qualified for D appears
            // multiple times if they teach D in multiple classes.
            if qual_set.insert((teacher.id, subject.id)) {
                quals.push(TeacherQualification {
                    teacher_id: teacher.id,
                    subject_id: subject.id,
                });
            }
        }
    }

    assert_eq!(
        lessons.len(),
        68,
        "zweizuegig fixture drifted from the seed: expected 68 lessons"
    );
    let total_hours: u32 = lessons.iter().map(|l| u32::from(l.hours_per_week)).sum();
    assert_eq!(
        total_hours, 196,
        "zweizuegig fixture drifted from the seed: expected 196 placements"
    );

    // Turnhalle (room 8) suits only Sport (subject 7).
    // Sportplatz (room 9) also suits only Sport.
    // Musikraum (room 10) suits only Musik (subject 6).
    // Kunstraum (room 11) suits only Kunst (subject 5).
    let suits: Vec<RoomSubjectSuitability> = vec![
        RoomSubjectSuitability {
            room_id: rooms[8].id,
            subject_id: subject_ids[7],
        },
        RoomSubjectSuitability {
            room_id: rooms[9].id,
            subject_id: subject_ids[7],
        },
        RoomSubjectSuitability {
            room_id: rooms[10].id,
            subject_id: subject_ids[6],
        },
        RoomSubjectSuitability {
            room_id: rooms[11].id,
            subject_id: subject_ids[5],
        },
    ];

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

fn bench_greedy_cfg() -> SolveConfig {
    SolveConfig {
        weights: ConstraintWeights {
            class_gap: 1,
            teacher_gap: 1,
            ..ConstraintWeights::default()
        },
        ..SolveConfig::default()
    }
}

fn bench_lahc_cfg() -> SolveConfig {
    SolveConfig {
        weights: ConstraintWeights {
            class_gap: 1,
            teacher_gap: 1,
            ..ConstraintWeights::default()
        },
        deadline: Some(LAHC_DEADLINE),
        seed: LAHC_SEED,
        ..SolveConfig::default()
    }
}

/// (mode_name, sample_count, config_builder) tuple alias. The function-pointer
/// shape is unique to the bench and not worth factoring out beyond the alias.
type Mode = (&'static str, usize, fn() -> SolveConfig);

fn bench_fixtures(c: &mut Criterion) {
    let fixtures: [(&str, Problem); 2] = [
        ("grundschule", grundschule_fixture()),
        ("zweizuegig", zweizuegig_fixture()),
    ];

    // LAHC config is built per sample so the benchmark cannot accidentally
    // share an RNG sequence across the timed iterations.
    let modes: [Mode; 2] = [
        ("greedy", GREEDY_SAMPLE_COUNT, bench_greedy_cfg),
        ("lahc", LAHC_SAMPLE_COUNT, bench_lahc_cfg),
    ];

    // Two-key map: (fixture_name, mode_name) -> samples / totals.
    type Key = (&'static str, &'static str);
    let samples_by_key: Mutex<HashMap<Key, Vec<Duration>>> = Mutex::new(HashMap::new());
    let totals_by_fixture: Mutex<HashMap<&'static str, u32>> = Mutex::new(HashMap::new());

    for (fixture_name, problem) in &fixtures {
        let expected_hours: u32 = problem
            .lessons
            .iter()
            .map(|l| u32::from(l.hours_per_week))
            .sum();
        totals_by_fixture
            .lock()
            .expect("totals mutex poisoned")
            .insert(*fixture_name, expected_hours);

        for (mode_name, sample_count, build_cfg) in &modes {
            let mut group = c.benchmark_group(format!("solver_{mode_name}"));
            group.sample_size(*sample_count);
            group.sampling_mode(SamplingMode::Flat);
            // LAHC's 200 ms deadline pushes per-sample wall-clock past
            // criterion's default 5 s warm-up + measurement target; setting
            // measurement_time well above sample_count * deadline lets it
            // fit without warning.
            if *mode_name == "lahc" {
                group.measurement_time(Duration::from_secs(20));
                group.warm_up_time(Duration::from_millis(200));
            }
            let cfg = build_cfg();
            group.bench_function(*fixture_name, |b| {
                b.iter_custom(|iters| {
                    let mut total = Duration::ZERO;
                    let mut local: Vec<Duration> = Vec::with_capacity(iters as usize);
                    for _ in 0..iters {
                        let start = Instant::now();
                        let solution = solve_with_config(problem, &cfg)
                            .expect("solve must succeed on the bench fixture");
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
                    samples_by_key
                        .lock()
                        .expect("samples mutex poisoned")
                        .entry((*fixture_name, *mode_name))
                        .or_default()
                        .extend(local);
                    total
                });
            });
            group.finish();
        }
    }

    eprintln!("---SOLVER-BENCH-BASELINE---");
    eprint_bench_header();
    for (fixture_name, problem) in &fixtures {
        for (mode_name, sample_count, build_cfg) in &modes {
            let mut collected = samples_by_key
                .lock()
                .expect("samples mutex poisoned")
                .get(&(*fixture_name, *mode_name))
                .cloned()
                .expect("samples missing for fixture/mode");
            let total_samples = collected.len();
            assert!(
                total_samples >= *sample_count,
                "criterion produced fewer samples than requested for {fixture_name}/{mode_name}"
            );
            let (p1, p50, p99) = compute_percentiles(&mut collected);
            let mean = collected.iter().copied().sum::<Duration>() / total_samples as u32;
            let expected_hours = *totals_by_fixture
                .lock()
                .expect("totals mutex poisoned")
                .get(fixture_name)
                .expect("totals missing for fixture");
            let placements_per_sec = if mean.is_zero() {
                0
            } else {
                (f64::from(expected_hours) / mean.as_secs_f64()) as u64
            };
            // One extra solve outside the timing loop captures the soft_score
            // for the BASELINE row. Both modes are deterministic under their
            // configured (seed, max_iterations) pair so this matches what the
            // timed iterations produced; LAHC determinism additionally
            // depends on wall-clock for the deadline-only case, but with the
            // fixed LAHC_DEADLINE the iterations-per-sample variance stays
            // small enough that the soft score floors at the same value.
            let cfg = build_cfg();
            let solution =
                solve_with_config(problem, &cfg).expect("solve must succeed on the bench fixture");
            eprint_bench_row(
                fixture_name,
                mode_name,
                total_samples,
                p1,
                p50,
                p99,
                placements_per_sec,
                expected_hours,
                0,
                solution.soft_score,
            );
        }
    }
    eprintln!("---END---");
}

fn eprint_bench_header() {
    eprintln!(
        "fixture\tmode\tsamples\tp1_us\tp50_us\tp99_us\tplacements_per_sec\ttotal_placements\ttotal_hard_violations\tsoft_score"
    );
}

// Reason: every column is a named scalar; a wrapper struct would not improve clarity.
#[allow(clippy::too_many_arguments)]
fn eprint_bench_row(
    fixture: &str,
    mode: &str,
    samples: usize,
    p1: std::time::Duration,
    p50: std::time::Duration,
    p99: std::time::Duration,
    placements_per_sec: u64,
    total_placements: u32,
    hard_violations: u32,
    soft_score: u32,
) {
    eprintln!(
        "{fixture}\t{mode}\t{samples}\t{p1}\t{p50}\t{p99}\t{placements_per_sec}\t{total_placements}\t{hard_violations}\t{soft_score}",
        p1 = p1.as_micros(),
        p50 = p50.as_micros(),
        p99 = p99.as_micros(),
    );
}

criterion_group!(benches, bench_fixtures);
criterion_main!(benches);
