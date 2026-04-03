use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::rooms;

#[derive(Debug, Serialize)]
struct RoomResponse {
    id: String,
    name: String,
    building: Option<String>,
    capacity: Option<i32>,
}

impl RoomResponse {
    fn from_model(m: &rooms::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            building: m.building.clone(),
            capacity: m.capacity,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = rooms::Entity::find()
        .filter(rooms::Column::SchoolId.eq(school_ctx.school.id))
        .filter(rooms::Column::IsActive.eq(true))
        .all(&ctx.db)
        .await?;

    let resp: Vec<RoomResponse> = items.iter().map(RoomResponse::from_model).collect();
    format::json(resp)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/rooms")
        .add("/", get(list))
}
