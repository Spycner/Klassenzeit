use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QuerySelect, RelationTrait};
use serde::Serialize;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{school_years, terms};

#[derive(Debug, Serialize)]
struct TermResponse {
    id: String,
    name: String,
    start_date: String,
    end_date: String,
    is_current: bool,
}

impl TermResponse {
    fn from_model(m: &terms::Model) -> Self {
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

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/terms")
        .add("/", get(list))
}
