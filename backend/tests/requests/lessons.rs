use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{
    app_users, lessons, school_classes, school_memberships, school_years, schools, subjects,
    teachers, terms, time_slots,
};
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

/// Helper: create a school with a member of the given role, return (school, token).
async fn setup_school_with_role(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
    role: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test User".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();

    let school =
        schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-school-slug"));
    let school = school.insert(&ctx.db).await.unwrap();

    let m = school_memberships::ActiveModel::new(user.id, school.id, role.into());
    m.insert(&ctx.db).await.unwrap();

    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

async fn setup_admin_school(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    setup_school_with_role(ctx, kp, prefix, "admin").await
}

/// Helper: create a school_year + term in `school`, returning the term.
async fn create_term(
    ctx: &loco_rs::app::AppContext,
    school_id: uuid::Uuid,
    sy_name: &str,
    term_name: &str,
) -> klassenzeit_backend::models::terms::Model {
    let sy = school_years::ActiveModel::new(
        school_id,
        sy_name.into(),
        chrono::NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
    );
    let sy = sy.insert(&ctx.db).await.unwrap();

    let term = terms::ActiveModel::new(
        sy.id,
        term_name.into(),
        chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
    );
    term.insert(&ctx.db).await.unwrap()
}

/// Helper: create the FK rows needed by a lesson and insert one lesson into `term`.
async fn create_lesson_in_term(
    ctx: &loco_rs::app::AppContext,
    school_id: uuid::Uuid,
    term_id: uuid::Uuid,
    discriminator: &str,
) -> klassenzeit_backend::models::lessons::Model {
    let class = school_classes::ActiveModel::new(school_id, format!("class-{discriminator}"), 5);
    let class = class.insert(&ctx.db).await.unwrap();

    let teacher = teachers::ActiveModel::new(
        school_id,
        format!("First-{discriminator}"),
        format!("Last-{discriminator}"),
        format!("T{discriminator}"),
    );
    let teacher = teacher.insert(&ctx.db).await.unwrap();

    let subject = subjects::ActiveModel::new(
        school_id,
        format!("Subject-{discriminator}"),
        format!("S{discriminator}"),
    );
    let subject = subject.insert(&ctx.db).await.unwrap();

    // (school, day_of_week, period) must be unique and period must be in [1, 10].
    // Derive a stable index from the discriminator so concurrent calls don't collide.
    let sum: i16 = discriminator
        .as_bytes()
        .iter()
        .map(|b| *b as i16)
        .sum::<i16>();
    let day_of_week = sum % 5; // 0..=4
    let period = (sum % 10) + 1; // 1..=10
    let timeslot = time_slots::ActiveModel::new(
        school_id,
        day_of_week,
        period,
        chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
        chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap(),
    );
    let timeslot = timeslot.insert(&ctx.db).await.unwrap();

    let lesson = lessons::ActiveModel::new(term_id, class.id, teacher.id, subject.id, timeslot.id);
    lesson.insert(&ctx.db).await.unwrap()
}

#[tokio::test]
#[serial]
async fn list_lessons_returns_empty_for_term_with_no_lessons() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "lessons-empty").await;
        let term = create_term(&ctx, school.id, "2025/2026", "Fall").await;

        let resp = server
            .get(&format!(
                "/api/schools/{}/terms/{}/lessons",
                school.id, term.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert!(body.is_array(), "expected array, got: {body}");
        assert_eq!(body.as_array().unwrap().len(), 0);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn list_lessons_returns_only_requested_term() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "lessons-filter").await;

        let term_a = create_term(&ctx, school.id, "2025/2026", "Term A").await;
        let term_b = create_term(&ctx, school.id, "2026/2027", "Term B").await;

        // Two lessons in term A, one in term B.
        let l_a1 = create_lesson_in_term(&ctx, school.id, term_a.id, "fa1").await;
        let l_a2 = create_lesson_in_term(&ctx, school.id, term_a.id, "fa2").await;
        let _l_b1 = create_lesson_in_term(&ctx, school.id, term_b.id, "fb9").await;

        let resp = server
            .get(&format!(
                "/api/schools/{}/terms/{}/lessons",
                school.id, term_a.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        let arr = body.as_array().expect("expected array");
        assert_eq!(arr.len(), 2, "expected 2 lessons in term A, got {arr:?}");

        let term_a_id_str = term_a.id.to_string();
        let mut returned_ids: Vec<String> = arr
            .iter()
            .map(|l| {
                assert_eq!(
                    l["term_id"], term_a_id_str,
                    "lesson should belong to term A"
                );
                l["id"].as_str().unwrap().to_string()
            })
            .collect();
        returned_ids.sort();
        let mut expected = vec![l_a1.id.to_string(), l_a2.id.to_string()];
        expected.sort();
        assert_eq!(returned_ids, expected);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn list_lessons_returns_404_for_term_in_other_school() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // School A: caller is admin.
        let (school_a, token) = setup_admin_school(&ctx, &kp, "lessons-tenant-a").await;

        // School B: a separate school with its own term.
        let school_b = schools::ActiveModel::new(
            "lessons-tenant-b-school".into(),
            "lessons-tenant-b-slug".into(),
        );
        let school_b = school_b.insert(&ctx.db).await.unwrap();
        let term_b = create_term(&ctx, school_b.id, "2025/2026", "B Term").await;

        // Caller authenticates as school A but requests school B's term.
        let resp = server
            .get(&format!(
                "/api/schools/{}/terms/{}/lessons",
                school_a.id, term_b.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school_a.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn list_lessons_requires_auth() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Set up a school + term so the URL is valid; we just omit the Authorization header.
        let (school, _token) = setup_admin_school(&ctx, &kp, "lessons-noauth").await;
        let term = create_term(&ctx, school.id, "2025/2026", "NoAuth Term").await;

        let resp = server
            .get(&format!(
                "/api/schools/{}/terms/{}/lessons",
                school.id, term.id
            ))
            .await;

        let status = resp.status_code();
        assert!(
            status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN,
            "expected 401 or 403, got {status}"
        );
    })
    .await;
}

#[tokio::test]
#[serial]
async fn list_lessons_allows_non_admin_member() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_school_with_role(&ctx, &kp, "lessons-teacher", "teacher").await;
        let term = create_term(&ctx, school.id, "2025/2026", "Teacher Term").await;
        let _lesson = create_lesson_in_term(&ctx, school.id, term.id, "tch").await;

        let resp = server
            .get(&format!(
                "/api/schools/{}/terms/{}/lessons",
                school.id, term.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        let arr = body.as_array().expect("expected array");
        assert_eq!(arr.len(), 1);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn list_lessons_with_violations_returns_wrapped_object() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "lessons-violations").await;
        let term = create_term(&ctx, school.id, "2025/2026", "Fall").await;
        let _lesson = create_lesson_in_term(&ctx, school.id, term.id, "lv1").await;

        let resp = server
            .get(&format!(
                "/api/schools/{}/terms/{}/lessons?include_violations=true",
                school.id, term.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert!(body.is_object(), "expected object, got: {body}");
        assert!(body.get("lessons").is_some(), "missing lessons key");
        assert!(body.get("violations").is_some(), "missing violations key");
        assert!(body["lessons"].is_array());
        assert!(body["violations"].is_array());
        assert_eq!(body["lessons"].as_array().unwrap().len(), 1);
    })
    .await;
}
