use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use chrono::Utc;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::Serialize;
use uuid::Uuid;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::lessons;
use crate::services::scheduler::{SchedulerState, SolveJob, SolveStatus};
use crate::workers::scheduler::{SchedulerWorker, SchedulerWorkerArgs};

#[derive(Debug, Serialize)]
struct StatusResponse {
    status: SolveStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    hard_violations: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    soft_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn get_scheduler_state(ctx: &AppContext) -> Result<SchedulerState, (StatusCode, String)> {
    ctx.shared_store
        .get_ref::<SchedulerState>()
        .ok_or((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Scheduler state not available".to_string(),
        ))
        .map(|s| s.clone())
}

fn require_admin(school_ctx: &SchoolContext) -> Result<(), (StatusCode, String)> {
    if school_ctx.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin access required".to_string()));
    }
    Ok(())
}

/// POST /api/schools/{school_id}/terms/{term_id}/scheduler/solve
async fn trigger_solve(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    school_ctx: SchoolContext,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_admin(&school_ctx)?;
    let state = get_scheduler_state(&ctx)?;

    // Check if already solving
    if let Some(job) = state.get(&term_id) {
        if job.status == SolveStatus::Solving {
            return Err((
                StatusCode::CONFLICT,
                "A solve job is already running for this term".to_string(),
            ));
        }
    }

    // Insert job with Solving status
    state.insert(
        term_id,
        SolveJob {
            status: SolveStatus::Solving,
            started_at: Utc::now(),
            completed_at: None,
            result: None,
            error: None,
        },
    );

    // Enqueue background worker
    SchedulerWorker::perform_later(
        &ctx,
        SchedulerWorkerArgs {
            term_id,
            school_id: school_ctx.school.id,
        },
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::ACCEPTED)
}

/// GET /api/schools/{school_id}/terms/{term_id}/scheduler/status
async fn get_status(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    _school_ctx: SchoolContext,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let state = get_scheduler_state(&ctx)?;

    let job = state.get(&term_id).ok_or((
        StatusCode::NOT_FOUND,
        "No solve job found for this term".to_string(),
    ))?;

    let response = StatusResponse {
        status: job.status.clone(),
        hard_violations: job.result.as_ref().map(|r| r.score.hard_violations),
        soft_score: job.result.as_ref().map(|r| r.score.soft_score),
        error: job.error.clone(),
    };

    Ok(Json(response))
}

/// GET /api/schools/{school_id}/terms/{term_id}/scheduler/solution
async fn get_solution(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    _school_ctx: SchoolContext,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let state = get_scheduler_state(&ctx)?;

    let job = state.get(&term_id).ok_or((
        StatusCode::NOT_FOUND,
        "No solve job found for this term".to_string(),
    ))?;

    if job.status != SolveStatus::Solved {
        return Err((
            StatusCode::NOT_FOUND,
            "No solved solution available".to_string(),
        ));
    }

    let result = job
        .result
        .clone()
        .ok_or((StatusCode::NOT_FOUND, "Solution data missing".to_string()))?;

    Ok(Json(result))
}

/// POST /api/schools/{school_id}/terms/{term_id}/scheduler/apply
async fn apply_solution(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    school_ctx: SchoolContext,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_admin(&school_ctx)?;
    let state = get_scheduler_state(&ctx)?;

    let result = {
        let job = state
            .get(&term_id)
            .ok_or((StatusCode::BAD_REQUEST, "No solve job found".to_string()))?;

        if job.status != SolveStatus::Solved {
            return Err((
                StatusCode::BAD_REQUEST,
                "Solution is not in solved state".to_string(),
            ));
        }

        job.result
            .clone()
            .ok_or((StatusCode::BAD_REQUEST, "Solution data missing".to_string()))?
    };

    // Delete existing lessons for this term
    lessons::Entity::delete_many()
        .filter(lessons::Column::TermId.eq(term_id))
        .exec(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Insert new lessons from solution
    let mut lessons_created: u64 = 0;
    for lesson in &result.timetable {
        let active = lessons::ActiveModel {
            id: Set(Uuid::new_v4()),
            term_id: Set(term_id),
            school_class_id: Set(lesson.class_id),
            teacher_id: Set(lesson.teacher_id),
            subject_id: Set(lesson.subject_id),
            room_id: Set(lesson.room_id),
            timeslot_id: Set(lesson.timeslot_id),
            week_pattern: Set("every".to_string()),
            ..Default::default()
        };
        active
            .insert(&ctx.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        lessons_created += 1;
    }

    // Clear cached solution
    state.remove(&term_id);

    Ok(Json(
        serde_json::json!({ "lessons_created": lessons_created }),
    ))
}

/// DELETE /api/schools/{school_id}/terms/{term_id}/scheduler/solution
async fn discard_solution(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    school_ctx: SchoolContext,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_admin(&school_ctx)?;
    let state = get_scheduler_state(&ctx)?;

    state.remove(&term_id);

    Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}/terms/{term_id}/scheduler")
        .add("/solve", post(trigger_solve))
        .add("/status", get(get_status))
        .add("/solution", get(get_solution).delete(discard_solution))
        .add("/apply", post(apply_solution))
}
