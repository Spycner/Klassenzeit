use chrono::{DateTime, Utc};
use dashmap::DashMap;
use klassenzeit_scheduler::types as sched;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use klassenzeit_scheduler::constraints::diagnose;
use klassenzeit_scheduler::mapper::{to_planning, translate_diagnosed};
use klassenzeit_scheduler::planning::PlanningLesson;

use crate::models::_entities::{
    curriculum_entries, lessons, room_subject_suitabilities, room_timeslot_capacities, rooms,
    school_classes, subjects, teacher_availabilities, teacher_subject_qualifications, teachers,
    time_slots,
};

// ---------------------------------------------------------------------------
// Shared state types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct SolveJob {
    pub status: SolveStatus,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<SolveResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SolveStatus {
    Solving,
    Solved,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct SolveResult {
    pub timetable: Vec<SolveLesson>,
    pub score: SolveScore,
    pub violations: Vec<ViolationDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<SolveStatsDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ViolationDto {
    pub kind: String,
    pub severity: String,
    pub message: String,
    pub lesson_refs: Vec<LessonRefDto>,
    pub resources: Vec<ResourceRefDto>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LessonRefDto {
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot_id: Uuid,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "id", rename_all = "snake_case")]
pub enum ResourceRefDto {
    Teacher(Uuid),
    Class(Uuid),
    Room(Uuid),
    Subject(Uuid),
    Timeslot(Uuid),
}

#[derive(Debug, Clone, Serialize)]
pub struct SolveStatsDto {
    pub construction_ms: u64,
    pub local_search_ms: u64,
    pub iterations: u64,
    pub iterations_per_sec: f64,
    pub moves_accepted: u64,
    pub moves_rejected: u64,
    pub best_found_at_iteration: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SolveLesson {
    pub teacher_id: Uuid,
    pub class_id: Uuid,
    pub subject_id: Uuid,
    pub room_id: Option<Uuid>,
    pub timeslot_id: Uuid,
}

#[derive(Debug, Clone, Serialize)]
pub struct SolveScore {
    pub hard_violations: u32,
    pub soft_score: f64,
}

pub type SchedulerState = Arc<DashMap<Uuid, SolveJob>>;

pub fn new_scheduler_state() -> SchedulerState {
    Arc::new(DashMap::new())
}

// ---------------------------------------------------------------------------
// DB-to-scheduler mapping
// ---------------------------------------------------------------------------

pub async fn load_schedule_input(
    db: &DatabaseConnection,
    school_id: Uuid,
    term_id: Uuid,
) -> Result<sched::ScheduleInput, sea_orm::DbErr> {
    // Load active teachers for school
    let db_teachers = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(db)
        .await?;

    let teacher_ids: Vec<Uuid> = db_teachers.iter().map(|t| t.id).collect();

    // Load qualifications for these teachers
    let qualifications = teacher_subject_qualifications::Entity::find()
        .filter(teacher_subject_qualifications::Column::TeacherId.is_in(teacher_ids.clone()))
        .all(db)
        .await?;

    // Load availabilities (term-specific or default)
    let availabilities = teacher_availabilities::Entity::find()
        .filter(teacher_availabilities::Column::TeacherId.is_in(teacher_ids.clone()))
        .filter(
            teacher_availabilities::Column::TermId
                .eq(term_id)
                .or(teacher_availabilities::Column::TermId.is_null()),
        )
        .all(db)
        .await?;

    // Load non-break timeslots
    let db_timeslots = time_slots::Entity::find()
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .filter(time_slots::Column::IsBreak.eq(false))
        .all(db)
        .await?;

    let sched_timeslots: Vec<sched::TimeSlot> = db_timeslots
        .iter()
        .map(|ts| sched::TimeSlot {
            id: ts.id,
            day: ts.day_of_week as u8,
            period: ts.period as u8,
        })
        .collect();

    // Build teacher structs with availability and qualifications
    let sched_teachers: Vec<sched::Teacher> = db_teachers
        .iter()
        .map(|t| {
            let qualified_subjects: Vec<Uuid> = qualifications
                .iter()
                .filter(|q| q.teacher_id == t.id)
                .map(|q| q.subject_id)
                .collect();

            let blocked: std::collections::HashSet<(i16, i16)> = availabilities
                .iter()
                .filter(|a| a.teacher_id == t.id && a.availability_type == "blocked")
                .map(|a| (a.day_of_week, a.period))
                .collect();

            let available_slots: Vec<sched::TimeSlot> = sched_timeslots
                .iter()
                .filter(|ts| !blocked.contains(&(ts.day as i16, ts.period as i16)))
                .cloned()
                .collect();

            let preferred: std::collections::HashSet<(i16, i16)> = availabilities
                .iter()
                .filter(|a| a.teacher_id == t.id && a.availability_type == "preferred")
                .map(|a| (a.day_of_week, a.period))
                .collect();

            let preferred_slots: Vec<sched::TimeSlot> = sched_timeslots
                .iter()
                .filter(|ts| preferred.contains(&(ts.day as i16, ts.period as i16)))
                .cloned()
                .collect();

            sched::Teacher {
                id: t.id,
                name: format!("{} {}", t.first_name, t.last_name),
                max_hours_per_week: t.max_hours_per_week as u32,
                is_part_time: t.is_part_time,
                available_slots,
                qualified_subjects,
                preferred_slots,
            }
        })
        .collect();

    // Load active classes
    let db_classes = school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .filter(school_classes::Column::IsActive.eq(true))
        .all(db)
        .await?;

    let sched_classes: Vec<sched::SchoolClass> = db_classes
        .iter()
        .map(|c| sched::SchoolClass {
            id: c.id,
            name: c.name.clone(),
            grade_level: c.grade_level as u8,
            student_count: c.student_count.map(|s| s as u32),
            class_teacher_id: c.class_teacher_id,
            available_slots: vec![],
            grade: None,
        })
        .collect();

    // Load subjects
    let db_subjects = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_id))
        .all(db)
        .await?;

    let sched_subjects: Vec<sched::Subject> = db_subjects
        .iter()
        .map(|s| sched::Subject {
            id: s.id,
            name: s.name.clone(),
            needs_special_room: s.needs_special_room,
        })
        .collect();

    // Load active rooms with suitabilities
    let db_rooms = rooms::Entity::find()
        .filter(rooms::Column::SchoolId.eq(school_id))
        .filter(rooms::Column::IsActive.eq(true))
        .all(db)
        .await?;

    let room_ids: Vec<Uuid> = db_rooms.iter().map(|r| r.id).collect();
    let suitabilities = room_subject_suitabilities::Entity::find()
        .filter(room_subject_suitabilities::Column::RoomId.is_in(room_ids.clone()))
        .all(db)
        .await?;

    let capacity_overrides = room_timeslot_capacities::Entity::find()
        .filter(room_timeslot_capacities::Column::RoomId.is_in(room_ids))
        .all(db)
        .await?;

    let sched_rooms: Vec<sched::Room> = db_rooms
        .iter()
        .map(|r| {
            let suitable_subjects: Vec<Uuid> = suitabilities
                .iter()
                .filter(|s| s.room_id == r.id)
                .map(|s| s.subject_id)
                .collect();

            let timeslot_capacity_overrides: std::collections::HashMap<sched::TimeSlot, u8> =
                capacity_overrides
                    .iter()
                    .filter(|co| co.room_id == r.id)
                    .filter_map(|co| {
                        db_timeslots
                            .iter()
                            .find(|ts| ts.id == co.timeslot_id)
                            .map(|ts| {
                                (
                                    sched::TimeSlot {
                                        id: ts.id,
                                        day: ts.day_of_week as u8,
                                        period: ts.period as u8,
                                    },
                                    co.capacity.max(0) as u8,
                                )
                            })
                    })
                    .collect();

            sched::Room {
                id: r.id,
                name: r.name.clone(),
                capacity: r.capacity.map(|c| c as u32),
                suitable_subjects,
                max_concurrent: r.max_concurrent.max(0) as u8,
                timeslot_capacity_overrides,
            }
        })
        .collect();

    // Load curriculum entries
    let db_curriculum = curriculum_entries::Entity::find()
        .filter(curriculum_entries::Column::SchoolId.eq(school_id))
        .filter(curriculum_entries::Column::TermId.eq(term_id))
        .all(db)
        .await?;

    let requirements: Vec<sched::LessonRequirement> = db_curriculum
        .iter()
        .map(|c| sched::LessonRequirement {
            class_id: c.school_class_id,
            subject_id: c.subject_id,
            teacher_id: c.teacher_id,
            hours_per_week: c.hours_per_week as u32,
        })
        .collect();

    let weights: klassenzeit_scheduler::planning::ConstraintWeights =
        crate::services::scheduler_settings::load(db, school_id)
            .await?
            .into();

    Ok(sched::ScheduleInput {
        teachers: sched_teachers,
        classes: sched_classes,
        rooms: sched_rooms,
        subjects: sched_subjects,
        timeslots: sched_timeslots,
        requirements,
        stundentafeln: vec![],
        weights,
    })
}

/// Convert scheduler output to serializable result
pub fn to_solve_result(output: sched::ScheduleOutput) -> SolveResult {
    SolveResult {
        timetable: output
            .timetable
            .into_iter()
            .map(|l| SolveLesson {
                teacher_id: l.teacher_id,
                class_id: l.class_id,
                subject_id: l.subject_id,
                room_id: l.room_id,
                timeslot_id: l.timeslot.id,
            })
            .collect(),
        score: SolveScore {
            hard_violations: output.score.hard_violations,
            soft_score: output.score.soft_score,
        },
        violations: output
            .violations
            .into_iter()
            .map(|v| ViolationDto {
                kind: v.kind.as_snake_case().to_string(),
                severity: match v.severity {
                    sched::Severity::Hard => "hard".to_string(),
                    sched::Severity::Soft => "soft".to_string(),
                },
                message: v.message,
                lesson_refs: v
                    .lesson_refs
                    .into_iter()
                    .map(|r| LessonRefDto {
                        class_id: r.class_id,
                        subject_id: r.subject_id,
                        teacher_id: r.teacher_id,
                        room_id: r.room_id,
                        timeslot_id: r.timeslot_id,
                    })
                    .collect(),
                resources: v
                    .resources
                    .into_iter()
                    .map(|r| match r {
                        sched::ResourceRef::Teacher(id) => ResourceRefDto::Teacher(id),
                        sched::ResourceRef::Class(id) => ResourceRefDto::Class(id),
                        sched::ResourceRef::Room(id) => ResourceRefDto::Room(id),
                        sched::ResourceRef::Subject(id) => ResourceRefDto::Subject(id),
                        sched::ResourceRef::Timeslot(id) => ResourceRefDto::Timeslot(id),
                    })
                    .collect(),
            })
            .collect(),
        stats: output.stats.map(|s| SolveStatsDto {
            construction_ms: s.construction_ms,
            local_search_ms: s.local_search_ms,
            iterations: s.iterations,
            iterations_per_sec: s.iterations_per_sec,
            moves_accepted: s.moves_accepted,
            moves_rejected: s.moves_rejected,
            best_found_at_iteration: s.best_found_at_iteration,
        }),
    }
}

/// Evaluate hard+soft violations for the **applied** lessons of a term.
///
/// Re-uses `load_schedule_input` for facts/index maps but replaces the
/// curriculum-derived planning lessons with the actual DB rows so the
/// diagnosis reflects what's persisted, not what the solver started from.
pub async fn evaluate_term_violations(
    db: &DatabaseConnection,
    school_id: Uuid,
    term_id: Uuid,
) -> Result<Vec<ViolationDto>, sea_orm::DbErr> {
    let input = load_schedule_input(db, school_id, term_id).await?;
    let (mut solution, maps) = to_planning(&input);

    // Replace planning lessons with the actual applied DB rows.
    let db_lessons = lessons::Entity::find()
        .filter(lessons::Column::TermId.eq(term_id))
        .all(db)
        .await?;

    let mut planning_lessons: Vec<PlanningLesson> = Vec::with_capacity(db_lessons.len());
    for (i, l) in db_lessons.iter().enumerate() {
        let class_idx = match maps.class_uuid_to_idx.get(&l.school_class_id) {
            Some(&v) => v,
            None => continue, // class deleted/inactive — skip silently
        };
        let subject_idx = match maps.subject_uuid_to_idx.get(&l.subject_id) {
            Some(&v) => v,
            None => continue,
        };
        let teacher_idx = match maps.teacher_uuid_to_idx.get(&l.teacher_id) {
            Some(&v) => v,
            None => continue,
        };
        let timeslot_idx = match maps.timeslot_uuid_to_idx.get(&l.timeslot_id) {
            Some(&v) => v,
            None => continue,
        };
        let room_idx = l
            .room_id
            .and_then(|rid| maps.room_uuid_to_idx.get(&rid).copied());

        planning_lessons.push(PlanningLesson {
            id: i,
            subject_idx,
            teacher_idx,
            class_idx,
            timeslot: Some(timeslot_idx),
            room: room_idx,
        });
    }

    solution.lessons = planning_lessons;

    let diagnosed = diagnose(&solution.lessons, &solution.facts);
    let violations = translate_diagnosed(diagnosed, &solution, &maps, &input);

    let dtos: Vec<ViolationDto> = violations
        .into_iter()
        .map(|v| ViolationDto {
            kind: v.kind.as_snake_case().to_string(),
            severity: match v.severity {
                sched::Severity::Hard => "hard".to_string(),
                sched::Severity::Soft => "soft".to_string(),
            },
            message: v.message,
            lesson_refs: v
                .lesson_refs
                .into_iter()
                .map(|r| LessonRefDto {
                    class_id: r.class_id,
                    subject_id: r.subject_id,
                    teacher_id: r.teacher_id,
                    room_id: r.room_id,
                    timeslot_id: r.timeslot_id,
                })
                .collect(),
            resources: v
                .resources
                .into_iter()
                .map(|r| match r {
                    sched::ResourceRef::Teacher(id) => ResourceRefDto::Teacher(id),
                    sched::ResourceRef::Class(id) => ResourceRefDto::Class(id),
                    sched::ResourceRef::Room(id) => ResourceRefDto::Room(id),
                    sched::ResourceRef::Subject(id) => ResourceRefDto::Subject(id),
                    sched::ResourceRef::Timeslot(id) => ResourceRefDto::Timeslot(id),
                })
                .collect(),
        })
        .collect();

    Ok(dtos)
}
