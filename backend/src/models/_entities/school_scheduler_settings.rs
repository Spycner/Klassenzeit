//! `SeaORM` entity for `school_scheduler_settings`.
//! Hand-written to match the m20250406_000001 migration.

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "school_scheduler_settings")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub school_id: Uuid,
    #[sea_orm(column_type = "JsonBinary")]
    pub weights: serde_json::Value,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::schools::Entity",
        from = "Column::SchoolId",
        to = "super::schools::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    Schools,
}

impl Related<super::schools::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Schools.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
