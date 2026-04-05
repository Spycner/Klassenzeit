use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set, TransactionTrait};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::room_timeslot_capacities;
use crate::models::_entities::rooms;

#[derive(Debug, Deserialize)]
struct CapacityOverride {
    timeslot_id: Uuid,
    capacity: i16,
}

#[derive(Debug, Serialize)]
struct CapacityOverrideResponse {
    timeslot_id: String,
    capacity: i16,
}

async fn list(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    let room = rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_ctx.school.id))
        .one(&ctx.db)
        .await;

    match room {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "room not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    match room_timeslot_capacities::Entity::find()
        .filter(room_timeslot_capacities::Column::RoomId.eq(room_id))
        .all(&ctx.db)
        .await
    {
        Ok(items) => {
            let resp: Vec<CapacityOverrideResponse> = items
                .iter()
                .map(|i| CapacityOverrideResponse {
                    timeslot_id: i.timeslot_id.to_string(),
                    capacity: i.capacity,
                })
                .collect();
            format::json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn replace(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<Vec<CapacityOverride>>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    // Validate capacity values
    for item in &body {
        if item.capacity < 0 {
            return (StatusCode::BAD_REQUEST, "capacity must be >= 0".to_string()).into_response();
        }
    }

    let room = rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_ctx.school.id))
        .one(&ctx.db)
        .await;

    match room {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "room not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    let txn = match ctx.db.begin().await {
        Ok(txn) => txn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if let Err(e) = room_timeslot_capacities::Entity::delete_many()
        .filter(room_timeslot_capacities::Column::RoomId.eq(room_id))
        .exec(&txn)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let now = chrono::Utc::now().into();
    for item in &body {
        let entry = room_timeslot_capacities::ActiveModel {
            id: Set(Uuid::new_v4()),
            room_id: Set(room_id),
            timeslot_id: Set(item.timeslot_id),
            capacity: Set(item.capacity),
            created_at: Set(now),
            updated_at: Set(now),
        };
        if let Err(e) = entry.insert(&txn).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }

    if let Err(e) = txn.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/rooms/{room_id}/timeslot-capacities")
        .add("/", get(list).put(replace))
}
