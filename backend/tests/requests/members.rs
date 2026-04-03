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
async fn list_members_returns_school_members() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create admin user
        let admin_user = app_users::ActiveModel::new(
            "kc-list-members-admin".into(),
            "admin-list@example.com".into(),
            "Admin User".into(),
        );
        let admin_user = admin_user.insert(&ctx.db).await.unwrap();

        // Create teacher user
        let teacher_user = app_users::ActiveModel::new(
            "kc-list-members-teacher".into(),
            "teacher-list@example.com".into(),
            "Teacher User".into(),
        );
        let teacher_user = teacher_user.insert(&ctx.db).await.unwrap();

        // Create school
        let school = schools::ActiveModel::new("Members School".into(), "members-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        // Create memberships
        let m1 = school_memberships::ActiveModel::new(admin_user.id, school.id, "admin".into());
        m1.insert(&ctx.db).await.unwrap();

        let m2 = school_memberships::ActiveModel::new(teacher_user.id, school.id, "teacher".into());
        m2.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-list-members-admin", "admin-list@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get(&format!("/api/schools/{}/members", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: Vec<serde_json::Value> = resp.json();
        assert_eq!(body.len(), 2);

        let emails: Vec<&str> = body.iter().map(|m| m["email"].as_str().unwrap()).collect();
        assert!(emails.contains(&"admin-list@example.com"));
        assert!(emails.contains(&"teacher-list@example.com"));
    })
    .await;
}

#[tokio::test]
#[serial]
async fn add_member_requires_admin() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create teacher user
        let teacher_user = app_users::ActiveModel::new(
            "kc-add-member-teacher".into(),
            "teacher-add@example.com".into(),
            "Teacher User".into(),
        );
        let teacher_user = teacher_user.insert(&ctx.db).await.unwrap();

        // Create school + teacher membership
        let school =
            schools::ActiveModel::new("Add Member School".into(), "add-member-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        let m = school_memberships::ActiveModel::new(teacher_user.id, school.id, "teacher".into());
        m.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-add-member-teacher", "teacher-add@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .post(&format!("/api/schools/{}/members", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "email": "someone@example.com", "role": "teacher" }))
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn add_member_as_admin_succeeds() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create admin user
        let admin_user = app_users::ActiveModel::new(
            "kc-add-member-admin".into(),
            "admin-add@example.com".into(),
            "Admin User".into(),
        );
        let admin_user = admin_user.insert(&ctx.db).await.unwrap();

        // Create the user to be added (must exist in DB)
        let new_user = app_users::ActiveModel::new(
            "kc-new-member".into(),
            "newmember@example.com".into(),
            "New Member".into(),
        );
        new_user.insert(&ctx.db).await.unwrap();

        // Create school + admin membership
        let school =
            schools::ActiveModel::new("Add Admin School".into(), "add-admin-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        let m = school_memberships::ActiveModel::new(admin_user.id, school.id, "admin".into());
        m.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-add-member-admin", "admin-add@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .post(&format!("/api/schools/{}/members", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "email": "newmember@example.com", "role": "teacher" }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["email"], "newmember@example.com");
        assert_eq!(body["role"], "teacher");
        assert_eq!(body["is_active"], true);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn change_member_role_as_admin() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create admin
        let admin_user = app_users::ActiveModel::new(
            "kc-change-role-admin".into(),
            "admin-role@example.com".into(),
            "Admin User".into(),
        );
        let admin_user = admin_user.insert(&ctx.db).await.unwrap();

        // Create teacher
        let teacher_user = app_users::ActiveModel::new(
            "kc-change-role-teacher".into(),
            "teacher-role@example.com".into(),
            "Teacher User".into(),
        );
        let teacher_user = teacher_user.insert(&ctx.db).await.unwrap();

        // Create school
        let school =
            schools::ActiveModel::new("Role Change School".into(), "role-change-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        // Create memberships
        let m1 = school_memberships::ActiveModel::new(admin_user.id, school.id, "admin".into());
        m1.insert(&ctx.db).await.unwrap();

        let m2 = school_memberships::ActiveModel::new(teacher_user.id, school.id, "teacher".into());
        m2.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-change-role-admin", "admin-role@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .put(&format!(
                "/api/schools/{}/members/{}",
                school.id, teacher_user.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "role": "viewer" }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["role"], "viewer");
        assert_eq!(body["email"], "teacher-role@example.com");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn remove_last_admin_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create sole admin
        let admin_user = app_users::ActiveModel::new(
            "kc-last-admin".into(),
            "last-admin@example.com".into(),
            "Admin User".into(),
        );
        let admin_user = admin_user.insert(&ctx.db).await.unwrap();

        // Create school
        let school =
            schools::ActiveModel::new("Last Admin School".into(), "last-admin-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        let m = school_memberships::ActiveModel::new(admin_user.id, school.id, "admin".into());
        m.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-last-admin", "last-admin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .delete(&format!(
                "/api/schools/{}/members/{}",
                school.id, admin_user.id
            ))
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
async fn remove_member_as_admin_succeeds() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create admin
        let admin_user = app_users::ActiveModel::new(
            "kc-remove-admin".into(),
            "admin-remove@example.com".into(),
            "Admin User".into(),
        );
        let admin_user = admin_user.insert(&ctx.db).await.unwrap();

        // Create teacher to remove
        let teacher_user = app_users::ActiveModel::new(
            "kc-remove-teacher".into(),
            "teacher-remove@example.com".into(),
            "Teacher User".into(),
        );
        let teacher_user = teacher_user.insert(&ctx.db).await.unwrap();

        // Create school
        let school = schools::ActiveModel::new("Remove School".into(), "remove-school".into());
        let school = school.insert(&ctx.db).await.unwrap();

        // Create memberships
        let m1 = school_memberships::ActiveModel::new(admin_user.id, school.id, "admin".into());
        m1.insert(&ctx.db).await.unwrap();

        let m2 = school_memberships::ActiveModel::new(teacher_user.id, school.id, "teacher".into());
        m2.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-remove-admin", "admin-remove@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .delete(&format!(
                "/api/schools/{}/members/{}",
                school.id, teacher_user.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Verify member is soft-deleted (inactive)
        let membership =
            school_memberships::Model::find_active_membership(&ctx.db, teacher_user.id, school.id)
                .await
                .unwrap();
        assert!(
            membership.is_none(),
            "membership should be inactive after removal"
        );
    })
    .await;
}
