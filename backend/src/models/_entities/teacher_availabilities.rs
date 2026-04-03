use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "teacher_availabilities")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub teacher_id: Uuid,
    pub term_id: Option<Uuid>,
    pub day_of_week: i16,
    pub period: i16,
    pub availability_type: String,
    pub reason: Option<String>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::teachers::Entity",
        from = "Column::TeacherId",
        to = "super::teachers::Column::Id"
    )]
    Teacher,
    #[sea_orm(
        belongs_to = "super::terms::Entity",
        from = "Column::TermId",
        to = "super::terms::Column::Id"
    )]
    Term,
}

impl Related<super::teachers::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Teacher.def()
    }
}

impl Related<super::terms::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Term.def()
    }
}
