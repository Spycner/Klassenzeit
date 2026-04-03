use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::subjects::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(school_id: Uuid, name: String, abbreviation: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            school_id: sea_orm::ActiveValue::Set(school_id),
            name: sea_orm::ActiveValue::Set(name),
            abbreviation: sea_orm::ActiveValue::Set(abbreviation),
            color: sea_orm::ActiveValue::Set(None),
            needs_special_room: sea_orm::ActiveValue::Set(false),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
