use klassenzeit_backend::app::App;
use klassenzeit_backend::models::{app_users, school_memberships, schools};
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;

#[tokio::test]
#[serial]
async fn can_create_school() {
    let boot = boot_test::<App>().await.unwrap();

    let school = schools::ActiveModel::new("Test School".to_string(), "test-school".to_string());
    let school = school.insert(&boot.app_context.db).await.unwrap();

    assert_eq!(school.name, "Test School");
    assert_eq!(school.slug, "test-school");
}

#[tokio::test]
#[serial]
async fn can_find_school_by_slug() {
    let boot = boot_test::<App>().await.unwrap();

    let school = schools::ActiveModel::new("Slug School".to_string(), "slug-school".to_string());
    school.insert(&boot.app_context.db).await.unwrap();

    let found = schools::Model::find_by_slug(&boot.app_context.db, "slug-school")
        .await
        .unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().name, "Slug School");
}

#[tokio::test]
#[serial]
async fn slug_must_be_unique() {
    let boot = boot_test::<App>().await.unwrap();

    let school1 = schools::ActiveModel::new("School A".to_string(), "unique-slug".to_string());
    school1.insert(&boot.app_context.db).await.unwrap();

    let school2 = schools::ActiveModel::new("School B".to_string(), "unique-slug".to_string());
    let result = school2.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}

#[test]
fn generate_slug_from_name() {
    assert_eq!(schools::generate_slug("My School"), "my-school");
    assert_eq!(
        schools::generate_slug("  Spaces  Everywhere  "),
        "spaces-everywhere"
    );
    assert_eq!(
        schools::generate_slug("Special Ch@rs & More!"),
        "special-chrs-more"
    );
    assert_eq!(schools::generate_slug("Über Schule"), "ber-schule");
}

#[tokio::test]
#[serial]
async fn find_schools_for_user_returns_memberships() {
    let boot = boot_test::<App>().await.unwrap();

    let user = app_users::ActiveModel::new(
        "kc-list-user".into(),
        "listuser@example.com".into(),
        "List User".into(),
    );
    let user = user.insert(&boot.app_context.db).await.unwrap();

    let school1 = schools::ActiveModel::new("School A".into(), "school-a".into());
    let school1 = school1.insert(&boot.app_context.db).await.unwrap();

    let school2 = schools::ActiveModel::new("School B".into(), "school-b".into());
    let school2 = school2.insert(&boot.app_context.db).await.unwrap();

    school_memberships::ActiveModel::new(user.id, school1.id, "admin".into())
        .insert(&boot.app_context.db)
        .await
        .unwrap();
    school_memberships::ActiveModel::new(user.id, school2.id, "teacher".into())
        .insert(&boot.app_context.db)
        .await
        .unwrap();

    let results = schools::Model::find_schools_for_user(&boot.app_context.db, user.id)
        .await
        .unwrap();
    assert_eq!(results.len(), 2);
}
