use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::school_memberships::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl Model {
    pub async fn find_active_membership(
        db: &DatabaseConnection,
        user_id: Uuid,
        school_id: Uuid,
    ) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(school_memberships::Column::UserId.eq(user_id))
            .filter(school_memberships::Column::SchoolId.eq(school_id))
            .filter(school_memberships::Column::IsActive.eq(true))
            .one(db)
            .await
    }

    pub async fn find_members_for_school(
        db: &DatabaseConnection,
        school_id: Uuid,
    ) -> Result<Vec<(Self, Option<crate::models::_entities::app_users::Model>)>, DbErr> {
        use crate::models::_entities::app_users;

        Entity::find()
            .filter(school_memberships::Column::SchoolId.eq(school_id))
            .filter(school_memberships::Column::IsActive.eq(true))
            .find_also_related(app_users::Entity)
            .all(db)
            .await
    }

    pub async fn count_admins(db: &DatabaseConnection, school_id: Uuid) -> Result<u64, DbErr> {
        Entity::find()
            .filter(school_memberships::Column::SchoolId.eq(school_id))
            .filter(school_memberships::Column::Role.eq("admin"))
            .filter(school_memberships::Column::IsActive.eq(true))
            .count(db)
            .await
    }
}

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
