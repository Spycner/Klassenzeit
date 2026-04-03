use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{
    app_users, school_classes, school_memberships, schools, teachers,
};
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;

use crate::helpers::jwt::{TestKeyPair, TEST_CLIENT_ID, TEST_ISSUER};

fn valid_claims(sub: &str, email: &str) -> AuthClaims {
    AuthClaims {
        sub: sub.to_string(),
        email: email.to_string(),
        preferred_username: Some("Test User".to_string()),
        exp: (chrono::Utc::now().timestamp() + 300) as usize,
        iss: TEST_ISSUER.to_string(),
        aud: serde_json::json!(TEST_CLIENT_ID),
    }
}

/// Helper: create a school with an admin user, return (school, token)
async fn setup_admin_school(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Admin".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();

    let school =
        schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-school-slug"));
    let school = school.insert(&ctx.db).await.unwrap();

    let m = school_memberships::ActiveModel::new(user.id, school.id, "admin".into());
    m.insert(&ctx.db).await.unwrap();

    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

#[tokio::test]
#[serial]
async fn create_class_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "cls-create").await;

        let resp = server
            .post(&format!("/api/schools/{}/classes", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "5a",
                "grade_level": 5,
                "student_count": 28
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "5a");
        assert_eq!(body["grade_level"], 5);
        assert_eq!(body["student_count"], 28);
        assert_eq!(body["is_active"], true);
        assert!(body["id"].as_str().is_some());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn create_class_with_class_teacher_validates_teacher_exists() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "cls-teacher-fk").await;

        // Create a teacher in the DB
        let teacher =
            teachers::ActiveModel::new(school.id, "Jane".into(), "Doe".into(), "JD".into());
        let teacher = teacher.insert(&ctx.db).await.unwrap();

        // Create class with valid class_teacher_id
        let resp = server
            .post(&format!("/api/schools/{}/classes", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "6b",
                "grade_level": 6,
                "class_teacher_id": teacher.id.to_string()
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["class_teacher_id"], teacher.id.to_string());

        // Try with a non-existent teacher id
        let fake_id = uuid::Uuid::new_v4();
        let resp = server
            .post(&format!("/api/schools/{}/classes", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "6c",
                "grade_level": 6,
                "class_teacher_id": fake_id.to_string()
            }))
            .await;

        resp.assert_status(StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_class_partial_fields() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "cls-update").await;

        // Create class in DB
        let class = school_classes::ActiveModel::new(school.id, "7a".into(), 7);
        let class = class.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!("/api/schools/{}/classes/{}", school.id, class.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "7b",
                "student_count": 30
            }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "7b");
        assert_eq!(body["student_count"], 30);
        // grade_level should remain unchanged
        assert_eq!(body["grade_level"], 7);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_class_soft_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "cls-delete").await;

        let class = school_classes::ActiveModel::new(school.id, "8a".into(), 8);
        let class = class.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/classes/{}", school.id, class.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Verify soft-deleted (is_active = false)
        use sea_orm::EntityTrait;
        let deleted = school_classes::Entity::find_by_id(class.id)
            .one(&ctx.db)
            .await
            .unwrap()
            .expect("class should still exist in DB");
        assert!(
            !deleted.is_active,
            "class should be soft-deleted (is_active = false)"
        );
    })
    .await;
}
