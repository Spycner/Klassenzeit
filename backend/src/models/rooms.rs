use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::rooms::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(school_id: Uuid, name: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            school_id: sea_orm::ActiveValue::Set(school_id),
            name: sea_orm::ActiveValue::Set(name),
            building: sea_orm::ActiveValue::Set(None),
            capacity: sea_orm::ActiveValue::Set(None),
            is_active: sea_orm::ActiveValue::Set(true),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
