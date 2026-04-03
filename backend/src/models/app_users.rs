use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::app_users::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl Model {
    pub async fn find_by_keycloak_id(
        db: &DatabaseConnection,
        keycloak_id: &str,
    ) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(app_users::Column::KeycloakId.eq(keycloak_id))
            .one(db)
            .await
    }

    pub async fn find_by_email(
        db: &DatabaseConnection,
        email: &str,
    ) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(app_users::Column::Email.eq(email))
            .one(db)
            .await
    }
}

impl ActiveModel {
    pub fn new(keycloak_id: String, email: String, display_name: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            keycloak_id: sea_orm::ActiveValue::Set(keycloak_id),
            email: sea_orm::ActiveValue::Set(email),
            display_name: sea_orm::ActiveValue::Set(display_name),
            is_active: sea_orm::ActiveValue::Set(true),
            last_login_at: sea_orm::ActiveValue::Set(None),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
