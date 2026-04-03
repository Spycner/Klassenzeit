use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::time_slots;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    day_of_week: i16,
    period: i16,
    start_time: chrono::NaiveTime,
    end_time: chrono::NaiveTime,
    is_break: Option<bool>,
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    day_of_week: Option<i16>,
    period: Option<i16>,
    start_time: Option<chrono::NaiveTime>,
    end_time: Option<chrono::NaiveTime>,
    is_break: Option<bool>,
    label: Option<String>,
}

#[derive(Debug, Serialize)]
struct TimeSlotResponse {
    id: String,
    day_of_week: i16,
    period: i16,
    start_time: String,
    end_time: String,
    is_break: bool,
    label: Option<String>,
}

impl TimeSlotResponse {
    fn from_model(m: &time_slots::Model) -> Self {
        Self {
            id: m.id.to_string(),
            day_of_week: m.day_of_week,
            period: m.period,
            start_time: m.start_time.format("%H:%M").to_string(),
            end_time: m.end_time.format("%H:%M").to_string(),
            is_break: m.is_break,
            label: m.label.clone(),
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = time_slots::Entity::find()
        .filter(time_slots::Column::SchoolId.eq(school_ctx.school.id))
        .order_by_asc(time_slots::Column::DayOfWeek)
        .order_by_asc(time_slots::Column::Period)
        .all(&ctx.db)
        .await?;

    let resp: Vec<TimeSlotResponse> = items.iter().map(TimeSlotResponse::from_model).collect();
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

    let entry = time_slots::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        day_of_week: Set(body.day_of_week),
        period: Set(body.period),
        start_time: Set(body.start_time),
        end_time: Set(body.end_time),
        is_break: Set(body.is_break.unwrap_or(false)),
        label: Set(body.label),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = TimeSlotResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_timeslots_school_day_period") || msg.contains("duplicate key") {
                (
                    StatusCode::CONFLICT,
                    "timeslot already exists for this school/day/period".to_string(),
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
    Path((_school_id, slot_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match time_slots::Entity::find_by_id(slot_id)
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "timeslot not found".to_string()).into_response()
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: time_slots::ActiveModel = existing.into();

    if let Some(day_of_week) = body.day_of_week {
        active.day_of_week = Set(day_of_week);
    }
    if let Some(period) = body.period {
        active.period = Set(period);
    }
    if let Some(start_time) = body.start_time {
        active.start_time = Set(start_time);
    }
    if let Some(end_time) = body.end_time {
        active.end_time = Set(end_time);
    }
    if let Some(is_break) = body.is_break {
        active.is_break = Set(is_break);
    }
    if let Some(label) = body.label {
        active.label = Set(Some(label));
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = TimeSlotResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_timeslots_school_day_period") || msg.contains("duplicate key") {
                (
                    StatusCode::CONFLICT,
                    "timeslot already exists for this school/day/period".to_string(),
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
    Path((_school_id, slot_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    match time_slots::Entity::find_by_id(slot_id)
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "timeslot not found".to_string()).into_response()
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    match time_slots::Entity::delete_by_id(slot_id)
        .exec(&ctx.db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("foreign key") || msg.contains("violates") {
                (
                    StatusCode::CONFLICT,
                    "cannot delete timeslot: it is referenced by other records".to_string(),
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
        .prefix("api/schools/{id}/timeslots")
        .add("/", get(list).post(create))
        .add("/{slot_id}", put(update).delete(delete))
}
