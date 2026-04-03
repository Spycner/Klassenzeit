use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QuerySelect, RelationTrait, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{school_years, terms};

#[derive(Debug, Deserialize)]
struct CreateRequest {
    school_year_id: Uuid,
    name: String,
    start_date: chrono::NaiveDate,
    end_date: chrono::NaiveDate,
    is_current: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    start_date: Option<chrono::NaiveDate>,
    end_date: Option<chrono::NaiveDate>,
    is_current: Option<bool>,
}

#[derive(Debug, Serialize)]
struct TermResponse {
    id: String,
    school_year_id: String,
    name: String,
    start_date: String,
    end_date: String,
    is_current: bool,
}

impl TermResponse {
    fn from_model(m: &terms::Model) -> Self {
        Self {
            id: m.id.to_string(),
            school_year_id: m.school_year_id.to_string(),
            name: m.name.clone(),
            start_date: m.start_date.to_string(),
            end_date: m.end_date.to_string(),
            is_current: m.is_current,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = terms::Entity::find()
        .join(
            sea_orm::JoinType::InnerJoin,
            terms::Relation::SchoolYear.def(),
        )
        .filter(school_years::Column::SchoolId.eq(school_ctx.school.id))
        .all(&ctx.db)
        .await?;

    let resp: Vec<TermResponse> = items.iter().map(TermResponse::from_model).collect();
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

    // Validate school_year_id belongs to this school
    let school_year = school_years::Entity::find_by_id(body.school_year_id)
        .filter(school_years::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await;

    match school_year {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                "school_year_id does not belong to this school".to_string(),
            )
                .into_response()
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    let now = chrono::Utc::now().into();

    let entry = terms::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_year_id: Set(body.school_year_id),
        name: Set(body.name),
        start_date: Set(body.start_date),
        end_date: Set(body.end_date),
        is_current: Set(body.is_current.unwrap_or(false)),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = TermResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match terms::Entity::find_by_id(term_id)
        .join(
            sea_orm::JoinType::InnerJoin,
            terms::Relation::SchoolYear.def(),
        )
        .filter(school_years::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "term not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: terms::ActiveModel = existing.into();

    if let Some(name) = body.name {
        active.name = Set(name);
    }
    if let Some(start_date) = body.start_date {
        active.start_date = Set(start_date);
    }
    if let Some(end_date) = body.end_date {
        active.end_date = Set(end_date);
    }
    if let Some(is_current) = body.is_current {
        active.is_current = Set(is_current);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = TermResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    match terms::Entity::find_by_id(term_id)
        .join(
            sea_orm::JoinType::InnerJoin,
            terms::Relation::SchoolYear.def(),
        )
        .filter(school_years::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "term not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    match terms::Entity::delete_by_id(term_id).exec(&ctx.db).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("foreign key") || msg.contains("violates") {
                (
                    StatusCode::CONFLICT,
                    "cannot delete term: it is referenced by other records".to_string(),
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
        .prefix("api/schools/{id}/terms")
        .add("/", get(list).post(create))
        .add("/{term_id}", put(update).delete(delete))
}
