use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, school_years, schools, terms};
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
async fn create_term_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "term-create").await;

        // Create a school_year first
        let sy = school_years::ActiveModel::new(
            school.id,
            "2025/2026".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
        );
        let sy = sy.insert(&ctx.db).await.unwrap();

        let resp = server
            .post(&format!("/api/schools/{}/terms", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "school_year_id": sy.id.to_string(),
                "name": "Fall Term",
                "start_date": "2025-09-01",
                "end_date": "2026-01-31",
                "is_current": true
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Fall Term");
        assert_eq!(body["school_year_id"], sy.id.to_string());
        assert_eq!(body["start_date"], "2025-09-01");
        assert_eq!(body["end_date"], "2026-01-31");
        assert_eq!(body["is_current"], true);
        assert!(body["id"].as_str().is_some());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn create_term_with_wrong_school_year_returns_400() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "term-wrong-sy").await;

        // Create a DIFFERENT school and school_year
        let other_school =
            schools::ActiveModel::new("other-school-term".into(), "other-school-term-slug".into());
        let other_school = other_school.insert(&ctx.db).await.unwrap();

        let other_sy = school_years::ActiveModel::new(
            other_school.id,
            "2025/2026".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
        );
        let other_sy = other_sy.insert(&ctx.db).await.unwrap();

        // Try to create term with other school's school_year_id
        let resp = server
            .post(&format!("/api/schools/{}/terms", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "school_year_id": other_sy.id.to_string(),
                "name": "Sneaky Term",
                "start_date": "2025-09-01",
                "end_date": "2026-01-31"
            }))
            .await;

        resp.assert_status(StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_term_partial_fields() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "term-update").await;

        let sy = school_years::ActiveModel::new(
            school.id,
            "2025/2026".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
        );
        let sy = sy.insert(&ctx.db).await.unwrap();

        let term = terms::ActiveModel::new(
            sy.id,
            "Original Name".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
        );
        let term = term.insert(&ctx.db).await.unwrap();

        // Update only name
        let resp = server
            .put(&format!("/api/schools/{}/terms/{}", school.id, term.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "Updated Name"
            }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Updated Name");
        // start_date should be unchanged
        assert_eq!(body["start_date"], "2025-09-01");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_term_hard_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "term-delete").await;

        let sy = school_years::ActiveModel::new(
            school.id,
            "2025/2026".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
        );
        let sy = sy.insert(&ctx.db).await.unwrap();

        let term = terms::ActiveModel::new(
            sy.id,
            "To Delete".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
        );
        let term = term.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/terms/{}", school.id, term.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Verify hard-deleted from DB
        use sea_orm::EntityTrait;
        let deleted = terms::Entity::find_by_id(term.id)
            .one(&ctx.db)
            .await
            .unwrap();
        assert!(deleted.is_none(), "term should be hard-deleted");
    })
    .await;
}
