use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Schools table
        manager
            .create_table(
                Table::create()
                    .table(Schools::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Schools::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Schools::Name).string_len(255).not_null())
                    .col(
                        ColumnDef::new(Schools::Slug)
                            .string_len(100)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(Schools::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Schools::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        // App users table
        manager
            .create_table(
                Table::create()
                    .table(AppUsers::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(AppUsers::Id).uuid().not_null().primary_key())
                    .col(
                        ColumnDef::new(AppUsers::KeycloakId)
                            .string_len(255)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(AppUsers::Email)
                            .string_len(255)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(AppUsers::DisplayName)
                            .string_len(255)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AppUsers::IsActive)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(ColumnDef::new(AppUsers::LastLoginAt).timestamp_with_time_zone())
                    .col(
                        ColumnDef::new(AppUsers::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AppUsers::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        // School memberships table
        manager
            .create_table(
                Table::create()
                    .table(SchoolMemberships::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SchoolMemberships::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(SchoolMemberships::UserId).uuid().not_null())
                    .col(
                        ColumnDef::new(SchoolMemberships::SchoolId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::Role)
                            .string_len(20)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::IsActive)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_school_memberships_user")
                            .from(SchoolMemberships::Table, SchoolMemberships::UserId)
                            .to(AppUsers::Table, AppUsers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_school_memberships_school")
                            .from(SchoolMemberships::Table, SchoolMemberships::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Unique constraint: one membership per user per school
        manager
            .create_index(
                Index::create()
                    .name("uq_school_membership_user_school")
                    .table(SchoolMemberships::Table)
                    .col(SchoolMemberships::UserId)
                    .col(SchoolMemberships::SchoolId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // Index on school_memberships.school_id for tenant queries
        manager
            .create_index(
                Index::create()
                    .name("idx_school_memberships_school")
                    .table(SchoolMemberships::Table)
                    .col(SchoolMemberships::SchoolId)
                    .to_owned(),
            )
            .await?;

        // Check constraint on role column (raw SQL — SeaQuery doesn't support CHECK constraints)
        let db = manager.get_connection();
        db.execute_unprepared(
            "ALTER TABLE school_memberships ADD CONSTRAINT ck_membership_role CHECK (role IN ('admin', 'teacher', 'viewer'))"
        ).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(SchoolMemberships::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(AppUsers::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Schools::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(Iden)]
enum Schools {
    Table,
    Id,
    Name,
    Slug,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum AppUsers {
    Table,
    Id,
    KeycloakId,
    Email,
    DisplayName,
    IsActive,
    LastLoginAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum SchoolMemberships {
    Table,
    Id,
    UserId,
    SchoolId,
    Role,
    IsActive,
    CreatedAt,
    UpdatedAt,
}
