use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, rooms, school_memberships, schools};
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
async fn create_room_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "room-create").await;

        let resp = server
            .post(&format!("/api/schools/{}/rooms", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "Room 101",
                "building": "Main Building",
                "capacity": 30
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Room 101");
        assert_eq!(body["building"], "Main Building");
        assert_eq!(body["capacity"], 30);
        assert_eq!(body["is_active"], true);
        assert!(body["id"].as_str().is_some());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_room_partial_fields() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "room-update").await;

        // Create room in DB with building set
        let mut room = rooms::ActiveModel::new(school.id, "Old Room".into());
        room.building = sea_orm::ActiveValue::Set(Some("East Wing".into()));
        room.capacity = sea_orm::ActiveValue::Set(Some(20));
        let room = room.insert(&ctx.db).await.unwrap();

        // Update only name and capacity, building should stay unchanged
        let resp = server
            .put(&format!("/api/schools/{}/rooms/{}", school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "name": "New Room",
                "capacity": 40
            }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "New Room");
        assert_eq!(body["capacity"], 40);
        assert_eq!(
            body["building"], "East Wing",
            "building should remain unchanged"
        );
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_room_soft_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "room-delete").await;

        let room = rooms::ActiveModel::new(school.id, "To Delete".into());
        let room = room.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/rooms/{}", school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Verify soft-deleted: still in DB but is_active = false
        use sea_orm::EntityTrait;
        let deleted = rooms::Entity::find_by_id(room.id)
            .one(&ctx.db)
            .await
            .unwrap();
        assert!(
            deleted.is_some(),
            "room should still exist in DB (soft delete)"
        );
        assert_eq!(
            deleted.unwrap().is_active,
            false,
            "is_active should be false"
        );
    })
    .await;
}
