use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, schools, time_slots};
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
async fn create_timeslot_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ts-create").await;

        let resp = server
            .post(&format!("/api/schools/{}/timeslots", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "day_of_week": 0,
                "period": 1,
                "start_time": "08:00:00",
                "end_time": "08:45:00",
                "label": "1st Period"
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["day_of_week"], 0);
        assert_eq!(body["period"], 1);
        assert_eq!(body["start_time"], "08:00");
        assert_eq!(body["end_time"], "08:45");
        assert_eq!(body["is_break"], false);
        assert_eq!(body["label"], "1st Period");
        assert!(body["id"].as_str().is_some());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_timeslot_partial_fields() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ts-update").await;

        // Create timeslot in DB
        let start = chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap();
        let end = chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap();
        let slot = time_slots::ActiveModel::new(school.id, 0, 1, start, end);
        let slot = slot.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!("/api/schools/{}/timeslots/{}", school.id, slot.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "label": "Updated Label"
            }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["label"], "Updated Label");
        assert_eq!(body["start_time"], "08:00");
        assert_eq!(body["end_time"], "08:45");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_timeslot_hard_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ts-delete").await;

        let start = chrono::NaiveTime::from_hms_opt(9, 0, 0).unwrap();
        let end = chrono::NaiveTime::from_hms_opt(9, 45, 0).unwrap();
        let slot = time_slots::ActiveModel::new(school.id, 1, 2, start, end);
        let slot = slot.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/timeslots/{}", school.id, slot.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Verify hard-deleted from DB
        use sea_orm::EntityTrait;
        let deleted = time_slots::Entity::find_by_id(slot.id)
            .one(&ctx.db)
            .await
            .unwrap();
        assert!(deleted.is_none(), "timeslot should be hard-deleted");
    })
    .await;
}
