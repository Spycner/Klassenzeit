use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::rooms;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    name: String,
    building: Option<String>,
    capacity: Option<i32>,
    max_concurrent: Option<i16>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    building: Option<String>,
    capacity: Option<i32>,
    max_concurrent: Option<i16>,
}

#[derive(Debug, Serialize)]
struct RoomResponse {
    id: String,
    name: String,
    building: Option<String>,
    capacity: Option<i32>,
    is_active: bool,
    max_concurrent: i16,
}

impl RoomResponse {
    fn from_model(m: &rooms::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            building: m.building.clone(),
            capacity: m.capacity,
            is_active: m.is_active,
            max_concurrent: m.max_concurrent,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = rooms::Entity::find()
        .filter(rooms::Column::SchoolId.eq(school_ctx.school.id))
        .filter(rooms::Column::IsActive.eq(true))
        .all(&ctx.db)
        .await?;

    let resp: Vec<RoomResponse> = items.iter().map(RoomResponse::from_model).collect();
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

    let entry = rooms::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(body.name),
        building: Set(body.building),
        capacity: Set(body.capacity),
        is_active: Set(true),
        max_concurrent: Set(body.max_concurrent.unwrap_or(1)),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = RoomResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_rooms_school_name") || msg.contains("duplicate key") {
                (
                    StatusCode::CONFLICT,
                    "name already exists for this school".to_string(),
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
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "room not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: rooms::ActiveModel = existing.into();

    if let Some(name) = body.name {
        active.name = Set(name);
    }
    if let Some(building) = body.building {
        active.building = Set(Some(building));
    }
    if let Some(capacity) = body.capacity {
        active.capacity = Set(Some(capacity));
    }
    if let Some(mc) = body.max_concurrent {
        active.max_concurrent = Set(mc);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = RoomResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_rooms_school_name") || msg.contains("duplicate key") {
                (
                    StatusCode::CONFLICT,
                    "name already exists for this school".to_string(),
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
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "room not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: rooms::ActiveModel = existing.into();
    active.is_active = Set(false);
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/rooms")
        .add("/", get(list).post(create))
        .add("/{room_id}", put(update).delete(delete))
}
