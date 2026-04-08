use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::_entities::teachers as teachers_entity;
use klassenzeit_backend::models::{
    app_users, curriculum_entries, rooms, school_classes, school_memberships, school_years,
    schools, subjects, teachers, terms, time_slots,
};
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
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

async fn setup_admin(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Admin".into(),
    )
    .insert(&ctx.db)
    .await
    .unwrap();
    let school =
        schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-school-slug"))
            .insert(&ctx.db)
            .await
            .unwrap();
    school_memberships::ActiveModel::new(user.id, school.id, "admin".into())
        .insert(&ctx.db)
        .await
        .unwrap();
    let token = kp.create_token(&valid_claims(
        &format!("kc-{prefix}"),
        &format!("{prefix}@example.com"),
    ));
    (school, token)
}

async fn setup_teacher_user(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Teacher".into(),
    )
    .insert(&ctx.db)
    .await
    .unwrap();
    let school =
        schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-school-slug"))
            .insert(&ctx.db)
            .await
            .unwrap();
    school_memberships::ActiveModel::new(user.id, school.id, "teacher".into())
        .insert(&ctx.db)
        .await
        .unwrap();
    let token = kp.create_token(&valid_claims(
        &format!("kc-{prefix}"),
        &format!("{prefix}@example.com"),
    ));
    (school, token)
}

fn auth_headers(token: &str, school: Uuid) -> Vec<(HeaderName, String)> {
    vec![
        (header::AUTHORIZATION, format!("Bearer {token}")),
        (HeaderName::from_static("x-school-id"), school.to_string()),
    ]
}

async fn seed_teacher(ctx: &loco_rs::app::AppContext, school_id: Uuid, abbr: &str) {
    let now = chrono::Utc::now().into();
    teachers::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        first_name: Set("Jane".into()),
        last_name: Set("Doe".into()),
        abbreviation: Set(abbr.into()),
        email: Set(Some(format!("{abbr}@example.com"))),
        max_hours_per_week: Set(28),
        is_part_time: Set(false),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap();
}

async fn seed_subject(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    name: &str,
    abbr: &str,
) -> subjects::Model {
    subjects::ActiveModel::new(school_id, name.into(), abbr.into())
        .insert(&ctx.db)
        .await
        .unwrap()
}

async fn seed_room(ctx: &loco_rs::app::AppContext, school_id: Uuid, name: &str) -> rooms::Model {
    rooms::ActiveModel::new(school_id, name.into())
        .insert(&ctx.db)
        .await
        .unwrap()
}

async fn seed_class(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    name: &str,
    grade: i16,
) -> school_classes::Model {
    school_classes::ActiveModel::new(school_id, name.into(), grade)
        .insert(&ctx.db)
        .await
        .unwrap()
}

async fn seed_timeslot(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    day: i16,
    period: i16,
) -> time_slots::Model {
    let start = chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap();
    let end = chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap();
    time_slots::ActiveModel::new(school_id, day, period, start, end)
        .insert(&ctx.db)
        .await
        .unwrap()
}

async fn seed_term(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
) -> (school_years::Model, terms::Model) {
    use chrono::NaiveDate;
    let sy = school_years::ActiveModel::new(
        school_id,
        "2025/26".into(),
        NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
    )
    .insert(&ctx.db)
    .await
    .unwrap();

    let term = terms::ActiveModel::new(
        sy.id,
        "Term 1".into(),
        NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
    )
    .insert(&ctx.db)
    .await
    .unwrap();

    (sy, term)
}

async fn seed_curriculum_entry(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    term_id: Uuid,
    class_id: Uuid,
    subject_id: Uuid,
    hours: i32,
) -> curriculum_entries::Model {
    curriculum_entries::ActiveModel::new(school_id, term_id, class_id, subject_id, None, hours)
        .insert(&ctx.db)
        .await
        .unwrap()
}

// ========== Task 14: Happy-path round-trip for teachers ==========

#[tokio::test]
#[serial]
async fn teachers_export_then_reimport_is_unchanged() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-tea-rt").await;
        seed_teacher(&ctx, school.id, "JD1").await;
        seed_teacher(&ctx, school.id, "JD2").await;

        let mut req = server.get(&format!("/api/schools/{}/export/teachers", school.id));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let csv_bytes = resp.as_bytes().to_vec();
        assert!(String::from_utf8_lossy(&csv_bytes).contains("JD1"));

        // Re-import the exact bytes via preview.
        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv_bytes.clone())
                        .file_name("teachers.csv")
                        .mime_type("text/csv"),
                ),
            );
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["summary"]["create"], 0);
        assert_eq!(body["summary"]["update"], 0);
        assert_eq!(body["summary"]["unchanged"], 2);
        assert_eq!(body["summary"]["invalid"], 0);
    })
    .await;
}
