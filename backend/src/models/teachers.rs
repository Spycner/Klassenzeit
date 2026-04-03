use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::teachers::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(
        school_id: Uuid,
        first_name: String,
        last_name: String,
        abbreviation: String,
    ) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            school_id: sea_orm::ActiveValue::Set(school_id),
            first_name: sea_orm::ActiveValue::Set(first_name),
            last_name: sea_orm::ActiveValue::Set(last_name),
            email: sea_orm::ActiveValue::Set(None),
            abbreviation: sea_orm::ActiveValue::Set(abbreviation),
            max_hours_per_week: sea_orm::ActiveValue::Set(28),
            is_part_time: sea_orm::ActiveValue::Set(false),
            is_active: sea_orm::ActiveValue::Set(true),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
