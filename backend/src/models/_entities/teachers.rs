use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "teachers")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub school_id: Uuid,
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub abbreviation: String,
    pub max_hours_per_week: i32,
    pub is_part_time: bool,
    pub is_active: bool,
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
    #[sea_orm(has_many = "super::teacher_availabilities::Entity")]
    TeacherAvailabilities,
    #[sea_orm(has_many = "super::school_classes::Entity")]
    SchoolClasses,
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

impl Related<super::teacher_availabilities::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TeacherAvailabilities.def()
    }
}

impl Related<super::school_classes::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolClasses.def()
    }
}

impl Related<super::lessons::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Lessons.def()
    }
}
