use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. school_years
        manager
            .create_table(
                Table::create()
                    .table(SchoolYears::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SchoolYears::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(SchoolYears::SchoolId).uuid().not_null())
                    .col(ColumnDef::new(SchoolYears::Name).string_len(50).not_null())
                    .col(ColumnDef::new(SchoolYears::StartDate).date().not_null())
                    .col(ColumnDef::new(SchoolYears::EndDate).date().not_null())
                    .col(
                        ColumnDef::new(SchoolYears::IsCurrent)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(SchoolYears::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolYears::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_school_years_school")
                            .from(SchoolYears::Table, SchoolYears::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_school_years_school_name")
                    .table(SchoolYears::Table)
                    .col(SchoolYears::SchoolId)
                    .col(SchoolYears::Name)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_school_years_school")
                    .table(SchoolYears::Table)
                    .col(SchoolYears::SchoolId)
                    .to_owned(),
            )
            .await?;

        // 2. terms
        manager
            .create_table(
                Table::create()
                    .table(Terms::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Terms::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Terms::SchoolYearId).uuid().not_null())
                    .col(ColumnDef::new(Terms::Name).string_len(100).not_null())
                    .col(ColumnDef::new(Terms::StartDate).date().not_null())
                    .col(ColumnDef::new(Terms::EndDate).date().not_null())
                    .col(
                        ColumnDef::new(Terms::IsCurrent)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Terms::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Terms::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_terms_school_year")
                            .from(Terms::Table, Terms::SchoolYearId)
                            .to(SchoolYears::Table, SchoolYears::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_terms_school_year")
                    .table(Terms::Table)
                    .col(Terms::SchoolYearId)
                    .to_owned(),
            )
            .await?;

        // 3. teachers
        manager
            .create_table(
                Table::create()
                    .table(Teachers::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Teachers::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Teachers::SchoolId).uuid().not_null())
                    .col(
                        ColumnDef::new(Teachers::FirstName)
                            .string_len(100)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Teachers::LastName)
                            .string_len(100)
                            .not_null(),
                    )
                    .col(ColumnDef::new(Teachers::Email).string_len(255))
                    .col(
                        ColumnDef::new(Teachers::Abbreviation)
                            .string_len(5)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Teachers::MaxHoursPerWeek)
                            .integer()
                            .default(28),
                    )
                    .col(
                        ColumnDef::new(Teachers::IsPartTime)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Teachers::IsActive)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(
                        ColumnDef::new(Teachers::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Teachers::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_teachers_school")
                            .from(Teachers::Table, Teachers::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_teachers_school_abbreviation")
                    .table(Teachers::Table)
                    .col(Teachers::SchoolId)
                    .col(Teachers::Abbreviation)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_teachers_school")
                    .table(Teachers::Table)
                    .col(Teachers::SchoolId)
                    .to_owned(),
            )
            .await?;

        // 4. subjects
        manager
            .create_table(
                Table::create()
                    .table(Subjects::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Subjects::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Subjects::SchoolId).uuid().not_null())
                    .col(ColumnDef::new(Subjects::Name).string_len(100).not_null())
                    .col(
                        ColumnDef::new(Subjects::Abbreviation)
                            .string_len(10)
                            .not_null(),
                    )
                    .col(ColumnDef::new(Subjects::Color).string_len(7))
                    .col(
                        ColumnDef::new(Subjects::NeedsSpecialRoom)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Subjects::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Subjects::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_subjects_school")
                            .from(Subjects::Table, Subjects::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_subjects_school_abbreviation")
                    .table(Subjects::Table)
                    .col(Subjects::SchoolId)
                    .col(Subjects::Abbreviation)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_subjects_school")
                    .table(Subjects::Table)
                    .col(Subjects::SchoolId)
                    .to_owned(),
            )
            .await?;

        // 5. rooms
        manager
            .create_table(
                Table::create()
                    .table(Rooms::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Rooms::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Rooms::SchoolId).uuid().not_null())
                    .col(ColumnDef::new(Rooms::Name).string_len(50).not_null())
                    .col(ColumnDef::new(Rooms::Building).string_len(100))
                    .col(ColumnDef::new(Rooms::Capacity).integer())
                    .col(
                        ColumnDef::new(Rooms::IsActive)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(
                        ColumnDef::new(Rooms::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Rooms::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_rooms_school")
                            .from(Rooms::Table, Rooms::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_rooms_school_name")
                    .table(Rooms::Table)
                    .col(Rooms::SchoolId)
                    .col(Rooms::Name)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_rooms_school")
                    .table(Rooms::Table)
                    .col(Rooms::SchoolId)
                    .to_owned(),
            )
            .await?;

        // 6. school_classes
        manager
            .create_table(
                Table::create()
                    .table(SchoolClasses::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SchoolClasses::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(SchoolClasses::SchoolId).uuid().not_null())
                    .col(
                        ColumnDef::new(SchoolClasses::Name)
                            .string_len(20)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolClasses::GradeLevel)
                            .small_integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(SchoolClasses::StudentCount).integer())
                    .col(ColumnDef::new(SchoolClasses::ClassTeacherId).uuid())
                    .col(
                        ColumnDef::new(SchoolClasses::IsActive)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(
                        ColumnDef::new(SchoolClasses::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolClasses::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_school_classes_school")
                            .from(SchoolClasses::Table, SchoolClasses::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_school_classes_teacher")
                            .from(SchoolClasses::Table, SchoolClasses::ClassTeacherId)
                            .to(Teachers::Table, Teachers::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_school_classes_school_name")
                    .table(SchoolClasses::Table)
                    .col(SchoolClasses::SchoolId)
                    .col(SchoolClasses::Name)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_school_classes_school")
                    .table(SchoolClasses::Table)
                    .col(SchoolClasses::SchoolId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_school_classes_teacher")
                    .table(SchoolClasses::Table)
                    .col(SchoolClasses::ClassTeacherId)
                    .to_owned(),
            )
            .await?;

        // 7. time_slots
        manager
            .create_table(
                Table::create()
                    .table(TimeSlots::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(TimeSlots::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(TimeSlots::SchoolId).uuid().not_null())
                    .col(
                        ColumnDef::new(TimeSlots::DayOfWeek)
                            .small_integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(TimeSlots::Period).small_integer().not_null())
                    .col(ColumnDef::new(TimeSlots::StartTime).time().not_null())
                    .col(ColumnDef::new(TimeSlots::EndTime).time().not_null())
                    .col(
                        ColumnDef::new(TimeSlots::IsBreak)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(ColumnDef::new(TimeSlots::Label).string_len(50))
                    .col(
                        ColumnDef::new(TimeSlots::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TimeSlots::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_time_slots_school")
                            .from(TimeSlots::Table, TimeSlots::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_time_slots_school_day_period")
                    .table(TimeSlots::Table)
                    .col(TimeSlots::SchoolId)
                    .col(TimeSlots::DayOfWeek)
                    .col(TimeSlots::Period)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_time_slots_school")
                    .table(TimeSlots::Table)
                    .col(TimeSlots::SchoolId)
                    .to_owned(),
            )
            .await?;

        // 8. teacher_subject_qualifications
        manager
            .create_table(
                Table::create()
                    .table(TeacherSubjectQualifications::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(TeacherSubjectQualifications::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(TeacherSubjectQualifications::TeacherId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TeacherSubjectQualifications::SubjectId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TeacherSubjectQualifications::QualificationLevel)
                            .string_len(20)
                            .not_null(),
                    )
                    .col(ColumnDef::new(TeacherSubjectQualifications::MaxHoursPerWeek).integer())
                    .col(
                        ColumnDef::new(TeacherSubjectQualifications::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TeacherSubjectQualifications::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_tsq_teacher")
                            .from(
                                TeacherSubjectQualifications::Table,
                                TeacherSubjectQualifications::TeacherId,
                            )
                            .to(Teachers::Table, Teachers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_tsq_subject")
                            .from(
                                TeacherSubjectQualifications::Table,
                                TeacherSubjectQualifications::SubjectId,
                            )
                            .to(Subjects::Table, Subjects::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_tsq_teacher_subject")
                    .table(TeacherSubjectQualifications::Table)
                    .col(TeacherSubjectQualifications::TeacherId)
                    .col(TeacherSubjectQualifications::SubjectId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_tsq_teacher")
                    .table(TeacherSubjectQualifications::Table)
                    .col(TeacherSubjectQualifications::TeacherId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_tsq_subject")
                    .table(TeacherSubjectQualifications::Table)
                    .col(TeacherSubjectQualifications::SubjectId)
                    .to_owned(),
            )
            .await?;

        // 9. teacher_availabilities
        manager
            .create_table(
                Table::create()
                    .table(TeacherAvailabilities::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(TeacherAvailabilities::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(TeacherAvailabilities::TeacherId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(TeacherAvailabilities::TermId).uuid())
                    .col(
                        ColumnDef::new(TeacherAvailabilities::DayOfWeek)
                            .small_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TeacherAvailabilities::Period)
                            .small_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TeacherAvailabilities::AvailabilityType)
                            .string_len(20)
                            .not_null(),
                    )
                    .col(ColumnDef::new(TeacherAvailabilities::Reason).string_len(255))
                    .col(
                        ColumnDef::new(TeacherAvailabilities::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(TeacherAvailabilities::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_teacher_avail_teacher")
                            .from(
                                TeacherAvailabilities::Table,
                                TeacherAvailabilities::TeacherId,
                            )
                            .to(Teachers::Table, Teachers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_teacher_avail_term")
                            .from(TeacherAvailabilities::Table, TeacherAvailabilities::TermId)
                            .to(Terms::Table, Terms::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_teacher_avail_teacher")
                    .table(TeacherAvailabilities::Table)
                    .col(TeacherAvailabilities::TeacherId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_teacher_avail_term")
                    .table(TeacherAvailabilities::Table)
                    .col(TeacherAvailabilities::TermId)
                    .to_owned(),
            )
            .await?;

        // 10. room_subject_suitabilities
        manager
            .create_table(
                Table::create()
                    .table(RoomSubjectSuitabilities::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(RoomSubjectSuitabilities::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(RoomSubjectSuitabilities::RoomId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomSubjectSuitabilities::SubjectId)
                            .uuid()
                            .not_null(),
                    )
                    .col(ColumnDef::new(RoomSubjectSuitabilities::Notes).string_len(255))
                    .col(
                        ColumnDef::new(RoomSubjectSuitabilities::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(RoomSubjectSuitabilities::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_rss_room")
                            .from(
                                RoomSubjectSuitabilities::Table,
                                RoomSubjectSuitabilities::RoomId,
                            )
                            .to(Rooms::Table, Rooms::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_rss_subject")
                            .from(
                                RoomSubjectSuitabilities::Table,
                                RoomSubjectSuitabilities::SubjectId,
                            )
                            .to(Subjects::Table, Subjects::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_rss_room_subject")
                    .table(RoomSubjectSuitabilities::Table)
                    .col(RoomSubjectSuitabilities::RoomId)
                    .col(RoomSubjectSuitabilities::SubjectId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_rss_room")
                    .table(RoomSubjectSuitabilities::Table)
                    .col(RoomSubjectSuitabilities::RoomId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_rss_subject")
                    .table(RoomSubjectSuitabilities::Table)
                    .col(RoomSubjectSuitabilities::SubjectId)
                    .to_owned(),
            )
            .await?;

        // 11. lessons
        manager
            .create_table(
                Table::create()
                    .table(Lessons::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Lessons::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Lessons::TermId).uuid().not_null())
                    .col(ColumnDef::new(Lessons::SchoolClassId).uuid().not_null())
                    .col(ColumnDef::new(Lessons::TeacherId).uuid().not_null())
                    .col(ColumnDef::new(Lessons::SubjectId).uuid().not_null())
                    .col(ColumnDef::new(Lessons::RoomId).uuid())
                    .col(ColumnDef::new(Lessons::TimeslotId).uuid().not_null())
                    .col(
                        ColumnDef::new(Lessons::WeekPattern)
                            .string_len(10)
                            .not_null()
                            .default("every"),
                    )
                    .col(
                        ColumnDef::new(Lessons::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Lessons::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_lessons_term")
                            .from(Lessons::Table, Lessons::TermId)
                            .to(Terms::Table, Terms::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_lessons_class")
                            .from(Lessons::Table, Lessons::SchoolClassId)
                            .to(SchoolClasses::Table, SchoolClasses::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_lessons_teacher")
                            .from(Lessons::Table, Lessons::TeacherId)
                            .to(Teachers::Table, Teachers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_lessons_subject")
                            .from(Lessons::Table, Lessons::SubjectId)
                            .to(Subjects::Table, Subjects::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_lessons_room")
                            .from(Lessons::Table, Lessons::RoomId)
                            .to(Rooms::Table, Rooms::Id)
                            .on_delete(ForeignKeyAction::SetNull),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_lessons_timeslot")
                            .from(Lessons::Table, Lessons::TimeslotId)
                            .to(TimeSlots::Table, TimeSlots::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Lessons collision prevention unique indexes
        manager
            .create_index(
                Index::create()
                    .name("uq_lessons_class_timeslot")
                    .table(Lessons::Table)
                    .col(Lessons::TermId)
                    .col(Lessons::SchoolClassId)
                    .col(Lessons::TimeslotId)
                    .col(Lessons::WeekPattern)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_lessons_teacher_timeslot")
                    .table(Lessons::Table)
                    .col(Lessons::TermId)
                    .col(Lessons::TeacherId)
                    .col(Lessons::TimeslotId)
                    .col(Lessons::WeekPattern)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // Lessons FK indexes
        manager
            .create_index(
                Index::create()
                    .name("idx_lessons_term")
                    .table(Lessons::Table)
                    .col(Lessons::TermId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_lessons_class")
                    .table(Lessons::Table)
                    .col(Lessons::SchoolClassId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_lessons_teacher")
                    .table(Lessons::Table)
                    .col(Lessons::TeacherId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_lessons_subject")
                    .table(Lessons::Table)
                    .col(Lessons::SubjectId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_lessons_room")
                    .table(Lessons::Table)
                    .col(Lessons::RoomId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_lessons_timeslot")
                    .table(Lessons::Table)
                    .col(Lessons::TimeslotId)
                    .to_owned(),
            )
            .await?;

        // --- CHECK constraints and partial unique indexes via raw SQL ---
        let db = manager.get_connection();

        // school_years: start_date < end_date
        db.execute_unprepared(
            "ALTER TABLE school_years ADD CONSTRAINT ck_school_years_dates CHECK (start_date < end_date)"
        ).await?;

        // terms: start_date < end_date
        db.execute_unprepared(
            "ALTER TABLE terms ADD CONSTRAINT ck_terms_dates CHECK (start_date < end_date)",
        )
        .await?;

        // time_slots: day_of_week 0-4, period 1-10, start_time < end_time
        db.execute_unprepared(
            "ALTER TABLE time_slots ADD CONSTRAINT ck_time_slots_day CHECK (day_of_week >= 0 AND day_of_week <= 4)"
        ).await?;

        db.execute_unprepared(
            "ALTER TABLE time_slots ADD CONSTRAINT ck_time_slots_period CHECK (period >= 1 AND period <= 10)"
        ).await?;

        db.execute_unprepared(
            "ALTER TABLE time_slots ADD CONSTRAINT ck_time_slots_times CHECK (start_time < end_time)"
        ).await?;

        // teacher_subject_qualifications: qualification_level enum
        db.execute_unprepared(
            "ALTER TABLE teacher_subject_qualifications ADD CONSTRAINT ck_tsq_level CHECK (qualification_level IN ('primary', 'secondary', 'substitute'))"
        ).await?;

        // teacher_availabilities: day_of_week 0-4, period 1-10, availability_type enum
        db.execute_unprepared(
            "ALTER TABLE teacher_availabilities ADD CONSTRAINT ck_teacher_avail_day CHECK (day_of_week >= 0 AND day_of_week <= 4)"
        ).await?;

        db.execute_unprepared(
            "ALTER TABLE teacher_availabilities ADD CONSTRAINT ck_teacher_avail_period CHECK (period >= 1 AND period <= 10)"
        ).await?;

        db.execute_unprepared(
            "ALTER TABLE teacher_availabilities ADD CONSTRAINT ck_teacher_avail_type CHECK (availability_type IN ('available', 'blocked', 'preferred'))"
        ).await?;

        // teacher_availabilities: partial unique indexes
        db.execute_unprepared(
            "CREATE UNIQUE INDEX uq_teacher_avail_default ON teacher_availabilities (teacher_id, day_of_week, period) WHERE term_id IS NULL"
        ).await?;

        db.execute_unprepared(
            "CREATE UNIQUE INDEX uq_teacher_avail_term ON teacher_availabilities (teacher_id, term_id, day_of_week, period) WHERE term_id IS NOT NULL"
        ).await?;

        // lessons: week_pattern enum
        db.execute_unprepared(
            "ALTER TABLE lessons ADD CONSTRAINT ck_lessons_week_pattern CHECK (week_pattern IN ('every', 'a', 'b'))"
        ).await?;

        // lessons: partial unique index for room collision prevention
        db.execute_unprepared(
            "CREATE UNIQUE INDEX uq_lessons_room_timeslot ON lessons (term_id, room_id, timeslot_id, week_pattern) WHERE room_id IS NOT NULL"
        ).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop in reverse dependency order
        manager
            .drop_table(Table::drop().table(Lessons::Table).to_owned())
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(RoomSubjectSuitabilities::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(TeacherAvailabilities::Table).to_owned())
            .await?;
        manager
            .drop_table(
                Table::drop()
                    .table(TeacherSubjectQualifications::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(TimeSlots::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(SchoolClasses::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Rooms::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Subjects::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Teachers::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Terms::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(SchoolYears::Table).to_owned())
            .await?;
        Ok(())
    }
}

// Reference to schools table from core_tables migration
#[derive(Iden)]
enum Schools {
    Table,
    Id,
}

#[derive(Iden)]
enum SchoolYears {
    Table,
    Id,
    SchoolId,
    Name,
    StartDate,
    EndDate,
    IsCurrent,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Terms {
    Table,
    Id,
    SchoolYearId,
    Name,
    StartDate,
    EndDate,
    IsCurrent,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Teachers {
    Table,
    Id,
    SchoolId,
    FirstName,
    LastName,
    Email,
    Abbreviation,
    MaxHoursPerWeek,
    IsPartTime,
    IsActive,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Subjects {
    Table,
    Id,
    SchoolId,
    Name,
    Abbreviation,
    Color,
    NeedsSpecialRoom,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Rooms {
    Table,
    Id,
    SchoolId,
    Name,
    Building,
    Capacity,
    IsActive,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum SchoolClasses {
    Table,
    Id,
    SchoolId,
    Name,
    GradeLevel,
    StudentCount,
    ClassTeacherId,
    IsActive,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum TimeSlots {
    Table,
    Id,
    SchoolId,
    DayOfWeek,
    Period,
    StartTime,
    EndTime,
    IsBreak,
    Label,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum TeacherSubjectQualifications {
    Table,
    Id,
    TeacherId,
    SubjectId,
    QualificationLevel,
    MaxHoursPerWeek,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum TeacherAvailabilities {
    Table,
    Id,
    TeacherId,
    TermId,
    DayOfWeek,
    Period,
    AvailabilityType,
    Reason,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum RoomSubjectSuitabilities {
    Table,
    Id,
    RoomId,
    SubjectId,
    Notes,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Lessons {
    Table,
    Id,
    TermId,
    SchoolClassId,
    TeacherId,
    SubjectId,
    RoomId,
    TimeslotId,
    WeekPattern,
    CreatedAt,
    UpdatedAt,
}
