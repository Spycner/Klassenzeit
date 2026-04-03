use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::teacher_availabilities::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(
        teacher_id: Uuid,
        term_id: Option<Uuid>,
        day_of_week: i16,
        period: i16,
        availability_type: String,
    ) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            teacher_id: sea_orm::ActiveValue::Set(teacher_id),
            term_id: sea_orm::ActiveValue::Set(term_id),
            day_of_week: sea_orm::ActiveValue::Set(day_of_week),
            period: sea_orm::ActiveValue::Set(period),
            availability_type: sea_orm::ActiveValue::Set(availability_type),
            reason: sea_orm::ActiveValue::Set(None),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
