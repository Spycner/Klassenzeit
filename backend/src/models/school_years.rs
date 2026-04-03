use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::school_years::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(school_id: Uuid, name: String, start_date: Date, end_date: Date) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            school_id: sea_orm::ActiveValue::Set(school_id),
            name: sea_orm::ActiveValue::Set(name),
            start_date: sea_orm::ActiveValue::Set(start_date),
            end_date: sea_orm::ActiveValue::Set(end_date),
            is_current: sea_orm::ActiveValue::Set(false),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
