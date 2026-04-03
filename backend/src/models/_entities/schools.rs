use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "schools")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub name: String,
    #[sea_orm(unique)]
    pub slug: String,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::rooms::Entity")]
    Rooms,
    #[sea_orm(has_many = "super::school_classes::Entity")]
    SchoolClasses,
    #[sea_orm(has_many = "super::school_memberships::Entity")]
    SchoolMemberships,
    #[sea_orm(has_many = "super::school_years::Entity")]
    SchoolYears,
    #[sea_orm(has_many = "super::subjects::Entity")]
    Subjects,
    #[sea_orm(has_many = "super::teachers::Entity")]
    Teachers,
    #[sea_orm(has_many = "super::time_slots::Entity")]
    TimeSlots,
}

impl Related<super::rooms::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Rooms.def()
    }
}

impl Related<super::school_classes::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolClasses.def()
    }
}

impl Related<super::school_memberships::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolMemberships.def()
    }
}

impl Related<super::school_years::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolYears.def()
    }
}

impl Related<super::subjects::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Subjects.def()
    }
}

impl Related<super::teachers::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Teachers.def()
    }
}

impl Related<super::time_slots::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TimeSlots.def()
    }
}
