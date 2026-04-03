use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::schools::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl Model {
    pub async fn find_by_slug(db: &DatabaseConnection, slug: &str) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(schools::Column::Slug.eq(slug))
            .one(db)
            .await
    }
}

impl ActiveModel {
    pub fn new(name: String, slug: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            name: sea_orm::ActiveValue::Set(name),
            slug: sea_orm::ActiveValue::Set(slug),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
