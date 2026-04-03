use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "app_users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(unique)]
    pub keycloak_id: String,
    #[sea_orm(unique)]
    pub email: String,
    pub display_name: String,
    pub is_active: bool,
    pub last_login_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::school_memberships::Entity")]
    SchoolMemberships,
}

impl Related<super::school_memberships::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolMemberships.def()
    }
}
