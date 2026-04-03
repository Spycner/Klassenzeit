use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, schools, subjects};
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

/// Helper: create a school with a teacher user, return (school, token)
async fn setup_teacher_school(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Teacher".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();

    let school =
        schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-school-slug"));
    let school = school.insert(&ctx.db).await.unwrap();

    let m = school_memberships::ActiveModel::new(user.id, school.id, "teacher".into());
    m.insert(&ctx.db).await.unwrap();

    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

#[tokio::test]
#[serial]
async fn create_subject_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "subj-create").await;

        let resp = server
            .post(&format!("/api/schools/{}/subjects", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "Mathematics",
                "abbreviation": "MAT",
                "color": "#ff0000",
                "needs_special_room": false
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Mathematics");
        assert_eq!(body["abbreviation"], "MAT");
        assert_eq!(body["color"], "#ff0000");
        assert_eq!(body["needs_special_room"], false);
        assert!(body["id"].as_str().is_some());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn create_subject_as_teacher_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "subj-create-teacher").await;

        let resp = server
            .post(&format!("/api/schools/{}/subjects", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "Physics",
                "abbreviation": "PHY"
            }))
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_subject_as_admin_returns_200() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "subj-update").await;

        // Create subject in DB
        let subject = subjects::ActiveModel::new(school.id, "Old Name".into(), "OLD".into());
        let subject = subject.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!(
                "/api/schools/{}/subjects/{}",
                school.id, subject.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "New Name",
                "abbreviation": "NEW"
            }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "New Name");
        assert_eq!(body["abbreviation"], "NEW");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_subject_not_found_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "subj-update-404").await;

        let fake_id = uuid::Uuid::new_v4();
        let resp = server
            .put(&format!("/api/schools/{}/subjects/{}", school.id, fake_id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "name": "Nope" }))
            .await;

        resp.assert_status(StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_subject_as_admin_hard_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "subj-delete").await;

        let subject = subjects::ActiveModel::new(school.id, "To Delete".into(), "DEL".into());
        let subject = subject.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!(
                "/api/schools/{}/subjects/{}",
                school.id, subject.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Verify hard-deleted from DB
        use sea_orm::EntityTrait;
        let deleted = subjects::Entity::find_by_id(subject.id)
            .one(&ctx.db)
            .await
            .unwrap();
        assert!(deleted.is_none(), "subject should be hard-deleted");
    })
    .await;
}
