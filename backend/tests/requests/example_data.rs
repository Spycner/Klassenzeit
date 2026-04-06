use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::_entities::{
    curriculum_entries, school_classes, subjects, teachers, terms, time_slots,
};
use klassenzeit_backend::models::{app_users, school_memberships, schools};
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, Set};
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

fn url(school_id: uuid::Uuid) -> String {
    format!("/api/schools/{school_id}/load-example")
}

#[tokio::test]
#[serial]
async fn admin_loads_example_into_empty_school_returns_204() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ld-empty").await;

        let terms_before = terms::Entity::find().count(&ctx.db).await.unwrap();

        let resp = server
            .post(&url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        let terms_after = terms::Entity::find().count(&ctx.db).await.unwrap();
        assert!(terms_after > terms_before);
        assert!(
            teachers::Entity::find()
                .filter(teachers::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
        assert!(
            subjects::Entity::find()
                .filter(subjects::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
        assert!(
            school_classes::Entity::find()
                .filter(school_classes::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
        assert!(
            time_slots::Entity::find()
                .filter(time_slots::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
        assert!(
            curriculum_entries::Entity::find()
                .filter(curriculum_entries::Column::SchoolId.eq(school.id))
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
    })
    .await;
}

#[tokio::test]
#[serial]
async fn non_admin_returns_forbidden() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "ld-teacher").await;

        let resp = server
            .post(&url(school.id))
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
async fn second_load_returns_conflict() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ld-twice").await;

        let r1 = server
            .post(&url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        r1.assert_status(StatusCode::NO_CONTENT);

        let r2 = server
            .post(&url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        r2.assert_status(StatusCode::CONFLICT);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn pre_existing_teacher_blocks_load() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ld-pre-teacher").await;

        let now = chrono::Utc::now();
        teachers::ActiveModel {
            id: Set(uuid::Uuid::new_v4()),
            school_id: Set(school.id),
            first_name: Set("Pre".into()),
            last_name: Set("Existing".into()),
            email: Set(None),
            abbreviation: Set("PRE".into()),
            max_hours_per_week: Set(28),
            is_part_time: Set(false),
            is_active: Set(true),
            created_at: Set(now.into()),
            updated_at: Set(now.into()),
        }
        .insert(&ctx.db)
        .await
        .unwrap();

        let resp = server
            .post(&url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::CONFLICT);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn admin_of_other_school_cannot_load() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (_school_a, token_a) = setup_admin_school(&ctx, &kp, "ld-tenant-a").await;
        let school_b =
            schools::ActiveModel::new("ld-tenant-b-school".into(), "ld-tenant-b-slug".into());
        let school_b = school_b.insert(&ctx.db).await.unwrap();

        let resp = server
            .post(&url(school_b.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token_a}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school_b.id.to_string(),
            )
            .await;

        assert_ne!(resp.status_code(), StatusCode::NO_CONTENT);
        assert!(
            resp.status_code() == StatusCode::FORBIDDEN
                || resp.status_code() == StatusCode::NOT_FOUND
        );
    })
    .await;
}
