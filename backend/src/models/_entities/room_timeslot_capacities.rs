use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "room_timeslot_capacities")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub room_id: Uuid,
    pub timeslot_id: Uuid,
    pub capacity: i16,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::rooms::Entity",
        from = "Column::RoomId",
        to = "super::rooms::Column::Id"
    )]
    Room,
    #[sea_orm(
        belongs_to = "super::time_slots::Entity",
        from = "Column::TimeslotId",
        to = "super::time_slots::Column::Id"
    )]
    TimeSlot,
}

impl Related<super::rooms::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Room.def()
    }
}

impl Related<super::time_slots::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TimeSlot.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
