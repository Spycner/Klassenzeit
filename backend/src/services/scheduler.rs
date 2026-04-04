use chrono::{DateTime, Utc};
use dashmap::DashMap;
use klassenzeit_scheduler::types as sched;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::models::_entities::{
    curriculum_entries, room_subject_suitabilities, rooms, school_classes, subjects,
    teacher_availabilities, teacher_subject_qualifications, teachers, time_slots,
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
    pub violations: Vec<String>,
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

            sched::Teacher {
                id: t.id,
                name: format!("{} {}", t.first_name, t.last_name),
                max_hours_per_week: t.max_hours_per_week as u32,
                is_part_time: t.is_part_time,
                available_slots,
                qualified_subjects,
                preferred_slots: vec![],
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
            class_teacher_id: None,
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
        .filter(room_subject_suitabilities::Column::RoomId.is_in(room_ids))
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
            sched::Room {
                id: r.id,
                name: r.name.clone(),
                capacity: r.capacity.map(|c| c as u32),
                suitable_subjects,
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

    Ok(sched::ScheduleInput {
        teachers: sched_teachers,
        classes: sched_classes,
        rooms: sched_rooms,
        subjects: sched_subjects,
        timeslots: sched_timeslots,
        requirements,
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
            .map(|v| v.description)
            .collect(),
    }
}
