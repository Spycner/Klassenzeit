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

#[tokio::test]
#[serial]
async fn create_school_returns_201_and_creates_admin_membership() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let claims = valid_claims("kc-create-school", "creator@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .post("/api/schools")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .json(&serde_json::json!({ "name": "Springfield Elementary" }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Springfield Elementary");
        assert_eq!(body["slug"], "springfield-elementary");
        assert_eq!(body["role"], "admin");
        assert!(body["id"].as_str().is_some());
        assert!(body["created_at"].as_str().is_some());

        // Verify admin membership was created in DB
        let user = app_users::Model::find_by_keycloak_id(&ctx.db, "kc-create-school")
            .await
            .unwrap()
            .expect("user should exist");

        let school_id: uuid::Uuid = body["id"].as_str().unwrap().parse().unwrap();
        let membership =
            school_memberships::Model::find_active_membership(&ctx.db, user.id, school_id)
                .await
                .unwrap();
        assert!(membership.is_some(), "admin membership should exist");
        assert_eq!(membership.unwrap().role, "admin");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn create_school_without_auth_returns_401() {
    request::<App, _, _>(|server, _ctx| async move {
        let resp = server
            .post("/api/schools")
            .json(&serde_json::json!({ "name": "No Auth School" }))
            .await;

        resp.assert_status(StatusCode::UNAUTHORIZED);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn list_schools_returns_user_memberships() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create user
        let user = app_users::ActiveModel::new(
            "kc-list-schools".into(),
            "lister@example.com".into(),
            "Lister User".into(),
        );
        let user = user.insert(&ctx.db).await.unwrap();

        // Create 2 schools with memberships
        let school1 = schools::ActiveModel::new("School One".into(), "school-one".into());
        let school1 = school1.insert(&ctx.db).await.unwrap();
        let m1 = school_memberships::ActiveModel::new(user.id, school1.id, "admin".into());
        m1.insert(&ctx.db).await.unwrap();

        let school2 = schools::ActiveModel::new("School Two".into(), "school-two".into());
        let school2 = school2.insert(&ctx.db).await.unwrap();
        let m2 = school_memberships::ActiveModel::new(user.id, school2.id, "teacher".into());
        m2.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-list-schools", "lister@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get("/api/schools")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .await;

        resp.assert_status_ok();
        let body: Vec<serde_json::Value> = resp.json();
        assert_eq!(body.len(), 2);

        // Verify both schools are present (order not guaranteed)
        let names: Vec<&str> = body.iter().map(|s| s["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"School One"));
        assert!(names.contains(&"School Two"));
    })
    .await;
}

#[tokio::test]
#[serial]
async fn get_school_returns_details() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create user, school, membership
        let user = app_users::ActiveModel::new(
            "kc-get-school".into(),
            "getter@example.com".into(),
            "Getter User".into(),
        );
        let user = user.insert(&ctx.db).await.unwrap();

        let school = schools::ActiveModel::new("Detail School".into(), "detail-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        let membership = school_memberships::ActiveModel::new(user.id, school.id, "teacher".into());
        membership.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-get-school", "getter@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get(&format!("/api/schools/{}", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Detail School");
        assert_eq!(body["slug"], "detail-school");
        assert_eq!(body["role"], "teacher");
        assert_eq!(body["id"], school.id.to_string());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_school_requires_admin() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create user, school, teacher membership
        let user = app_users::ActiveModel::new(
            "kc-update-nonadmin".into(),
            "teacher@example.com".into(),
            "Teacher User".into(),
        );
        let user = user.insert(&ctx.db).await.unwrap();

        let school = schools::ActiveModel::new("Teacher School".into(), "teacher-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        let membership = school_memberships::ActiveModel::new(user.id, school.id, "teacher".into());
        membership.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-update-nonadmin", "teacher@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .put(&format!("/api/schools/{}", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "name": "Renamed School" }))
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_school_as_admin_succeeds() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create user, school, admin membership
        let user = app_users::ActiveModel::new(
            "kc-update-admin".into(),
            "admin@example.com".into(),
            "Admin User".into(),
        );
        let user = user.insert(&ctx.db).await.unwrap();

        let school = schools::ActiveModel::new("Old Name".into(), "old-name".into());
        let school = school.insert(&ctx.db).await.unwrap();

        let membership = school_memberships::ActiveModel::new(user.id, school.id, "admin".into());
        membership.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-update-admin", "admin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .put(&format!("/api/schools/{}", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "name": "New Name" }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "New Name");
        assert_eq!(body["slug"], "new-name");
        assert_eq!(body["role"], "admin");
    })
    .await;
}
