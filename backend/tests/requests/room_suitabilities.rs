use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::_entities::{room_subject_suitabilities, rooms, subjects};
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

async fn create_room(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    suffix: &str,
) -> rooms::Model {
    let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
    rooms::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(format!("Room {suffix}")),
        building: Set(None),
        capacity: Set(None),
        is_active: Set(true),
        max_concurrent: Set(1),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap()
}

async fn create_subject(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    suffix: &str,
) -> subjects::Model {
    let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
    subjects::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(format!("Subject {suffix}")),
        abbreviation: Set(suffix.to_string()),
        color: Set(None),
        needs_special_room: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap()
}

fn url(school_id: Uuid, room_id: Uuid) -> String {
    format!("/api/schools/{school_id}/rooms/{room_id}/suitabilities")
}

// ─── GET: returns empty array when no rows ───────────────────────────────────

#[tokio::test]
#[serial]
async fn get_returns_empty_when_no_rows() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "rs-get-empty").await;
        let room = create_room(&ctx, school.id, "GE").await;

        let resp = server
            .get(&url(school.id, room.id))
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

// ─── PUT: admin persists subject list, GET returns 2 rows ────────────────────

#[tokio::test]
#[serial]
async fn put_as_admin_persists_subject_list() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "rs-put-persist").await;
        let room = create_room(&ctx, school.id, "PP").await;
        let subj1 = create_subject(&ctx, school.id, "PP1").await;
        let subj2 = create_subject(&ctx, school.id, "PP2").await;

        let u = url(school.id, room.id);

        let put_resp = server
            .put(&u)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({"subject_ids": [subj1.id, subj2.id]}))
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
        assert_eq!(arr.len(), 2, "expected 2 suitability rows");

        let returned_ids: Vec<&str> = arr
            .iter()
            .map(|v| v["subject_id"].as_str().unwrap())
            .collect();
        assert!(
            returned_ids.contains(&subj1.id.to_string().as_str()),
            "subj1 missing"
        );
        assert!(
            returned_ids.contains(&subj2.id.to_string().as_str()),
            "subj2 missing"
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

        let (school, token) = setup_admin_school(&ctx, &kp, "rs-put-replace").await;
        let room = create_room(&ctx, school.id, "PR").await;
        let subj_old1 = create_subject(&ctx, school.id, "PRO1").await;
        let subj_old2 = create_subject(&ctx, school.id, "PRO2").await;
        let subj_new = create_subject(&ctx, school.id, "PRN").await;

        // Seed two existing rows directly
        let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
        room_subject_suitabilities::ActiveModel {
            id: Set(Uuid::new_v4()),
            room_id: Set(room.id),
            subject_id: Set(subj_old1.id),
            notes: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&ctx.db)
        .await
        .unwrap();

        room_subject_suitabilities::ActiveModel {
            id: Set(Uuid::new_v4()),
            room_id: Set(room.id),
            subject_id: Set(subj_old2.id),
            notes: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(&ctx.db)
        .await
        .unwrap();

        let u = url(school.id, room.id);

        // PUT a single different subject — should replace both seeded rows
        let put_resp = server
            .put(&u)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({"subject_ids": [subj_new.id]}))
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
        assert_eq!(arr[0]["subject_id"], subj_new.id.to_string());
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

        let (school, token) = setup_teacher_school(&ctx, &kp, "rs-put-forbidden").await;
        let room = create_room(&ctx, school.id, "PF").await;
        let subj = create_subject(&ctx, school.id, "PF1").await;

        let resp = server
            .put(&url(school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({"subject_ids": [subj.id]}))
            .await;

        resp.assert_status_forbidden();
    })
    .await;
}

// ─── PUT: cross-tenant subject returns 422 ───────────────────────────────────

#[tokio::test]
#[serial]
async fn put_with_cross_tenant_subject_returns_422() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // School A — attacker
        let (school_a, token_a) = setup_admin_school(&ctx, &kp, "rs-ct-a").await;
        // School B — victim
        let (school_b, _token_b) = setup_admin_school(&ctx, &kp, "rs-ct-b").await;

        let room_a = create_room(&ctx, school_a.id, "CTA").await;
        // Subject belongs to school B
        let subj_b = create_subject(&ctx, school_b.id, "CTB").await;

        let resp = server
            .put(&url(school_a.id, room_a.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token_a}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school_a.id.to_string(),
            )
            .json(&serde_json::json!({"subject_ids": [subj_b.id]}))
            .await;

        resp.assert_status(StatusCode::UNPROCESSABLE_ENTITY);
    })
    .await;
}

// ─── PUT: unknown room UUID returns 404 ──────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_with_unknown_room_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "rs-put-404").await;
        let bogus_room_id = Uuid::new_v4();

        let resp = server
            .put(&url(school.id, bogus_room_id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({"subject_ids": []}))
            .await;

        resp.assert_status_not_found();
    })
    .await;
}
