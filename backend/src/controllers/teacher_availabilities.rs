use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set, TransactionTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{teacher_availabilities, teachers};

#[derive(Debug, Deserialize)]
struct TermQuery {
    term_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct AvailabilityInput {
    day_of_week: i16,
    period: i16,
    availability_type: String,
}

#[derive(Debug, Serialize)]
struct AvailabilityResponse {
    day_of_week: i16,
    period: i16,
    availability_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

async fn verify_teacher_in_school(
    db: &sea_orm::DatabaseConnection,
    teacher_id: Uuid,
    school_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let teacher = teachers::Entity::find_by_id(teacher_id)
        .filter(teachers::Column::SchoolId.eq(school_id))
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    match teacher {
        Some(_) => Ok(()),
        None => Err((StatusCode::NOT_FOUND, "teacher not found".to_string())),
    }
}

async fn list(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, teacher_id)): Path<(Uuid, Uuid)>,
    Query(q): Query<TermQuery>,
) -> impl IntoResponse {
    if let Err(e) = verify_teacher_in_school(&ctx.db, teacher_id, school_ctx.school.id).await {
        return e.into_response();
    }

    let mut query = teacher_availabilities::Entity::find()
        .filter(teacher_availabilities::Column::TeacherId.eq(teacher_id));
    query = match q.term_id {
        Some(tid) => query.filter(teacher_availabilities::Column::TermId.eq(tid)),
        None => query.filter(teacher_availabilities::Column::TermId.is_null()),
    };

    match query.all(&ctx.db).await {
        Ok(items) => {
            let resp: Vec<AvailabilityResponse> = items
                .into_iter()
                .map(|i| AvailabilityResponse {
                    day_of_week: i.day_of_week,
                    period: i.period,
                    availability_type: i.availability_type,
                    reason: i.reason,
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
    Path((_school_id, teacher_id)): Path<(Uuid, Uuid)>,
    Query(q): Query<TermQuery>,
    Json(body): Json<Vec<AvailabilityInput>>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    // Validate ranges and types, detect duplicates
    let mut seen: HashSet<(i16, i16)> = HashSet::new();
    for item in &body {
        if !(0..=4).contains(&item.day_of_week) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("day_of_week {} out of range (0..=4)", item.day_of_week),
            )
                .into_response();
        }
        if !(1..=10).contains(&item.period) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("period {} out of range (1..=10)", item.period),
            )
                .into_response();
        }
        if !matches!(
            item.availability_type.as_str(),
            "available" | "blocked" | "preferred"
        ) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!(
                    "availability_type '{}' must be available, blocked, or preferred",
                    item.availability_type
                ),
            )
                .into_response();
        }
        if !seen.insert((item.day_of_week, item.period)) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!(
                    "duplicate (day_of_week={}, period={})",
                    item.day_of_week, item.period
                ),
            )
                .into_response();
        }
    }

    if let Err(e) = verify_teacher_in_school(&ctx.db, teacher_id, school_ctx.school.id).await {
        return e.into_response();
    }

    let txn = match ctx.db.begin().await {
        Ok(txn) => txn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Delete existing rows in the target scope
    let mut delete_query = teacher_availabilities::Entity::delete_many()
        .filter(teacher_availabilities::Column::TeacherId.eq(teacher_id));
    delete_query = match q.term_id {
        Some(tid) => delete_query.filter(teacher_availabilities::Column::TermId.eq(tid)),
        None => delete_query.filter(teacher_availabilities::Column::TermId.is_null()),
    };
    if let Err(e) = delete_query.exec(&txn).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Insert non-"available" rows
    let now = chrono::Utc::now().into();
    for item in &body {
        if item.availability_type == "available" {
            continue;
        }
        let entry = teacher_availabilities::ActiveModel {
            id: Set(Uuid::new_v4()),
            teacher_id: Set(teacher_id),
            term_id: Set(q.term_id),
            day_of_week: Set(item.day_of_week),
            period: Set(item.period),
            availability_type: Set(item.availability_type.clone()),
            reason: Set(None),
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
        .prefix("api/schools/{id}/teachers/{teacher_id}/availabilities")
        .add("/", get(list).put(replace))
}
