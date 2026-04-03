use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::subjects;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    name: String,
    abbreviation: String,
    color: Option<String>,
    needs_special_room: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    abbreviation: Option<String>,
    color: Option<String>,
    needs_special_room: Option<bool>,
}

#[derive(Debug, Serialize)]
struct SubjectResponse {
    id: String,
    name: String,
    abbreviation: String,
    color: Option<String>,
    needs_special_room: bool,
}

impl SubjectResponse {
    fn from_model(m: &subjects::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            abbreviation: m.abbreviation.clone(),
            color: m.color.clone(),
            needs_special_room: m.needs_special_room,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_ctx.school.id))
        .all(&ctx.db)
        .await?;

    let resp: Vec<SubjectResponse> = items.iter().map(SubjectResponse::from_model).collect();
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

    let entry = subjects::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(body.name),
        abbreviation: Set(body.abbreviation),
        color: Set(body.color),
        needs_special_room: Set(body.needs_special_room.unwrap_or(false)),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = SubjectResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_subjects_school_abbreviation") || msg.contains("duplicate key") {
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
    Path((_school_id, subject_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match subjects::Entity::find_by_id(subject_id)
        .filter(subjects::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "subject not found".to_string()).into_response()
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: subjects::ActiveModel = existing.into();

    if let Some(name) = body.name {
        active.name = Set(name);
    }
    if let Some(abbreviation) = body.abbreviation {
        active.abbreviation = Set(abbreviation);
    }
    if let Some(color) = body.color {
        active.color = Set(Some(color));
    }
    if let Some(needs_special_room) = body.needs_special_room {
        active.needs_special_room = Set(needs_special_room);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = SubjectResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_subjects_school_abbreviation") || msg.contains("duplicate key") {
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
    Path((_school_id, subject_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    match subjects::Entity::find_by_id(subject_id)
        .filter(subjects::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "subject not found".to_string()).into_response()
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    match subjects::Entity::delete_by_id(subject_id)
        .exec(&ctx.db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("foreign key") || msg.contains("violates") {
                (
                    StatusCode::CONFLICT,
                    "cannot delete subject: it is referenced by other records".to_string(),
                )
                    .into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/subjects")
        .add("/", get(list).post(create))
        .add("/{subject_id}", put(update).delete(delete))
}
