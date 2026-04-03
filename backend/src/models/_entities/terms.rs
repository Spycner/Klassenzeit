use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "terms")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub school_year_id: Uuid,
    pub name: String,
    pub start_date: Date,
    pub end_date: Date,
    pub is_current: bool,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::school_years::Entity",
        from = "Column::SchoolYearId",
        to = "super::school_years::Column::Id"
    )]
    SchoolYear,
    #[sea_orm(has_many = "super::teacher_availabilities::Entity")]
    TeacherAvailabilities,
    #[sea_orm(has_many = "super::lessons::Entity")]
    Lessons,
}

impl Related<super::school_years::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolYear.def()
    }
}

impl Related<super::teacher_availabilities::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TeacherAvailabilities.def()
    }
}

impl Related<super::lessons::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Lessons.def()
    }
}
