# Subject Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode "prefer early periods" and "avoid first period" as per-subject soft-constraint axes that LAHC can optimise on, end-to-end across solver, backend, and frontend.

**Architecture:** Two boolean fields on `Subject` (Rust struct + DB column + Pydantic + Zod) drive two new `ConstraintWeights` axes (`prefer_early_period` linear in `tb.position`, `avoid_first_period` binary at `tb.position == 0`). Per-placement scoring is added in `score_solution`; lowest-delta greedy and LAHC delta evaluation reuse a shared `subject_preference_score` helper.

**Tech Stack:** Rust 1.85 (`solver-core`, `solver-py`), Python 3.13 (FastAPI + SQLAlchemy 2.0 async + Alembic + Pydantic v2), TypeScript 5 (Vite + React 19 + react-hook-form + Zod + react-i18next).

**Spec:** `docs/superpowers/specs/2026-04-28-subject-preferences-design.md`.

---

## Commit 1: `feat(solver-core): subject preferences scoring axes`

Lands the Rust side end-to-end behind a green test set: types extend, scoring helper, score_solution + lowest-delta greedy + LAHC delta all integrated, property tests, bench fixture data updated to match commit 2's seed values.

### Task 1.1: Extend `Subject` and `ConstraintWeights` types

**Files:**
- Modify: `solver/solver-core/src/types.rs`

- [ ] **Step 1: Add the new fields to `Subject` and `ConstraintWeights`**

Replace lines 30-43 (`ConstraintWeights`) and lines 102-108 (`Subject`) with:

```rust
/// Soft-constraint weights consumed by `score_solution` and the lowest-delta
/// greedy in `solve_with_config`. Each field defaults to zero so explicit
/// `ConstraintWeights::default()` callers get unweighted behaviour. The
/// no-config `solve()` entry point applies active defaults of `1` per axis.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ConstraintWeights {
    /// Penalty per gap-hour in any class's day. A gap-hour is a position p in
    /// a `(school_class_id, day_of_week)` partition where the class has
    /// placements at some position less than p and some position greater than
    /// p on that day, but no placement at position p.
    pub class_gap: u32,
    /// Penalty per gap-hour in any teacher's day. Same definition as
    /// `class_gap`, partitioned by `(teacher_id, day_of_week)` instead.
    pub teacher_gap: u32,
    /// Linear penalty per placement of a `prefer_early_periods` subject:
    /// `tb.position * prefer_early_period`. Zero when the subject's flag is
    /// false or when this weight is zero.
    pub prefer_early_period: u32,
    /// Constant penalty per placement of an `avoid_first_period` subject at
    /// `tb.position == 0`. Zero when the subject's flag is false, the weight
    /// is zero, or the placement is not at position 0.
    pub avoid_first_period: u32,
}
```

```rust
/// A subject (the thing being taught in a lesson).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Subject {
    /// Stable identifier for this subject.
    pub id: SubjectId,
    /// When true, scoring adds `tb.position * weights.prefer_early_period` per
    /// placement of any lesson teaching this subject. Use for "Hauptfaecher
    /// frueh" (German: prefer Hauptfaecher in early periods).
    pub prefer_early_periods: bool,
    /// When true, scoring adds `weights.avoid_first_period` per placement of
    /// any lesson teaching this subject at `tb.position == 0`. Use for "Sport
    /// nicht in der ersten Stunde".
    pub avoid_first_period: bool,
}
```

- [ ] **Step 2: Run `cargo check -p solver-core` to confirm compile failures spread**

Run: `cargo check -p solver-core --tests --benches`
Expected: FAIL with "missing fields `prefer_early_periods` and `avoid_first_period` in initializer of `Subject`" at every `Subject { id: ... }` literal.

- [ ] **Step 3: Add the missing fields to every `Subject { ... }` literal in solver-core**

Apply the same patch shape at each site: append `, prefer_early_periods: false, avoid_first_period: false` inside the struct literal.

Sites to fix (verified by `grep -rn "Subject {" /home/pascal/Code/Klassenzeit/solver/solver-core/`):
- `solver/solver-core/src/json.rs:79`
- `solver/solver-core/src/ordering.rs:99`
- `solver/solver-core/src/ordering.rs:102`
- `solver/solver-core/src/index.rs:104`
- `solver/solver-core/src/index.rs:107`
- `solver/solver-core/src/score.rs:171`
- `solver/solver-core/src/solve.rs:377`
- `solver/solver-core/src/solve.rs:436`
- `solver/solver-core/src/solve.rs:478`
- `solver/solver-core/src/solve.rs:506`
- `solver/solver-core/src/solve.rs:528`
- `solver/solver-core/src/solve.rs:597`
- `solver/solver-core/src/validate.rs:189`
- `solver/solver-core/src/lahc.rs:563`
- `solver/solver-core/src/lahc.rs:598`
- `solver/solver-core/src/lahc.rs:630`
- `solver/solver-core/tests/grundschule_smoke.rs:52` (use closure helper, see step below)
- `solver/solver-core/tests/lahc_property.rs:37`
- `solver/solver-core/tests/ffd_solver_outcome.rs:50`
- `solver/solver-core/tests/ffd_solver_outcome.rs:53`
- `solver/solver-core/tests/common/mod.rs:57`
- `solver/solver-core/benches/solver_fixtures.rs:82`
- `solver/solver-core/benches/solver_fixtures.rs:176`

For closure-style `.map(|id| Subject { id: *id })` sites in `grundschule_smoke.rs:52`, `solver_fixtures.rs:82`, and `solver_fixtures.rs:176`, expand to:

```rust
.map(|id| Subject { id: *id, prefer_early_periods: false, avoid_first_period: false })
```

For the `tests/common/mod.rs:57` `.map(|i| Subject { ... })` shape, use the same expansion.

- [ ] **Step 4: Run `cargo check -p solver-core --tests --benches`**

Expected: PASS (no missing-field errors). Existing inline tests in `score.rs`, `solve.rs`, `lahc.rs` still pass under default-zero weights for the new axes since they explicitly set `ConstraintWeights { class_gap: ..., teacher_gap: ... }` and the new fields default to `0`.

- [ ] **Step 5: Run `cargo nextest run -p solver-core`**

Expected: PASS for all existing tests.

### Task 1.2: Add `subject_preference_score` helper with inline tests

**Files:**
- Modify: `solver/solver-core/src/score.rs`

- [ ] **Step 1: Add a failing inline test asserting the helper exists and returns 0 when both flags are off**

Append at the bottom of the existing `#[cfg(test)] mod tests { ... }` in `solver/solver-core/src/score.rs`:

```rust
    #[test]
    fn subject_preference_score_returns_zero_when_flags_off() {
        let subject = Subject {
            id: SubjectId(score_uuid(40)),
            prefer_early_periods: false,
            avoid_first_period: false,
        };
        let tb = TimeBlock {
            id: TimeBlockId(score_uuid(10)),
            day_of_week: 0,
            position: 3,
        };
        let weights = ConstraintWeights {
            prefer_early_period: 5,
            avoid_first_period: 7,
            ..ConstraintWeights::default()
        };
        assert_eq!(subject_preference_score(&subject, &tb, &weights), 0);
    }

    #[test]
    fn subject_preference_score_linear_in_position_when_prefer_early_set() {
        let subject = Subject {
            id: SubjectId(score_uuid(40)),
            prefer_early_periods: true,
            avoid_first_period: false,
        };
        let weights = ConstraintWeights {
            prefer_early_period: 3,
            ..ConstraintWeights::default()
        };
        for pos in 0u8..7 {
            let tb = TimeBlock {
                id: TimeBlockId(score_uuid(10)),
                day_of_week: 0,
                position: pos,
            };
            assert_eq!(
                subject_preference_score(&subject, &tb, &weights),
                u32::from(pos) * 3
            );
        }
    }

    #[test]
    fn subject_preference_score_constant_at_position_zero_when_avoid_first_set() {
        let subject = Subject {
            id: SubjectId(score_uuid(40)),
            prefer_early_periods: false,
            avoid_first_period: true,
        };
        let weights = ConstraintWeights {
            avoid_first_period: 9,
            ..ConstraintWeights::default()
        };
        let tb_zero = TimeBlock {
            id: TimeBlockId(score_uuid(10)),
            day_of_week: 0,
            position: 0,
        };
        let tb_nonzero = TimeBlock {
            id: TimeBlockId(score_uuid(11)),
            day_of_week: 0,
            position: 1,
        };
        assert_eq!(subject_preference_score(&subject, &tb_zero, &weights), 9);
        assert_eq!(subject_preference_score(&subject, &tb_nonzero, &weights), 0);
    }

    #[test]
    fn subject_preference_score_sums_when_both_flags_on_at_position_zero() {
        let subject = Subject {
            id: SubjectId(score_uuid(40)),
            prefer_early_periods: true,
            avoid_first_period: true,
        };
        let weights = ConstraintWeights {
            prefer_early_period: 2,
            avoid_first_period: 5,
            ..ConstraintWeights::default()
        };
        let tb_zero = TimeBlock {
            id: TimeBlockId(score_uuid(10)),
            day_of_week: 0,
            position: 0,
        };
        let tb_two = TimeBlock {
            id: TimeBlockId(score_uuid(11)),
            day_of_week: 0,
            position: 2,
        };
        // Position 0: prefer_early contributes 0, avoid_first contributes 5; total 5.
        assert_eq!(subject_preference_score(&subject, &tb_zero, &weights), 5);
        // Position 2: prefer_early contributes 4, avoid_first contributes 0; total 4.
        assert_eq!(subject_preference_score(&subject, &tb_two, &weights), 4);
    }
```

- [ ] **Step 2: Run `cargo nextest run -p solver-core score::`**

Expected: FAIL with "cannot find function `subject_preference_score` in this scope".

- [ ] **Step 3: Add the helper to `score.rs`**

Insert near the existing `gap_count_after_remove` (after line 129), before the `#[cfg(test)]` block:

```rust
/// Per-placement subject-preference score. Returns
/// `tb.position * weights.prefer_early_period` (linear) when the subject's
/// `prefer_early_periods` flag is set, plus `weights.avoid_first_period`
/// (binary) when the `avoid_first_period` flag is set and `tb.position == 0`.
/// Pure: depends only on `subject`, `tb`, `weights`. Allocation-free.
pub(crate) fn subject_preference_score(
    subject: &crate::types::Subject,
    tb: &TimeBlock,
    weights: &ConstraintWeights,
) -> u32 {
    let mut score = 0u32;
    if subject.prefer_early_periods {
        score = score.saturating_add(
            u32::from(tb.position).saturating_mul(weights.prefer_early_period),
        );
    }
    if subject.avoid_first_period && tb.position == 0 {
        score = score.saturating_add(weights.avoid_first_period);
    }
    score
}
```

- [ ] **Step 4: Run `cargo nextest run -p solver-core score::`**

Expected: PASS for the four new tests plus all existing score tests.

### Task 1.3: Extend `score_solution` to fold in subject-preference contributions

**Files:**
- Modify: `solver/solver-core/src/score.rs`

- [ ] **Step 1: Add a failing inline test asserting `score_solution` returns the per-placement subject-preference contribution**

Append in the same `tests` block in `score.rs`:

```rust
    fn one_class_two_block_problem_with_flagged_subject(
        prefer_early: bool,
        avoid_first: bool,
    ) -> Problem {
        Problem {
            time_blocks: vec![
                TimeBlock {
                    id: TimeBlockId(score_uuid(10)),
                    day_of_week: 0,
                    position: 0,
                },
                TimeBlock {
                    id: TimeBlockId(score_uuid(11)),
                    day_of_week: 0,
                    position: 1,
                },
            ],
            teachers: vec![Teacher {
                id: TeacherId(score_uuid(20)),
                max_hours_per_week: 10,
            }],
            rooms: vec![Room {
                id: RoomId(score_uuid(30)),
            }],
            subjects: vec![Subject {
                id: SubjectId(score_uuid(40)),
                prefer_early_periods: prefer_early,
                avoid_first_period: avoid_first,
            }],
            school_classes: vec![SchoolClass {
                id: SchoolClassId(score_uuid(50)),
            }],
            lessons: vec![Lesson {
                id: LessonId(score_uuid(60)),
                school_class_id: SchoolClassId(score_uuid(50)),
                subject_id: SubjectId(score_uuid(40)),
                teacher_id: TeacherId(score_uuid(20)),
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: TeacherId(score_uuid(20)),
                subject_id: SubjectId(score_uuid(40)),
            }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        }
    }

    #[test]
    fn score_solution_includes_prefer_early_per_placement() {
        let p = one_class_two_block_problem_with_flagged_subject(true, false);
        let weights = ConstraintWeights {
            prefer_early_period: 2,
            ..ConstraintWeights::default()
        };
        // Lesson placed at position 1: contribution = 1 * 2 = 2.
        let placements = [Placement {
            lesson_id: LessonId(score_uuid(60)),
            time_block_id: TimeBlockId(score_uuid(11)),
            room_id: RoomId(score_uuid(30)),
        }];
        assert_eq!(score_solution(&p, &placements, &weights), 2);
    }

    #[test]
    fn score_solution_includes_avoid_first_only_at_position_zero() {
        let p = one_class_two_block_problem_with_flagged_subject(false, true);
        let weights = ConstraintWeights {
            avoid_first_period: 7,
            ..ConstraintWeights::default()
        };
        // At position 0: contribution = 7.
        let placements_at_zero = [Placement {
            lesson_id: LessonId(score_uuid(60)),
            time_block_id: TimeBlockId(score_uuid(10)),
            room_id: RoomId(score_uuid(30)),
        }];
        assert_eq!(score_solution(&p, &placements_at_zero, &weights), 7);
        // At position 1: contribution = 0.
        let placements_at_one = [Placement {
            lesson_id: LessonId(score_uuid(60)),
            time_block_id: TimeBlockId(score_uuid(11)),
            room_id: RoomId(score_uuid(30)),
        }];
        assert_eq!(score_solution(&p, &placements_at_one, &weights), 0);
    }

    #[test]
    fn score_solution_zero_with_subject_flags_off_matches_pre_9c_score() {
        let p = three_block_one_class_problem();
        let weights = ConstraintWeights {
            class_gap: 5,
            teacher_gap: 7,
            prefer_early_period: 100,
            avoid_first_period: 100,
        };
        // Subject in three_block_one_class_problem has both flags false (default
        // after task 1.1's literal updates). The new axes contribute 0; total
        // matches the pre-9c gap-only score of 12 (one gap each in class + teacher
        // partitions, weights 5 and 7).
        let placements = [place(60, 10), place(60, 12)];
        assert_eq!(score_solution(&p, &placements, &weights), 12);
    }
```

- [ ] **Step 2: Run `cargo nextest run -p solver-core score::`**

Expected: FAIL on the two new "includes" tests (subject-preference contribution returns 0 because `score_solution` does not yet call the helper).

- [ ] **Step 3: Modify `score_solution` to fold the subject-preference contribution**

Replace the early-exit guard at the top of `score_solution` (lines 18-20) and the final return statement (lines 59-60) with:

```rust
    if weights.class_gap == 0
        && weights.teacher_gap == 0
        && weights.prefer_early_period == 0
        && weights.avoid_first_period == 0
    {
        return 0;
    }
```

Add a `subject_lookup` build alongside the existing `tb_lookup` and `lesson_lookup` (after line 24):

```rust
    let subject_lookup: std::collections::HashMap<crate::ids::SubjectId, &crate::types::Subject> =
        problem.subjects.iter().map(|s| (s.id, s)).collect();
```

After the existing `class_gaps` / `teacher_gaps` totals (line 49-57), add a per-placement loop and fold it into the return:

```rust
    let subject_preference: u32 = placements
        .iter()
        .map(|p| {
            let lesson = lesson_lookup[&p.lesson_id];
            let subject = subject_lookup[&lesson.subject_id];
            let tb = tb_lookup[&p.time_block_id];
            subject_preference_score(subject, tb, weights)
        })
        .sum();

    weights.class_gap.saturating_mul(class_gaps)
        .saturating_add(weights.teacher_gap.saturating_mul(teacher_gaps))
        .saturating_add(subject_preference)
```

- [ ] **Step 4: Run `cargo nextest run -p solver-core score::`**

Expected: PASS for all score tests including the three new ones.

### Task 1.4: Extend `solve.rs` lowest-delta greedy with subject-preference contribution

**Files:**
- Modify: `solver/solver-core/src/solve.rs`

- [ ] **Step 1: Add a failing inline test asserting the greedy avoids position 0 for an avoid-first subject when an alternative slot is available**

Append at the bottom of the `#[cfg(test)] mod tests` in `solve.rs`:

```rust
    #[test]
    fn greedy_avoids_position_zero_for_avoid_first_subject_when_alternative_exists() {
        let mut p = base_problem();
        p.time_blocks.push(TimeBlock {
            id: TimeBlockId(solve_uuid(12)),
            day_of_week: 0,
            position: 2,
        });
        // Mark the only subject as avoid_first.
        p.subjects[0].avoid_first_period = true;
        // Active default solve(p) uses weight 1 for each axis; lesson should
        // place at position 1 (the lowest-id non-zero alternative), not 0.
        let s = solve_with_config(
            &p,
            &SolveConfig {
                weights: ConstraintWeights {
                    class_gap: 1,
                    teacher_gap: 1,
                    prefer_early_period: 1,
                    avoid_first_period: 1,
                },
                ..SolveConfig::default()
            },
        )
        .unwrap();
        assert_eq!(s.placements.len(), 1);
        assert_ne!(
            s.placements[0].time_block_id,
            TimeBlockId(solve_uuid(10)),
            "expected the avoid-first subject to skip position 0"
        );
    }

    #[test]
    fn greedy_packs_prefer_early_subject_into_lower_positions_when_multiple_hours() {
        // Two-hour lesson of a prefer-early subject across a four-block day.
        // With prefer_early weight = 1, positions 0 and 1 should win over
        // 2 and 3 because their cumulative position cost (0+1=1) beats
        // (0+2=2) or any later combination.
        let mut p = base_problem();
        p.time_blocks = vec![
            TimeBlock { id: TimeBlockId(solve_uuid(10)), day_of_week: 0, position: 0 },
            TimeBlock { id: TimeBlockId(solve_uuid(11)), day_of_week: 0, position: 1 },
            TimeBlock { id: TimeBlockId(solve_uuid(12)), day_of_week: 0, position: 2 },
            TimeBlock { id: TimeBlockId(solve_uuid(13)), day_of_week: 0, position: 3 },
        ];
        p.lessons[0].hours_per_week = 2;
        p.subjects[0].prefer_early_periods = true;
        let s = solve_with_config(
            &p,
            &SolveConfig {
                weights: ConstraintWeights {
                    class_gap: 1,
                    teacher_gap: 1,
                    prefer_early_period: 1,
                    avoid_first_period: 1,
                },
                ..SolveConfig::default()
            },
        )
        .unwrap();
        assert_eq!(s.placements.len(), 2);
        let positions: Vec<u8> = s
            .placements
            .iter()
            .map(|pl| {
                p.time_blocks
                    .iter()
                    .find(|tb| tb.id == pl.time_block_id)
                    .unwrap()
                    .position
            })
            .collect();
        assert_eq!(
            positions.iter().copied().collect::<std::collections::HashSet<_>>(),
            std::collections::HashSet::from([0u8, 1u8])
        );
    }
```

- [ ] **Step 2: Run `cargo nextest run -p solver-core solve::tests::greedy_avoids_position_zero_for_avoid_first_subject_when_alternative_exists solve::tests::greedy_packs_prefer_early_subject_into_lower_positions_when_multiple_hours`**

Expected: FAIL. `candidate_score` does not yet include the subject-preference contribution, so the greedy still picks position 0 first.

- [ ] **Step 3: Extend `candidate_score` and pass `subject` through**

In `solve.rs`, modify `candidate_score` (lines 162-181) to accept `subject_pref: u32` and include it:

```rust
fn candidate_score(
    state: &GreedyState,
    class: SchoolClassId,
    teacher: TeacherId,
    day: u8,
    pos: u8,
    weights: &ConstraintWeights,
    subject_pref: u32,
) -> u32 {
    let class_partition = state.class_positions.get(&(class, day));
    let teacher_partition = state.teacher_positions.get(&(teacher, day));
    let class_old = gap_count_partition(class_partition).saturating_mul(weights.class_gap);
    let teacher_old = gap_count_partition(teacher_partition).saturating_mul(weights.teacher_gap);
    let class_new = crate::score::gap_count_after_insert(class_partition, pos)
        .saturating_mul(weights.class_gap);
    let teacher_new = crate::score::gap_count_after_insert(teacher_partition, pos)
        .saturating_mul(weights.teacher_gap);
    state.soft_score - class_old - teacher_old + class_new + teacher_new + subject_pref
}
```

In `try_place_hour` (lines 191-295), build the subject lookup once at the top of the function (just after the `let class = ...; let teacher = ...;` lines) and call `subject_preference_score` once per `tb` (hoisted out of the room loop, since the value depends only on subject + tb):

```rust
    // Look up the subject once; it does not change across tb iterations.
    let subject = problem
        .subjects
        .iter()
        .find(|s| s.id == lesson.subject_id)
        .expect("validate_structural ensures every lesson.subject_id resolves");
```

Inside the `'tb_loop`, after the `let tb = ...` line and before the existing feasibility checks, compute the subject-preference contribution:

```rust
        let subject_pref = crate::score::subject_preference_score(subject, tb, weights);
```

Replace the existing `let score = candidate_score(...)` call to pass `subject_pref`:

```rust
        let score = candidate_score(
            state,
            class,
            teacher,
            tb.day_of_week,
            tb.position,
            weights,
            subject_pref,
        );
```

- [ ] **Step 4: Run `cargo nextest run -p solver-core`**

Expected: PASS for all solve tests including the two new ones, and PASS for the existing 11 inline tests in `solve.rs`.

### Task 1.5: Extend LAHC delta evaluation with subject-preference contribution

**Files:**
- Modify: `solver/solver-core/src/lahc.rs`

- [ ] **Step 1: Add a failing inline test asserting the LAHC accepts a Change move that reduces a subject-preference penalty**

Append at the bottom of the `#[cfg(test)] mod tests` in `lahc.rs`:

```rust
    #[test]
    fn lahc_change_move_reduces_avoid_first_penalty_when_seed_finds_alternative() {
        use crate::types::{
            Lesson, Problem, Room, SchoolClass, Subject, Teacher, TeacherQualification,
        };

        let class = SchoolClassId(lahc_uuid(50));
        let teacher = TeacherId(lahc_uuid(20));
        let subject = SubjectId(lahc_uuid(40));
        let room = RoomId(lahc_uuid(30));
        let lesson = LessonId(lahc_uuid(60));
        let tb_zero = TimeBlockId(lahc_uuid(10));
        let tb_one = TimeBlockId(lahc_uuid(11));

        let problem = Problem {
            time_blocks: vec![
                TimeBlock { id: tb_zero, day_of_week: 0, position: 0 },
                TimeBlock { id: tb_one, day_of_week: 0, position: 1 },
            ],
            teachers: vec![Teacher { id: teacher, max_hours_per_week: 10 }],
            rooms: vec![Room { id: room }],
            subjects: vec![Subject {
                id: subject,
                prefer_early_periods: false,
                avoid_first_period: true,
            }],
            school_classes: vec![SchoolClass { id: class }],
            lessons: vec![Lesson {
                id: lesson,
                school_class_id: class,
                subject_id: subject,
                teacher_id: teacher,
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification {
                teacher_id: teacher,
                subject_id: subject,
            }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        let idx = crate::index::Indexed::new(&problem);

        let mut placements = vec![Placement {
            lesson_id: lesson,
            time_block_id: tb_zero,
            room_id: room,
        }];
        let mut class_positions: HashMap<(SchoolClassId, u8), Vec<u8>> = HashMap::new();
        class_positions.insert((class, 0), vec_part(&[0]));
        let mut teacher_positions: HashMap<(TeacherId, u8), Vec<u8>> = HashMap::new();
        teacher_positions.insert((teacher, 0), vec_part(&[0]));
        let mut used_teacher: HashSet<(TeacherId, TimeBlockId)> = HashSet::new();
        used_teacher.insert((teacher, tb_zero));
        let mut used_class: HashSet<(SchoolClassId, TimeBlockId)> = HashSet::new();
        used_class.insert((class, tb_zero));
        let mut used_room: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
        used_room.insert((room, tb_zero));
        let mut current_score: u32 = 1; // avoid_first penalty active at position 0

        let config = SolveConfig {
            weights: ConstraintWeights {
                avoid_first_period: 1,
                ..ConstraintWeights::default()
            },
            seed: 0,
            deadline: Some(std::time::Duration::from_millis(50)),
            max_iterations: Some(20),
        };

        run(
            &problem,
            &idx,
            &config,
            &mut placements,
            &mut class_positions,
            &mut teacher_positions,
            &mut used_teacher,
            &mut used_class,
            &mut used_room,
            &mut current_score,
        );

        assert_eq!(placements.len(), 1);
        assert_eq!(
            placements[0].time_block_id, tb_one,
            "LAHC should move the avoid-first lesson off position 0"
        );
        assert_eq!(current_score, 0);
    }
```

- [ ] **Step 2: Run `cargo nextest run -p solver-core lahc::tests::lahc_change_move_reduces_avoid_first_penalty_when_seed_finds_alternative`**

Expected: FAIL because `score_after_change_move` ignores subject-preference contributions; the move's delta evaluates to 0 instead of -1.

- [ ] **Step 3: Extend `score_after_change_move` and the LAHC `run` plumbing**

In `lahc.rs`, modify `run` (lines 27-86) to build a `subject_lookup` once at the top:

```rust
    let subject_lookup: HashMap<crate::ids::SubjectId, &crate::types::Subject> =
        problem.subjects.iter().map(|s| (s.id, s)).collect();
```

Pass `&subject_lookup` and `&old_tb` / `&new_tb` (already in scope as `TimeBlock` clones) into `try_change_move` plus extend its signature to accept the lookup.

Modify `try_change_move` (lines 93-188) to compute subject-preference deltas after pulling `lesson` out:

```rust
    let subject = subject_lookup[&lesson.subject_id];
    let subject_pref_old = crate::score::subject_preference_score(subject, &old_tb, weights);
    let subject_pref_new = crate::score::subject_preference_score(subject, &new_tb, weights);
    let subject_pref_delta = i64::from(subject_pref_new) - i64::from(subject_pref_old);
```

Then fold `subject_pref_delta` into the existing `delta` computation (after the `score_after_change_move` call):

```rust
    let delta = score_after_change_move(
        class,
        teacher,
        old_tb.day_of_week,
        old_tb.position,
        new_tb.day_of_week,
        new_tb.position,
        class_positions,
        teacher_positions,
        weights,
    ) + subject_pref_delta;
```

Update `try_change_move`'s signature to take `subject_lookup: &HashMap<SubjectId, &Subject>` (add a parameter; keep the existing parameter order otherwise stable). Update the callsite in `run` accordingly.

- [ ] **Step 4: Run `cargo nextest run -p solver-core`**

Expected: PASS for all lahc tests including the new one, plus all existing solve / score / property tests.

### Task 1.6: Extend `solve()` active defaults to weight 1 for the new axes

**Files:**
- Modify: `solver/solver-core/src/solve.rs`

- [ ] **Step 1: Modify the `solve()` active default**

Replace lines 24-34 in `solve.rs`:

```rust
pub fn solve(problem: &Problem) -> Result<Solution, Error> {
    let active_default = SolveConfig {
        weights: ConstraintWeights {
            class_gap: 1,
            teacher_gap: 1,
            prefer_early_period: 1,
            avoid_first_period: 1,
        },
        deadline: Some(Duration::from_millis(200)),
        ..SolveConfig::default()
    };
    solve_with_config(problem, &active_default)
}
```

- [ ] **Step 2: Run `cargo nextest run -p solver-core`**

Expected: PASS. The existing `single_hour_places_into_first_slot_and_room` and other inline tests use `greedy_solve` (a helper inside the module that pins `class_gap = 1, teacher_gap = 1` and zero for the new axes), so they remain unchanged.

### Task 1.7: Add property tests for the new axes

**Files:**
- Modify: `solver/solver-core/tests/score_property.rs`

- [ ] **Step 1: Read the existing file to confirm the proptest harness shape**

Run: `cat solver/solver-core/tests/score_property.rs | head -40`

- [ ] **Step 2: Add two properties at the bottom of the file**

Append:

```rust
proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    /// score_solution scales linearly in tb.position for a single
    /// prefer_early_periods placement when only that weight is non-zero.
    #[test]
    fn property_score_solution_linear_in_position_for_prefer_early(
        position in 0u8..7,
        weight in 1u32..10,
    ) {
        let subject_id = SubjectId(Uuid::from_u128(0xAA));
        let lesson_id = LessonId(Uuid::from_u128(0xBB));
        let class_id = SchoolClassId(Uuid::from_u128(0xCC));
        let teacher_id = TeacherId(Uuid::from_u128(0xDD));
        let room_id = RoomId(Uuid::from_u128(0xEE));
        let tb_id = TimeBlockId(Uuid::from_u128(0xFF));
        let problem = Problem {
            time_blocks: vec![TimeBlock { id: tb_id, day_of_week: 0, position }],
            teachers: vec![Teacher { id: teacher_id, max_hours_per_week: 10 }],
            rooms: vec![Room { id: room_id }],
            subjects: vec![Subject {
                id: subject_id,
                prefer_early_periods: true,
                avoid_first_period: false,
            }],
            school_classes: vec![SchoolClass { id: class_id }],
            lessons: vec![Lesson {
                id: lesson_id,
                school_class_id: class_id,
                subject_id,
                teacher_id,
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification { teacher_id, subject_id }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        let placements = [Placement { lesson_id, time_block_id: tb_id, room_id }];
        let weights = ConstraintWeights {
            prefer_early_period: weight,
            ..ConstraintWeights::default()
        };
        prop_assert_eq!(
            score_solution(&problem, &placements, &weights),
            u32::from(position) * weight
        );
    }

    /// score_solution returns weight at position 0 and 0 elsewhere for an
    /// avoid_first_period subject when only that weight is non-zero.
    #[test]
    fn property_score_solution_avoid_first_only_at_position_zero(
        position in 0u8..7,
        weight in 1u32..10,
    ) {
        let subject_id = SubjectId(Uuid::from_u128(0xAA));
        let lesson_id = LessonId(Uuid::from_u128(0xBB));
        let class_id = SchoolClassId(Uuid::from_u128(0xCC));
        let teacher_id = TeacherId(Uuid::from_u128(0xDD));
        let room_id = RoomId(Uuid::from_u128(0xEE));
        let tb_id = TimeBlockId(Uuid::from_u128(0xFF));
        let problem = Problem {
            time_blocks: vec![TimeBlock { id: tb_id, day_of_week: 0, position }],
            teachers: vec![Teacher { id: teacher_id, max_hours_per_week: 10 }],
            rooms: vec![Room { id: room_id }],
            subjects: vec![Subject {
                id: subject_id,
                prefer_early_periods: false,
                avoid_first_period: true,
            }],
            school_classes: vec![SchoolClass { id: class_id }],
            lessons: vec![Lesson {
                id: lesson_id,
                school_class_id: class_id,
                subject_id,
                teacher_id,
                hours_per_week: 1,
            }],
            teacher_qualifications: vec![TeacherQualification { teacher_id, subject_id }],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };
        let placements = [Placement { lesson_id, time_block_id: tb_id, room_id }];
        let weights = ConstraintWeights {
            avoid_first_period: weight,
            ..ConstraintWeights::default()
        };
        let expected = if position == 0 { weight } else { 0 };
        prop_assert_eq!(score_solution(&problem, &placements, &weights), expected);
    }
}
```

If the existing file does not import `Uuid`, add `use uuid::Uuid;` at the top. If existing items use a different identifier helper, follow that pattern. If `proptest!` is already declared once, append the two properties inside the existing block instead of starting a new one.

- [ ] **Step 3: Run `cargo nextest run -p solver-core --test score_property`**

Expected: PASS for all properties (including any pre-existing ones).

### Task 1.8: Update bench fixtures to mark the same subjects the seeds will

**Files:**
- Modify: `solver/solver-core/benches/solver_fixtures.rs`

- [ ] **Step 1: Read the existing fixture builders to locate where subjects are constructed**

Run: `grep -n "subject_ids\|short_codes\|Subject {" /home/pascal/Code/Klassenzeit/solver/solver-core/benches/solver_fixtures.rs`

The two `.map(|id| Subject { id: *id, prefer_early_periods: false, avoid_first_period: false }).collect()` sites updated in Task 1.1 sit at lines 82 and 176.

- [ ] **Step 2: Replace the two `.map(...)` sites with helper-driven flag assignment matching the seed**

For both fixtures (grundschule and zweizuegig), the subject short-codes follow `_SUBJECTS` from `backend/src/klassenzeit_backend/seed/demo_grundschule.py`: `D`, `M`, `SU`, `RE`, `E`, `KU`, `MU`, `SP`, `FÖ` (in order). Mathematik (`M`) and Deutsch (`D`) get `prefer_early_periods=true`; Sport (`SP`) gets `avoid_first_period=true`. Bench fixture's `subject_ids` is a `Vec<SubjectId>` aligned with that authoring order.

Replace each `.map(...)` site with:

```rust
    let subjects: Vec<Subject> = subject_ids
        .iter()
        .enumerate()
        .map(|(i, id)| Subject {
            id: *id,
            prefer_early_periods: matches!(i, 0 | 1), // index 0 = Deutsch, 1 = Mathematik
            avoid_first_period: i == 7,                // index 7 = Sport
        })
        .collect();
```

If the surrounding bench builder uses a non-zero-based index or a different authoring order, follow whatever short-code list the function uses; the rule is "Mathematik + Deutsch get prefer-early; Sport gets avoid-first; everything else stays default".

- [ ] **Step 3: Run `cargo bench -p solver-core --no-run`**

Expected: PASS (bench compiles).

### Task 1.9: Run the full Rust test suite plus lint, then commit

- [ ] **Step 1: Full Rust suite**

Run: `mise run test:rust`
Expected: PASS for all unit, integration, property tests.

- [ ] **Step 2: Workspace clippy**

Run: `mise run lint:rust`
Expected: PASS (no warnings).

- [ ] **Step 3: Commit**

```bash
git add solver/
git commit -m "feat(solver-core): subject preferences scoring axes"
```

---

## Commit 2: `feat(backend): subject preference flags + solver wiring`

Lands the Python side: ORM column, Alembic migration, Pydantic schemas, `solver_io` JSON shape, demo seed updates, and tests.

### Task 2.1: Extend the `_SubjectSpec` NamedTuple and ORM model

**Files:**
- Modify: `backend/src/klassenzeit_backend/db/models/subject.py`

- [ ] **Step 1: Read the current ORM model**

Run: `cat /home/pascal/Code/Klassenzeit/backend/src/klassenzeit_backend/db/models/subject.py`

- [ ] **Step 2: Add the two new columns to the ORM model**

Modify `backend/src/klassenzeit_backend/db/models/subject.py` to add the imports and columns:

```python
"""Subject ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from klassenzeit_backend.db.base import Base


class Subject(Base):
    """A school subject (e.g. Mathematik, Deutsch, Sport)."""

    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(String(100), unique=True)
    short_name: Mapped[str] = mapped_column(String(10), unique=True)
    color: Mapped[str] = mapped_column(String(16))
    prefer_early_periods: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    avoid_first_period: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

### Task 2.2: Generate and tidy the Alembic migration

**Files:**
- Create: `backend/migrations/versions/<rev>_add_subject_preference_columns.py`

- [ ] **Step 1: Locate the most recent migration and identify the previous revision id**

Run: `ls -t /home/pascal/Code/Klassenzeit/backend/migrations/versions/*.py | head -1`
Run: `head -20 <that file>` to find the `revision` string.

- [ ] **Step 2: Generate the migration via Alembic autogenerate**

Run: `cd /home/pascal/Code/Klassenzeit && mise run db:up && uv run alembic -c backend/alembic.ini revision --autogenerate -m "add subject preference columns"`

(Requires `KZ_DATABASE_URL` to point at the local dev DB. The existing `mise run dev` flow assumes the dev DB is running.)

Expected: A new file in `backend/migrations/versions/` named like `<hash>_add_subject_preference_columns.py`.

- [ ] **Step 3: Tidy the autogenerated revision per project style**

Open the new file. Replace any `typing.Sequence` import with `from collections.abc import Sequence`. Replace `typing.Union[X, Y]` with `X | Y`. Confirm the upgrade body matches:

```python
def upgrade() -> None:
    op.add_column(
        "subjects",
        sa.Column(
            "prefer_early_periods",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "subjects",
        sa.Column(
            "avoid_first_period",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("subjects", "avoid_first_period")
    op.drop_column("subjects", "prefer_early_periods")
```

- [ ] **Step 4: Run the migration locally**

Run: `mise run db:migrate`
Expected: Migration applies successfully.

- [ ] **Step 5: Run the migration's downgrade and re-upgrade as a smoke test**

Run: `uv run alembic -c backend/alembic.ini downgrade -1`
Expected: PASS, columns dropped.
Run: `uv run alembic -c backend/alembic.ini upgrade head`
Expected: PASS, columns recreated.

### Task 2.3: Extend Pydantic schemas

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/schemas/subject.py`

- [ ] **Step 1: Add a failing test for the schema round-trip**

Append to `/home/pascal/Code/Klassenzeit/backend/tests/scheduling/test_subjects.py` (locate an existing test for SubjectCreate to follow the pattern):

```python
async def test_subject_create_accepts_preference_flags(client) -> None:
    res = await client.post(
        "/api/subjects",
        json={
            "name": "Test prefer early",
            "short_name": "PE",
            "color": "chart-1",
            "prefer_early_periods": True,
            "avoid_first_period": False,
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["prefer_early_periods"] is True
    assert body["avoid_first_period"] is False


async def test_subject_create_defaults_preference_flags_to_false(client) -> None:
    res = await client.post(
        "/api/subjects",
        json={"name": "Test default", "short_name": "TD", "color": "chart-1"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["prefer_early_periods"] is False
    assert body["avoid_first_period"] is False


async def test_subject_update_patches_preference_flags(client) -> None:
    res = await client.post(
        "/api/subjects",
        json={"name": "Test update", "short_name": "TU", "color": "chart-1"},
    )
    subject_id = res.json()["id"]

    res = await client.patch(
        f"/api/subjects/{subject_id}",
        json={"avoid_first_period": True},
    )
    assert res.status_code == 200
    assert res.json()["avoid_first_period"] is True
    # prefer_early stays untouched.
    assert res.json()["prefer_early_periods"] is False
```

(Use the existing test fixtures and async pattern; mirror the local test conventions in `test_subjects.py`. The exact `client` fixture name may differ; reuse whichever the existing tests in the same file use.)

- [ ] **Step 2: Run the failing tests**

Run: `mise run test:py -- backend/tests/scheduling/test_subjects.py -v`
Expected: FAIL on the three new tests (Pydantic rejects unknown fields).

- [ ] **Step 3: Extend the Pydantic schemas**

Replace `backend/src/klassenzeit_backend/scheduling/schemas/subject.py` with:

```python
"""Pydantic schemas for subject routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

COLOR_PATTERN = r"^(chart-(1[0-2]|[1-9])|#[0-9a-fA-F]{6})$"


class SubjectCreate(BaseModel):
    """Request body for creating a subject."""

    name: str
    short_name: str
    color: str = Field(pattern=COLOR_PATTERN)
    prefer_early_periods: bool = False
    avoid_first_period: bool = False


class SubjectUpdate(BaseModel):
    """Request body for patching a subject."""

    name: str | None = None
    short_name: str | None = None
    color: str | None = Field(default=None, pattern=COLOR_PATTERN)
    prefer_early_periods: bool | None = None
    avoid_first_period: bool | None = None


class SubjectResponse(BaseModel):
    """Response body for a subject."""

    id: uuid.UUID
    name: str
    short_name: str
    color: str
    prefer_early_periods: bool
    avoid_first_period: bool
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: If the route handler reads/writes specific fields, extend it to handle the two new ones**

Run: `grep -n "prefer_early_periods\|avoid_first_period\|short_name\|color" /home/pascal/Code/Klassenzeit/backend/src/klassenzeit_backend/scheduling/routes/subjects.py`

If the create handler uses `Subject(**payload.model_dump())`, the new fields flow through automatically. If it constructs `Subject(name=..., short_name=..., color=...)` field-by-field, append `prefer_early_periods=payload.prefer_early_periods` and `avoid_first_period=payload.avoid_first_period`. Same for the patch handler's `setattr(subject, field, value)` loop.

- [ ] **Step 5: Run the failing tests**

Run: `mise run test:py -- backend/tests/scheduling/test_subjects.py -v`
Expected: PASS for the three new tests plus all existing subject tests.

### Task 2.4: Extend `solver_io.build_problem_json` to emit the new keys

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/solver_io.py`

- [ ] **Step 1: Add a failing test for the JSON shape**

Append to `/home/pascal/Code/Klassenzeit/backend/tests/scheduling/test_solver_io.py`:

```python
async def test_build_problem_json_emits_subject_preference_flags(
    db_session, create_subject
) -> None:
    """The solver consumes Subject.prefer_early_periods and avoid_first_period;
    the wire format must include them so the Rust deserialiser sees the fields."""
    from klassenzeit_backend.scheduling.solver_io import build_problem_json

    subject = await create_subject(
        db_session,
        name="Mathematik",
        short_name="M",
        color="chart-2",
        prefer_early_periods=True,
        avoid_first_period=False,
    )
    problem = await build_problem_json(db_session, school_class_id=None)

    matched = next(s for s in problem["subjects"] if s["id"] == str(subject.id))
    assert matched["prefer_early_periods"] is True
    assert matched["avoid_first_period"] is False
```

(Adjust the `build_problem_json` arguments to match the actual signature; if it requires a `school_class_id`, scope this test to a per-class problem and seed a class + lesson too. The existing `test_solver_io.py` patterns show the right shape; mirror them.)

- [ ] **Step 2: Run the failing test**

Run: `mise run test:py -- backend/tests/scheduling/test_solver_io.py -v`
Expected: FAIL (KeyError or missing keys).

- [ ] **Step 3: Extend the JSON build**

In `solver_io.py`, find the `subjects` list comprehension that emits each subject as a dict. It currently looks roughly like:

```python
"subjects": [{"id": str(s.id)} for s in subjects],
```

Replace with:

```python
"subjects": [
    {
        "id": str(s.id),
        "prefer_early_periods": s.prefer_early_periods,
        "avoid_first_period": s.avoid_first_period,
    }
    for s in subjects
],
```

- [ ] **Step 4: Run the failing test**

Run: `mise run test:py -- backend/tests/scheduling/test_solver_io.py -v`
Expected: PASS.

### Task 2.5: Extend the `_SubjectSpec` and seed the flags

**Files:**
- Modify: `backend/src/klassenzeit_backend/seed/demo_grundschule.py`

- [ ] **Step 1: Extend the `_SubjectSpec` NamedTuple**

Replace lines 52-68 in `demo_grundschule.py`:

```python
class _SubjectSpec(NamedTuple):
    name: str
    short_name: str
    color: str
    prefer_early_periods: bool = False
    avoid_first_period: bool = False


_SUBJECTS: tuple[_SubjectSpec, ...] = (
    _SubjectSpec("Deutsch", "D", "chart-1", prefer_early_periods=True),
    _SubjectSpec("Mathematik", "M", "chart-2", prefer_early_periods=True),
    _SubjectSpec("Sachunterricht", "SU", "chart-3"),
    _SubjectSpec("Religion / Ethik", "RE", "chart-4"),
    _SubjectSpec("Englisch", "E", "chart-5"),
    _SubjectSpec("Kunst", "KU", "chart-1"),
    _SubjectSpec("Musik", "MU", "chart-3"),
    _SubjectSpec("Sport", "SP", "chart-4", avoid_first_period=True),
    _SubjectSpec("Förderunterricht", "FÖ", "chart-5"),
)
```

- [ ] **Step 2: Update the Subject construction line to forward the flags**

Find line 183 (`subject = Subject(name=spec.name, short_name=spec.short_name, color=spec.color)`) and replace with:

```python
subject = Subject(
    name=spec.name,
    short_name=spec.short_name,
    color=spec.color,
    prefer_early_periods=spec.prefer_early_periods,
    avoid_first_period=spec.avoid_first_period,
)
```

- [ ] **Step 3: Confirm the zweizuegig seed inherits the change**

Run: `grep -n "_SUBJECTS\|_SubjectSpec\|prefer_early_periods" /home/pascal/Code/Klassenzeit/backend/src/klassenzeit_backend/seed/demo_grundschule_zweizuegig.py`

If it imports `_SUBJECTS` from `demo_grundschule.py`, no further edit is needed. If it duplicates the data, mirror the same flags here.

- [ ] **Step 4: Run the seed solvability tests**

Run: `mise run test:py -- backend/tests/seed -v`
Expected: PASS (the seed flags should not break placement; the active-default weight = 1 for each axis is small enough not to push existing fixture solutions out of feasibility).

### Task 2.6: Run backend tests + lint, then commit

- [ ] **Step 1: Full backend suite**

Run: `mise run test:py`
Expected: PASS.

- [ ] **Step 2: Backend lint**

Run: `mise run lint:py`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/
git commit -m "feat(backend): subject preference flags and solver wiring"
```

---

## Commit 3: `feat(frontend): subject preference checkboxes in edit dialog`

Lands the React surface: regenerated OpenAPI types, Zod schema, two checkboxes inside the subject edit dialog, four i18n keys per locale, Vitest coverage.

### Task 3.1: Regenerate OpenAPI types

**Files:**
- Modify: `frontend/src/api/types.gen.ts` (auto-generated)

- [ ] **Step 1: Start the backend so the OpenAPI schema is reachable**

Run: `mise run dev` (in a separate terminal, leave running) or whatever the local pattern is for this repo.

- [ ] **Step 2: Regenerate**

Run: `mise run fe:types`
Expected: `frontend/src/api/types.gen.ts` updated; `prefer_early_periods` and `avoid_first_period` now appear inside the `SubjectCreate` / `SubjectUpdate` / `SubjectResponse` types.

- [ ] **Step 3: Verify the diff**

Run: `git diff frontend/src/api/types.gen.ts | grep -A1 -B1 "prefer_early_periods\|avoid_first_period"`
Expected: shows the new fields on the three Subject types.

### Task 3.2: Extend the Zod schema

**Files:**
- Modify: `frontend/src/features/subjects/schema.ts`

- [ ] **Step 1: Add the new fields to `SubjectSchema`**

Open `frontend/src/features/subjects/schema.ts`, locate `SubjectSchema`, and add:

```ts
  prefer_early_periods: z.boolean().default(false),
  avoid_first_period: z.boolean().default(false),
```

Inside the `z.object({ ... })` literal alongside the existing `name`, `short_name`, `color` fields.

- [ ] **Step 2: Run the frontend type check**

Run: `mise run fe:test -- --run`
Expected: existing tests still pass; no new type errors.

### Task 3.3: Add the two checkboxes inside the create / edit dialog

**Files:**
- Modify: `frontend/src/features/subjects/subjects-dialogs.tsx`

- [ ] **Step 1: Add a failing Vitest assertion**

Open the existing `frontend/src/features/subjects/subjects-page.test.tsx` (or wherever subject dialog tests live; if no test file exists, create `frontend/src/features/subjects/subjects-dialogs.test.tsx` mirroring the existing `subject-multi-picker.test.tsx` setup).

Add:

```tsx
test("create dialog renders prefer-early-periods and avoid-first-period checkboxes", async () => {
  const user = userEvent.setup();
  renderWithProviders(<SubjectsPage />);
  await user.click(await screen.findByRole("button", { name: /add subject|neues fach/i }));
  expect(
    screen.getByRole("checkbox", { name: /prefer early periods|frühe stunden/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: /avoid the first period|erste stunde vermeiden/i }),
  ).toBeInTheDocument();
});

test("submitting create dialog with both checkboxes ticked sends both fields", async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  // ... wire fetchSpy via MSW or the existing test pattern in this repo's frontend ...
  renderWithProviders(<SubjectsPage />);
  await user.click(await screen.findByRole("button", { name: /add subject|neues fach/i }));
  await user.type(screen.getByLabelText(/name/i), "Test");
  await user.type(screen.getByLabelText(/short name|kurzname/i), "TS");
  await user.click(screen.getByRole("checkbox", { name: /prefer early periods|frühe stunden/i }));
  await user.click(screen.getByRole("checkbox", { name: /avoid the first period|erste stunde vermeiden/i }));
  await user.click(screen.getByRole("button", { name: /save|speichern/i }));
  await waitFor(() => {
    const lastCall = fetchSpy.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const body = JSON.parse(lastCall![1]?.body as string);
    expect(body.prefer_early_periods).toBe(true);
    expect(body.avoid_first_period).toBe(true);
  });
});
```

(Adapt the "Add subject" / "Save" labels and fetch-spy plumbing to match this repo's patterns. Look at `frontend/src/features/subjects/subjects-page.test.tsx` if it exists, or the closest entity-page test, e.g. `frontend/src/features/rooms/rooms-page.test.tsx` for the MSW setup pattern.)

- [ ] **Step 2: Run the failing tests**

Run: `mise run fe:test -- --run subjects`
Expected: FAIL (checkboxes not rendered).

- [ ] **Step 3: Add the checkboxes inside `subjects-dialogs.tsx`**

Locate the form body inside `SubjectsCreateDialog` / `SubjectsEditDialog`. After the color picker block, insert two checkbox rows. Use the existing react-hook-form `Controller` pattern. Each checkbox is a `<Checkbox>` from shadcn (`frontend/src/components/ui/checkbox.tsx`); wrap with a label and help text. Pseudocode:

```tsx
<FormField
  control={form.control}
  name="prefer_early_periods"
  render={({ field }) => (
    <FormItem className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <FormControl>
          <Checkbox
            checked={field.value}
            onCheckedChange={field.onChange}
            id="subject-prefer-early"
          />
        </FormControl>
        <FormLabel htmlFor="subject-prefer-early">
          {t("subjects.fields.preferEarlyPeriods.label")}
        </FormLabel>
      </div>
      <FormDescription>{t("subjects.fields.preferEarlyPeriods.help")}</FormDescription>
    </FormItem>
  )}
/>
<FormField
  control={form.control}
  name="avoid_first_period"
  render={({ field }) => (
    <FormItem className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <FormControl>
          <Checkbox
            checked={field.value}
            onCheckedChange={field.onChange}
            id="subject-avoid-first"
          />
        </FormControl>
        <FormLabel htmlFor="subject-avoid-first">
          {t("subjects.fields.avoidFirstPeriod.label")}
        </FormLabel>
      </div>
      <FormDescription>{t("subjects.fields.avoidFirstPeriod.help")}</FormDescription>
    </FormItem>
  )}
/>
```

If the existing form uses a different set of imports for `FormField` / `FormItem` / `FormLabel` / `FormDescription` (e.g. the local `frontend/src/components/ui/form.tsx`), import from there. If `Checkbox` does not yet exist in `frontend/src/components/ui/`, add the shadcn-style component first via `npx shadcn-ui@latest add checkbox` from inside `frontend/`, then import.

Update the create dialog's default values to include both fields as `false` so the form's `useForm({ defaultValues: ... })` initialiser stays in sync with the schema.

- [ ] **Step 4: Run the failing tests**

Run: `mise run fe:test -- --run subjects`
Expected: PASS for the two new tests plus all existing subject tests.

### Task 3.4: Add the i18n keys

**Files:**
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/de.json`

- [ ] **Step 1: Add the four English keys**

Locate the `subjects.fields` namespace in `frontend/src/i18n/locales/en.json` and append:

```json
"preferEarlyPeriods": {
  "label": "Prefer early periods",
  "help": "Schedule lessons of this subject earlier in the day when possible (e.g. Hauptfächer)."
},
"avoidFirstPeriod": {
  "label": "Avoid the first period",
  "help": "Avoid scheduling lessons of this subject in the very first period of the day (e.g. Sport)."
}
```

- [ ] **Step 2: Add the four German keys**

In `frontend/src/i18n/locales/de.json`:

```json
"preferEarlyPeriods": {
  "label": "Frühe Stunden bevorzugen",
  "help": "Stunden dieses Fachs möglichst früh am Tag einplanen (z. B. Hauptfächer)."
},
"avoidFirstPeriod": {
  "label": "Erste Stunde vermeiden",
  "help": "Stunden dieses Fachs nicht in die erste Stunde des Tages legen (z. B. Sport)."
}
```

- [ ] **Step 3: Run the frontend test suite**

Run: `mise run fe:test -- --run`
Expected: PASS for all tests.

### Task 3.5: Run frontend lint + typecheck, then commit

- [ ] **Step 1: Frontend lint and typecheck**

Run: `mise run lint`
Expected: PASS (ruff, ty, vulture, biome, clippy, machete, actionlint all green).

- [ ] **Step 2: Run the full test suite**

Run: `mise run test`
Expected: PASS for Rust + Python + frontend.

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): subject preference checkboxes in edit dialog"
```

---

## Commit 4: `docs: subject preferences ADR + OPEN_THINGS update`

Lands the documentation: ADR 0017, OPEN_THINGS update marking the sprint item closed plus follow-ups, and the bench `BASELINE.md` refresh only if the diff exceeds 20%.

### Task 4.1: Run the bench and decide whether to refresh `BASELINE.md`

**Files:**
- Maybe-modify: `solver/solver-core/benches/BASELINE.md`

- [ ] **Step 1: Run the bench**

Run: `mise run bench`
Expected: criterion output shows p50 numbers for grundschule and zweizuegig fixtures.

- [ ] **Step 2: Compare to the existing `BASELINE.md`**

Read `solver/solver-core/benches/BASELINE.md`. The committed numbers were: grundschule p50 51 µs greedy / 200 ms LAHC; zweizuegig p50 243 µs greedy / 200 ms LAHC.

If the bench's p50 stays within 20% of the existing values per fixture (i.e. grundschule ≤ 61 µs, zweizuegig ≤ 292 µs for greedy mode), do not refresh. Note the diff in the PR body and skip to Task 4.2.

If the bench breaches 20%, optimise:
- Move the `subject_lookup` build out of the hot loop in `score_solution` and `try_place_hour`. The cheapest move is computing the per-tb subject contribution once per `(subject_id, tb)` pair via a `HashMap<(SubjectId, TimeBlockId), u32>` cache; for the greedy this is amortised over rooms.
- Use a `Vec<u32>` indexed by subject's position in `problem.subjects` instead of a `HashMap`.

Re-bench. If still breaching, refresh:

Run: `mise run bench:record`
Expected: `solver/solver-core/benches/BASELINE.md` updated.

### Task 4.2: Add ADR 0017

**Files:**
- Create: `docs/adr/0017-subject-preferences.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: Verify ADR 0017 is still available**

Run: `ls /home/pascal/Code/Klassenzeit/docs/adr/*.md | sort | tail -1`
Expected: `0016-structured-logging.md`.

- [ ] **Step 2: Read the existing ADR template**

Run: `cat /home/pascal/Code/Klassenzeit/docs/adr/template.md`

- [ ] **Step 3: Create the ADR**

Use this content for `docs/adr/0017-subject-preferences.md`:

```markdown
# 0017: Subject-level pedagogy preferences

Date: 2026-04-28
Status: Accepted
Supersedes: none
Superseded-by: none

## Context

The solver's soft-constraint surface after PR-9a (gap-counting infrastructure) and PR-9b (LAHC) carries only structural axes (`class_gap`, `teacher_gap`). Real-world Hessen Grundschule complaints map to per-subject pedagogy axes: "Hauptfächer früh", "Sport nicht in der ersten Stunde". Without subject-level scoring axes, LAHC's local search has nothing to chase past compactness; PR-9b's bench numbers showed `Soft score = 0/0` and `2/2` precisely because the gap-only weights produce a single-Change-move local minimum on the seed fixtures.

## Decision

PR-9c adds two orthogonal subject-level soft-constraint axes:

1. `Subject.prefer_early_periods: bool` plus `ConstraintWeights.prefer_early_period: u32`. Per-placement penalty is `tb.position * weight` for flagged subjects.
2. `Subject.avoid_first_period: bool` plus `ConstraintWeights.avoid_first_period: u32`. Per-placement penalty is `weight` if `tb.position == 0` for flagged subjects.

`solve()`'s active default is `1` for each new weight; `ConstraintWeights::default()` keeps zeros. The two flags live as direct fields on the `Subject` struct (Rust + ORM + Pydantic + Zod), not on a join-table or an enum. `score_solution` adds a per-placement loop after the existing partition logic; LAHC and the lowest-delta greedy share a single `pub(crate) fn subject_preference_score` helper that is allocation-free and `O(1)` per call.

## Consequences

### Positive

- LAHC's local search has new per-subject axes to chase; soft-score reduction becomes visible on bench fixtures.
- Schools express the most common pedagogy rules ("Hauptfächer früh", "Sport nicht zuerst") through the existing CRUD UI without any code change.
- Adding a third axis later is a one-field extension on `Subject` plus a matching weight, not a schema rewrite.
- Active defaults keep production callers unchanged from the previous release: `solve()` continues to optimise both gap and pedagogy axes with weight 1 each.

### Negative

- Wire format breakage: any external consumer of the `Problem` JSON must pass the two new fields. Mitigated by the same-PR backend update.
- Per-placement scoring loop adds `O(placements)` work to `score_solution` and `try_place_hour`'s candidate evaluation. Mitigated by hoisting the subject lookup once per solve.
- Boolean flags do not express "Mathematik is more strongly early than Deutsch". When that need surfaces, the booleans become weights; covered by the "configurable per-subject weights" follow-up.

### Considered alternatives

- **Single enum `preference_kind`.** Rejected because the two axes are orthogonal: a subject could plausibly want both ("Hauptfach but also not first slot"). Enum forces a single choice.
- **Join table `subject_preferences(subject_id, kind)`.** Rejected as schema overhead for what is conceptually a 1:1 property of Subject.
- **Linear `tb.position * weight` for avoid-first too.** Rejected because the real-world rule is binary ("Sport at 08:00 is bad"), not graded.

## References

- Spec: `docs/superpowers/specs/2026-04-28-subject-preferences-design.md`.
- OPEN_THINGS sprint item #9c.
- ADR 0013 (typed violations), 0014 (SolveConfig), 0015 (LAHC) for the surrounding solver-quality sprint.
```

- [ ] **Step 4: Update the ADR index**

Edit `docs/adr/README.md` and add a row for ADR 0017:

```markdown
| 0017 | [Subject-level pedagogy preferences](0017-subject-preferences.md) | Accepted |
```

(Match the table format of the existing rows.)

### Task 4.3: Update OPEN_THINGS

**Files:**
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Mark sprint item #9 fully shipped**

Find the "Subject-level pedagogy preferences (sprint item 9, post-LAHC follow-up)" entry under "Acknowledged deferrals" (around line 64). Replace it with a "Shipped 2026-04-28" mention under sprint item #9 in the Algorithm phase section, in the same shape PR-9b's entry uses. Specifically:

In the "Algorithm phase" section, append to item 9:

> Shipped 2026-04-28 in PR `feat/subject-preferences`. Two new soft-constraint axes (`prefer_early_period` linear in `tb.position`, `avoid_first_period` binary at `tb.position == 0`); two new boolean fields on `Subject` (`prefer_early_periods`, `avoid_first_period`). Active default weights `(1, 1, 1, 1)`. Demo seeds mark Mathematik + Deutsch as `prefer_early_periods=True` and Sport as `avoid_first_period=True`. Bench fixture mirrors the same flags; `BASELINE.md` <refresh status, fill in based on Task 4.1 outcome>. Frontend renders two checkboxes inside the subject edit dialog, plus en/de i18n. ADR 0017 records the decision.

Remove the matching "Subject-level pedagogy preferences" entry under "Acknowledged deferrals" (since the deferral resolved).

Add a follow-up under "Acknowledged deferrals":

- **Configurable per-subject preference weights.** Replace `prefer_early_periods: bool` / `avoid_first_period: bool` with `u32` weights when a school wants to express "Mathematik is more strongly early than Deutsch". Surfaced during PR-9c.

- **Subjects table column for preference flags.** A check-mark or icon column next to each subject in the list view. Skipped in PR-9c because two boolean columns clutter the existing four-column row; revisit when users say they cannot see at-a-glance which subjects are flagged. Surfaced during PR-9c.

- **Per-class subject preference overrides.** A class wanting "Sport last period despite the global avoid-first flag" needs a `school_class_subject_preferences` table. Surfaced during PR-9c.

- **Third axis: avoid last period.** Symmetric to `avoid_first_period`. Defer until a school complains about Hauptfächer in the last slot. Surfaced during PR-9c.

### Task 4.4: Final commit

- [ ] **Step 1: Stage and commit**

```bash
git add docs/
git commit -m "docs: subject preferences ADR and OPEN_THINGS update"
```

If `BASELINE.md` was refreshed in Task 4.1, include `solver/solver-core/benches/BASELINE.md` in the same commit.

- [ ] **Step 2: Final smoke**

Run: `mise run test`
Expected: PASS.
Run: `mise run lint`
Expected: PASS.

---

## Self-review notes

- **Spec coverage:** every section of `2026-04-28-subject-preferences-design.md` maps to a task above (types: 1.1; score: 1.2-1.3; greedy: 1.4; LAHC: 1.5; active defaults: 1.6; properties: 1.7; bench fixture: 1.8; migration: 2.2; ORM: 2.1; Pydantic: 2.3; solver_io: 2.4; seed: 2.5; OpenAPI types: 3.1; Zod: 3.2; checkboxes: 3.3; i18n: 3.4; ADR: 4.2; OPEN_THINGS: 4.3; bench refresh: 4.1).
- **Placeholder scan:** no "TBD" or "fill in details" inside the task bodies; all code blocks are concrete.
- **Type consistency:** `subject_preference_score` signature `(subject: &Subject, tb: &TimeBlock, weights: &ConstraintWeights) -> u32` is identical at every callsite (Tasks 1.2, 1.3, 1.4, 1.5). `prefer_early_periods` / `avoid_first_period` field names are consistent across Rust struct, ORM column, Pydantic field, OpenAPI key, Zod field, i18n key prefix.
- **Risks:** the autogenerated migration may emit `typing.Sequence` / `typing.Union` (project rule says use PEP 604 + `collections.abc.Sequence`); Task 2.2 step 3 explicitly tidies that.
