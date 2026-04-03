use klassenzeit_backend::app::App;
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;

use klassenzeit_backend::models::schools;

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
