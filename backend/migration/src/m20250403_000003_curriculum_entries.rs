use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(CurriculumEntries::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(CurriculumEntries::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(CurriculumEntries::SchoolId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(CurriculumEntries::TermId).uuid().not_null())
                    .col(
                        ColumnDef::new(CurriculumEntries::SchoolClassId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CurriculumEntries::SubjectId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(CurriculumEntries::TeacherId).uuid())
                    .col(
                        ColumnDef::new(CurriculumEntries::HoursPerWeek)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CurriculumEntries::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(CurriculumEntries::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_curriculum_entries_school")
                            .from(CurriculumEntries::Table, CurriculumEntries::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_curriculum_entries_term")
                            .from(CurriculumEntries::Table, CurriculumEntries::TermId)
                            .to(Terms::Table, Terms::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_curriculum_entries_class")
                            .from(CurriculumEntries::Table, CurriculumEntries::SchoolClassId)
                            .to(SchoolClasses::Table, SchoolClasses::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_curriculum_entries_subject")
                            .from(CurriculumEntries::Table, CurriculumEntries::SubjectId)
                            .to(Subjects::Table, Subjects::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_curriculum_entries_teacher")
                            .from(CurriculumEntries::Table, CurriculumEntries::TeacherId)
                            .to(Teachers::Table, Teachers::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        // Unique index: one entry per term + class + subject
        manager
            .create_index(
                Index::create()
                    .name("uq_curriculum_term_class_subject")
                    .table(CurriculumEntries::Table)
                    .col(CurriculumEntries::TermId)
                    .col(CurriculumEntries::SchoolClassId)
                    .col(CurriculumEntries::SubjectId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // FK indexes
        manager
            .create_index(
                Index::create()
                    .name("idx_curriculum_entries_school")
                    .table(CurriculumEntries::Table)
                    .col(CurriculumEntries::SchoolId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_curriculum_entries_term")
                    .table(CurriculumEntries::Table)
                    .col(CurriculumEntries::TermId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_curriculum_entries_class")
                    .table(CurriculumEntries::Table)
                    .col(CurriculumEntries::SchoolClassId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_curriculum_entries_subject")
                    .table(CurriculumEntries::Table)
                    .col(CurriculumEntries::SubjectId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_curriculum_entries_teacher")
                    .table(CurriculumEntries::Table)
                    .col(CurriculumEntries::TeacherId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(CurriculumEntries::Table).to_owned())
            .await?;
        Ok(())
    }
}

// Reference Iden enums for foreign key targets
#[derive(Iden)]
enum Schools {
    Table,
    Id,
}

#[derive(Iden)]
enum Terms {
    Table,
    Id,
}

#[derive(Iden)]
enum SchoolClasses {
    Table,
    Id,
}

#[derive(Iden)]
enum Subjects {
    Table,
    Id,
}

#[derive(Iden)]
enum Teachers {
    Table,
    Id,
}

#[derive(Iden)]
enum CurriculumEntries {
    Table,
    Id,
    SchoolId,
    TermId,
    SchoolClassId,
    SubjectId,
    TeacherId,
    HoursPerWeek,
    CreatedAt,
    UpdatedAt,
}
