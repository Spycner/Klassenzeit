use klassenzeit_backend::app::App;
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, EntityTrait, ModelTrait};
use serial_test::serial;

use klassenzeit_backend::models::{app_users, school_memberships, schools};

async fn create_school_and_user(
    db: &sea_orm::DatabaseConnection,
) -> (schools::Model, app_users::Model) {
    let school = schools::ActiveModel::new(
        "Membership School".to_string(),
        format!("membership-school-{}", uuid::Uuid::new_v4()),
    );
    let school = school.insert(db).await.unwrap();

    let user = app_users::ActiveModel::new(
        format!("kc-{}", uuid::Uuid::new_v4()),
        format!("{}@example.com", uuid::Uuid::new_v4()),
        "Test User".to_string(),
    );
    let user = user.insert(db).await.unwrap();

    (school, user)
}

#[tokio::test]
#[serial]
async fn can_create_membership() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let membership = school_memberships::ActiveModel::new(user.id, school.id, "admin".to_string());
    let membership = membership.insert(&boot.app_context.db).await.unwrap();

    assert_eq!(membership.user_id, user.id);
    assert_eq!(membership.school_id, school.id);
    assert_eq!(membership.role, "admin");
    assert!(membership.is_active);
}

#[tokio::test]
#[serial]
async fn membership_user_school_must_be_unique() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let m1 = school_memberships::ActiveModel::new(user.id, school.id, "admin".to_string());
    m1.insert(&boot.app_context.db).await.unwrap();

    let m2 = school_memberships::ActiveModel::new(user.id, school.id, "teacher".to_string());
    let result = m2.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}

#[tokio::test]
#[serial]
async fn deleting_school_cascades_to_memberships() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let membership =
        school_memberships::ActiveModel::new(user.id, school.id, "teacher".to_string());
    let membership = membership.insert(&boot.app_context.db).await.unwrap();
    let membership_id = membership.id;

    // Delete the school
    school.delete(&boot.app_context.db).await.unwrap();

    // Membership should be gone
    let found = school_memberships::Entity::find_by_id(membership_id)
        .one(&boot.app_context.db)
        .await
        .unwrap();
    assert!(found.is_none());
}

#[tokio::test]
#[serial]
async fn deleting_user_cascades_to_memberships() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let membership = school_memberships::ActiveModel::new(user.id, school.id, "viewer".to_string());
    let membership = membership.insert(&boot.app_context.db).await.unwrap();
    let membership_id = membership.id;

    // Delete the user
    user.delete(&boot.app_context.db).await.unwrap();

    // Membership should be gone
    let found = school_memberships::Entity::find_by_id(membership_id)
        .one(&boot.app_context.db)
        .await
        .unwrap();
    assert!(found.is_none());
}

#[tokio::test]
#[serial]
async fn role_check_constraint_rejects_invalid_role() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let membership = school_memberships::ActiveModel::new(
        user.id,
        school.id,
        "superadmin".to_string(), // invalid role
    );
    let result = membership.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}
