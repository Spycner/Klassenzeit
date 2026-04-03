use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::schools::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

/// Generate a URL-friendly slug from a name.
///
/// Lowercases, splits on whitespace, joins with hyphens, removes non-ASCII
/// and non-alphanumeric characters (except hyphens), collapses consecutive
/// hyphens, and trims leading/trailing hyphens.
pub fn generate_slug(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    let mut result = String::new();
    let mut prev_hyphen = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_hyphen {
                result.push(c);
            }
            prev_hyphen = true;
        } else {
            result.push(c);
            prev_hyphen = false;
        }
    }
    result.trim_matches('-').to_string()
}

impl Model {
    pub async fn find_by_slug(db: &DatabaseConnection, slug: &str) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(schools::Column::Slug.eq(slug))
            .one(db)
            .await
    }

    pub async fn find_schools_for_user(
        db: &DatabaseConnection,
        user_id: Uuid,
    ) -> Result<Vec<(Self, String)>, DbErr> {
        use crate::models::_entities::school_memberships;

        let memberships = school_memberships::Entity::find()
            .filter(school_memberships::Column::UserId.eq(user_id))
            .filter(school_memberships::Column::IsActive.eq(true))
            .find_also_related(Entity)
            .all(db)
            .await?;

        Ok(memberships
            .into_iter()
            .filter_map(|(membership, school)| school.map(|s| (s, membership.role)))
            .collect())
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
