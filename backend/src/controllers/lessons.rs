use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{lessons, school_years, terms};
use crate::services::scheduler::{evaluate_term_violations, ViolationDto};

#[derive(Debug, Deserialize, Default)]
struct ListQuery {
    #[serde(default)]
    include_violations: bool,
}

#[derive(Debug, Serialize)]
struct LessonsWithViolations {
    lessons: Vec<LessonResponse>,
    violations: Vec<ViolationDto>,
}

#[derive(Debug, Serialize)]
struct LessonResponse {
    id: String,
    term_id: String,
    class_id: String,
    teacher_id: String,
    subject_id: String,
    room_id: Option<String>,
    timeslot_id: String,
    week_pattern: String,
}

impl From<lessons::Model> for LessonResponse {
    fn from(m: lessons::Model) -> Self {
        Self {
            id: m.id.to_string(),
            term_id: m.term_id.to_string(),
            class_id: m.school_class_id.to_string(),
            teacher_id: m.teacher_id.to_string(),
            subject_id: m.subject_id.to_string(),
            room_id: m.room_id.map(|id| id.to_string()),
            timeslot_id: m.timeslot_id.to_string(),
            week_pattern: m.week_pattern,
        }
    }
}

/// GET /api/schools/{school_id}/terms/{term_id}/lessons[?include_violations=true]
async fn list(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ListQuery>,
    school_ctx: SchoolContext,
) -> impl IntoResponse {
    let school_id = school_ctx.school.id;

    // Verify the term belongs to the caller's school via school_years.
    match terms::Entity::find_by_id(term_id)
        .find_also_related(school_years::Entity)
        .one(&ctx.db)
        .await
    {
        Ok(Some((_term, Some(year)))) if year.school_id == school_id => {}
        Ok(_) => {
            return (StatusCode::NOT_FOUND, "term not found".to_string()).into_response();
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    let items = match lessons::Entity::find()
        .filter(lessons::Column::TermId.eq(term_id))
        .all(&ctx.db)
        .await
    {
        Ok(items) => items,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let lesson_responses: Vec<LessonResponse> =
        items.into_iter().map(LessonResponse::from).collect();

    if query.include_violations {
        let violations = match evaluate_term_violations(&ctx.db, school_id, term_id).await {
            Ok(v) => v,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };
        axum::Json(LessonsWithViolations {
            lessons: lesson_responses,
            violations,
        })
        .into_response()
    } else {
        axum::Json(lesson_responses).into_response()
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}/terms")
        .add("/{term_id}/lessons", get(list))
}
