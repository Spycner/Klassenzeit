use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::subjects;

#[derive(Debug, Serialize)]
struct SubjectResponse {
    id: String,
    name: String,
    abbreviation: String,
    color: Option<String>,
    needs_special_room: bool,
}

impl SubjectResponse {
    fn from_model(m: &subjects::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            abbreviation: m.abbreviation.clone(),
            color: m.color.clone(),
            needs_special_room: m.needs_special_room,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_ctx.school.id))
        .all(&ctx.db)
        .await?;

    let resp: Vec<SubjectResponse> = items.iter().map(SubjectResponse::from_model).collect();
    format::json(resp)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/subjects")
        .add("/", get(list))
}
