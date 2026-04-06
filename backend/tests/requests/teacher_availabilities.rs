use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::_entities::{teacher_availabilities, teachers};
use klassenzeit_backend::models::{app_users, school_memberships, schools};
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, Set};
use serial_test::serial;
use uuid::Uuid;

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

async fn create_teacher(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    suffix: &str,
) -> teachers::Model {
    let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
    teachers::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        first_name: Set(format!("First{suffix}")),
        last_name: Set(format!("Last{suffix}")),
        email: Set(None),
        abbreviation: Set(suffix.to_string()),
        max_hours_per_week: Set(20),
        is_part_time: Set(false),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap()
}

fn url(school_id: Uuid, teacher_id: Uuid) -> String {
    format!("/api/schools/{school_id}/teachers/{teacher_id}/availabilities")
}

// ─── GET: returns empty array when no rows ───────────────────────────────────

#[tokio::test]
#[serial]
async fn get_returns_empty_when_no_rows() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "ta-get-empty").await;
        let teacher = create_teacher(&ctx, school.id, "GE").await;

        let resp = server
            .get(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body, serde_json::json!([]));
    })
    .await;
}

// ─── PUT: admin persists blocked and preferred, GET returns only non-available ─

#[tokio::test]
#[serial]
async fn put_as_admin_persists_blocked_and_preferred() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ta-put-persist").await;
        let teacher = create_teacher(&ctx, school.id, "PP").await;
        let u = url(school.id, teacher.id);

        let put_resp = server
            .put(&u)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                {"day_of_week": 0, "period": 1, "availability_type": "blocked"},
                {"day_of_week": 1, "period": 2, "availability_type": "preferred"},
                {"day_of_week": 2, "period": 3, "availability_type": "available"},
            ]))
            .await;

        put_resp.assert_status(StatusCode::NO_CONTENT);

        let get_resp = server
            .get(&u)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        get_resp.assert_status_ok();
        let body: serde_json::Value = get_resp.json();
        let arr = body.as_array().unwrap();
        assert_eq!(
            arr.len(),
            2,
            "only blocked and preferred rows should be stored"
        );

        let types: Vec<&str> = arr
            .iter()
            .map(|v| v["availability_type"].as_str().unwrap())
            .collect();
        assert!(types.contains(&"blocked"), "blocked row missing");
        assert!(types.contains(&"preferred"), "preferred row missing");
        assert!(
            !types.contains(&"available"),
            "available row should not be stored"
        );
    })
    .await;
}

// ─── PUT: replaces existing rows with new set ────────────────────────────────

#[tokio::test]
#[serial]
async fn put_replaces_existing_state() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ta-put-replace").await;
        let teacher = create_teacher(&ctx, school.id, "PR").await;

        // Seed two existing rows directly
        let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
        teacher_availabilities::ActiveModel {
            id: Set(Uuid::new_v4()),
            teacher_id: Set(teacher.id),
            term_id: Set(None),
            day_of_week: Set(0),
            period: Set(1),
            availability_type: Set("blocked".to_string()),
            reason: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&ctx.db)
        .await
        .unwrap();

        teacher_availabilities::ActiveModel {
            id: Set(Uuid::new_v4()),
            teacher_id: Set(teacher.id),
            term_id: Set(None),
            day_of_week: Set(1),
            period: Set(2),
            availability_type: Set("preferred".to_string()),
            reason: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&ctx.db)
        .await
        .unwrap();

        let u = url(school.id, teacher.id);

        // PUT a single different row — should replace both seeded rows
        let put_resp = server
            .put(&u)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                {"day_of_week": 3, "period": 5, "availability_type": "blocked"},
            ]))
            .await;

        put_resp.assert_status(StatusCode::NO_CONTENT);

        let get_resp = server
            .get(&u)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        get_resp.assert_status_ok();
        let body: serde_json::Value = get_resp.json();
        let arr = body.as_array().unwrap();
        assert_eq!(arr.len(), 1, "old rows should have been replaced");
        assert_eq!(arr[0]["day_of_week"], 3);
        assert_eq!(arr[0]["period"], 5);
        assert_eq!(arr[0]["availability_type"], "blocked");
    })
    .await;
}

// ─── PUT: non-admin returns 403 ───────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_as_non_admin_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "ta-put-forbidden").await;
        let teacher = create_teacher(&ctx, school.id, "PF").await;

        let resp = server
            .put(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                {"day_of_week": 0, "period": 1, "availability_type": "blocked"},
            ]))
            .await;

        resp.assert_status_forbidden();
    })
    .await;
}

// ─── PUT: invalid day_of_week returns 422 ────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_with_invalid_day_returns_422() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ta-put-422").await;
        let teacher = create_teacher(&ctx, school.id, "P4").await;

        let resp = server
            .put(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                {"day_of_week": 9, "period": 1, "availability_type": "blocked"},
            ]))
            .await;

        resp.assert_status(StatusCode::UNPROCESSABLE_ENTITY);
    })
    .await;
}

// ─── PUT: unknown teacher UUID returns 404 ───────────────────────────────────

#[tokio::test]
#[serial]
async fn put_with_unknown_teacher_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ta-put-404").await;
        let bogus_teacher_id = Uuid::new_v4();

        let resp = server
            .put(&url(school.id, bogus_teacher_id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                {"day_of_week": 0, "period": 1, "availability_type": "blocked"},
            ]))
            .await;

        resp.assert_status_not_found();
    })
    .await;
}

// ─── GET: cross-tenant teacher returns 404 ───────────────────────────────────

#[tokio::test]
#[serial]
async fn get_with_cross_tenant_teacher_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // School A — attacker
        let (school_a, token_a) = setup_admin_school(&ctx, &kp, "ta-ct-a").await;
        // School B — victim
        let (school_b, _token_b) = setup_admin_school(&ctx, &kp, "ta-ct-b").await;

        // Teacher belongs to school B
        let teacher_b = create_teacher(&ctx, school_b.id, "CT").await;

        // Use school A's token + x-school-id to try to access school B's teacher
        let resp = server
            .get(&url(school_a.id, teacher_b.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token_a}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school_a.id.to_string(),
            )
            .await;

        resp.assert_status_not_found();
    })
    .await;
}
