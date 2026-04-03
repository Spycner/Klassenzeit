use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::school_years;

#[derive(Debug, Serialize)]
struct SchoolYearResponse {
    id: String,
    name: String,
    start_date: String,
    end_date: String,
    is_current: bool,
}

impl SchoolYearResponse {
    fn from_model(m: &school_years::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            start_date: m.start_date.to_string(),
            end_date: m.end_date.to_string(),
            is_current: m.is_current,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = school_years::Entity::find()
        .filter(school_years::Column::SchoolId.eq(school_ctx.school.id))
        .all(&ctx.db)
        .await?;

    let resp: Vec<SchoolYearResponse> = items.iter().map(SchoolYearResponse::from_model).collect();
    format::json(resp)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/school-years")
        .add("/", get(list))
}
