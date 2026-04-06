use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set, TransactionTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{room_subject_suitabilities, rooms, subjects};

#[derive(Debug, Deserialize)]
struct SuitabilityReplaceBody {
    subject_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize)]
struct SuitabilityResponse {
    subject_id: String,
}

async fn verify_room_in_school(
    db: &sea_orm::DatabaseConnection,
    room_id: Uuid,
    school_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let room = rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_id))
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    match room {
        Some(_) => Ok(()),
        None => Err((StatusCode::NOT_FOUND, "room not found".to_string())),
    }
}

async fn list(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if let Err(e) = verify_room_in_school(&ctx.db, room_id, school_ctx.school.id).await {
        return e.into_response();
    }

    match room_subject_suitabilities::Entity::find()
        .filter(room_subject_suitabilities::Column::RoomId.eq(room_id))
        .all(&ctx.db)
        .await
    {
        Ok(items) => {
            let resp: Vec<SuitabilityResponse> = items
                .into_iter()
                .map(|i| SuitabilityResponse {
                    subject_id: i.subject_id.to_string(),
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
    Json(body): Json<SuitabilityReplaceBody>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    if let Err(e) = verify_room_in_school(&ctx.db, room_id, school_ctx.school.id).await {
        return e.into_response();
    }

    // Dedupe
    let unique_ids: HashSet<Uuid> = body.subject_ids.into_iter().collect();

    // Validate every subject belongs to this school
    if !unique_ids.is_empty() {
        let ids: Vec<Uuid> = unique_ids.iter().copied().collect();
        let found = match subjects::Entity::find()
            .filter(subjects::Column::Id.is_in(ids))
            .filter(subjects::Column::SchoolId.eq(school_ctx.school.id))
            .all(&ctx.db)
            .await
        {
            Ok(s) => s,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };
        if found.len() != unique_ids.len() {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                "subject_ids: unknown or cross-tenant".to_string(),
            )
                .into_response();
        }
    }

    let txn = match ctx.db.begin().await {
        Ok(txn) => txn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if let Err(e) = room_subject_suitabilities::Entity::delete_many()
        .filter(room_subject_suitabilities::Column::RoomId.eq(room_id))
        .exec(&txn)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let now = chrono::Utc::now().into();
    for sid in unique_ids {
        let entry = room_subject_suitabilities::ActiveModel {
            id: Set(Uuid::new_v4()),
            room_id: Set(room_id),
            subject_id: Set(sid),
            notes: Set(None),
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
        .prefix("api/schools/{id}/rooms/{room_id}/suitabilities")
        .add("/", get(list).put(replace))
}
