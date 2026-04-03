use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::room_subject_suitabilities::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(room_id: Uuid, subject_id: Uuid) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            room_id: sea_orm::ActiveValue::Set(room_id),
            subject_id: sea_orm::ActiveValue::Set(subject_id),
            notes: sea_orm::ActiveValue::Set(None),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
