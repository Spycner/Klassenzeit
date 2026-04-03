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

fn expired_claims(sub: &str, email: &str) -> AuthClaims {
    AuthClaims {
        sub: sub.to_string(),
        email: email.to_string(),
        preferred_username: Some("Test User".to_string()),
        exp: (chrono::Utc::now().timestamp() - 300) as usize,
        iss: TEST_ISSUER.to_string(),
        aud: serde_json::json!(TEST_CLIENT_ID),
    }
}

#[tokio::test]
#[serial]
async fn me_returns_401_without_token() {
    request::<App, _, _>(|server, _ctx| async move {
        let resp = server.get("/api/auth/me").await;
        resp.assert_status(StatusCode::UNAUTHORIZED);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn me_returns_user_info_with_valid_token() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let claims = valid_claims("kc-test-me", "me@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get("/api/auth/me")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["email"], "me@example.com");
        assert_eq!(body["keycloak_id"], "kc-test-me");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn me_auto_creates_user_on_first_login() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let claims = valid_claims("kc-new-user", "newuser@example.com");

        // Verify user does not exist before request
        let before = app_users::Model::find_by_keycloak_id(&ctx.db, "kc-new-user")
            .await
            .unwrap();
        assert!(before.is_none(), "user should not exist before first login");

        let token = kp.create_token(&claims);
        let resp = server
            .get("/api/auth/me")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .await;
        resp.assert_status_ok();

        // Verify user was created
        let after = app_users::Model::find_by_keycloak_id(&ctx.db, "kc-new-user")
            .await
            .unwrap();
        assert!(after.is_some(), "user should have been auto-created");
        assert_eq!(after.unwrap().email, "newuser@example.com");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn me_returns_401_with_expired_token() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let claims = expired_claims("kc-expired", "expired@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get("/api/auth/me")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .await;

        resp.assert_status(StatusCode::UNAUTHORIZED);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn school_returns_400_without_school_id_header() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let claims = valid_claims("kc-school-test", "schooltest@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get("/api/auth/school")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .await;

        resp.assert_status(StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn school_returns_403_without_membership() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create a school but no membership for the user
        let school =
            schools::ActiveModel::new("No-Member School".into(), "no-member-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-no-member", "nomember@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get("/api/auth/school")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn school_returns_context_with_valid_membership() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create user, school, and membership
        let user = app_users::ActiveModel::new(
            "kc-member".into(),
            "member@example.com".into(),
            "Member User".into(),
        );
        let user = user.insert(&ctx.db).await.unwrap();

        let school = schools::ActiveModel::new("Member School".into(), "member-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        let membership = school_memberships::ActiveModel::new(user.id, school.id, "teacher".into());
        membership.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-member", "member@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get("/api/auth/school")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["school_name"], "Member School");
        assert_eq!(body["role"], "teacher");
    })
    .await;
}
