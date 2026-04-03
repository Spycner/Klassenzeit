use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::teachers;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    first_name: String,
    last_name: String,
    abbreviation: String,
    email: Option<String>,
    max_hours_per_week: Option<i32>,
    is_part_time: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    first_name: Option<String>,
    last_name: Option<String>,
    abbreviation: Option<String>,
    email: Option<String>,
    max_hours_per_week: Option<i32>,
    is_part_time: Option<bool>,
}

#[derive(Debug, Serialize)]
struct TeacherResponse {
    id: String,
    first_name: String,
    last_name: String,
    email: Option<String>,
    abbreviation: String,
    max_hours_per_week: i32,
    is_part_time: bool,
    is_active: bool,
}

impl TeacherResponse {
    fn from_model(m: &teachers::Model) -> Self {
        Self {
            id: m.id.to_string(),
            first_name: m.first_name.clone(),
            last_name: m.last_name.clone(),
            email: m.email.clone(),
            abbreviation: m.abbreviation.clone(),
            max_hours_per_week: m.max_hours_per_week,
            is_part_time: m.is_part_time,
            is_active: m.is_active,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_ctx.school.id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(&ctx.db)
        .await?;

    let resp: Vec<TeacherResponse> = items.iter().map(TeacherResponse::from_model).collect();
    format::json(resp)
}

async fn create(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;
    let now = chrono::Utc::now().into();

    let entry = teachers::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        first_name: Set(body.first_name),
        last_name: Set(body.last_name),
        abbreviation: Set(body.abbreviation),
        email: Set(body.email),
        max_hours_per_week: Set(body.max_hours_per_week.unwrap_or(28)),
        is_part_time: Set(body.is_part_time.unwrap_or(false)),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = TeacherResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_teachers_school_abbreviation") || msg.contains("duplicate key") {
                (
                    StatusCode::CONFLICT,
                    "abbreviation already exists for this school".to_string(),
                )
                    .into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, teacher_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match teachers::Entity::find_by_id(teacher_id)
        .filter(teachers::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "teacher not found".to_string()).into_response()
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: teachers::ActiveModel = existing.into();

    if let Some(first_name) = body.first_name {
        active.first_name = Set(first_name);
    }
    if let Some(last_name) = body.last_name {
        active.last_name = Set(last_name);
    }
    if let Some(abbreviation) = body.abbreviation {
        active.abbreviation = Set(abbreviation);
    }
    if let Some(email) = body.email {
        active.email = Set(Some(email));
    }
    if let Some(max_hours_per_week) = body.max_hours_per_week {
        active.max_hours_per_week = Set(max_hours_per_week);
    }
    if let Some(is_part_time) = body.is_part_time {
        active.is_part_time = Set(is_part_time);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = TeacherResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_teachers_school_abbreviation") || msg.contains("duplicate key") {
                (
                    StatusCode::CONFLICT,
                    "abbreviation already exists for this school".to_string(),
                )
                    .into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, teacher_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match teachers::Entity::find_by_id(teacher_id)
        .filter(teachers::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "teacher not found".to_string()).into_response()
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: teachers::ActiveModel = existing.into();
    active.is_active = Set(false);
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/teachers")
        .add("/", get(list).post(create))
        .add("/{teacher_id}", put(update).delete(delete))
}
