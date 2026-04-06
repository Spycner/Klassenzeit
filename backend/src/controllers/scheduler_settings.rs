use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use serde::Serialize;
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::services::scheduler_settings::{self, ConstraintWeightsDto, ValidationError};

#[derive(Debug, Serialize)]
struct WeightsResponse {
    weights: ConstraintWeightsDto,
}

async fn get_settings(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(_school_id): Path<Uuid>,
) -> impl IntoResponse {
    match scheduler_settings::load(&ctx.db, school_ctx.school.id).await {
        Ok(weights) => format::json(WeightsResponse { weights }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn put_settings(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(_school_id): Path<Uuid>,
    Json(body): Json<ConstraintWeightsDto>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }
    if let Err(e) = scheduler_settings::validate(&body) {
        return match e {
            ValidationError::OutOfRange { .. } => {
                (StatusCode::UNPROCESSABLE_ENTITY, e.to_string()).into_response()
            }
        };
    }
    if let Err(e) = scheduler_settings::upsert(&ctx.db, school_ctx.school.id, &body).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    format::json(WeightsResponse { weights: body }).into_response()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/scheduler-settings")
        .add("/", get(get_settings).put(put_settings))
}
