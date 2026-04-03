use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::time_slots::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(
        school_id: Uuid,
        day_of_week: i16,
        period: i16,
        start_time: chrono::NaiveTime,
        end_time: chrono::NaiveTime,
    ) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            school_id: sea_orm::ActiveValue::Set(school_id),
            day_of_week: sea_orm::ActiveValue::Set(day_of_week),
            period: sea_orm::ActiveValue::Set(period),
            start_time: sea_orm::ActiveValue::Set(start_time),
            end_time: sea_orm::ActiveValue::Set(end_time),
            is_break: sea_orm::ActiveValue::Set(false),
            label: sea_orm::ActiveValue::Set(None),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
