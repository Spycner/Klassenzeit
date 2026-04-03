use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::school_memberships::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(user_id: Uuid, school_id: Uuid, role: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            user_id: sea_orm::ActiveValue::Set(user_id),
            school_id: sea_orm::ActiveValue::Set(school_id),
            role: sea_orm::ActiveValue::Set(role),
            is_active: sea_orm::ActiveValue::Set(true),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
