use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, schools};
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

async fn setup_admin_school(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (schools::Model, String) {
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

async fn setup_teacher_school(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (schools::Model, String) {
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

fn settings_url(school_id: uuid::Uuid) -> String {
    format!("/api/schools/{school_id}/scheduler-settings")
}

// ─── GET: returns defaults when no row exists ────────────────────────────────

#[tokio::test]
#[serial]
async fn get_returns_defaults_when_no_row() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "ss-get-defaults").await;

        let resp = server
            .get(&settings_url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        let weights = &body["weights"];
        assert_eq!(weights["w_teacher_gap"], 1);
        assert_eq!(weights["w_subject_distribution"], 2);
        assert_eq!(weights["soften_teacher_max_hours"], serde_json::Value::Null);
    })
    .await;
}

// ─── PUT: admin persists settings, GET reflects them ─────────────────────────

#[tokio::test]
#[serial]
async fn put_as_admin_persists_and_get_reflects() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ss-put-persist").await;
        let url = settings_url(school.id);

        let put_resp = server
            .put(&url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "w_preferred_slot": 1,
                "w_teacher_gap": 5,
                "w_subject_distribution": 2,
                "w_class_teacher_first_period": 1,
                "soften_teacher_max_hours": 100
            }))
            .await;

        put_resp.assert_status_ok();
        let put_body: serde_json::Value = put_resp.json();
        assert_eq!(put_body["weights"]["w_teacher_gap"], 5);
        assert_eq!(put_body["weights"]["soften_teacher_max_hours"], 100);

        // Follow-up GET should return the updated values
        let get_resp = server
            .get(&url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        get_resp.assert_status_ok();
        let get_body: serde_json::Value = get_resp.json();
        assert_eq!(get_body["weights"]["w_teacher_gap"], 5);
        assert_eq!(get_body["weights"]["soften_teacher_max_hours"], 100);
    })
    .await;
}

// ─── PUT: non-admin returns 403 ───────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_as_non_admin_returns_forbidden() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "ss-put-forbidden").await;

        let resp = server
            .put(&settings_url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "w_teacher_gap": 5
            }))
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}

// ─── PUT: out-of-range weight returns 422 ────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_out_of_range_returns_422() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ss-put-422").await;

        let resp = server
            .put(&settings_url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "w_preferred_slot": 1,
                "w_teacher_gap": 999,
                "w_subject_distribution": 2,
                "w_class_teacher_first_period": 1
            }))
            .await;

        resp.assert_status(StatusCode::UNPROCESSABLE_ENTITY);
    })
    .await;
}
