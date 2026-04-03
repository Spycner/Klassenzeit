use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::school_classes;

#[derive(Debug, Serialize)]
struct SchoolClassResponse {
    id: String,
    name: String,
    grade_level: i16,
    student_count: Option<i32>,
}

impl SchoolClassResponse {
    fn from_model(m: &school_classes::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            grade_level: m.grade_level,
            student_count: m.student_count,
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

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/classes")
        .add("/", get(list))
}
