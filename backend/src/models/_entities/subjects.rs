use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "subjects")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub school_id: Uuid,
    pub name: String,
    pub abbreviation: String,
    pub color: Option<String>,
    pub needs_special_room: bool,
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
    #[sea_orm(has_many = "super::teacher_subject_qualifications::Entity")]
    TeacherSubjectQualifications,
    #[sea_orm(has_many = "super::room_subject_suitabilities::Entity")]
    RoomSubjectSuitabilities,
    #[sea_orm(has_many = "super::lessons::Entity")]
    Lessons,
}

impl Related<super::schools::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::School.def()
    }
}

impl Related<super::teacher_subject_qualifications::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TeacherSubjectQualifications.def()
    }
}

impl Related<super::room_subject_suitabilities::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RoomSubjectSuitabilities.def()
    }
}

impl Related<super::lessons::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Lessons.def()
    }
}
