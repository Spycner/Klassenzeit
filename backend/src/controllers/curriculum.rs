use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::curriculum_entries;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    term_id: Uuid,
    school_class_id: Uuid,
    subject_id: Uuid,
    teacher_id: Option<Uuid>,
    hours_per_week: i32,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    teacher_id: Option<Uuid>,
    hours_per_week: Option<i32>,
}

#[derive(Debug, Serialize)]
struct CurriculumEntryResponse {
    id: String,
    term_id: String,
    school_class_id: String,
    subject_id: String,
    teacher_id: Option<String>,
    hours_per_week: i32,
    created_at: String,
    updated_at: String,
}

impl From<curriculum_entries::Model> for CurriculumEntryResponse {
    fn from(m: curriculum_entries::Model) -> Self {
        Self {
            id: m.id.to_string(),
            term_id: m.term_id.to_string(),
            school_class_id: m.school_class_id.to_string(),
            subject_id: m.subject_id.to_string(),
            teacher_id: m.teacher_id.map(|id| id.to_string()),
            hours_per_week: m.hours_per_week,
            created_at: m.created_at.to_rfc3339(),
            updated_at: m.updated_at.to_rfc3339(),
        }
    }
}

/// GET /api/schools/{school_id}/terms/{term_id}/curriculum
async fn list(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    school_ctx: SchoolContext,
) -> impl IntoResponse {
    let school_id = school_ctx.school.id;

    match curriculum_entries::Entity::find()
        .filter(curriculum_entries::Column::SchoolId.eq(school_id))
        .filter(curriculum_entries::Column::TermId.eq(term_id))
        .all(&ctx.db)
        .await
    {
        Ok(entries) => {
            let resp: Vec<CurriculumEntryResponse> = entries
                .into_iter()
                .map(CurriculumEntryResponse::from)
                .collect();
            axum::Json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// POST /api/schools/{school_id}/terms/{term_id}/curriculum
async fn create(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    school_ctx: SchoolContext,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    if body.term_id != term_id {
        return (
            StatusCode::BAD_REQUEST,
            "term_id in body must match URL term_id".to_string(),
        )
            .into_response();
    }

    let school_id = school_ctx.school.id;
    let now = chrono::Utc::now().into();

    let entry = curriculum_entries::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        term_id: Set(term_id),
        school_class_id: Set(body.school_class_id),
        subject_id: Set(body.subject_id),
        teacher_id: Set(body.teacher_id),
        hours_per_week: Set(body.hours_per_week),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = CurriculumEntryResponse::from(model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// PUT /api/schools/{school_id}/terms/{term_id}/curriculum/{entry_id}
async fn update(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id, entry_id)): Path<(Uuid, Uuid, Uuid)>,
    school_ctx: SchoolContext,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match curriculum_entries::Entity::find_by_id(entry_id)
        .filter(curriculum_entries::Column::SchoolId.eq(school_id))
        .filter(curriculum_entries::Column::TermId.eq(term_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                "curriculum entry not found".to_string(),
            )
                .into_response();
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: curriculum_entries::ActiveModel = existing.into();

    if let Some(teacher_id) = body.teacher_id {
        active.teacher_id = Set(Some(teacher_id));
    }
    if let Some(hours) = body.hours_per_week {
        active.hours_per_week = Set(hours);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = CurriculumEntryResponse::from(model);
            axum::Json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// DELETE /api/schools/{school_id}/terms/{term_id}/curriculum/{entry_id}
async fn delete(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id, entry_id)): Path<(Uuid, Uuid, Uuid)>,
    school_ctx: SchoolContext,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    // Verify the entry exists and belongs to this school/term
    match curriculum_entries::Entity::find_by_id(entry_id)
        .filter(curriculum_entries::Column::SchoolId.eq(school_id))
        .filter(curriculum_entries::Column::TermId.eq(term_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                "curriculum entry not found".to_string(),
            )
                .into_response();
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    match curriculum_entries::Entity::delete_by_id(entry_id)
        .exec(&ctx.db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}/terms")
        .add("/{term_id}/curriculum", get(list).post(create))
        .add(
            "/{term_id}/curriculum/{entry_id}",
            put(update).delete(delete),
        )
}
