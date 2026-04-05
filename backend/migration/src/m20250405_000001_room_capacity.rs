use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Rooms::Table)
                    .add_column(
                        ColumnDef::new(Rooms::MaxConcurrent)
                            .small_integer()
                            .not_null()
                            .default(1),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(RoomTimeslotCapacities::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::RoomId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::TimeslotId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::Capacity)
                            .small_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomTimeslotCapacities::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_rtc_room")
                            .from(
                                RoomTimeslotCapacities::Table,
                                RoomTimeslotCapacities::RoomId,
                            )
                            .to(Rooms::Table, Rooms::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_rtc_timeslot")
                            .from(
                                RoomTimeslotCapacities::Table,
                                RoomTimeslotCapacities::TimeslotId,
                            )
                            .to(TimeSlots::Table, TimeSlots::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_rtc_room_timeslot")
                    .table(RoomTimeslotCapacities::Table)
                    .col(RoomTimeslotCapacities::RoomId)
                    .col(RoomTimeslotCapacities::TimeslotId)
                    .unique()
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(RoomTimeslotCapacities::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Rooms::Table)
                    .drop_column(Rooms::MaxConcurrent)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum Rooms {
    Table,
    Id,
    MaxConcurrent,
}

#[derive(Iden)]
enum RoomTimeslotCapacities {
    Table,
    Id,
    RoomId,
    TimeslotId,
    Capacity,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum TimeSlots {
    Table,
    Id,
}
