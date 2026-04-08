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

// ========== Task 15: Error paths and tenant isolation ==========

#[tokio::test]
#[serial]
async fn preview_then_commit_creates_rows() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-commit-create").await;

        let csv = b"first_name,last_name,abbreviation\nJohn,Doe,JD3\nJane,Smith,JD4\n";

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv.to_vec())
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
        assert_eq!(body["summary"]["create"], 2, "expected 2 create rows");
        let token_val = body["token"].as_str().unwrap().to_string();

        // Commit
        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/commit",
                school.id
            ))
            .json(&serde_json::json!({ "token": token_val }));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        assert_eq!(
            resp.status_code(),
            StatusCode::NO_CONTENT,
            "commit should return 204"
        );

        // Verify rows exist in DB
        let count = teachers::Entity::find()
            .filter(teachers_entity::Column::SchoolId.eq(school.id))
            .filter(teachers_entity::Column::IsActive.eq(true))
            .all(&ctx.db)
            .await
            .unwrap()
            .len();
        assert_eq!(count, 2, "should have 2 teachers after commit");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn commit_with_invalid_token_returns_410() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-invalid-tok").await;

        let random_token = Uuid::new_v4();
        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/commit",
                school.id
            ))
            .json(&serde_json::json!({ "token": random_token }));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        assert_eq!(resp.status_code(), StatusCode::GONE);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn commit_refuses_when_preview_had_invalid_rows() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-invalid-rows").await;

        // One valid row, one missing last_name (invalid)
        let csv = b"first_name,last_name,abbreviation\nJohn,Doe,JD1\nJane,,JD2\n";

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv.to_vec())
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
        assert_eq!(body["summary"]["invalid"], 1, "should have 1 invalid row");
        let preview_token = body["token"].as_str().unwrap().to_string();

        // Commit should be rejected
        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/commit",
                school.id
            ))
            .json(&serde_json::json!({ "token": preview_token }));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        assert_eq!(resp.status_code(), StatusCode::UNPROCESSABLE_ENTITY);

        // No rows should be in DB
        let count = teachers::Entity::find()
            .filter(teachers_entity::Column::SchoolId.eq(school.id))
            .all(&ctx.db)
            .await
            .unwrap()
            .len();
        assert_eq!(count, 0, "no rows should have been inserted");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn preview_with_missing_required_column_returns_400() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-missing-col").await;

        // Missing 'abbreviation' column
        let csv = b"first_name,last_name\nJohn,Doe\n";

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv.to_vec())
                        .file_name("teachers.csv")
                        .mime_type("text/csv"),
                ),
            );
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        assert_eq!(resp.status_code(), StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn commit_token_for_other_school_returns_410() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school_a, token_a) = setup_admin(&ctx, &kp, "ie-tenant-a").await;
        let (school_b, token_b) = setup_admin(&ctx, &kp, "ie-tenant-b").await;

        let csv = b"first_name,last_name,abbreviation\nJohn,Doe,JD1\n";

        // Preview against school A
        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/preview",
                school_a.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv.to_vec())
                        .file_name("teachers.csv")
                        .mime_type("text/csv"),
                ),
            );
        for (k, v) in auth_headers(&token_a, school_a.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let body: serde_json::Value = resp.json();
        let preview_token = body["token"].as_str().unwrap().to_string();

        // Try to commit with school B's credentials
        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/commit",
                school_b.id
            ))
            .json(&serde_json::json!({ "token": preview_token }));
        for (k, v) in auth_headers(&token_b, school_b.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        assert_eq!(
            resp.status_code(),
            StatusCode::GONE,
            "cross-school commit should return 410"
        );

        // Verify school A's DB unchanged
        let count = teachers::Entity::find()
            .filter(teachers_entity::Column::SchoolId.eq(school_a.id))
            .all(&ctx.db)
            .await
            .unwrap()
            .len();
        assert_eq!(count, 0, "school A should have no teachers");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn commit_token_for_other_entity_returns_410() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-wrong-entity").await;

        let csv = b"first_name,last_name,abbreviation\nJohn,Doe,JD1\n";

        // Preview against teachers
        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv.to_vec())
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
        let preview_token = body["token"].as_str().unwrap().to_string();

        // Try to commit against rooms endpoint
        let mut req = server
            .post(&format!("/api/schools/{}/import/rooms/commit", school.id))
            .json(&serde_json::json!({ "token": preview_token }));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        assert_eq!(
            resp.status_code(),
            StatusCode::GONE,
            "wrong-entity commit should return 410"
        );
    })
    .await;
}

#[tokio::test]
#[serial]
async fn preview_as_non_admin_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_teacher_user(&ctx, &kp, "ie-non-admin").await;

        let csv = b"first_name,last_name,abbreviation\nJohn,Doe,JD1\n";

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv.to_vec())
                        .file_name("teachers.csv")
                        .mime_type("text/csv"),
                ),
            );
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        assert_eq!(resp.status_code(), StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn commit_atomicity_rollback_on_db_error() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-atomicity").await;

        // Seed an existing teacher with abbreviation JD1
        seed_teacher(&ctx, school.id, "JD1").await;

        // CSV with two new rows for the same abbreviation NEWDUP.
        // Preview will see both as Create (no existing entry in DB).
        // On commit, the first insert succeeds; the second violates the
        // unique index on (school_id, abbreviation) → DB error → rollback.
        let csv = b"first_name,last_name,abbreviation\nAlice,A,NEWDUP\nBob,B,NEWDUP\n";

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv.to_vec())
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
        assert_eq!(
            body["summary"]["create"], 2,
            "both NEWDUP rows should be Create"
        );
        let preview_token = body["token"].as_str().unwrap().to_string();

        // Commit — should fail with 422 due to unique constraint violation
        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/teachers/commit",
                school.id
            ))
            .json(&serde_json::json!({ "token": preview_token }));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        assert_eq!(
            resp.status_code(),
            StatusCode::UNPROCESSABLE_ENTITY,
            "commit should fail with 422 on DB constraint error"
        );

        // Verify atomicity: NEWDUP should NOT be in the DB (rollback happened)
        let newdup_rows = teachers::Entity::find()
            .filter(teachers_entity::Column::SchoolId.eq(school.id))
            .filter(teachers_entity::Column::Abbreviation.eq("NEWDUP"))
            .all(&ctx.db)
            .await
            .unwrap();
        assert_eq!(
            newdup_rows.len(),
            0,
            "NEWDUP should not exist after rollback"
        );

        // Original JD1 should still be there
        let jd1_rows = teachers::Entity::find()
            .filter(teachers_entity::Column::SchoolId.eq(school.id))
            .filter(teachers_entity::Column::Abbreviation.eq("JD1"))
            .all(&ctx.db)
            .await
            .unwrap();
        assert_eq!(jd1_rows.len(), 1, "original JD1 should still exist");
    })
    .await;
}

// ========== Task 16: Round-trip tests for all 5 remaining entities ==========

#[tokio::test]
#[serial]
async fn subjects_export_then_reimport_is_unchanged() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-sub-rt").await;
        seed_subject(&ctx, school.id, "Mathematics", "MATH").await;
        seed_subject(&ctx, school.id, "English", "ENG").await;

        let mut req = server.get(&format!("/api/schools/{}/export/subjects", school.id));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let csv_bytes = resp.as_bytes().to_vec();
        assert!(String::from_utf8_lossy(&csv_bytes).contains("MATH"));

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/subjects/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv_bytes)
                        .file_name("subjects.csv")
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

#[tokio::test]
#[serial]
async fn rooms_export_then_reimport_is_unchanged() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-room-rt").await;
        seed_room(&ctx, school.id, "Room 101").await;
        seed_room(&ctx, school.id, "Room 102").await;

        let mut req = server.get(&format!("/api/schools/{}/export/rooms", school.id));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let csv_bytes = resp.as_bytes().to_vec();
        assert!(String::from_utf8_lossy(&csv_bytes).contains("Room 101"));

        let mut req = server
            .post(&format!("/api/schools/{}/import/rooms/preview", school.id))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv_bytes)
                        .file_name("rooms.csv")
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

#[tokio::test]
#[serial]
async fn classes_export_then_reimport_is_unchanged() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-cls-rt").await;
        seed_class(&ctx, school.id, "10A", 10).await;
        seed_class(&ctx, school.id, "10B", 10).await;

        let mut req = server.get(&format!("/api/schools/{}/export/classes", school.id));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let csv_bytes = resp.as_bytes().to_vec();
        assert!(String::from_utf8_lossy(&csv_bytes).contains("10A"));

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/classes/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv_bytes)
                        .file_name("classes.csv")
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

#[tokio::test]
#[serial]
async fn timeslots_export_then_reimport_is_unchanged() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-ts-rt").await;
        seed_timeslot(&ctx, school.id, 1, 1).await;
        seed_timeslot(&ctx, school.id, 1, 2).await;

        let mut req = server.get(&format!("/api/schools/{}/export/timeslots", school.id));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let csv_bytes = resp.as_bytes().to_vec();
        assert!(String::from_utf8_lossy(&csv_bytes).contains("1"));

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/timeslots/preview",
                school.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv_bytes)
                        .file_name("timeslots.csv")
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

#[tokio::test]
#[serial]
async fn curriculum_export_then_reimport_is_unchanged() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        ctx.shared_store
            .get_ref::<AuthState>()
            .unwrap()
            .jwks
            .set_keys(kp.jwk_set.clone())
            .await;
        let (school, token) = setup_admin(&ctx, &kp, "ie-curr-rt").await;

        // Seed prerequisites
        let (_sy, term) = seed_term(&ctx, school.id).await;
        let class_a = seed_class(&ctx, school.id, "CurrA", 5).await;
        let class_b = seed_class(&ctx, school.id, "CurrB", 6).await;
        let subj_math = seed_subject(&ctx, school.id, "Mathematics", "CMATH").await;
        let subj_eng = seed_subject(&ctx, school.id, "English", "CENG").await;
        seed_curriculum_entry(&ctx, school.id, term.id, class_a.id, subj_math.id, 4).await;
        seed_curriculum_entry(&ctx, school.id, term.id, class_b.id, subj_eng.id, 3).await;

        let mut req = server.get(&format!(
            "/api/schools/{}/export/curriculum?term_id={}",
            school.id, term.id
        ));
        for (k, v) in auth_headers(&token, school.id) {
            req = req.add_header(k, v);
        }
        let resp = req.await;
        resp.assert_status(StatusCode::OK);
        let csv_bytes = resp.as_bytes().to_vec();
        assert!(String::from_utf8_lossy(&csv_bytes).contains("CurrA"));

        let mut req = server
            .post(&format!(
                "/api/schools/{}/import/curriculum/preview?term_id={}",
                school.id, term.id
            ))
            .multipart(
                axum_test::multipart::MultipartForm::new().add_part(
                    "file",
                    axum_test::multipart::Part::bytes(csv_bytes)
                        .file_name("curriculum.csv")
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
