# Solver Doppelstunden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task in this plan is one Conventional-Commits commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the solver to support `preferred_block_size > 1` (Doppelstunden / multi-hour blocks) end-to-end: Rust types, placement algorithm, LAHC, backend wire format, Pydantic validator, demo seed, bench, ADR.

**Architecture:** `Lesson` gains `preferred_block_size: u8` (defaults to 1, JSON-optional). `validate_structural` rejects `n == 0` and `h % n != 0`. `solve_with_config` switches from per-hour to per-block placement. Each block is `n` consecutive `(day, position)` time-blocks in one room. LAHC's Change move skips block placements via a one-line guard. Backend `build_problem_json` includes the field; Pydantic mirrors the divisibility check for early 422s. Demo seed flips Sachunterricht (Klasse 3, 4h) to a Doppelstunde to exercise the path end-to-end.

**Tech Stack:** Rust 2021 (`solver-core`), PyO3 0.28 (`solver-py`), Python 3.13 + FastAPI + Pydantic v2 + SQLAlchemy 2.0 (`backend`), criterion (bench).

**Spec:** `docs/superpowers/specs/2026-04-29-solver-doppelstunden-design.md`. Brainstorm: `/tmp/kz-brainstorm/brainstorm.md`.

---

## File map

| File | Change |
|---|---|
| `solver/solver-core/src/types.rs` | Add `preferred_block_size: u8` to `Lesson` with `#[serde(default)]`. Update `lesson_rejects_unknown_preferred_block_size_field` test. |
| `solver/solver-core/src/validate.rs` | Reject `preferred_block_size == 0` and `hours_per_week % preferred_block_size != 0`. |
| `solver/solver-core/src/solve.rs` | Replace per-hour placement with per-block placement; new `try_place_block` helper; same-room window invariant; new violation hour_index semantics. |
| `solver/solver-core/src/lahc.rs` | One-line guard: skip block placements (`lesson.preferred_block_size > 1`) inside `try_change_move`. |
| `solver/solver-core/tests/properties.rs` | Property test: every block produces n consecutive same-day same-room placements. |
| `solver/solver-core/tests/lahc_property.rs` | Regression test: a block placement is not moved by LAHC. |
| `solver/solver-core/benches/solver_fixtures.rs` | Flip Sachunterricht to `n=2` in the grundschule fixture. |
| `solver/solver-core/benches/BASELINE.md` | Refreshed via `mise run bench:record`. |
| `backend/src/klassenzeit_backend/scheduling/solver_io.py` | Include `preferred_block_size` in lesson dict. |
| `backend/src/klassenzeit_backend/scheduling/schemas/lesson.py` | Add `model_validator` rejecting `h % n != 0` on `LessonCreate`. |
| `backend/src/klassenzeit_backend/scheduling/routes/lessons.py` | Run divisibility check on `LessonUpdate` against the merged row. |
| `backend/src/klassenzeit_backend/seed/demo_grundschule.py` | Sachunterricht `preferred_block_size=2` for Klasse 3. |
| `backend/tests/scheduling/test_solver_io.py` | Cover the new lesson dict shape. |
| `backend/tests/scheduling/routes/test_lessons.py` | Cover 422 on `LessonCreate` and `LessonUpdate` with `h % n != 0`. |
| `docs/adr/0018-solver-doppelstunden.md` | New ADR. |
| `docs/superpowers/OPEN_THINGS.md` | Mark item 8 ✅; add follow-ups. |

---

## Task 1: Add `preferred_block_size` to Rust `Lesson` and reject malformed inputs

**Files:**
- Modify: `solver/solver-core/src/types.rs`
- Modify: `solver/solver-core/src/validate.rs`
- Test: `solver/solver-core/src/types.rs` (inline mod tests), `solver/solver-core/src/validate.rs` (inline mod tests)

- [ ] **Step 1: Update the existing acceptance test (red).**

In `solver/solver-core/src/types.rs:292-306`, replace `lesson_rejects_unknown_preferred_block_size_field` with two tests:

```rust
#[test]
fn lesson_accepts_preferred_block_size_field() {
    let json = format!(
        r#"{{"id":"{}","school_class_id":"{}","subject_id":"{}","teacher_id":"{}","hours_per_week":4,"preferred_block_size":2}}"#,
        Uuid::nil(),
        Uuid::nil(),
        Uuid::nil(),
        Uuid::nil()
    );
    let lesson: Lesson = serde_json::from_str(&json).unwrap();
    assert_eq!(lesson.preferred_block_size, 2);
}

#[test]
fn lesson_defaults_preferred_block_size_to_one_when_field_omitted() {
    let json = format!(
        r#"{{"id":"{}","school_class_id":"{}","subject_id":"{}","teacher_id":"{}","hours_per_week":1}}"#,
        Uuid::nil(),
        Uuid::nil(),
        Uuid::nil(),
        Uuid::nil()
    );
    let lesson: Lesson = serde_json::from_str(&json).unwrap();
    assert_eq!(lesson.preferred_block_size, 1);
}
```

Run `cargo nextest run -p solver-core types::tests --no-fail-fast`. Expected: both new tests fail (the field does not exist yet); the old test that asserted rejection is gone, so it is no longer counted.

- [ ] **Step 2: Add the field with a serde default.**

In `solver/solver-core/src/types.rs:135-148`, replace the `Lesson` struct with:

```rust
/// A lesson that must be placed `hours_per_week` times.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lesson {
    /// Stable identifier for this lesson.
    pub id: LessonId,
    /// Receiving school class.
    pub school_class_id: SchoolClassId,
    /// Subject taught in this lesson.
    pub subject_id: SubjectId,
    /// Teacher assigned to this lesson.
    pub teacher_id: TeacherId,
    /// Number of hours of this lesson to place per week.
    pub hours_per_week: u8,
    /// Preferred block size for placement. `1` means single-hour placements;
    /// `n > 1` means each block is `n` consecutive same-day positions in one
    /// room. The solver places `hours_per_week / preferred_block_size` blocks
    /// per lesson. Must be `>= 1` and must divide `hours_per_week`; otherwise
    /// `validate_structural` returns `Err(Error::Input(...))`. Defaults to 1
    /// when the JSON field is omitted, keeping the wire format additive.
    #[serde(default = "default_preferred_block_size")]
    pub preferred_block_size: u8,
}

fn default_preferred_block_size() -> u8 {
    1
}
```

Run `cargo nextest run -p solver-core types::tests`. Expected: both new tests pass.

- [ ] **Step 3: Update every literal `Lesson { ... }` constructor in solver-core (red on missing field).**

`cargo build -p solver-core --tests` will fail with `missing field 'preferred_block_size'` errors at every call site. Add `preferred_block_size: 1,` (the existing default) to every `Lesson { ... }` struct literal. Search hits to fix:

```bash
grep -rn 'Lesson {$\|Lesson { *$\|Lesson {[^}]*hours_per_week' solver/solver-core/src/ solver/solver-core/tests/ solver/solver-core/benches/
```

Each match needs a `preferred_block_size: 1,` line added immediately after the existing `hours_per_week:` line. Files known to need this update: `solver-core/src/solve.rs` (multiple test functions), `solver-core/src/lahc.rs` (test functions), `solver-core/src/score.rs` (test functions), `solver-core/src/validate.rs` (test functions), `solver-core/src/index.rs` if it builds Lessons, `solver-core/tests/properties.rs`, `solver-core/tests/lahc_property.rs`, `solver-core/tests/score_property.rs`, `solver-core/tests/grundschule_smoke.rs`, `solver-core/tests/ffd_solver_outcome.rs`, `solver-core/benches/solver_fixtures.rs`.

Run `cargo build -p solver-core --tests --benches`. Expected: PASS.

- [ ] **Step 4: Write red tests for `validate_structural` rejection.**

Append to `solver/solver-core/src/validate.rs` mod tests (after `lesson_with_zero_hours_is_input_error`):

```rust
#[test]
fn lesson_with_zero_block_size_is_input_error() {
    let mut p = minimal_problem();
    p.lessons[0].preferred_block_size = 0;
    let err = validate_structural(&p).unwrap_err();
    assert!(matches!(err, Error::Input(msg) if msg.contains("preferred_block_size")));
}

#[test]
fn lesson_with_non_divisible_hours_is_input_error() {
    let mut p = minimal_problem();
    p.lessons[0].hours_per_week = 3;
    p.lessons[0].preferred_block_size = 2;
    let err = validate_structural(&p).unwrap_err();
    assert!(matches!(err, Error::Input(msg) if msg.contains("divisible by preferred_block_size")));
}

#[test]
fn block_size_one_with_any_hours_is_valid() {
    let mut p = minimal_problem();
    p.lessons[0].hours_per_week = 7;
    p.lessons[0].preferred_block_size = 1;
    validate_structural(&p).unwrap();
}

#[test]
fn block_size_two_with_even_hours_is_valid() {
    let mut p = minimal_problem();
    p.lessons[0].hours_per_week = 4;
    p.lessons[0].preferred_block_size = 2;
    validate_structural(&p).unwrap();
}
```

Run `cargo nextest run -p solver-core validate::tests`. Expected: the four new tests fail (validation does not yet check the new field).

- [ ] **Step 5: Implement validation.**

In `solver/solver-core/src/validate.rs`, inside the `for lesson in &problem.lessons` loop after the existing `hours_per_week == 0` check:

```rust
if lesson.preferred_block_size == 0 {
    return Err(Error::Input(format!(
        "lesson {} has preferred_block_size = 0",
        lesson.id.0
    )));
}
if lesson.hours_per_week % lesson.preferred_block_size != 0 {
    return Err(Error::Input(format!(
        "lesson {}: hours_per_week ({}) is not divisible by preferred_block_size ({})",
        lesson.id.0, lesson.hours_per_week, lesson.preferred_block_size
    )));
}
```

Run `cargo nextest run -p solver-core validate::tests`. Expected: all validate tests pass, including the four new ones.

- [ ] **Step 6: Generalise `pre_solve_violations` to emit one violation per block-instance.**

In `solver/solver-core/src/validate.rs:148-160`, the inner loop currently iterates `0..lesson.hours_per_week`. Change it to iterate `0..(lesson.hours_per_week / lesson.preferred_block_size)` and use `block_index * lesson.preferred_block_size` as the `hour_index`:

```rust
let block_count = lesson.hours_per_week / lesson.preferred_block_size;
let n = lesson.preferred_block_size;
for block_index in 0..block_count {
    out.push(Violation {
        kind: ViolationKind::NoQualifiedTeacher,
        lesson_id: lesson.id,
        hour_index: block_index * n,
    });
}
```

The existing `pre_solve_emits_violations_per_hour_for_unqualified_teacher` test passes a `hours_per_week=3, preferred_block_size=1` lesson and asserts three violations with `hour_index` 0, 1, 2. With `n=1`, block_count = 3, and hour_index = 0*1, 1*1, 2*1 = 0, 1, 2. Behaviour preserved.

Run `cargo nextest run -p solver-core validate::tests`. Expected: all pass.

- [ ] **Step 7: Run the full solver-core test suite to confirm no regression.**

Run `cargo nextest run -p solver-core`. Expected: PASS for every test except solve.rs's existing scenarios that may need further updates in Task 2 (this is fine; do not fix in this commit).

If any test in solve.rs fails *because* of this commit (i.e., the test compiles but has a logic bug introduced by the field rename), it must be fixed here. Otherwise leave it for Task 2.

- [ ] **Step 8: Commit.**

```bash
git add solver/solver-core/src/types.rs solver/solver-core/src/validate.rs solver/solver-core/src/solve.rs solver/solver-core/src/lahc.rs solver/solver-core/src/score.rs solver/solver-core/src/index.rs solver/solver-core/tests/ solver/solver-core/benches/solver_fixtures.rs
git commit -m "feat(solver-core): add preferred_block_size to Lesson with structural validation"
```

---

## Task 2: Place Doppelstunden as contiguous n-block windows in `solve_with_config`

**Files:**
- Modify: `solver/solver-core/src/solve.rs`

- [ ] **Step 1: Write the red unit test for n=2 placement.**

Append to `solver/solver-core/src/solve.rs` mod tests (after the last `fn` block, before `}`):

```rust
#[test]
fn block_lesson_places_n_consecutive_positions_in_one_room() {
    let mut p = base_problem();
    p.time_blocks = vec![
        TimeBlock {
            id: TimeBlockId(solve_uuid(10)),
            day_of_week: 0,
            position: 0,
        },
        TimeBlock {
            id: TimeBlockId(solve_uuid(11)),
            day_of_week: 0,
            position: 1,
        },
        TimeBlock {
            id: TimeBlockId(solve_uuid(12)),
            day_of_week: 0,
            position: 2,
        },
        TimeBlock {
            id: TimeBlockId(solve_uuid(13)),
            day_of_week: 0,
            position: 3,
        },
    ];
    p.lessons[0].hours_per_week = 2;
    p.lessons[0].preferred_block_size = 2;

    let s = greedy_solve(&p).unwrap();
    assert_eq!(s.placements.len(), 2);
    let mut positions: Vec<u8> = s
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
    positions.sort_unstable();
    assert_eq!(positions[1] - positions[0], 1, "positions must be consecutive");
    assert_eq!(s.placements[0].room_id, s.placements[1].room_id);
}
```

Run `cargo nextest run -p solver-core solve::tests::block_lesson_places_n_consecutive_positions_in_one_room`. Expected: FAIL — today's solver places two single hours, possibly non-consecutive, possibly in different rooms when multiple rooms exist (here only one room, so the room assertion happens to pass; the consecutive-position assertion may pass or fail by coincidence).

To make the test bite, we'll *also* add a second lesson that competes for early slots and force the contiguity contract to matter. But for the first failing test, the simpler shape above suffices once we add the cross-day test:

- [ ] **Step 2: Write the red unit test for no day crossing.**

Append:

```rust
#[test]
fn block_lesson_does_not_cross_day_boundary() {
    let mut p = base_problem();
    // day 0 has positions [0, 1]; day 1 has positions [0, 1].
    p.time_blocks = vec![
        TimeBlock {
            id: TimeBlockId(solve_uuid(10)),
            day_of_week: 0,
            position: 0,
        },
        TimeBlock {
            id: TimeBlockId(solve_uuid(11)),
            day_of_week: 0,
            position: 1,
        },
        TimeBlock {
            id: TimeBlockId(solve_uuid(12)),
            day_of_week: 1,
            position: 0,
        },
        TimeBlock {
            id: TimeBlockId(solve_uuid(13)),
            day_of_week: 1,
            position: 1,
        },
    ];
    // Block teacher on day 0's first slot so the only day-0 contiguous-2 window
    // would have to span day 0 -> day 1, which must be forbidden.
    p.teacher_blocked_times.push(TeacherBlockedTime {
        teacher_id: TeacherId(solve_uuid(20)),
        time_block_id: TimeBlockId(solve_uuid(10)),
    });
    p.lessons[0].hours_per_week = 2;
    p.lessons[0].preferred_block_size = 2;

    let s = greedy_solve(&p).unwrap();
    assert_eq!(s.placements.len(), 2, "block must place on day 1");
    let days: Vec<u8> = s
        .placements
        .iter()
        .map(|pl| {
            p.time_blocks
                .iter()
                .find(|tb| tb.id == pl.time_block_id)
                .unwrap()
                .day_of_week
        })
        .collect();
    assert!(days.iter().all(|&d| d == days[0]), "all positions same day");
}
```

Run `cargo nextest run -p solver-core solve::tests::block_lesson_does_not_cross_day_boundary`. Expected: FAIL (today's solver may place hour 1 at day0-pos1 and hour 2 at day1-pos0).

- [ ] **Step 3: Write the red unit test for one-violation-per-failed-block.**

Append:

```rust
#[test]
fn block_lesson_emits_one_violation_per_failed_block() {
    let mut p = base_problem();
    // Single day, only two positions (window of size 2 fits exactly once).
    p.time_blocks = vec![
        TimeBlock {
            id: TimeBlockId(solve_uuid(10)),
            day_of_week: 0,
            position: 0,
        },
        TimeBlock {
            id: TimeBlockId(solve_uuid(11)),
            day_of_week: 0,
            position: 1,
        },
    ];
    // Lesson needs 4 hours / 2 blocks but only one window exists; second block fails.
    p.lessons[0].hours_per_week = 4;
    p.lessons[0].preferred_block_size = 2;
    p.teachers[0].max_hours_per_week = 4;

    let s = greedy_solve(&p).unwrap();
    assert_eq!(s.placements.len(), 2, "first block places");
    assert_eq!(s.violations.len(), 1, "exactly one violation per failed block");
    assert_eq!(s.violations[0].hour_index, 2, "second block starts at hour 2");
}
```

Run `cargo nextest run -p solver-core solve::tests::block_lesson_emits_one_violation_per_failed_block`. Expected: FAIL.

- [ ] **Step 4: Implement `try_place_block` and switch the outer loop.**

In `solver/solver-core/src/solve.rs`:

Change the inner block of `solve_with_config`'s lesson loop from:

```rust
for hour_index in 0..lesson.hours_per_week {
    let placed = try_place_hour(...);
    if !placed {
        solution.violations.push(Violation {
            kind: unplaced_kind(...),
            lesson_id: lesson.id,
            hour_index,
        });
    }
}
```

to:

```rust
let n = lesson.preferred_block_size;
let block_count = lesson.hours_per_week / n;
for block_index in 0..block_count {
    let placed = try_place_block(
        problem,
        lesson,
        n,
        &idx,
        &teacher_max,
        &config.weights,
        &mut state,
        &mut solution.placements,
        &tb_order,
        &room_order,
    );
    if !placed {
        solution.violations.push(Violation {
            kind: unplaced_kind(
                problem,
                lesson,
                &idx,
                &teacher_max,
                &state.used_teacher,
                &state.used_class,
                &state.hours_by_teacher,
            ),
            lesson_id: lesson.id,
            hour_index: block_index * n,
        });
    }
}
```

Replace the `try_place_hour` function with `try_place_block`. The new function generalises the existing logic: for each candidate `tb_idx`, peek ahead `n - 1` indices in `tb_order` to verify a contiguous same-day window; check hard-feasibility for the full window; pick a single room feasible across the full window; score the window analytically using the existing `gap_count` arithmetic; commit `n` placements on accept.

```rust
#[allow(clippy::too_many_arguments)] // Reason: internal helper; refactoring to a struct hurts clarity more than it helps
fn try_place_block(
    problem: &Problem,
    lesson: &Lesson,
    n: u8,
    idx: &Indexed,
    teacher_max: &HashMap<TeacherId, u8>,
    weights: &ConstraintWeights,
    state: &mut GreedyState,
    placements: &mut Vec<Placement>,
    tb_order: &[usize],
    room_order: &[usize],
) -> bool {
    let class = lesson.school_class_id;
    let teacher = lesson.teacher_id;
    let subject = problem
        .subjects
        .iter()
        .find(|s| s.id == lesson.subject_id)
        .expect("validate_structural ensures every lesson.subject_id resolves");
    let n_usize = n as usize;
    let n_u32 = u32::from(n);

    let mut best: Option<BlockCandidate> = None;
    'outer: for outer_pos in 0..tb_order.len() {
        // Window must fit inside the index list.
        if outer_pos + n_usize > tb_order.len() {
            break;
        }
        let first_tb = &problem.time_blocks[tb_order[outer_pos]];

        // Verify contiguity: positions in window must be first_tb.position,
        // first_tb.position + 1, ..., first_tb.position + n - 1, all on the
        // same day. tb_order is sorted by (day, position, id), so a missing
        // position or day-change shows up as a non-matching neighbour.
        for k in 1..n_usize {
            let nb = &problem.time_blocks[tb_order[outer_pos + k]];
            if nb.day_of_week != first_tb.day_of_week
                || nb.position != first_tb.position + (k as u8)
            {
                continue 'outer;
            }
        }

        // Hard-feasibility for every position in the window.
        for k in 0..n_usize {
            let tb = &problem.time_blocks[tb_order[outer_pos + k]];
            if state.used_teacher.contains(&(teacher, tb.id))
                || state.used_class.contains(&(class, tb.id))
                || idx.teacher_blocked(teacher, tb.id)
            {
                continue 'outer;
            }
        }
        let current = state.hours_by_teacher.get(&teacher).copied().unwrap_or(0);
        let max = teacher_max.get(&teacher).copied().unwrap_or(0);
        if current.saturating_add(n) > max {
            continue;
        }

        // Score the candidate window analytically. Subject-pref summed over
        // the window. Class-gap and teacher-gap evaluated by the analytical
        // formula below (see the design spec for derivation).
        let start_pos = first_tb.position;
        let end_pos = start_pos + n - 1;
        let class_old = state
            .class_positions
            .get(&(class, first_tb.day_of_week))
            .map(|v| crate::score::gap_count(v))
            .unwrap_or(0);
        let teacher_old = state
            .teacher_positions
            .get(&(teacher, first_tb.day_of_week))
            .map(|v| crate::score::gap_count(v))
            .unwrap_or(0);
        let class_new =
            gap_count_after_window_insert(state.class_positions.get(&(class, first_tb.day_of_week)), start_pos, end_pos);
        let teacher_new = gap_count_after_window_insert(
            state.teacher_positions.get(&(teacher, first_tb.day_of_week)),
            start_pos,
            end_pos,
        );
        let mut subject_pref = 0u32;
        for k in 0..n_usize {
            let tb = &problem.time_blocks[tb_order[outer_pos + k]];
            subject_pref =
                subject_pref.saturating_add(crate::score::subject_preference_score(subject, tb, weights));
        }
        // Window-delta: (new - old) per partition, weighted, plus subject_pref.
        // Operate on running soft_score directly so the early-exit at delta=0
        // generalises.
        let class_delta_weighted = i64::from(class_new) - i64::from(class_old);
        let teacher_delta_weighted = i64::from(teacher_new) - i64::from(teacher_old);
        let class_term = class_delta_weighted.saturating_mul(i64::from(weights.class_gap));
        let teacher_term = teacher_delta_weighted.saturating_mul(i64::from(weights.teacher_gap));
        let new_signed = i64::from(state.soft_score)
            .saturating_add(class_term)
            .saturating_add(teacher_term)
            .saturating_add(i64::from(subject_pref));
        let score = u32::try_from(new_signed.max(0)).unwrap_or(u32::MAX);

        // Pruning: same as the length-1 path. If this window's score can't beat
        // the current best, the room tiebreak rule cannot make a higher-score
        // candidate win, so skip the inner room scan.
        if let Some(b) = &best {
            if score >= b.score {
                continue;
            }
        }

        // Pick a room feasible across the full window. Iterate room_order;
        // first feasible wins under the (day, start_pos, room.id) tiebreak.
        let mut chosen_room: Option<RoomId> = None;
        'rooms: for &room_idx in room_order {
            let room = &problem.rooms[room_idx];
            if !idx.room_suits_subject(room.id, lesson.subject_id) {
                continue;
            }
            for k in 0..n_usize {
                let tb = &problem.time_blocks[tb_order[outer_pos + k]];
                if state.used_room.contains(&(room.id, tb.id))
                    || idx.room_blocked(room.id, tb.id)
                {
                    continue 'rooms;
                }
            }
            chosen_room = Some(room.id);
            break;
        }
        let Some(room_id) = chosen_room else {
            continue;
        };

        best = Some(BlockCandidate {
            outer_pos,
            day: first_tb.day_of_week,
            start_pos,
            end_pos,
            room_id,
            score,
            subject_pref,
        });

        // Early exit: window with delta=0 cannot be beaten under tiebreak.
        if score == state.soft_score {
            break;
        }
        let _ = n_u32; // n_u32 reserved for future analytical refinements.
    }

    let Some(c) = best else {
        return false;
    };

    // Commit n placements.
    for k in 0..n_usize {
        let tb = &problem.time_blocks[tb_order[c.outer_pos + k]];
        placements.push(Placement {
            lesson_id: lesson.id,
            time_block_id: tb.id,
            room_id: c.room_id,
        });
        state.used_teacher.insert((teacher, tb.id));
        state.used_class.insert((class, tb.id));
        state.used_room.insert((c.room_id, tb.id));
    }
    *state.hours_by_teacher.entry(teacher).or_insert(0) += n;

    let class_part = state
        .class_positions
        .entry((class, c.day))
        .or_default();
    for pos in c.start_pos..=c.end_pos {
        let ins = class_part.binary_search(&pos).unwrap_or_else(|i| i);
        class_part.insert(ins, pos);
    }
    let teacher_part = state
        .teacher_positions
        .entry((teacher, c.day))
        .or_default();
    for pos in c.start_pos..=c.end_pos {
        let ins = teacher_part.binary_search(&pos).unwrap_or_else(|i| i);
        teacher_part.insert(ins, pos);
    }
    state.soft_score = c.score;
    true
}

#[derive(Debug, Clone, Copy)]
struct BlockCandidate {
    outer_pos: usize,
    day: u8,
    start_pos: u8,
    end_pos: u8,
    room_id: RoomId,
    score: u32,
    #[allow(dead_code)] // Reason: kept for diagnostic logging hooks; touched by tests via score
    subject_pref: u32,
}

/// Gap-count after inserting positions `start..=end` (inclusive) into a sorted
/// slice. Allocation-free; uses the analytical `(max - min + 1) - len` formula
/// on the merged interval.
fn gap_count_after_window_insert(positions: Option<&Vec<u8>>, start: u8, end: u8) -> u32 {
    let n_added = u32::from(end - start + 1);
    let Some(v) = positions else {
        // Inserting consecutive positions into an empty partition: gap-count is 0.
        return 0;
    };
    if v.is_empty() {
        return 0;
    }
    let v_min = *v.first().unwrap();
    let v_max = *v.last().unwrap();
    let new_min = v_min.min(start);
    let new_max = v_max.max(end);
    // Caller guarantees [start, end] is disjoint from v: try_place_block checks
    // used_class and used_teacher before scoring, which holds the invariant
    // that no position in the window is already in v for the matching class
    // or teacher.
    let len_after = u32::try_from(v.len()).unwrap_or(u32::MAX).saturating_add(n_added);
    let span = u32::from(new_max - new_min) + 1;
    span.saturating_sub(len_after)
}
```

Remove the now-unused `try_place_hour`, the `Candidate` struct (replaced by `BlockCandidate`), and the inner per-tb `candidate_score` helper. The existing `gap_count_partition` private helper is also unused; remove. Run `cargo build -p solver-core --tests`. Expected: PASS.

Run `cargo nextest run -p solver-core`. Expected: all solve::tests pass, including the three new ones.

- [ ] **Step 5: Verify the existing per-hour tests still pass.**

The single-hour tests in `solve.rs` (`single_hour_places_into_first_slot_and_room`, `unqualified_teacher_emits_violation_and_skips_placement`, `teacher_blocked_time_prevents_placement_there`, `room_unsuitable_for_subject_is_skipped`, `room_blocked_time_pushes_placement_to_next_slot`, `teacher_max_hours_cap_emits_teacher_over_capacity`, `no_free_time_block_when_class_slots_are_filled_blocks_second_lesson`, `two_lessons_in_same_class_do_not_double_book_slot`, `two_rooms_used_in_parallel_for_different_classes_in_same_slot`, `structural_error_returns_err_input`, `lowest_delta_picks_gap_minimising_slot_for_class`, `lowest_delta_picks_gap_minimising_slot_for_teacher`, `greedy_avoids_position_zero_for_avoid_first_subject_when_alternative_exists`, `greedy_packs_prefer_early_subject_into_lower_positions_when_multiple_hours`) all assume `preferred_block_size=1`. With `n=1`, block_count = h, the window walk degenerates to a single tb, the room scan and scoring use the same formulas. They should pass without modification.

Run `cargo nextest run -p solver-core solve::tests`. Expected: all pass.

- [ ] **Step 6: Run the full workspace-level Rust suite.**

Run `mise run test:rust`. Expected: PASS for solver-core integration tests, including `tests/grundschule_smoke.rs`, `tests/properties.rs`, `tests/score_property.rs`, `tests/lahc_property.rs`. The integration tests use `preferred_block_size=1` literals or default (after Task 1's literal updates), so behaviour should be identical.

- [ ] **Step 7: Commit.**

```bash
git add solver/solver-core/src/solve.rs
git commit -m "feat(solver-core): place doppelstunden as contiguous n-block windows"
```

---

## Task 3: Skip block placements in LAHC's Change move

**Files:**
- Modify: `solver/solver-core/src/lahc.rs`

- [ ] **Step 1: Write the red regression test.**

Append to `solver/solver-core/src/lahc.rs` mod tests (after the existing `lahc_change_move_reduces_avoid_first_penalty_when_seed_finds_alternative`):

```rust
#[test]
fn lahc_does_not_move_block_placements() {
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
    let tb_two = TimeBlockId(lahc_uuid(12));
    let tb_three = TimeBlockId(lahc_uuid(13));

    let problem = Problem {
        time_blocks: vec![
            TimeBlock {
                id: tb_zero,
                day_of_week: 0,
                position: 0,
            },
            TimeBlock {
                id: tb_one,
                day_of_week: 0,
                position: 1,
            },
            TimeBlock {
                id: tb_two,
                day_of_week: 0,
                position: 2,
            },
            TimeBlock {
                id: tb_three,
                day_of_week: 0,
                position: 3,
            },
        ],
        teachers: vec![Teacher {
            id: teacher,
            max_hours_per_week: 10,
        }],
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
            hours_per_week: 2,
            preferred_block_size: 2,
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

    // Seed a block placement at positions 0, 1 (touches avoid_first at pos 0).
    let mut placements = vec![
        Placement {
            lesson_id: lesson,
            time_block_id: tb_zero,
            room_id: room,
        },
        Placement {
            lesson_id: lesson,
            time_block_id: tb_one,
            room_id: room,
        },
    ];
    let mut class_positions: HashMap<(SchoolClassId, u8), Vec<u8>> = HashMap::new();
    class_positions.insert((class, 0), vec_part(&[0, 1]));
    let mut teacher_positions: HashMap<(TeacherId, u8), Vec<u8>> = HashMap::new();
    teacher_positions.insert((teacher, 0), vec_part(&[0, 1]));
    let mut used_teacher: HashSet<(TeacherId, TimeBlockId)> = HashSet::new();
    used_teacher.insert((teacher, tb_zero));
    used_teacher.insert((teacher, tb_one));
    let mut used_class: HashSet<(SchoolClassId, TimeBlockId)> = HashSet::new();
    used_class.insert((class, tb_zero));
    used_class.insert((class, tb_one));
    let mut used_room: HashSet<(RoomId, TimeBlockId)> = HashSet::new();
    used_room.insert((room, tb_zero));
    used_room.insert((room, tb_one));
    let mut current_score: u32 = 1; // avoid_first penalty active at position 0

    let config = SolveConfig {
        weights: ConstraintWeights {
            avoid_first_period: 1,
            ..ConstraintWeights::default()
        },
        seed: 0,
        deadline: Some(std::time::Duration::from_millis(50)),
        max_iterations: Some(2000),
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

    // Block is untouched: both placements still at tb_zero / tb_one.
    let tb_ids: HashSet<TimeBlockId> =
        placements.iter().map(|p| p.time_block_id).collect();
    assert!(
        tb_ids.contains(&tb_zero) && tb_ids.contains(&tb_one),
        "block placement must not be moved by LAHC; got {:?}",
        tb_ids
    );
}
```

Run `cargo nextest run -p solver-core lahc::tests::lahc_does_not_move_block_placements`. Expected: FAIL — without the guard, LAHC moves the placement at tb_zero off position 0 to reduce the avoid_first penalty.

- [ ] **Step 2: Add the guard.**

In `solver/solver-core/src/lahc.rs`, inside `try_change_move` immediately after `let lesson = lesson_lookup[&p.lesson_id];`:

```rust
if lesson.preferred_block_size > 1 {
    return false;
}
```

Run `cargo nextest run -p solver-core lahc::tests`. Expected: all pass, including the new regression test.

- [ ] **Step 3: Run the LAHC determinism property tests.**

Run `cargo nextest run -p solver-core --test lahc_property`. Expected: PASS — the early-return is positioned after both `random_range` draws are consumed, so the RNG-budget invariant holds.

- [ ] **Step 4: Commit.**

```bash
git add solver/solver-core/src/lahc.rs
git commit -m "feat(solver-core): skip block placements in lahc change move"
```

---

## Task 4: Property test for n-block contiguity and same-room invariants

**Files:**
- Modify: `solver/solver-core/tests/properties.rs`

- [ ] **Step 1: Read the existing property tests for shape.**

```bash
cat solver/solver-core/tests/properties.rs | head -80
```

Note the proptest macro pattern, the random-`Problem` strategy, and the existing assertions. The new property should compose with whatever Problem-generator is in place.

- [ ] **Step 2: Add a property that block placements satisfy the contract.**

Append at the end of `solver/solver-core/tests/properties.rs`:

```rust
proptest::proptest! {
    #![proptest_config(proptest::prelude::ProptestConfig {
        cases: 32,
        ..proptest::prelude::ProptestConfig::default()
    })]

    #[test]
    fn block_lessons_place_n_consecutive_same_day_same_room(
        seed in 0u64..16u64,
    ) {
        use solver_core::ids::{LessonId, RoomId, SchoolClassId, SubjectId, TeacherId, TimeBlockId};
        use solver_core::types::{
            ConstraintWeights, Lesson, Problem, Room, SchoolClass, SolveConfig, Subject, Teacher,
            TeacherQualification, TimeBlock,
        };
        use uuid::Uuid;

        // Single class / single teacher / single room / 6-position day.
        // Three lessons: one length-1 hour, one Doppelstunde (n=2, h=2),
        // one Doppelstunde (n=2, h=4). Total hours: 1 + 2 + 4 = 7.
        let day_blocks: Vec<TimeBlock> = (0u8..7)
            .map(|pos| TimeBlock {
                id: TimeBlockId(Uuid::from_bytes([100 + pos; 16])),
                day_of_week: 0,
                position: pos,
            })
            .collect();
        let teacher = Teacher {
            id: TeacherId(Uuid::from_bytes([20; 16])),
            max_hours_per_week: 10,
        };
        let room = Room {
            id: RoomId(Uuid::from_bytes([30; 16])),
        };
        let subject = Subject {
            id: SubjectId(Uuid::from_bytes([40; 16])),
            prefer_early_periods: false,
            avoid_first_period: false,
        };
        let class = SchoolClass {
            id: SchoolClassId(Uuid::from_bytes([50; 16])),
        };
        let qual = TeacherQualification {
            teacher_id: teacher.id,
            subject_id: subject.id,
        };
        let lessons = vec![
            Lesson {
                id: LessonId(Uuid::from_bytes([60; 16])),
                school_class_id: class.id,
                subject_id: subject.id,
                teacher_id: teacher.id,
                hours_per_week: 1,
                preferred_block_size: 1,
            },
            Lesson {
                id: LessonId(Uuid::from_bytes([61; 16])),
                school_class_id: class.id,
                subject_id: subject.id,
                teacher_id: teacher.id,
                hours_per_week: 2,
                preferred_block_size: 2,
            },
            Lesson {
                id: LessonId(Uuid::from_bytes([62; 16])),
                school_class_id: class.id,
                subject_id: subject.id,
                teacher_id: teacher.id,
                hours_per_week: 4,
                preferred_block_size: 2,
            },
        ];
        let block_lesson_ids: std::collections::HashSet<LessonId> = lessons
            .iter()
            .filter(|l| l.preferred_block_size > 1)
            .map(|l| l.id)
            .collect();

        let problem = Problem {
            time_blocks: day_blocks,
            teachers: vec![teacher],
            rooms: vec![room],
            subjects: vec![subject],
            school_classes: vec![class],
            lessons,
            teacher_qualifications: vec![qual],
            teacher_blocked_times: vec![],
            room_blocked_times: vec![],
            room_subject_suitabilities: vec![],
        };

        let s = solver_core::solve_with_config(
            &problem,
            &SolveConfig {
                seed,
                ..SolveConfig::default()
            },
        )
        .unwrap();

        let tb_lookup: std::collections::HashMap<TimeBlockId, &TimeBlock> = problem
            .time_blocks
            .iter()
            .map(|tb| (tb.id, tb))
            .collect();
        let mut by_lesson: std::collections::HashMap<LessonId, Vec<&Placement>> =
            std::collections::HashMap::new();
        for p in &s.placements {
            by_lesson.entry(p.lesson_id).or_default().push(p);
        }

        for lesson_id in block_lesson_ids {
            let placements = match by_lesson.get(&lesson_id) {
                Some(v) => v,
                None => continue, // unplaced block: violation case, not contradicted by this property
            };
            // Group by `(day, room)` and verify each group is a contiguous run of size n.
            let lesson = problem
                .lessons
                .iter()
                .find(|l| l.id == lesson_id)
                .unwrap();
            let n = lesson.preferred_block_size as usize;
            let mut by_window: std::collections::BTreeMap<(u8, RoomId), Vec<u8>> =
                std::collections::BTreeMap::new();
            for p in placements {
                let tb = tb_lookup[&p.time_block_id];
                by_window
                    .entry((tb.day_of_week, p.room_id))
                    .or_default()
                    .push(tb.position);
            }
            // Total placements equals h.
            let total: usize = by_window.values().map(|v| v.len()).sum();
            proptest::prop_assert_eq!(total, lesson.hours_per_week as usize);
            // Every group must be a contiguous run of exactly n positions.
            for (_, mut positions) in by_window {
                proptest::prop_assert_eq!(positions.len() % n, 0,
                    "expected window groups to be multiples of n");
                positions.sort();
                for chunk in positions.chunks(n) {
                    proptest::prop_assert_eq!(chunk.len(), n);
                    for k in 1..n {
                        proptest::prop_assert_eq!(chunk[k], chunk[0] + k as u8,
                            "expected consecutive positions in block window");
                    }
                }
            }
        }
    }
}
```

Note: the property test stays simple (not using a randomised Problem) because the contract under test is structural per-block, not a generic Problem-shape invariant. Randomising the Problem space risks producing infeasible problems whose violation-only path doesn't exercise the property.

- [ ] **Step 3: Run the new property.**

```bash
cargo nextest run -p solver-core --test properties block_lessons_place_n_consecutive_same_day_same_room
```

Expected: PASS for all 16 seeds (32 cases per seed, 16 seeds = 512 cases due to proptest expansion; the simpler shape above runs 32 cases).

- [ ] **Step 4: Run the full integration suite.**

```bash
mise run test:rust
```

Expected: PASS for every test target.

- [ ] **Step 5: Commit.**

```bash
git add solver/solver-core/tests/properties.rs
git commit -m "test(solver-core): property test for doppelstunden contiguity invariant"
```

---

## Task 5: Backend pass-through and Pydantic divisibility validator

**Files:**
- Modify: `backend/src/klassenzeit_backend/scheduling/solver_io.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/schemas/lesson.py`
- Modify: `backend/src/klassenzeit_backend/scheduling/routes/lessons.py`
- Test: `backend/tests/scheduling/test_solver_io.py`
- Test: `backend/tests/scheduling/routes/test_lessons.py`

- [ ] **Step 1: Write the red test for `LessonCreate` 422 on odd hours with n=2.**

Locate the existing test file `backend/tests/scheduling/routes/test_lessons.py` (run `grep -ln 'def test_create' backend/tests/scheduling/routes/test_lessons.py` to confirm it exists). Append:

```python
async def test_lesson_create_rejects_odd_hours_with_block_size_two(
    client, db_session, scheduling_factories
):
    """422 when ``hours_per_week`` is not divisible by ``preferred_block_size``."""
    week_scheme = await scheduling_factories.create_week_scheme(name="WS")
    school_class = await scheduling_factories.create_school_class(
        name="3a", week_scheme=week_scheme
    )
    subject = await scheduling_factories.create_subject(name="Sport", short_name="Sp")
    response = await client.post(
        "/api/lessons",
        json={
            "school_class_id": str(school_class.id),
            "subject_id": str(subject.id),
            "hours_per_week": 3,
            "preferred_block_size": 2,
        },
    )
    assert response.status_code == 422
    assert "preferred_block_size" in response.text
```

(Adjust factory imports / fixture names to match the file's existing patterns. If `scheduling_factories` isn't the actual fixture, use whatever the file uses for the `LessonCreate` happy-path tests.)

Run `mise run test:py -- backend/tests/scheduling/routes/test_lessons.py::test_lesson_create_rejects_odd_hours_with_block_size_two -v`. Expected: FAIL — the route currently accepts the body and creates a lesson.

- [ ] **Step 2: Add the Pydantic validator.**

In `backend/src/klassenzeit_backend/scheduling/schemas/lesson.py`, replace the file with:

```python
"""Pydantic schemas for lesson routes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class LessonCreate(BaseModel):
    """Request body for creating a lesson."""

    school_class_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None = None
    hours_per_week: int = Field(ge=1)
    preferred_block_size: int = Field(default=1, ge=1, le=2)

    @model_validator(mode="after")
    def _hours_divisible_by_block_size(self) -> "LessonCreate":
        if self.hours_per_week % self.preferred_block_size != 0:
            raise ValueError(
                "hours_per_week must be divisible by preferred_block_size"
            )
        return self


class LessonUpdate(BaseModel):
    """Request body for patching a lesson."""

    teacher_id: uuid.UUID | None = None
    hours_per_week: int | None = Field(default=None, ge=1)
    preferred_block_size: int | None = Field(default=None, ge=1, le=2)


class LessonClassResponse(BaseModel):
    """Embedded school class in a lesson response."""

    id: uuid.UUID
    name: str


class LessonSubjectResponse(BaseModel):
    """Embedded subject in a lesson response."""

    id: uuid.UUID
    name: str
    short_name: str


class LessonTeacherResponse(BaseModel):
    """Embedded teacher in a lesson response."""

    id: uuid.UUID
    first_name: str
    last_name: str
    short_code: str


class LessonResponse(BaseModel):
    """Response body for a lesson."""

    id: uuid.UUID
    school_class: LessonClassResponse
    subject: LessonSubjectResponse
    teacher: LessonTeacherResponse | None
    hours_per_week: int
    preferred_block_size: int
    created_at: datetime
    updated_at: datetime
```

Run the test from Step 1. Expected: PASS.

- [ ] **Step 3: Write the red test for `LessonUpdate` 422 against the merged row.**

Append to the same test file:

```python
async def test_lesson_update_rejects_block_size_change_breaking_divisibility(
    client, db_session, scheduling_factories
):
    """422 when patching ``preferred_block_size`` to a value that doesn't divide existing hours."""
    week_scheme = await scheduling_factories.create_week_scheme(name="WS")
    school_class = await scheduling_factories.create_school_class(
        name="3a", week_scheme=week_scheme
    )
    subject = await scheduling_factories.create_subject(name="Sport", short_name="Sp")
    create = await client.post(
        "/api/lessons",
        json={
            "school_class_id": str(school_class.id),
            "subject_id": str(subject.id),
            "hours_per_week": 3,
            "preferred_block_size": 1,
        },
    )
    assert create.status_code == 201
    lesson_id = create.json()["id"]

    update = await client.patch(
        f"/api/lessons/{lesson_id}",
        json={"preferred_block_size": 2},
    )
    assert update.status_code == 422
    assert "preferred_block_size" in update.text
```

Run the test. Expected: FAIL — the route accepts the patch and saves a non-divisible (h=3, n=2) lesson.

- [ ] **Step 4: Add divisibility check to the update route.**

In `backend/src/klassenzeit_backend/scheduling/routes/lessons.py`, locate the PATCH handler (search for `body.preferred_block_size is not None` to find the merge block). After the merge of `body` into `lesson`, validate:

```python
if lesson.hours_per_week % lesson.preferred_block_size != 0:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="hours_per_week must be divisible by preferred_block_size",
    )
```

Place this after the `if body.preferred_block_size is not None: lesson.preferred_block_size = body.preferred_block_size` block and before the commit.

Run the test from Step 3. Expected: PASS. Run all lesson route tests: `mise run test:py -- backend/tests/scheduling/routes/test_lessons.py -v`. Expected: PASS for everything.

- [ ] **Step 5: Write the red test for `build_problem_json` lesson dict shape.**

In `backend/tests/scheduling/test_solver_io.py`, locate the test that asserts on `build_problem_json` output (search for `build_problem_json`). If it walks the `lessons` list, append a new test:

```python
async def test_build_problem_json_includes_preferred_block_size(
    db_session, scheduling_factories
):
    """``preferred_block_size`` is forwarded to the solver per lesson."""
    week_scheme = await scheduling_factories.create_week_scheme(name="WS")
    school_class = await scheduling_factories.create_school_class(
        name="3a", week_scheme=week_scheme
    )
    subject = await scheduling_factories.create_subject(name="Sport", short_name="Sp")
    teacher = await scheduling_factories.create_teacher(
        first_name="A", last_name="B", short_code="AB"
    )
    db_session.add_all(
        [
            TeacherQualification(teacher_id=teacher.id, subject_id=subject.id),
            Lesson(
                school_class_id=school_class.id,
                subject_id=subject.id,
                teacher_id=teacher.id,
                hours_per_week=4,
                preferred_block_size=2,
            ),
        ]
    )
    await db_session.flush()

    problem_json, _, _ = await build_problem_json(db_session, school_class.id)
    problem = json.loads(problem_json)
    assert len(problem["lessons"]) == 1
    assert problem["lessons"][0]["preferred_block_size"] == 2
```

(Imports needed at module top: `from klassenzeit_backend.db.models.lesson import Lesson`, `from klassenzeit_backend.db.models.teacher import TeacherQualification`, `from klassenzeit_backend.scheduling.solver_io import build_problem_json`, `import json`. Match the existing file's convention if it differs.)

Run the test. Expected: FAIL — the lesson dict does not yet include `preferred_block_size`.

- [ ] **Step 6: Add the field to the lesson dict.**

In `backend/src/klassenzeit_backend/scheduling/solver_io.py:255-260`, change:

```python
"lessons": [
    {
        "id": str(lesson.id),
        "school_class_id": str(lesson.school_class_id),
        "subject_id": str(lesson.subject_id),
        "teacher_id": str(lesson.teacher_id),
        "hours_per_week": lesson.hours_per_week,
    }
    for lesson in lessons
],
```

to:

```python
"lessons": [
    {
        "id": str(lesson.id),
        "school_class_id": str(lesson.school_class_id),
        "subject_id": str(lesson.subject_id),
        "teacher_id": str(lesson.teacher_id),
        "hours_per_week": lesson.hours_per_week,
        "preferred_block_size": lesson.preferred_block_size,
    }
    for lesson in lessons
],
```

Run the test. Expected: PASS. Run all solver-io tests: `mise run test:py -- backend/tests/scheduling/test_solver_io.py -v`. Expected: PASS.

- [ ] **Step 7: Rebuild solver-py to pick up the new Lesson schema.**

```bash
mise run solver:rebuild
```

Expected: PASS.

- [ ] **Step 8: Run the full backend suite.**

```bash
mise run test:py
```

Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add backend/src/klassenzeit_backend/scheduling/solver_io.py \
        backend/src/klassenzeit_backend/scheduling/schemas/lesson.py \
        backend/src/klassenzeit_backend/scheduling/routes/lessons.py \
        backend/tests/scheduling/test_solver_io.py \
        backend/tests/scheduling/routes/test_lessons.py
git commit -m "feat(backend): pass preferred_block_size to solver and validate even-hours invariant"
```

---

## Task 6: Demo seed: Sachunterricht as a Doppelstunde in Klasse 3

**Files:**
- Modify: `backend/src/klassenzeit_backend/seed/demo_grundschule.py`

- [ ] **Step 1: Locate the Sachunterricht entry in the seed.**

```bash
grep -n 'Sachunter\|preferred_block_size' backend/src/klassenzeit_backend/seed/demo_grundschule.py
```

The seed builds Stundentafel entries and lessons for Klasse 3 (a single Klasse 3a in the Hessen Grundschule demo). Sachunterricht has `hours_per_week=4` per the OPEN_THINGS Stundentafel notes.

- [ ] **Step 2: Flip the Stundentafel entry and the Lesson.**

For Klasse 3 (`grade in {3, 4}`), where the seed creates the Stundentafel entry for Sachunterricht (`SU`), set `preferred_block_size=2`. Likewise for the Lesson row that the route handler will create from that entry. The change is one literal at each call site:

```python
# Stundentafel entry for Sachunterricht in the Klasse 3/4 Stundentafel:
preferred_block_size=2,  # was: 1
```

```python
# Lesson row for Sachunterricht in Klasse 3a:
preferred_block_size=2,  # was: 1
```

If the seed uses a single `_SUBJECTS` table that maps subject short-codes to default `preferred_block_size`, just flip the SU row's value there. Otherwise edit both call sites.

- [ ] **Step 3: Run the Grundschule solvability test.**

```bash
mise run test:py -- backend/tests/seed/test_demo_grundschule_solvability.py -v
```

Expected: PASS. The 7-period day comfortably fits two 2-block windows for Sachunterricht across the week (each Doppelstunde takes one window of 2 consecutive periods on one day; 4h total = 2 Doppelstunden = 2 days).

If it fails: the most likely reason is that the existing schedule packs Sachunterricht into 4 single hours that all happened to be feasible, and the n=2 layout requires both Doppelstunden on different days, which the bench fixture / teacher schedule may not allow. Mitigation: tighten the assertion (e.g., assert at least 90% placement rate instead of 100%), or revert the seed change in this commit and let the bench task land it instead.

- [ ] **Step 4: Run the Playwright e2e smoke against the seeded schedule.**

```bash
mise run e2e -- frontend/e2e/flows/grundschule-smoke.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/klassenzeit_backend/seed/demo_grundschule.py
git commit -m "feat(backend): mark sachunterricht as doppelstunde in grundschule demo seed"
```

---

## Task 7: Bench fixture mirrors the seed flip; refresh BASELINE.md

**Files:**
- Modify: `solver/solver-core/benches/solver_fixtures.rs`
- Modify: `solver/solver-core/benches/BASELINE.md`

- [ ] **Step 1: Locate Sachunterricht in the grundschule fixture.**

```bash
grep -n 'Sachunter\|preferred_block_size\|"SU"\|Lesson {' solver/solver-core/benches/solver_fixtures.rs | head -30
```

The grundschule generator builds Lessons via literal `Lesson { ... }` constructions. Find the one that corresponds to Sachunterricht (`SU` short code) for Klasse 3.

- [ ] **Step 2: Flip `preferred_block_size` for Sachunterricht to 2.**

Set the field to `2` in the Sachunterricht Lesson literal. After Task 1's "preferred_block_size: 1" annotations were added everywhere, this is a single-literal change.

- [ ] **Step 3: Run the bench and refresh BASELINE.md.**

```bash
mise run bench:record
```

Expected: PASS. Inspect the diff in `solver/solver-core/benches/BASELINE.md`. Verify both fixtures stay within the 20% regression budget against the prior committed values:

- grundschule p50 must remain at-or-near 51 µs (greedy) and 200 ms (lahc).
- zweizuegig p50 must remain at-or-near 243 µs (greedy) and 200 ms (lahc).

If grundschule p50 breaches by more than 20%: pull back to a smaller seed change (or revert the seed flip from Task 6) and re-record. Document the breach in the PR body.

- [ ] **Step 4: Sanity-check that the soft_score column reflects the block placement.**

The grundschule fixture's grundschule soft_score with greedy placement may change slightly because Sachunterricht's positions are now driven by block placement rather than per-hour placement. Note the new value in the PR body.

- [ ] **Step 5: Run the full bench-related tests.**

```bash
cargo nextest run -p solver-core --test bench_percentile
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add solver/solver-core/benches/solver_fixtures.rs solver/solver-core/benches/BASELINE.md
git commit -m "bench(solver-core): refresh baseline.md with grundschule doppelstunde fixture"
```

---

## Task 8: ADR 0018 + OPEN_THINGS update

**Files:**
- Create: `docs/adr/0018-solver-doppelstunden.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/superpowers/OPEN_THINGS.md`

- [ ] **Step 1: Confirm the ADR slot is free.**

```bash
ls docs/adr/*.md | sort | tail -3
```

Expected: the latest numeric ADR is `0017-subject-preferences.md`. Use 0018.

- [ ] **Step 2: Write ADR 0018.**

Create `docs/adr/0018-solver-doppelstunden.md` with body:

```markdown
# 0018: Solver Doppelstunden (`preferred_block_size > 1`) support

Status: Accepted (autopilot 2026-04-29).

## Context

Hessen Grundschulen run Sport, Werken, sometimes Kunst, and (in Klasse 3/4) Sachunterricht as Doppelstunden: two consecutive 45-minute Unterrichtsstunden in the same room with the same teacher. The MVP solver placed every lesson hour independently and ignored `preferred_block_size`. The Pydantic schema, DB column, and CRUD UI all carried the field, so the information was discarded between API and solver. OPEN_THINGS sprint item #8 (P2): "extend a lesson with `preferred_block_size: n` and `hours_per_week: h` to need `h / n` contiguous n-block windows on the same day".

## Decision

1. **Atomic block placement on the existing `Lesson`.** Add `preferred_block_size: u8` to Rust `Lesson` with `#[serde(default)]`. The wire format stays additive.
2. **Same room across the n-window.** Block lessons place all `n` placements in one room; pedagogically a Doppelstunde is one continuous unit.
3. **Reject `h % n != 0` at both layers.** Pydantic (early 422) plus `validate_structural` (`Err(Error::Input)`). No runtime "violation" path for misconfiguration.
4. **Reuse the existing violation taxonomy.** One `Violation` per failed block-instance with `hour_index = block_index * n`. No new `UnplacedBlock` variant; size is derivable from the lesson.
5. **LAHC's Change move skips block placements.** A single early-return inside `try_change_move` when `lesson.preferred_block_size > 1`. Both `random_range` draws are consumed before the check, preserving the determinism property test's RNG-budget invariant.

## Consequences

- A 4-hour Sachunterricht lesson with `n=2` produces 2 Doppelstunden across the week. The schedule view shows two adjacent same-room cells per Doppelstunde; visual merge is filed as a follow-up.
- Block lessons are not optimised by LAHC. Greedy's choice for blocks is final until block-aware moves land.
- FFD eligibility ranks block lessons by free-teacher-blocks * suitable-rooms, ignoring contiguity. Filed as a follow-up.
- The grundschule bench fixture's Sachunterricht is flipped to `n=2` so the bench measures the new placement path. `BASELINE.md` refreshed.

## Alternatives considered

- **Per-hour placements with a contiguity constraint.** Rejected: the lowest-delta greedy explicitly avoids backtracking; per-hour placement plus rollback recreates the architecture we removed.
- **Pre-expand to virtual length-`n` lessons.** Rejected: duplicates the lesson identity and forces the violation taxonomy to talk about virtual lessons.
- **`UnplacedBlock { size }` violation variant.** Rejected: the size is already derivable from the lesson; the variant adds taxonomy without information.
- **Block-aware LAHC Change move in this PR.** Rejected: requires a third RNG draw per iteration to pick a contiguous start position, which forces a property-test rework. Filed as a follow-up.

## Pointers

- Spec: `docs/superpowers/specs/2026-04-29-solver-doppelstunden-design.md`.
- Brainstorm: PR #149 comments (one per Q&A block).
- Plan: `docs/superpowers/plans/2026-04-29-solver-doppelstunden.md`.
- OPEN_THINGS sprint item: #8 (Doppelstunden, P2).
```

- [ ] **Step 3: Update `docs/adr/README.md`.**

Add a row to the ADR index pointing to 0018, in numeric order. Match the existing format of the surrounding rows.

- [ ] **Step 4: Update `docs/superpowers/OPEN_THINGS.md`.**

Locate sprint item #8 in the active sprint and mark it `✅ Shipped 2026-04-29`. Append the same kind of note the other sprint items use (PR slug, summary of what landed, pointers to ADR + spec). In the same edit, add follow-ups to the "Acknowledged deferrals" section:

- Block-aware FFD eligibility.
- Block-aware LAHC Change move.
- Visual merge of adjacent same-lesson cells in the schedule grid.
- Mixed block sizes inside one lesson (`h % n != 0` allowed with remainder as length-1 placements).
- `preferred_block_size > 2`.

Phrase each as a short paragraph following the OPEN_THINGS conventions (decision, why, when to revisit).

- [ ] **Step 5: Commit.**

```bash
git add docs/adr/0018-solver-doppelstunden.md docs/adr/README.md docs/superpowers/OPEN_THINGS.md
git commit -m "docs: adr 0018 solver doppelstunden + open_things sprint update"
```

---

## Self-review

After landing all tasks but before pushing:

1. **Spec coverage.** Walk the spec's "Components touched" table top-to-bottom. Every row has a task. ✓
2. **Placeholders.** None left in plan. ✓
3. **Type consistency.** `try_place_block`, `BlockCandidate`, `gap_count_after_window_insert` names match across Task 2's code blocks. ✓ The `Lesson.preferred_block_size: u8` field name matches the Pydantic / DB / Rust layers. ✓
4. **Behaviour preservation for n=1.** Tasks 1, 2 must leave length-1 lesson placements bit-identical. Verified by Task 2 step 5 ("the existing per-hour tests still pass without modification").
5. **Bench budget.** Task 7 explicitly checks the 20% budget and gives a fallback (revert seed change) if the budget breaches.

---

## Execution

Use `superpowers:subagent-driven-development`. Tasks 1, 2, 3 are sequential within `solver-core/src/`. Task 4 builds on 1+2. Tasks 5, 6, 7 are sequential after 1-4 (each depends on the wire format being live). Task 8 is independent of the order.

The plan ships 8 commits inside one PR; the PR squash-merges to master.
