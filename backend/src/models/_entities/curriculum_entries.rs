use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "curriculum_entries")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub school_id: Uuid,
    pub term_id: Uuid,
    pub school_class_id: Uuid,
    pub subject_id: Uuid,
    pub teacher_id: Option<Uuid>,
    pub hours_per_week: i32,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::schools::Entity",
        from = "Column::SchoolId",
        to = "super::schools::Column::Id"
    )]
    School,
    #[sea_orm(
        belongs_to = "super::terms::Entity",
        from = "Column::TermId",
        to = "super::terms::Column::Id"
    )]
    Term,
    #[sea_orm(
        belongs_to = "super::school_classes::Entity",
        from = "Column::SchoolClassId",
        to = "super::school_classes::Column::Id"
    )]
    SchoolClass,
    #[sea_orm(
        belongs_to = "super::subjects::Entity",
        from = "Column::SubjectId",
        to = "super::subjects::Column::Id"
    )]
    Subject,
    #[sea_orm(
        belongs_to = "super::teachers::Entity",
        from = "Column::TeacherId",
        to = "super::teachers::Column::Id"
    )]
    Teacher,
}

impl Related<super::schools::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::School.def()
    }
}

impl Related<super::terms::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Term.def()
    }
}

impl Related<super::school_classes::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolClass.def()
    }
}

impl Related<super::subjects::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Subject.def()
    }
}

impl Related<super::teachers::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Teacher.def()
    }
}
