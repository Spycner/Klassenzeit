use klassenzeit_backend::app::App;
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;

use klassenzeit_backend::models::app_users;

#[tokio::test]
#[serial]
async fn can_create_app_user() {
    let boot = boot_test::<App>().await.unwrap();

    let user = app_users::ActiveModel::new(
        "kc-123".to_string(),
        "test@example.com".to_string(),
        "Test User".to_string(),
    );
    let user = user.insert(&boot.app_context.db).await.unwrap();

    assert_eq!(user.keycloak_id, "kc-123");
    assert_eq!(user.email, "test@example.com");
    assert_eq!(user.display_name, "Test User");
    assert!(user.is_active);
    assert!(user.last_login_at.is_none());
}

#[tokio::test]
#[serial]
async fn can_find_by_keycloak_id() {
    let boot = boot_test::<App>().await.unwrap();

    let user = app_users::ActiveModel::new(
        "kc-find-me".to_string(),
        "findme@example.com".to_string(),
        "Find Me".to_string(),
    );
    user.insert(&boot.app_context.db).await.unwrap();

    let found = app_users::Model::find_by_keycloak_id(&boot.app_context.db, "kc-find-me")
        .await
        .unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().email, "findme@example.com");
}

#[tokio::test]
#[serial]
async fn can_find_by_email() {
    let boot = boot_test::<App>().await.unwrap();

    let user = app_users::ActiveModel::new(
        "kc-email".to_string(),
        "email@example.com".to_string(),
        "Email User".to_string(),
    );
    user.insert(&boot.app_context.db).await.unwrap();

    let found = app_users::Model::find_by_email(&boot.app_context.db, "email@example.com")
        .await
        .unwrap();
    assert!(found.is_some());
}

#[tokio::test]
#[serial]
async fn keycloak_id_must_be_unique() {
    let boot = boot_test::<App>().await.unwrap();

    let user1 = app_users::ActiveModel::new(
        "kc-dupe".to_string(),
        "user1@example.com".to_string(),
        "User 1".to_string(),
    );
    user1.insert(&boot.app_context.db).await.unwrap();

    let user2 = app_users::ActiveModel::new(
        "kc-dupe".to_string(),
        "user2@example.com".to_string(),
        "User 2".to_string(),
    );
    let result = user2.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}

#[tokio::test]
#[serial]
async fn email_must_be_unique() {
    let boot = boot_test::<App>().await.unwrap();

    let user1 = app_users::ActiveModel::new(
        "kc-a".to_string(),
        "dupe@example.com".to_string(),
        "User A".to_string(),
    );
    user1.insert(&boot.app_context.db).await.unwrap();

    let user2 = app_users::ActiveModel::new(
        "kc-b".to_string(),
        "dupe@example.com".to_string(),
        "User B".to_string(),
    );
    let result = user2.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}
