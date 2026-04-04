use axum::http::{header, HeaderName, StatusCode};
use chrono::NaiveDate;
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{
    app_users, curriculum_entries, school_classes, school_memberships, school_years, schools,
    subjects, teacher_subject_qualifications, teachers, terms, time_slots,
};
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, EntityTrait};
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

/// Helper: create school + admin user + token
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

/// Helper: create school + teacher (non-admin) user + token
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

/// Helper: create minimal schedulable data for a school (term, teacher, class, subject, timeslot, curriculum entry)
/// Returns (term_id, teacher_id, class_id, subject_id, timeslot_id)
async fn setup_schedule_data(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
) -> (Uuid, Uuid, Uuid, Uuid, Uuid) {
    let school_year = school_years::ActiveModel::new(
        school_id,
        "2025/26".into(),
        NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
    );
    let school_year = school_year.insert(&ctx.db).await.unwrap();

    let term = terms::ActiveModel::new(
        school_year.id,
        "Semester 1".into(),
        NaiveDate::from_ymd_opt(2025, 8, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
    );
    let term = term.insert(&ctx.db).await.unwrap();

    let teacher =
        teachers::ActiveModel::new(school_id, "Anna".into(), "Schmidt".into(), "AS".into());
    let teacher = teacher.insert(&ctx.db).await.unwrap();

    let class = school_classes::ActiveModel::new(school_id, "1a".into(), 1);
    let class = class.insert(&ctx.db).await.unwrap();

    let subject = subjects::ActiveModel::new(school_id, "Math".into(), "MA".into());
    let subject = subject.insert(&ctx.db).await.unwrap();

    // Teacher is qualified for subject
    let qual =
        teacher_subject_qualifications::ActiveModel::new(teacher.id, subject.id, "primary".into());
    qual.insert(&ctx.db).await.unwrap();

    // One timeslot (Monday period 1)
    let ts = time_slots::ActiveModel::new(
        school_id,
        1,
        1,
        chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
        chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap(),
    );
    let ts = ts.insert(&ctx.db).await.unwrap();

    // Curriculum: 1 hour of math per week for class 1a
    let ce = curriculum_entries::ActiveModel::new(
        school_id,
        term.id,
        class.id,
        subject.id,
        Some(teacher.id),
        1,
    );
    ce.insert(&ctx.db).await.unwrap();

    (term.id, teacher.id, class.id, subject.id, ts.id)
}

fn scheduler_url(school_id: Uuid, term_id: Uuid, endpoint: &str) -> String {
    format!("/api/schools/{school_id}/terms/{term_id}/scheduler/{endpoint}")
}

fn auth_headers(token: &str, school_id: Uuid) -> Vec<(HeaderName, String)> {
    vec![
        (header::AUTHORIZATION, format!("Bearer {token}")),
        (
            HeaderName::from_static("x-school-id"),
            school_id.to_string(),
        ),
    ]
}

// ─── Solve Endpoint ──────────────────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn trigger_solve_as_admin_returns_202() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-solve").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        let url = scheduler_url(school.id, term_id, "solve");
        let resp = server
            .post(&url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::ACCEPTED);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn trigger_solve_as_teacher_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "sched-solve-teacher").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        let url = scheduler_url(school.id, term_id, "solve");
        let resp = server
            .post(&url)
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

// ─── Status Endpoint ─────────────────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn get_status_before_solve_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-status-404").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        let url = scheduler_url(school.id, term_id, "status");
        let resp = server
            .get(&url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn get_status_after_solve_returns_solved() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-status-ok").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        // Trigger solve (runs synchronously in ForegroundBlocking mode)
        let solve_url = scheduler_url(school.id, term_id, "solve");
        server
            .post(&solve_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        // Check status
        let status_url = scheduler_url(school.id, term_id, "status");
        let resp = server
            .get(&status_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["status"], "solved");
        assert_eq!(body["hard_violations"], 0);
    })
    .await;
}

// ─── Solution Endpoint ───────────────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn get_solution_before_solve_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-sol-404").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        let url = scheduler_url(school.id, term_id, "solution");
        let resp = server
            .get(&url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn get_solution_after_solve_returns_timetable() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-sol-ok").await;
        let (term_id, teacher_id, class_id, subject_id, timeslot_id) =
            setup_schedule_data(&ctx, school.id).await;

        // Trigger solve
        let solve_url = scheduler_url(school.id, term_id, "solve");
        server
            .post(&solve_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        // Get solution
        let url = scheduler_url(school.id, term_id, "solution");
        let resp = server
            .get(&url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();

        let timetable = body["timetable"]
            .as_array()
            .expect("timetable should be an array");
        assert_eq!(timetable.len(), 1, "should have 1 lesson");

        let lesson = &timetable[0];
        assert_eq!(lesson["teacher_id"], teacher_id.to_string());
        assert_eq!(lesson["class_id"], class_id.to_string());
        assert_eq!(lesson["subject_id"], subject_id.to_string());
        assert_eq!(lesson["timeslot_id"], timeslot_id.to_string());
    })
    .await;
}

// ─── Apply Endpoint ──────────────────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn apply_solution_creates_lessons_in_db() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-apply").await;
        let (term_id, teacher_id, class_id, subject_id, timeslot_id) =
            setup_schedule_data(&ctx, school.id).await;

        // Trigger solve
        let solve_url = scheduler_url(school.id, term_id, "solve");
        server
            .post(&solve_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        // Apply solution
        let apply_url = scheduler_url(school.id, term_id, "apply");
        let resp = server
            .post(&apply_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["lessons_created"], 1);

        // Verify lesson in DB
        use klassenzeit_backend::models::_entities::lessons;
        use sea_orm::ColumnTrait;
        use sea_orm::QueryFilter;
        let db_lessons = lessons::Entity::find()
            .filter(lessons::Column::TermId.eq(term_id))
            .all(&ctx.db)
            .await
            .unwrap();
        assert_eq!(db_lessons.len(), 1);
        assert_eq!(db_lessons[0].teacher_id, teacher_id);
        assert_eq!(db_lessons[0].school_class_id, class_id);
        assert_eq!(db_lessons[0].subject_id, subject_id);
        assert_eq!(db_lessons[0].timeslot_id, timeslot_id);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn apply_solution_as_teacher_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "sched-apply-teacher").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        let url = scheduler_url(school.id, term_id, "apply");
        let resp = server
            .post(&url)
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
async fn apply_without_solved_solution_returns_400() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-apply-nosol").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        let url = scheduler_url(school.id, term_id, "apply");
        let resp = server
            .post(&url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::BAD_REQUEST);
    })
    .await;
}

// ─── Discard Endpoint ────────────────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn discard_solution_clears_state() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-discard").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        // Trigger solve
        let solve_url = scheduler_url(school.id, term_id, "solve");
        server
            .post(&solve_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        // Verify solution exists
        let solution_url = scheduler_url(school.id, term_id, "solution");
        let resp = server
            .get(&solution_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        resp.assert_status_ok();

        // Discard
        let resp = server
            .delete(&solution_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        resp.assert_status(StatusCode::NO_CONTENT);

        // Solution should now be gone
        let resp = server
            .get(&solution_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        resp.assert_status(StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn discard_as_teacher_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "sched-discard-teacher").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        let url = scheduler_url(school.id, term_id, "solution");
        let resp = server
            .delete(&url)
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

// ─── Apply Replaces Existing Lessons ─────────────────────────────────────────

#[tokio::test]
#[serial]
async fn apply_replaces_existing_lessons() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "sched-replace").await;
        let (term_id, ..) = setup_schedule_data(&ctx, school.id).await;

        // Solve and apply first time
        let solve_url = scheduler_url(school.id, term_id, "solve");
        server
            .post(&solve_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        let apply_url = scheduler_url(school.id, term_id, "apply");
        server
            .post(&apply_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        // Solve and apply second time
        server
            .post(&solve_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        let resp = server
            .post(&apply_url)
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["lessons_created"], 1);

        // Should still only have 1 lesson (old ones deleted)
        use klassenzeit_backend::models::_entities::lessons;
        use sea_orm::ColumnTrait;
        use sea_orm::QueryFilter;
        let db_lessons = lessons::Entity::find()
            .filter(lessons::Column::TermId.eq(term_id))
            .all(&ctx.db)
            .await
            .unwrap();
        assert_eq!(
            db_lessons.len(),
            1,
            "old lessons should be replaced, not duplicated"
        );
    })
    .await;
}
