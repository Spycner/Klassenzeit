use klassenzeit_backend::app::App;
use klassenzeit_backend::models::{
    lessons, room_subject_suitabilities, rooms, school_classes, school_years, schools, subjects,
    teacher_availabilities, teacher_subject_qualifications, teachers, terms, time_slots,
};
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;

async fn setup_school(db: &sea_orm::DatabaseConnection) -> schools::Model {
    let school = schools::ActiveModel::new("Test School".to_string(), "test-domain".to_string());
    school.insert(db).await.unwrap()
}

#[tokio::test]
#[serial]
async fn can_create_school_year() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let start = chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap();
    let end = chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap();
    let sy = school_years::ActiveModel::new(school.id, "2025/2026".to_string(), start, end);
    let sy = sy.insert(db).await.unwrap();

    assert_eq!(sy.name, "2025/2026");
    assert!(!sy.is_current);
}

#[tokio::test]
#[serial]
async fn can_create_term() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let sy = school_years::ActiveModel::new(
        school.id,
        "2025/2026".to_string(),
        chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
    );
    let sy = sy.insert(db).await.unwrap();

    let term = terms::ActiveModel::new(
        sy.id,
        "Fall 2025".to_string(),
        chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
    );
    let term = term.insert(db).await.unwrap();

    assert_eq!(term.name, "Fall 2025");
}

#[tokio::test]
#[serial]
async fn can_create_teacher() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let teacher = teachers::ActiveModel::new(
        school.id,
        "Jane".to_string(),
        "Doe".to_string(),
        "JD".to_string(),
    );
    let teacher = teacher.insert(db).await.unwrap();

    assert_eq!(teacher.abbreviation, "JD");
    assert_eq!(teacher.max_hours_per_week, 28);
    assert!(teacher.is_active);
}

#[tokio::test]
#[serial]
async fn can_create_subject() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let subject =
        subjects::ActiveModel::new(school.id, "Mathematics".to_string(), "MA".to_string());
    let subject = subject.insert(db).await.unwrap();

    assert_eq!(subject.name, "Mathematics");
    assert!(!subject.needs_special_room);
}

#[tokio::test]
#[serial]
async fn can_create_room() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let room = rooms::ActiveModel::new(school.id, "Room 101".to_string());
    let room = room.insert(db).await.unwrap();

    assert_eq!(room.name, "Room 101");
    assert!(room.is_active);
}

#[tokio::test]
#[serial]
async fn can_create_school_class() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let class = school_classes::ActiveModel::new(school.id, "5A".to_string(), 5);
    let class = class.insert(db).await.unwrap();

    assert_eq!(class.name, "5A");
    assert_eq!(class.grade_level, 5);
}

#[tokio::test]
#[serial]
async fn can_create_time_slot() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let start_time = chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap();
    let end_time = chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap();
    let ts = time_slots::ActiveModel::new(school.id, 0, 1, start_time, end_time);
    let ts = ts.insert(db).await.unwrap();

    assert_eq!(ts.day_of_week, 0);
    assert_eq!(ts.period, 1);
    assert!(!ts.is_break);
}

#[tokio::test]
#[serial]
async fn can_create_teacher_qualification() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let teacher = teachers::ActiveModel::new(
        school.id,
        "Alice".to_string(),
        "Smith".to_string(),
        "AS".to_string(),
    );
    let teacher = teacher.insert(db).await.unwrap();

    let subject = subjects::ActiveModel::new(school.id, "Physics".to_string(), "PH".to_string());
    let subject = subject.insert(db).await.unwrap();

    let qual = teacher_subject_qualifications::ActiveModel::new(
        teacher.id,
        subject.id,
        "primary".to_string(),
    );
    let qual = qual.insert(db).await.unwrap();

    assert_eq!(qual.qualification_level, "primary");
}

#[tokio::test]
#[serial]
async fn can_create_teacher_availability() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let teacher = teachers::ActiveModel::new(
        school.id,
        "Bob".to_string(),
        "Jones".to_string(),
        "BJ".to_string(),
    );
    let teacher = teacher.insert(db).await.unwrap();

    let avail =
        teacher_availabilities::ActiveModel::new(teacher.id, None, 0, 1, "blocked".to_string());
    let avail = avail.insert(db).await.unwrap();

    assert_eq!(avail.availability_type, "blocked");
    assert_eq!(avail.term_id, None);
}

#[tokio::test]
#[serial]
async fn can_create_room_subject_suitability() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let room = rooms::ActiveModel::new(school.id, "Lab 1".to_string());
    let room = room.insert(db).await.unwrap();

    let subject = subjects::ActiveModel::new(school.id, "Chemistry".to_string(), "CH".to_string());
    let subject = subject.insert(db).await.unwrap();

    let suit = room_subject_suitabilities::ActiveModel::new(room.id, subject.id);
    let suit = suit.insert(db).await.unwrap();

    assert_eq!(suit.room_id, room.id);
    assert_eq!(suit.subject_id, subject.id);
}

#[tokio::test]
#[serial]
async fn can_create_lesson() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    // Create school year and term
    let sy = school_years::ActiveModel::new(
        school.id,
        "2025/2026".to_string(),
        chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
    );
    let sy = sy.insert(db).await.unwrap();

    let term = terms::ActiveModel::new(
        sy.id,
        "Fall 2025".to_string(),
        chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
    );
    let term = term.insert(db).await.unwrap();

    // Create teacher, subject, class, time_slot
    let teacher = teachers::ActiveModel::new(
        school.id,
        "Carol".to_string(),
        "White".to_string(),
        "CW".to_string(),
    );
    let teacher = teacher.insert(db).await.unwrap();

    let subject = subjects::ActiveModel::new(school.id, "English".to_string(), "EN".to_string());
    let subject = subject.insert(db).await.unwrap();

    let class = school_classes::ActiveModel::new(school.id, "6B".to_string(), 6);
    let class = class.insert(db).await.unwrap();

    let ts = time_slots::ActiveModel::new(
        school.id,
        1,
        2,
        chrono::NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
        chrono::NaiveTime::from_hms_opt(9, 45, 0).unwrap(),
    );
    let ts = ts.insert(db).await.unwrap();

    // Create lesson
    let lesson = lessons::ActiveModel::new(term.id, class.id, teacher.id, subject.id, ts.id);
    let lesson = lesson.insert(db).await.unwrap();

    assert_eq!(lesson.week_pattern, "every");
    assert_eq!(lesson.room_id, None);
}

// --- Constraint violation tests ---

#[tokio::test]
#[serial]
async fn duplicate_teacher_abbreviation_rejected() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    teachers::ActiveModel::new(school.id, "A".into(), "B".into(), "AB".into())
        .insert(db)
        .await
        .unwrap();

    let dup = teachers::ActiveModel::new(school.id, "C".into(), "D".into(), "AB".into());
    assert!(dup.insert(db).await.is_err());
}

#[tokio::test]
#[serial]
async fn lesson_class_double_booking_rejected() {
    let boot = boot_test::<App>().await.unwrap();
    let db = &boot.app_context.db;
    let school = setup_school(db).await;

    let sy = school_years::ActiveModel::new(
        school.id,
        "2025/2026".into(),
        chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
    )
    .insert(db)
    .await
    .unwrap();

    let term = terms::ActiveModel::new(
        sy.id,
        "S1".into(),
        chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
    )
    .insert(db)
    .await
    .unwrap();

    let t1 = teachers::ActiveModel::new(school.id, "X".into(), "Y".into(), "T1".into())
        .insert(db)
        .await
        .unwrap();
    let t2 = teachers::ActiveModel::new(school.id, "A".into(), "B".into(), "T2".into())
        .insert(db)
        .await
        .unwrap();
    let s1 = subjects::ActiveModel::new(school.id, "Math".into(), "M1".into())
        .insert(db)
        .await
        .unwrap();
    let s2 = subjects::ActiveModel::new(school.id, "Eng".into(), "E1".into())
        .insert(db)
        .await
        .unwrap();
    let class = school_classes::ActiveModel::new(school.id, "5a".into(), 5)
        .insert(db)
        .await
        .unwrap();
    let ts = time_slots::ActiveModel::new(
        school.id,
        0,
        1,
        chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
        chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap(),
    )
    .insert(db)
    .await
    .unwrap();

    // First lesson OK
    lessons::ActiveModel::new(term.id, class.id, t1.id, s1.id, ts.id)
        .insert(db)
        .await
        .unwrap();

    // Same class, same timeslot, same week_pattern = double-booking → rejected
    let dup = lessons::ActiveModel::new(term.id, class.id, t2.id, s2.id, ts.id);
    assert!(dup.insert(db).await.is_err());
}
