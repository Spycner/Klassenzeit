pub mod types;

pub mod planning;

pub mod mapper;

pub mod constraints;

pub mod construction;

pub mod local_search;

use std::time::Instant;

use types::*;

pub fn solve(input: ScheduleInput) -> ScheduleOutput {
    solve_with_config(input, local_search::LahcConfig::default())
}

pub fn solve_with_config(input: ScheduleInput, config: local_search::LahcConfig) -> ScheduleOutput {
    if input.requirements.is_empty() {
        return ScheduleOutput::default();
    }

    // Check for requirements that can't be fulfilled before planning
    let mut pre_violations = Vec::new();
    let filterable_input = pre_validate(&input, &mut pre_violations);

    if filterable_input.requirements.is_empty() {
        return ScheduleOutput {
            timetable: vec![],
            score: types::Score {
                hard_violations: pre_violations.len() as u32,
                soft_score: 0.0,
            },
            violations: pre_violations,
            stats: None,
        };
    }

    let (mut solution, maps) = mapper::to_planning(&filterable_input);

    // Construction phase
    let construction_start = Instant::now();
    let mut state = constraints::IncrementalState::new(&solution.facts);
    construction::construct_with_state(&mut solution.lessons, &solution.facts, &mut state);
    let construction_ms = construction_start.elapsed().as_millis() as u64;

    // Local search phase
    let mut stats =
        local_search::optimize(&mut solution.lessons, &solution.facts, &mut state, &config);
    stats.construction_ms = construction_ms;

    solution.score = state.score();

    let mut output = mapper::to_output(&solution, &maps, &filterable_input);

    // Merge pre-validation violations
    output.score.hard_violations += pre_violations.len() as u32;
    output.violations.extend(pre_violations);
    output.stats = Some(stats);
    output
}

/// Filter out requirements that can never be satisfied (e.g. no qualified teacher).
fn pre_validate(input: &ScheduleInput, violations: &mut Vec<types::Violation>) -> ScheduleInput {
    let mut valid_requirements = Vec::new();

    for req in &input.requirements {
        let has_teacher = if let Some(tid) = req.teacher_id {
            input.teachers.iter().any(|t| t.id == tid)
        } else {
            input
                .teachers
                .iter()
                .any(|t| t.qualified_subjects.contains(&req.subject_id))
        };

        if has_teacher {
            valid_requirements.push(req.clone());
        } else {
            for _ in 0..req.hours_per_week {
                violations.push(types::Violation {
                    description: format!(
                        "No qualified teacher for subject {} in class {}",
                        req.subject_id, req.class_id
                    ),
                });
            }
        }
    }

    ScheduleInput {
        teachers: input.teachers.clone(),
        classes: input.classes.clone(),
        rooms: input.rooms.clone(),
        subjects: input.subjects.clone(),
        timeslots: input.timeslots.clone(),
        requirements: valid_requirements,
    }
}
