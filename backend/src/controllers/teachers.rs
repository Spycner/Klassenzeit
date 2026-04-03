use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::teachers;

#[derive(Debug, Serialize)]
struct TeacherResponse {
    id: String,
    first_name: String,
    last_name: String,
    abbreviation: String,
}

impl TeacherResponse {
    fn from_model(m: &teachers::Model) -> Self {
        Self {
            id: m.id.to_string(),
            first_name: m.first_name.clone(),
            last_name: m.last_name.clone(),
            abbreviation: m.abbreviation.clone(),
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_ctx.school.id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(&ctx.db)
        .await?;

    let resp: Vec<TeacherResponse> = items.iter().map(TeacherResponse::from_model).collect();
    format::json(resp)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/teachers")
        .add("/", get(list))
}
