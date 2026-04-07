use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::patch;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{
    lessons, rooms, school_years, teachers as teacher_entities, terms, time_slots,
};
use crate::services::scheduler::{evaluate_term_violations, ViolationDto};

#[derive(Debug, Deserialize, Default)]
struct ListQuery {
    #[serde(default)]
    include_violations: bool,
}

#[derive(Debug, Serialize)]
struct LessonsWithViolations {
    lessons: Vec<LessonResponse>,
    violations: Vec<ViolationDto>,
}

#[derive(Debug, Serialize)]
struct LessonResponse {
    id: String,
    term_id: String,
    class_id: String,
    teacher_id: String,
    subject_id: String,
    room_id: Option<String>,
    timeslot_id: String,
    week_pattern: String,
}

impl From<lessons::Model> for LessonResponse {
    fn from(m: lessons::Model) -> Self {
        Self {
            id: m.id.to_string(),
            term_id: m.term_id.to_string(),
            class_id: m.school_class_id.to_string(),
            teacher_id: m.teacher_id.to_string(),
            subject_id: m.subject_id.to_string(),
            room_id: m.room_id.map(|id| id.to_string()),
            timeslot_id: m.timeslot_id.to_string(),
            week_pattern: m.week_pattern,
        }
    }
}

/// GET /api/schools/{school_id}/terms/{term_id}/lessons[?include_violations=true]
async fn list(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ListQuery>,
    school_ctx: SchoolContext,
) -> impl IntoResponse {
    let school_id = school_ctx.school.id;

    // Verify the term belongs to the caller's school via school_years.
    match terms::Entity::find_by_id(term_id)
        .find_also_related(school_years::Entity)
        .one(&ctx.db)
        .await
    {
        Ok(Some((_term, Some(year)))) if year.school_id == school_id => {}
        Ok(_) => {
            return (StatusCode::NOT_FOUND, "term not found".to_string()).into_response();
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    let items = match lessons::Entity::find()
        .filter(lessons::Column::TermId.eq(term_id))
        .all(&ctx.db)
        .await
    {
        Ok(items) => items,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let lesson_responses: Vec<LessonResponse> =
        items.into_iter().map(LessonResponse::from).collect();

    if query.include_violations {
        let violations = match evaluate_term_violations(&ctx.db, school_id, term_id).await {
            Ok(v) => v,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };
        axum::Json(LessonsWithViolations {
            lessons: lesson_responses,
            violations,
        })
        .into_response()
    } else {
        axum::Json(lesson_responses).into_response()
    }
}

#[derive(Debug, Deserialize)]
struct PatchLessonRequest {
    #[serde(default)]
    timeslot_id: Option<Uuid>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    room_id: Option<Option<Uuid>>,
    #[serde(default)]
    teacher_id: Option<Uuid>,
}

// Distinguishes "field absent" (None) from "field present and null" (Some(None)).
fn deserialize_double_option<'de, D>(deserializer: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Uuid>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Serialize)]
struct PatchLessonResponse {
    lesson: LessonResponse,
    violations: Vec<ViolationDto>,
}

fn require_admin_or_403(school_ctx: &SchoolContext) -> Result<(), (StatusCode, String)> {
    if school_ctx.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin access required".to_string()));
    }
    Ok(())
}

/// PATCH /api/schools/{school_id}/terms/{term_id}/lessons/{lesson_id}
async fn patch_one(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id, lesson_id)): Path<(Uuid, Uuid, Uuid)>,
    school_ctx: SchoolContext,
    axum::Json(body): axum::Json<PatchLessonRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_admin_or_403(&school_ctx)?;
    let school_id = school_ctx.school.id;

    // Confirm term belongs to caller's school.
    match terms::Entity::find_by_id(term_id)
        .find_also_related(school_years::Entity)
        .one(&ctx.db)
        .await
    {
        Ok(Some((_term, Some(year)))) if year.school_id == school_id => {}
        Ok(_) => return Err((StatusCode::NOT_FOUND, "term not found".to_string())),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }

    // Load lesson and verify it belongs to that term.
    let lesson_model = lessons::Entity::find_by_id(lesson_id)
        .one(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "lesson not found".to_string()))?;
    if lesson_model.term_id != term_id {
        return Err((StatusCode::NOT_FOUND, "lesson not in term".to_string()));
    }

    // Validate provided timeslot.
    if let Some(ts_id) = body.timeslot_id {
        let ts = time_slots::Entity::find_by_id(ts_id)
            .one(&ctx.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((StatusCode::BAD_REQUEST, "timeslot not found".to_string()))?;
        if ts.school_id != school_id {
            return Err((
                StatusCode::BAD_REQUEST,
                "timeslot belongs to a different school".to_string(),
            ));
        }
        if ts.is_break {
            return Err((
                StatusCode::BAD_REQUEST,
                "cannot place a lesson on a break timeslot".to_string(),
            ));
        }
    }

    // Validate provided room (Some(Some(_))).
    if let Some(Some(rid)) = body.room_id {
        let room = rooms::Entity::find_by_id(rid)
            .one(&ctx.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((StatusCode::BAD_REQUEST, "room not found".to_string()))?;
        if room.school_id != school_id {
            return Err((
                StatusCode::BAD_REQUEST,
                "room belongs to a different school".to_string(),
            ));
        }
    }

    // Validate provided teacher.
    if let Some(tid) = body.teacher_id {
        let teacher = teacher_entities::Entity::find_by_id(tid)
            .one(&ctx.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((StatusCode::BAD_REQUEST, "teacher not found".to_string()))?;
        if teacher.school_id != school_id {
            return Err((
                StatusCode::BAD_REQUEST,
                "teacher belongs to a different school".to_string(),
            ));
        }
    }

    // Build the update.
    let mut active: lessons::ActiveModel = lesson_model.into();
    if let Some(ts) = body.timeslot_id {
        active.timeslot_id = Set(ts);
    }
    if let Some(room_opt) = body.room_id {
        active.room_id = Set(room_opt);
    }
    if let Some(tch) = body.teacher_id {
        active.teacher_id = Set(tch);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    let updated = active
        .update(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let violations = evaluate_term_violations(&ctx.db, school_id, term_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(axum::Json(PatchLessonResponse {
        lesson: LessonResponse::from(updated),
        violations,
    }))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}/terms")
        .add("/{term_id}/lessons", get(list))
        .add("/{term_id}/lessons/{lesson_id}", patch(patch_one))
}
