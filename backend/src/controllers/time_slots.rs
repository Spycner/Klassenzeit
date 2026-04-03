use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use serde::Serialize;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::time_slots;

#[derive(Debug, Serialize)]
struct TimeSlotResponse {
    id: String,
    day_of_week: i16,
    period: i16,
    start_time: String,
    end_time: String,
    is_break: bool,
    label: Option<String>,
}

impl TimeSlotResponse {
    fn from_model(m: &time_slots::Model) -> Self {
        Self {
            id: m.id.to_string(),
            day_of_week: m.day_of_week,
            period: m.period,
            start_time: m.start_time.format("%H:%M").to_string(),
            end_time: m.end_time.format("%H:%M").to_string(),
            is_break: m.is_break,
            label: m.label.clone(),
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = time_slots::Entity::find()
        .filter(time_slots::Column::SchoolId.eq(school_ctx.school.id))
        .order_by_asc(time_slots::Column::DayOfWeek)
        .order_by_asc(time_slots::Column::Period)
        .all(&ctx.db)
        .await?;

    let resp: Vec<TimeSlotResponse> = items.iter().map(TimeSlotResponse::from_model).collect();
    format::json(resp)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/timeslots")
        .add("/", get(list))
}
