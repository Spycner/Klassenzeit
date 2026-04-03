use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::lessons::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(
        term_id: Uuid,
        school_class_id: Uuid,
        teacher_id: Uuid,
        subject_id: Uuid,
        timeslot_id: Uuid,
    ) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            term_id: sea_orm::ActiveValue::Set(term_id),
            school_class_id: sea_orm::ActiveValue::Set(school_class_id),
            teacher_id: sea_orm::ActiveValue::Set(teacher_id),
            subject_id: sea_orm::ActiveValue::Set(subject_id),
            room_id: sea_orm::ActiveValue::Set(None),
            timeslot_id: sea_orm::ActiveValue::Set(timeslot_id),
            week_pattern: sea_orm::ActiveValue::Set("weekly".to_string()),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
