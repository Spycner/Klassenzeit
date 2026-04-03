use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{school_classes, teachers};

#[derive(Debug, Deserialize)]
struct CreateRequest {
    name: String,
    grade_level: i16,
    student_count: Option<i32>,
    class_teacher_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    grade_level: Option<i16>,
    student_count: Option<i32>,
    class_teacher_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
struct SchoolClassResponse {
    id: String,
    name: String,
    grade_level: i16,
    student_count: Option<i32>,
    class_teacher_id: Option<String>,
    is_active: bool,
}

impl SchoolClassResponse {
    fn from_model(m: &school_classes::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            grade_level: m.grade_level,
            student_count: m.student_count,
            class_teacher_id: m.class_teacher_id.map(|id| id.to_string()),
            is_active: m.is_active,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_ctx.school.id))
        .filter(school_classes::Column::IsActive.eq(true))
        .all(&ctx.db)
        .await?;

    let resp: Vec<SchoolClassResponse> =
        items.iter().map(SchoolClassResponse::from_model).collect();
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

    // FK validation for class_teacher_id
    if let Some(teacher_id) = body.class_teacher_id {
        let teacher = teachers::Entity::find_by_id(teacher_id)
            .filter(teachers::Column::SchoolId.eq(school_id))
            .filter(teachers::Column::IsActive.eq(true))
            .one(&ctx.db)
            .await;

        match teacher {
            Ok(Some(_)) => {}
            Ok(None) => {
                return (
                    StatusCode::BAD_REQUEST,
                    "class_teacher_id references a teacher that does not exist or is inactive"
                        .to_string(),
                )
                    .into_response();
            }
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        }
    }

    let now = chrono::Utc::now().into();

    let entry = school_classes::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(body.name),
        grade_level: Set(body.grade_level),
        student_count: Set(body.student_count),
        class_teacher_id: Set(body.class_teacher_id),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = SchoolClassResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, class_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match school_classes::Entity::find_by_id(class_id)
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "class not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // FK validation for class_teacher_id
    if let Some(teacher_id) = body.class_teacher_id {
        let teacher = teachers::Entity::find_by_id(teacher_id)
            .filter(teachers::Column::SchoolId.eq(school_id))
            .filter(teachers::Column::IsActive.eq(true))
            .one(&ctx.db)
            .await;

        match teacher {
            Ok(Some(_)) => {}
            Ok(None) => {
                return (
                    StatusCode::BAD_REQUEST,
                    "class_teacher_id references a teacher that does not exist or is inactive"
                        .to_string(),
                )
                    .into_response();
            }
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        }
    }

    let mut active: school_classes::ActiveModel = existing.into();

    if let Some(name) = body.name {
        active.name = Set(name);
    }
    if let Some(grade_level) = body.grade_level {
        active.grade_level = Set(grade_level);
    }
    if let Some(student_count) = body.student_count {
        active.student_count = Set(Some(student_count));
    }
    if let Some(class_teacher_id) = body.class_teacher_id {
        active.class_teacher_id = Set(Some(class_teacher_id));
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = SchoolClassResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, class_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match school_classes::Entity::find_by_id(class_id)
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "class not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: school_classes::ActiveModel = existing.into();
    active.is_active = Set(false);
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/classes")
        .add("/", get(list).post(create))
        .add("/{class_id}", put(update).delete(delete))
}
