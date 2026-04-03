use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::curriculum_entries::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(
        school_id: Uuid,
        term_id: Uuid,
        school_class_id: Uuid,
        subject_id: Uuid,
        teacher_id: Option<Uuid>,
        hours_per_week: i32,
    ) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            school_id: sea_orm::ActiveValue::Set(school_id),
            term_id: sea_orm::ActiveValue::Set(term_id),
            school_class_id: sea_orm::ActiveValue::Set(school_class_id),
            subject_id: sea_orm::ActiveValue::Set(subject_id),
            teacher_id: sea_orm::ActiveValue::Set(teacher_id),
            hours_per_week: sea_orm::ActiveValue::Set(hours_per_week),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
