# Reference Data CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add create, update, and delete endpoints for all 6 reference data entities (subjects, teachers, rooms, classes, timeslots, terms) so schools can be fully managed via the API.

**Architecture:** Expand each existing controller file with create/update/delete handlers following the curriculum controller pattern. Soft delete (set `is_active = false`) for entities that have the column (teachers, rooms, classes); hard delete for entities without it (subjects, timeslots, terms). All write endpoints require admin role.

**Note:** `subjects` and `time_slots` do NOT have an `is_active` column in the DB or entity model. Only `teachers`, `rooms`, and `school_classes` have `is_active`.

**Tech Stack:** Rust, Loco/Axum, SeaORM, PostgreSQL

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `backend/src/controllers/subjects.rs` | Add create, update, delete handlers |
| Modify | `backend/src/controllers/teachers.rs` | Add create, update, delete handlers |
| Modify | `backend/src/controllers/rooms.rs` | Add create, update, delete handlers |
| Modify | `backend/src/controllers/classes.rs` | Add create, update, delete handlers |
| Modify | `backend/src/controllers/time_slots.rs` | Add create, update, delete handlers |
| Modify | `backend/src/controllers/terms.rs` | Add create, update, delete handlers |
| Create | `backend/tests/requests/subjects.rs` | Integration tests for subjects CRUD |
| Create | `backend/tests/requests/teachers.rs` | Integration tests for teachers CRUD |
| Create | `backend/tests/requests/rooms.rs` | Integration tests for rooms CRUD |
| Create | `backend/tests/requests/classes.rs` | Integration tests for classes CRUD |
| Create | `backend/tests/requests/time_slots.rs` | Integration tests for timeslots CRUD |
| Create | `backend/tests/requests/terms.rs` | Integration tests for terms CRUD |
| Modify | `backend/tests/requests/mod.rs` | Register new test modules |

---

## Task 1: Subjects CRUD

**Files:**
- Modify: `backend/src/controllers/subjects.rs`
- Create: `backend/tests/requests/subjects.rs`
- Modify: `backend/tests/requests/mod.rs`

### Step 1.1: Register test module

Add `mod subjects;` to `backend/tests/requests/mod.rs`.

### Step 1.2: Write failing test — create subject

Create `backend/tests/requests/subjects.rs`:

```rust
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

/// Helper: create a school with an admin user, return (school, token)
async fn setup_admin_school(
    ctx: &loco_rs::testing::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Admin".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();

    let school = schools::ActiveModel::new(
        format!("{prefix}-school"),
        format!("{prefix}-school-slug"),
    );
    let school = school.insert(&ctx.db).await.unwrap();

    let m = school_memberships::ActiveModel::new(user.id, school.id, "admin".into());
    m.insert(&ctx.db).await.unwrap();

    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

#[tokio::test]
#[serial]
async fn create_subject_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "subj-create").await;

        let resp = server
            .post(&format!("/api/schools/{}/subjects", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "name": "Mathematics",
                "abbreviation": "MAT",
                "color": "#ff0000",
                "needs_special_room": false
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Mathematics");
        assert_eq!(body["abbreviation"], "MAT");
        assert_eq!(body["color"], "#ff0000");
        assert_eq!(body["needs_special_room"], false);
        assert!(body["id"].as_str().is_some());
    })
    .await;
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::subjects::create_subject_as_admin_returns_201 -- --nocapture`
- [ ] Expected: FAIL — no `create` route registered

### Step 1.3: Write failing test — create subject as non-admin returns 403

Add to `backend/tests/requests/subjects.rs`:

```rust
/// Helper: create a school with a teacher user, return (school, token)
async fn setup_teacher_school(
    ctx: &loco_rs::testing::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Teacher".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();

    let school = schools::ActiveModel::new(
        format!("{prefix}-school"),
        format!("{prefix}-school-slug"),
    );
    let school = school.insert(&ctx.db).await.unwrap();

    let m = school_memberships::ActiveModel::new(user.id, school.id, "teacher".into());
    m.insert(&ctx.db).await.unwrap();

    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

#[tokio::test]
#[serial]
async fn create_subject_as_teacher_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "subj-create-teacher").await;

        let resp = server
            .post(&format!("/api/schools/{}/subjects", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "name": "Physics",
                "abbreviation": "PHY"
            }))
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}
```

### Step 1.4: Write failing tests — update and delete

Add to `backend/tests/requests/subjects.rs`:

```rust
use klassenzeit_backend::models::subjects;

#[tokio::test]
#[serial]
async fn update_subject_as_admin_returns_200() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "subj-update").await;

        // Create subject in DB
        let subject = subjects::ActiveModel::new(school.id, "Old Name".into(), "OLD".into());
        let subject = subject.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!("/api/schools/{}/subjects/{}", school.id, subject.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "name": "New Name",
                "abbreviation": "NEW"
            }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "New Name");
        assert_eq!(body["abbreviation"], "NEW");
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_subject_not_found_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "subj-update-404").await;

        let fake_id = uuid::Uuid::new_v4();
        let resp = server
            .put(&format!("/api/schools/{}/subjects/{}", school.id, fake_id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "name": "Nope" }))
            .await;

        resp.assert_status(StatusCode::NOT_FOUND);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_subject_as_admin_hard_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "subj-delete").await;

        let subject = subjects::ActiveModel::new(school.id, "To Delete".into(), "DEL".into());
        let subject = subject.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/subjects/{}", school.id, subject.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Verify hard-deleted from DB
        use sea_orm::EntityTrait;
        let deleted = subjects::Entity::find_by_id(subject.id)
            .one(&ctx.db)
            .await
            .unwrap();
        assert!(deleted.is_none(), "subject should be hard-deleted");
    })
    .await;
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::subjects -- --nocapture`
- [ ] Expected: FAIL — no create/update/delete routes

### Step 1.5: Implement subjects controller CRUD

Replace entire `backend/src/controllers/subjects.rs` with:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::subjects;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    name: String,
    abbreviation: String,
    color: Option<String>,
    needs_special_room: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    abbreviation: Option<String>,
    color: Option<String>,
    needs_special_room: Option<bool>,
}

#[derive(Debug, Serialize)]
struct SubjectResponse {
    id: String,
    name: String,
    abbreviation: String,
    color: Option<String>,
    needs_special_room: bool,
}

impl SubjectResponse {
    fn from_model(m: &subjects::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            abbreviation: m.abbreviation.clone(),
            color: m.color.clone(),
            needs_special_room: m.needs_special_room,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = subjects::Entity::find()
        .filter(subjects::Column::SchoolId.eq(school_ctx.school.id))
        .all(&ctx.db)
        .await?;

    let resp: Vec<SubjectResponse> = items.iter().map(SubjectResponse::from_model).collect();
    format::json(resp)
}

async fn create(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;
    let now = chrono::Utc::now().into();

    let entry = subjects::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(body.name),
        abbreviation: Set(body.abbreviation),
        color: Set(body.color),
        needs_special_room: Set(body.needs_special_room.unwrap_or(false)),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = SubjectResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_subjects_school_abbreviation") || msg.contains("duplicate key") {
                (StatusCode::CONFLICT, "abbreviation already exists for this school".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(subject_id): Path<Uuid>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match subjects::Entity::find_by_id(subject_id)
        .filter(subjects::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "subject not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: subjects::ActiveModel = existing.into();

    if let Some(name) = body.name {
        active.name = Set(name);
    }
    if let Some(abbreviation) = body.abbreviation {
        active.abbreviation = Set(abbreviation);
    }
    if let Some(color) = body.color {
        active.color = Set(Some(color));
    }
    if let Some(needs_special_room) = body.needs_special_room {
        active.needs_special_room = Set(needs_special_room);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = SubjectResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_subjects_school_abbreviation") || msg.contains("duplicate key") {
                (StatusCode::CONFLICT, "abbreviation already exists for this school".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(subject_id): Path<Uuid>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    match subjects::Entity::find_by_id(subject_id)
        .filter(subjects::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "subject not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    match subjects::Entity::delete_by_id(subject_id)
        .exec(&ctx.db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("foreign key") || msg.contains("violates") {
                (StatusCode::CONFLICT, "cannot delete subject: it is referenced by other records".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/subjects")
        .add("/", get(list).post(create))
        .add("/{subject_id}", put(update).delete(delete))
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::subjects -- --nocapture`
- [ ] Expected: All tests PASS

### Step 1.6: Commit

```bash
git add backend/src/controllers/subjects.rs backend/tests/requests/subjects.rs backend/tests/requests/mod.rs
git commit -m "feat: add subjects CRUD endpoints with hard delete"
```

---

## Task 2: Teachers CRUD

**Files:**
- Modify: `backend/src/controllers/teachers.rs`
- Create: `backend/tests/requests/teachers.rs`
- Modify: `backend/tests/requests/mod.rs`

### Step 2.1: Register test module

Add `mod teachers;` to `backend/tests/requests/mod.rs` (if not already added).

### Step 2.2: Write tests

Create `backend/tests/requests/teachers.rs`:

```rust
use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, schools, teachers};
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
    ctx: &loco_rs::testing::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Admin".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();

    let school = schools::ActiveModel::new(
        format!("{prefix}-school"),
        format!("{prefix}-school-slug"),
    );
    let school = school.insert(&ctx.db).await.unwrap();

    let m = school_memberships::ActiveModel::new(user.id, school.id, "admin".into());
    m.insert(&ctx.db).await.unwrap();

    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

#[tokio::test]
#[serial]
async fn create_teacher_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "teacher-create").await;

        let resp = server
            .post(&format!("/api/schools/{}/teachers", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "first_name": "Jane",
                "last_name": "Doe",
                "abbreviation": "DOE",
                "email": "jane.doe@school.com",
                "max_hours_per_week": 24,
                "is_part_time": true
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["first_name"], "Jane");
        assert_eq!(body["last_name"], "Doe");
        assert_eq!(body["abbreviation"], "DOE");
        assert_eq!(body["email"], "jane.doe@school.com");
        assert_eq!(body["max_hours_per_week"], 24);
        assert_eq!(body["is_part_time"], true);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn create_teacher_as_non_admin_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let user = app_users::ActiveModel::new(
            "kc-teacher-create-nonadmin".into(),
            "teacher-nonadmin@example.com".into(),
            "Teacher User".into(),
        );
        let user = user.insert(&ctx.db).await.unwrap();
        let school = schools::ActiveModel::new("T-NA School".into(), "t-na-school".into());
        let school = school.insert(&ctx.db).await.unwrap();
        let m = school_memberships::ActiveModel::new(user.id, school.id, "teacher".into());
        m.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-teacher-create-nonadmin", "teacher-nonadmin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .post(&format!("/api/schools/{}/teachers", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "first_name": "X",
                "last_name": "Y",
                "abbreviation": "XY"
            }))
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_teacher_partial_fields() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "teacher-update").await;

        let teacher = teachers::ActiveModel::new(school.id, "Old".into(), "Name".into(), "OLD".into());
        let teacher = teacher.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!("/api/schools/{}/teachers/{}", school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "first_name": "Updated" }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["first_name"], "Updated");
        assert_eq!(body["last_name"], "Name"); // unchanged
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_teacher_soft_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "teacher-delete").await;

        let teacher = teachers::ActiveModel::new(school.id, "Del".into(), "Teacher".into(), "DLT".into());
        let teacher = teacher.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/teachers/{}", school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        use sea_orm::EntityTrait;
        let deleted = teachers::Entity::find_by_id(teacher.id)
            .one(&ctx.db).await.unwrap().unwrap();
        assert!(!deleted.is_active);
    })
    .await;
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::teachers -- --nocapture`
- [ ] Expected: FAIL — no create/update/delete routes

### Step 2.3: Implement teachers controller CRUD

Replace entire `backend/src/controllers/teachers.rs` with:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::teachers;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    first_name: String,
    last_name: String,
    email: Option<String>,
    abbreviation: String,
    max_hours_per_week: Option<i32>,
    is_part_time: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    first_name: Option<String>,
    last_name: Option<String>,
    email: Option<String>,
    abbreviation: Option<String>,
    max_hours_per_week: Option<i32>,
    is_part_time: Option<bool>,
}

#[derive(Debug, Serialize)]
struct TeacherResponse {
    id: String,
    first_name: String,
    last_name: String,
    email: Option<String>,
    abbreviation: String,
    max_hours_per_week: i32,
    is_part_time: bool,
    is_active: bool,
}

impl TeacherResponse {
    fn from_model(m: &teachers::Model) -> Self {
        Self {
            id: m.id.to_string(),
            first_name: m.first_name.clone(),
            last_name: m.last_name.clone(),
            email: m.email.clone(),
            abbreviation: m.abbreviation.clone(),
            max_hours_per_week: m.max_hours_per_week,
            is_part_time: m.is_part_time,
            is_active: m.is_active,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = teachers::Entity::find()
        .filter(teachers::Column::SchoolId.eq(school_ctx.school.id))
        .filter(teachers::Column::IsActive.eq(true))
        .all(&ctx.db)
        .await?;

    let resp: Vec<TeacherResponse> = items.iter().map(TeacherResponse::from_model).collect();
    format::json(resp)
}

async fn create(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;
    let now = chrono::Utc::now().into();

    let entry = teachers::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        first_name: Set(body.first_name),
        last_name: Set(body.last_name),
        email: Set(body.email),
        abbreviation: Set(body.abbreviation),
        max_hours_per_week: Set(body.max_hours_per_week.unwrap_or(28)),
        is_part_time: Set(body.is_part_time.unwrap_or(false)),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = TeacherResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_teachers_school_abbreviation") || msg.contains("duplicate key") {
                (StatusCode::CONFLICT, "abbreviation already exists for this school".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(teacher_id): Path<Uuid>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match teachers::Entity::find_by_id(teacher_id)
        .filter(teachers::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "teacher not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: teachers::ActiveModel = existing.into();

    if let Some(first_name) = body.first_name {
        active.first_name = Set(first_name);
    }
    if let Some(last_name) = body.last_name {
        active.last_name = Set(last_name);
    }
    if let Some(email) = body.email {
        active.email = Set(Some(email));
    }
    if let Some(abbreviation) = body.abbreviation {
        active.abbreviation = Set(abbreviation);
    }
    if let Some(max_hours_per_week) = body.max_hours_per_week {
        active.max_hours_per_week = Set(max_hours_per_week);
    }
    if let Some(is_part_time) = body.is_part_time {
        active.is_part_time = Set(is_part_time);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = TeacherResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_teachers_school_abbreviation") || msg.contains("duplicate key") {
                (StatusCode::CONFLICT, "abbreviation already exists for this school".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(teacher_id): Path<Uuid>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match teachers::Entity::find_by_id(teacher_id)
        .filter(teachers::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "teacher not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: teachers::ActiveModel = existing.into();
    active.is_active = Set(false);
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/teachers")
        .add("/", get(list).post(create))
        .add("/{teacher_id}", put(update).delete(delete))
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::teachers -- --nocapture`
- [ ] Expected: All tests PASS

### Step 2.4: Commit

```bash
git add backend/src/controllers/teachers.rs backend/tests/requests/teachers.rs backend/tests/requests/mod.rs
git commit -m "feat: add teachers CRUD endpoints with soft delete"
```

---

## Task 3: Rooms CRUD

**Files:**
- Modify: `backend/src/controllers/rooms.rs`
- Create: `backend/tests/requests/rooms.rs`
- Modify: `backend/tests/requests/mod.rs`

### Step 3.1: Register test module

Add `mod rooms;` to `backend/tests/requests/mod.rs` (if not already added).

### Step 3.2: Write tests

Create `backend/tests/requests/rooms.rs`:

```rust
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
    ctx: &loco_rs::testing::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Admin".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();
    let school = schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-slug"));
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
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "name": "Room 101",
                "building": "Main",
                "capacity": 30
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Room 101");
        assert_eq!(body["building"], "Main");
        assert_eq!(body["capacity"], 30);
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

        let room = rooms::ActiveModel::new(school.id, "Old Room".into());
        let room = room.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!("/api/schools/{}/rooms/{}", school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "name": "New Room", "capacity": 25 }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "New Room");
        assert_eq!(body["capacity"], 25);
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

        let room = rooms::ActiveModel::new(school.id, "Delete Me".into());
        let room = room.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/rooms/{}", school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        use sea_orm::EntityTrait;
        let deleted = rooms::Entity::find_by_id(room.id)
            .one(&ctx.db).await.unwrap().unwrap();
        assert!(!deleted.is_active);
    })
    .await;
}
```

### Step 3.3: Implement rooms controller CRUD

Replace entire `backend/src/controllers/rooms.rs` with:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::rooms;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    name: String,
    building: Option<String>,
    capacity: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    building: Option<String>,
    capacity: Option<i32>,
}

#[derive(Debug, Serialize)]
struct RoomResponse {
    id: String,
    name: String,
    building: Option<String>,
    capacity: Option<i32>,
    is_active: bool,
}

impl RoomResponse {
    fn from_model(m: &rooms::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            building: m.building.clone(),
            capacity: m.capacity,
            is_active: m.is_active,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = rooms::Entity::find()
        .filter(rooms::Column::SchoolId.eq(school_ctx.school.id))
        .filter(rooms::Column::IsActive.eq(true))
        .all(&ctx.db)
        .await?;

    let resp: Vec<RoomResponse> = items.iter().map(RoomResponse::from_model).collect();
    format::json(resp)
}

async fn create(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;
    let now = chrono::Utc::now().into();

    let entry = rooms::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(body.name),
        building: Set(body.building),
        capacity: Set(body.capacity),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = RoomResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_rooms_school_name") || msg.contains("duplicate key") {
                (StatusCode::CONFLICT, "room name already exists for this school".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(room_id): Path<Uuid>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "room not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: rooms::ActiveModel = existing.into();

    if let Some(name) = body.name {
        active.name = Set(name);
    }
    if let Some(building) = body.building {
        active.building = Set(Some(building));
    }
    if let Some(capacity) = body.capacity {
        active.capacity = Set(Some(capacity));
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = RoomResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_rooms_school_name") || msg.contains("duplicate key") {
                (StatusCode::CONFLICT, "room name already exists for this school".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(room_id): Path<Uuid>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "room not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: rooms::ActiveModel = existing.into();
    active.is_active = Set(false);
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/rooms")
        .add("/", get(list).post(create))
        .add("/{room_id}", put(update).delete(delete))
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::rooms -- --nocapture`
- [ ] Expected: All tests PASS

### Step 3.4: Commit

```bash
git add backend/src/controllers/rooms.rs backend/tests/requests/rooms.rs backend/tests/requests/mod.rs
git commit -m "feat: add rooms CRUD endpoints with soft delete"
```

---

## Task 4: Classes CRUD

**Files:**
- Modify: `backend/src/controllers/classes.rs`
- Create: `backend/tests/requests/classes.rs`
- Modify: `backend/tests/requests/mod.rs`

### Step 4.1: Register test module

Add `mod classes;` to `backend/tests/requests/mod.rs` (if not already added).

### Step 4.2: Write tests

Create `backend/tests/requests/classes.rs`:

```rust
use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_classes, school_memberships, schools, teachers};
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
    ctx: &loco_rs::testing::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Admin".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();
    let school = schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-slug"));
    let school = school.insert(&ctx.db).await.unwrap();
    let m = school_memberships::ActiveModel::new(user.id, school.id, "admin".into());
    m.insert(&ctx.db).await.unwrap();
    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

#[tokio::test]
#[serial]
async fn create_class_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "class-create").await;

        let resp = server
            .post(&format!("/api/schools/{}/classes", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "name": "5a",
                "grade_level": 5,
                "student_count": 28
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "5a");
        assert_eq!(body["grade_level"], 5);
        assert_eq!(body["student_count"], 28);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn create_class_with_class_teacher_validates_teacher_exists() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "class-teacher-fk").await;

        // Create a teacher in the same school
        let teacher = teachers::ActiveModel::new(school.id, "Jane".into(), "Doe".into(), "DOE".into());
        let teacher = teacher.insert(&ctx.db).await.unwrap();

        let resp = server
            .post(&format!("/api/schools/{}/classes", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "name": "5b",
                "grade_level": 5,
                "class_teacher_id": teacher.id.to_string()
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["class_teacher_id"], teacher.id.to_string());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_class_partial_fields() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "class-update").await;

        let class = school_classes::ActiveModel::new(school.id, "5a".into(), 5);
        let class = class.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!("/api/schools/{}/classes/{}", school.id, class.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "name": "5b", "student_count": 30 }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "5b");
        assert_eq!(body["student_count"], 30);
        assert_eq!(body["grade_level"], 5); // unchanged
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_class_soft_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "class-delete").await;

        let class = school_classes::ActiveModel::new(school.id, "Del".into(), 1);
        let class = class.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/classes/{}", school.id, class.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        use sea_orm::EntityTrait;
        let deleted = school_classes::Entity::find_by_id(class.id)
            .one(&ctx.db).await.unwrap().unwrap();
        assert!(!deleted.is_active);
    })
    .await;
}
```

### Step 4.3: Implement classes controller CRUD

Replace entire `backend/src/controllers/classes.rs` with:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{school_classes, teachers};

#[derive(Debug, Deserialize)]
struct CreateRequest {
    name: String,
    grade_level: i16,
    student_count: Option<i32>,
    class_teacher_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    grade_level: Option<i16>,
    student_count: Option<i32>,
    class_teacher_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
struct SchoolClassResponse {
    id: String,
    name: String,
    grade_level: i16,
    student_count: Option<i32>,
    class_teacher_id: Option<String>,
    is_active: bool,
}

impl SchoolClassResponse {
    fn from_model(m: &school_classes::Model) -> Self {
        Self {
            id: m.id.to_string(),
            name: m.name.clone(),
            grade_level: m.grade_level,
            student_count: m.student_count,
            class_teacher_id: m.class_teacher_id.map(|id| id.to_string()),
            is_active: m.is_active,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = school_classes::Entity::find()
        .filter(school_classes::Column::SchoolId.eq(school_ctx.school.id))
        .filter(school_classes::Column::IsActive.eq(true))
        .all(&ctx.db)
        .await?;

    let resp: Vec<SchoolClassResponse> =
        items.iter().map(SchoolClassResponse::from_model).collect();
    format::json(resp)
}

async fn create(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    // Validate class_teacher_id if provided
    if let Some(teacher_id) = body.class_teacher_id {
        match teachers::Entity::find_by_id(teacher_id)
            .filter(teachers::Column::SchoolId.eq(school_id))
            .filter(teachers::Column::IsActive.eq(true))
            .one(&ctx.db)
            .await
        {
            Ok(Some(_)) => {}
            Ok(None) => {
                return (StatusCode::BAD_REQUEST, "class_teacher_id not found or inactive".to_string()).into_response();
            }
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        }
    }

    let now = chrono::Utc::now().into();

    let entry = school_classes::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(body.name),
        grade_level: Set(body.grade_level),
        student_count: Set(body.student_count),
        class_teacher_id: Set(body.class_teacher_id),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = SchoolClassResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(class_id): Path<Uuid>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match school_classes::Entity::find_by_id(class_id)
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "class not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Validate class_teacher_id if provided
    if let Some(teacher_id) = body.class_teacher_id {
        match teachers::Entity::find_by_id(teacher_id)
            .filter(teachers::Column::SchoolId.eq(school_id))
            .filter(teachers::Column::IsActive.eq(true))
            .one(&ctx.db)
            .await
        {
            Ok(Some(_)) => {}
            Ok(None) => {
                return (StatusCode::BAD_REQUEST, "class_teacher_id not found or inactive".to_string()).into_response();
            }
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        }
    }

    let mut active: school_classes::ActiveModel = existing.into();

    if let Some(name) = body.name {
        active.name = Set(name);
    }
    if let Some(grade_level) = body.grade_level {
        active.grade_level = Set(grade_level);
    }
    if let Some(student_count) = body.student_count {
        active.student_count = Set(Some(student_count));
    }
    if let Some(class_teacher_id) = body.class_teacher_id {
        active.class_teacher_id = Set(Some(class_teacher_id));
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = SchoolClassResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(class_id): Path<Uuid>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match school_classes::Entity::find_by_id(class_id)
        .filter(school_classes::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "class not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: school_classes::ActiveModel = existing.into();
    active.is_active = Set(false);
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/classes")
        .add("/", get(list).post(create))
        .add("/{class_id}", put(update).delete(delete))
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::classes -- --nocapture`
- [ ] Expected: All tests PASS

### Step 4.4: Commit

```bash
git add backend/src/controllers/classes.rs backend/tests/requests/classes.rs backend/tests/requests/mod.rs
git commit -m "feat: add classes CRUD endpoints with soft delete and teacher FK validation"
```

---

## Task 5: Timeslots CRUD

**Files:**
- Modify: `backend/src/controllers/time_slots.rs`
- Create: `backend/tests/requests/time_slots.rs`
- Modify: `backend/tests/requests/mod.rs`

### Step 5.1: Register test module

Add `mod time_slots;` to `backend/tests/requests/mod.rs` (if not already added).

### Step 5.2: Write tests

Create `backend/tests/requests/time_slots.rs`:

```rust
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
    ctx: &loco_rs::testing::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Admin".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();
    let school = schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-slug"));
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
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "day_of_week": 0,
                "period": 1,
                "start_time": "08:00",
                "end_time": "08:45",
                "is_break": false,
                "label": "1st Period"
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["day_of_week"], 0);
        assert_eq!(body["period"], 1);
        assert_eq!(body["start_time"], "08:00");
        assert_eq!(body["end_time"], "08:45");
        assert_eq!(body["label"], "1st Period");
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

        let ts = time_slots::ActiveModel::new(
            school.id,
            0,
            1,
            chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
            chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap(),
        );
        let ts = ts.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!("/api/schools/{}/timeslots/{}", school.id, ts.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "label": "Updated Period" }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["label"], "Updated Period");
        assert_eq!(body["start_time"], "08:00"); // unchanged
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

        let ts = time_slots::ActiveModel::new(
            school.id,
            0,
            1,
            chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
            chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap(),
        );
        let ts = ts.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/timeslots/{}", school.id, ts.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        use sea_orm::EntityTrait;
        let deleted = time_slots::Entity::find_by_id(ts.id)
            .one(&ctx.db).await.unwrap();
        assert!(deleted.is_none(), "timeslot should be hard-deleted");
    })
    .await;
}
```

### Step 5.3: Implement timeslots controller CRUD

Replace entire `backend/src/controllers/time_slots.rs` with:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::time_slots;

#[derive(Debug, Deserialize)]
struct CreateRequest {
    day_of_week: i16,
    period: i16,
    start_time: chrono::NaiveTime,
    end_time: chrono::NaiveTime,
    is_break: Option<bool>,
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    day_of_week: Option<i16>,
    period: Option<i16>,
    start_time: Option<chrono::NaiveTime>,
    end_time: Option<chrono::NaiveTime>,
    is_break: Option<bool>,
    label: Option<String>,
}

#[derive(Debug, Serialize)]
struct TimeSlotResponse {
    id: String,
    day_of_week: i16,
    period: i16,
    start_time: String,
    end_time: String,
    is_break: bool,
    label: Option<String>,
}

impl TimeSlotResponse {
    fn from_model(m: &time_slots::Model) -> Self {
        Self {
            id: m.id.to_string(),
            day_of_week: m.day_of_week,
            period: m.period,
            start_time: m.start_time.format("%H:%M").to_string(),
            end_time: m.end_time.format("%H:%M").to_string(),
            is_break: m.is_break,
            label: m.label.clone(),
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = time_slots::Entity::find()
        .filter(time_slots::Column::SchoolId.eq(school_ctx.school.id))
        .order_by_asc(time_slots::Column::DayOfWeek)
        .order_by_asc(time_slots::Column::Period)
        .all(&ctx.db)
        .await?;

    let resp: Vec<TimeSlotResponse> = items.iter().map(TimeSlotResponse::from_model).collect();
    format::json(resp)
}

async fn create(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;
    let now = chrono::Utc::now().into();

    let entry = time_slots::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        day_of_week: Set(body.day_of_week),
        period: Set(body.period),
        start_time: Set(body.start_time),
        end_time: Set(body.end_time),
        is_break: Set(body.is_break.unwrap_or(false)),
        label: Set(body.label),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = TimeSlotResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_timeslots_school_day_period") || msg.contains("duplicate key") {
                (StatusCode::CONFLICT, "timeslot for this day/period already exists".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(slot_id): Path<Uuid>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    let existing = match time_slots::Entity::find_by_id(slot_id)
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "timeslot not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: time_slots::ActiveModel = existing.into();

    if let Some(day_of_week) = body.day_of_week {
        active.day_of_week = Set(day_of_week);
    }
    if let Some(period) = body.period {
        active.period = Set(period);
    }
    if let Some(start_time) = body.start_time {
        active.start_time = Set(start_time);
    }
    if let Some(end_time) = body.end_time {
        active.end_time = Set(end_time);
    }
    if let Some(is_break) = body.is_break {
        active.is_break = Set(is_break);
    }
    if let Some(label) = body.label {
        active.label = Set(Some(label));
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = TimeSlotResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("uq_timeslots_school_day_period") || msg.contains("duplicate key") {
                (StatusCode::CONFLICT, "timeslot for this day/period already exists".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(slot_id): Path<Uuid>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    match time_slots::Entity::find_by_id(slot_id)
        .filter(time_slots::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "timeslot not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    match time_slots::Entity::delete_by_id(slot_id)
        .exec(&ctx.db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("foreign key") || msg.contains("violates") {
                (StatusCode::CONFLICT, "cannot delete timeslot: it is referenced by other records".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/timeslots")
        .add("/", get(list).post(create))
        .add("/{slot_id}", put(update).delete(delete))
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::time_slots -- --nocapture`
- [ ] Expected: All tests PASS

### Step 5.4: Commit

```bash
git add backend/src/controllers/time_slots.rs backend/tests/requests/time_slots.rs backend/tests/requests/mod.rs
git commit -m "feat: add timeslots CRUD endpoints with hard delete"
```

---

## Task 6: Terms CRUD (hard delete, FK through school_year)

**Files:**
- Modify: `backend/src/controllers/terms.rs`
- Create: `backend/tests/requests/terms.rs`
- Modify: `backend/tests/requests/mod.rs`

### Step 6.1: Register test module

Add `mod terms;` to `backend/tests/requests/mod.rs` (if not already added).

### Step 6.2: Write tests

Create `backend/tests/requests/terms.rs`:

```rust
use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, school_years, schools, terms};
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
    ctx: &loco_rs::testing::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
) -> (klassenzeit_backend::models::schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test Admin".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();
    let school = schools::ActiveModel::new(format!("{prefix}-school"), format!("{prefix}-slug"));
    let school = school.insert(&ctx.db).await.unwrap();
    let m = school_memberships::ActiveModel::new(user.id, school.id, "admin".into());
    m.insert(&ctx.db).await.unwrap();
    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

#[tokio::test]
#[serial]
async fn create_term_as_admin_returns_201() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "term-create").await;

        // Create school year
        let sy = school_years::ActiveModel::new(
            school.id,
            "2025/2026".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
        );
        let sy = sy.insert(&ctx.db).await.unwrap();

        let resp = server
            .post(&format!("/api/schools/{}/terms", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "school_year_id": sy.id.to_string(),
                "name": "Fall 2025",
                "start_date": "2025-09-01",
                "end_date": "2026-01-31",
                "is_current": true
            }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Fall 2025");
        assert_eq!(body["start_date"], "2025-09-01");
        assert_eq!(body["end_date"], "2026-01-31");
        assert_eq!(body["is_current"], true);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn create_term_with_wrong_school_year_returns_400() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "term-wrong-sy").await;

        // Create school year for a DIFFERENT school
        let other_school = schools::ActiveModel::new("Other".into(), "other-slug".into());
        let other_school = other_school.insert(&ctx.db).await.unwrap();
        let sy = school_years::ActiveModel::new(
            other_school.id,
            "2025/2026".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
        );
        let sy = sy.insert(&ctx.db).await.unwrap();

        let resp = server
            .post(&format!("/api/schools/{}/terms", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({
                "school_year_id": sy.id.to_string(),
                "name": "Fall 2025",
                "start_date": "2025-09-01",
                "end_date": "2026-01-31"
            }))
            .await;

        resp.assert_status(StatusCode::BAD_REQUEST);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn update_term_partial_fields() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "term-update").await;

        let sy = school_years::ActiveModel::new(
            school.id,
            "2025/2026".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
        );
        let sy = sy.insert(&ctx.db).await.unwrap();

        let term = terms::ActiveModel::new(
            sy.id,
            "Old Name".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
        );
        let term = term.insert(&ctx.db).await.unwrap();

        let resp = server
            .put(&format!("/api/schools/{}/terms/{}", school.id, term.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "name": "Updated Name" }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Updated Name");
        assert_eq!(body["start_date"], "2025-09-01"); // unchanged
    })
    .await;
}

#[tokio::test]
#[serial]
async fn delete_term_hard_deletes() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "term-delete").await;

        let sy = school_years::ActiveModel::new(
            school.id,
            "2025/2026".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 7, 31).unwrap(),
        );
        let sy = sy.insert(&ctx.db).await.unwrap();

        let term = terms::ActiveModel::new(
            sy.id,
            "To Delete".into(),
            chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
        );
        let term = term.insert(&ctx.db).await.unwrap();

        let resp = server
            .delete(&format!("/api/schools/{}/terms/{}", school.id, term.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Verify hard-deleted
        use sea_orm::EntityTrait;
        let deleted = terms::Entity::find_by_id(term.id)
            .one(&ctx.db).await.unwrap();
        assert!(deleted.is_none(), "term should be hard-deleted");
    })
    .await;
}
```

### Step 6.3: Implement terms controller CRUD

Replace entire `backend/src/controllers/terms.rs` with:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{school_years, terms};

#[derive(Debug, Deserialize)]
struct CreateRequest {
    school_year_id: Uuid,
    name: String,
    start_date: chrono::NaiveDate,
    end_date: chrono::NaiveDate,
    is_current: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateRequest {
    name: Option<String>,
    start_date: Option<chrono::NaiveDate>,
    end_date: Option<chrono::NaiveDate>,
    is_current: Option<bool>,
}

#[derive(Debug, Serialize)]
struct TermResponse {
    id: String,
    school_year_id: String,
    name: String,
    start_date: String,
    end_date: String,
    is_current: bool,
}

impl TermResponse {
    fn from_model(m: &terms::Model) -> Self {
        Self {
            id: m.id.to_string(),
            school_year_id: m.school_year_id.to_string(),
            name: m.name.clone(),
            start_date: m.start_date.to_string(),
            end_date: m.end_date.to_string(),
            is_current: m.is_current,
        }
    }
}

async fn list(State(ctx): State<AppContext>, school_ctx: SchoolContext) -> Result<Response> {
    let items = terms::Entity::find()
        .join(
            sea_orm::JoinType::InnerJoin,
            terms::Relation::SchoolYear.def(),
        )
        .filter(school_years::Column::SchoolId.eq(school_ctx.school.id))
        .all(&ctx.db)
        .await?;

    let resp: Vec<TermResponse> = items.iter().map(TermResponse::from_model).collect();
    format::json(resp)
}

async fn create(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Json(body): Json<CreateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    // Verify school_year belongs to this school
    match school_years::Entity::find_by_id(body.school_year_id)
        .filter(school_years::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (StatusCode::BAD_REQUEST, "school_year_id not found for this school".to_string()).into_response();
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    let now = chrono::Utc::now().into();

    let entry = terms::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_year_id: Set(body.school_year_id),
        name: Set(body.name),
        start_date: Set(body.start_date),
        end_date: Set(body.end_date),
        is_current: Set(body.is_current.unwrap_or(false)),
        created_at: Set(now),
        updated_at: Set(now),
    };

    match entry.insert(&ctx.db).await {
        Ok(model) => {
            let resp = TermResponse::from_model(&model);
            (StatusCode::CREATED, axum::Json(resp)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn update(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(term_id): Path<Uuid>,
    Json(body): Json<UpdateRequest>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    // Find term and verify it belongs to this school (via school_year)
    let existing = match terms::Entity::find_by_id(term_id)
        .join(
            sea_orm::JoinType::InnerJoin,
            terms::Relation::SchoolYear.def(),
        )
        .filter(school_years::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(m)) => m,
        Ok(None) => return (StatusCode::NOT_FOUND, "term not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut active: terms::ActiveModel = existing.into();

    if let Some(name) = body.name {
        active.name = Set(name);
    }
    if let Some(start_date) = body.start_date {
        active.start_date = Set(start_date);
    }
    if let Some(end_date) = body.end_date {
        active.end_date = Set(end_date);
    }
    if let Some(is_current) = body.is_current {
        active.is_current = Set(is_current);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    match active.update(&ctx.db).await {
        Ok(model) => {
            let resp = TermResponse::from_model(&model);
            axum::Json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn delete(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path(term_id): Path<Uuid>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    let school_id = school_ctx.school.id;

    // Find term and verify it belongs to this school (via school_year)
    match terms::Entity::find_by_id(term_id)
        .join(
            sea_orm::JoinType::InnerJoin,
            terms::Relation::SchoolYear.def(),
        )
        .filter(school_years::Column::SchoolId.eq(school_id))
        .one(&ctx.db)
        .await
    {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "term not found".to_string()).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    // Hard delete — FK constraints will prevent if referenced
    match terms::Entity::delete_by_id(term_id)
        .exec(&ctx.db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("foreign key") || msg.contains("violates") {
                (StatusCode::CONFLICT, "cannot delete term: it is referenced by other records".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
            }
        }
    }
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/terms")
        .add("/", get(list).post(create))
        .add("/{term_id}", put(update).delete(delete))
}
```

- [ ] Run: `cargo test -p klassenzeit-backend --test mod requests::terms -- --nocapture`
- [ ] Expected: All tests PASS

### Step 6.4: Commit

```bash
git add backend/src/controllers/terms.rs backend/tests/requests/terms.rs backend/tests/requests/mod.rs
git commit -m "feat: add terms CRUD endpoints with hard delete and school_year FK validation"
```

---

## Task 7: Run full test suite and create PR

- [ ] Run: `cargo test --workspace`
- [ ] Run: `cargo test -p klassenzeit-backend --test mod`
- [ ] Expected: All tests PASS
- [ ] Create PR targeting `main` with title: "feat: add reference data CRUD endpoints"
