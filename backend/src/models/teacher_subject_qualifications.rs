use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::teacher_subject_qualifications::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(teacher_id: Uuid, subject_id: Uuid, qualification_level: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            teacher_id: sea_orm::ActiveValue::Set(teacher_id),
            subject_id: sea_orm::ActiveValue::Set(subject_id),
            qualification_level: sea_orm::ActiveValue::Set(qualification_level),
            max_hours_per_week: sea_orm::ActiveValue::Set(None),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
