use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(SchoolSchedulerSettings::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SchoolSchedulerSettings::SchoolId)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(SchoolSchedulerSettings::Weights)
                            .custom(Alias::new("jsonb"))
                            .not_null()
                            .default("{}"),
                    )
                    .col(
                        ColumnDef::new(SchoolSchedulerSettings::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolSchedulerSettings::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_sss_school")
                            .from(
                                SchoolSchedulerSettings::Table,
                                SchoolSchedulerSettings::SchoolId,
                            )
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(SchoolSchedulerSettings::Table)
                    .to_owned(),
            )
            .await
    }
}

#[derive(Iden)]
enum SchoolSchedulerSettings {
    Table,
    SchoolId,
    Weights,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Schools {
    Table,
    Id,
}
