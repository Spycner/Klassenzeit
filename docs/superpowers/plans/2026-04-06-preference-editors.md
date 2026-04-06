# Preference Editors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend endpoints and frontend dialogs so admins can edit each teacher's preferred/blocked slots and each room's subject suitability, feeding datasets the solver already consumes.

**Architecture:** Two new Loco controllers mirroring `room_timeslot_capacities`: `GET` returns the current list, `PUT` is admin-gated and does DELETE-then-INSERT in a transaction. Two new frontend Dialog components launched from the existing teachers/rooms tabs, using the same `useApiClient` + Sonner pattern as `scheduler-tab.tsx` (PR1).

**Tech Stack:** Rust (Loco/Axum/SeaORM), TypeScript (Next.js App Router + shadcn/ui Dialog + Tailwind), next-intl, vitest.

**Spec:** `docs/superpowers/specs/2026-04-06-preference-editors-design.md`

**Reference files (READ these before starting):**
- Backend controller pattern: `backend/src/controllers/room_timeslot_capacities.rs`
- Backend test harness: `backend/tests/requests/scheduler_settings.rs` (has `setup_admin_school`, `setup_teacher_school`, JWT+`x-school-id` header pattern)
- Entity definitions: `backend/src/models/_entities/teacher_availabilities.rs`, `backend/src/models/_entities/room_subject_suitabilities.rs`
- Frontend reference component: `frontend/src/app/[locale]/schools/[id]/settings/components/scheduler-tab.tsx` (from PR1)
- Frontend grid pattern: `frontend/src/app/[locale]/schools/[id]/settings/components/timeslot-capacity-grid.tsx`
- Frontend `useApiClient`: `frontend/src/lib/api-client.ts` exposes `get<T>(path)`, `put<T>(path, body)`, `delete<T>(path)`

---

## File Structure

### Backend
- **Create** `backend/src/controllers/teacher_availabilities.rs` — GET/PUT for `/api/schools/{id}/teachers/{teacher_id}/availabilities`
- **Create** `backend/src/controllers/room_suitabilities.rs` — GET/PUT for `/api/schools/{id}/rooms/{room_id}/suitabilities`
- **Modify** `backend/src/controllers/mod.rs` — register both modules
- **Modify** `backend/src/app.rs` — register both route sets
- **Create** `backend/tests/requests/teacher_availabilities.rs` — integration tests
- **Create** `backend/tests/requests/room_suitabilities.rs` — integration tests
- **Modify** `backend/tests/requests/mod.rs` — register both test modules

### Frontend
- **Modify** `frontend/src/lib/types.ts` — add DTO types
- **Modify** `frontend/src/messages/en.json` + `de.json` — add i18n keys
- **Create** `frontend/src/app/[locale]/schools/[id]/settings/components/teacher-availability-dialog.tsx`
- **Create** `frontend/src/app/[locale]/schools/[id]/settings/components/room-suitability-dialog.tsx`
- **Modify** `frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx` — add button invoking the dialog
- **Modify** `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx` — add button invoking the dialog
- **Create** `frontend/src/__tests__/teacher-availability-dialog.test.tsx`
- **Create** `frontend/src/__tests__/room-suitability-dialog.test.tsx`

### Documentation
- **Modify** `docs/STATUS.md` — add entry on merge
- **Modify** `docs/superpowers/next-steps.md` — mark 4a/4b done

---

## Task 1 — Backend: teacher availabilities controller

**Files:**
- Create: `backend/src/controllers/teacher_availabilities.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

- [ ] **Step 1: Read reference files**

Read `backend/src/controllers/room_timeslot_capacities.rs` fully — it's the closest pattern (admin-gated replace-all with transaction). Also read `backend/src/models/_entities/teacher_availabilities.rs` to confirm column names and types.

- [ ] **Step 2: Create the controller file**

Create `backend/src/controllers/teacher_availabilities.rs`:

```rust
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set, TransactionTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{teacher_availabilities, teachers};

#[derive(Debug, Deserialize)]
struct TermQuery {
    term_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct AvailabilityInput {
    day_of_week: i16,
    period: i16,
    availability_type: String,
}

#[derive(Debug, Serialize)]
struct AvailabilityResponse {
    day_of_week: i16,
    period: i16,
    availability_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

async fn verify_teacher_in_school(
    db: &sea_orm::DatabaseConnection,
    teacher_id: Uuid,
    school_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let teacher = teachers::Entity::find_by_id(teacher_id)
        .filter(teachers::Column::SchoolId.eq(school_id))
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    match teacher {
        Some(_) => Ok(()),
        None => Err((StatusCode::NOT_FOUND, "teacher not found".to_string())),
    }
}

async fn list(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, teacher_id)): Path<(Uuid, Uuid)>,
    Query(q): Query<TermQuery>,
) -> impl IntoResponse {
    if let Err(e) = verify_teacher_in_school(&ctx.db, teacher_id, school_ctx.school.id).await {
        return e.into_response();
    }

    let mut query = teacher_availabilities::Entity::find()
        .filter(teacher_availabilities::Column::TeacherId.eq(teacher_id));
    query = match q.term_id {
        Some(tid) => query.filter(teacher_availabilities::Column::TermId.eq(tid)),
        None => query.filter(teacher_availabilities::Column::TermId.is_null()),
    };

    match query.all(&ctx.db).await {
        Ok(items) => {
            let resp: Vec<AvailabilityResponse> = items
                .into_iter()
                .map(|i| AvailabilityResponse {
                    day_of_week: i.day_of_week,
                    period: i.period,
                    availability_type: i.availability_type,
                    reason: i.reason,
                })
                .collect();
            format::json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn replace(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, teacher_id)): Path<(Uuid, Uuid)>,
    Query(q): Query<TermQuery>,
    Json(body): Json<Vec<AvailabilityInput>>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    // Validate ranges and types, detect duplicates
    let mut seen: HashSet<(i16, i16)> = HashSet::new();
    for item in &body {
        if !(0..=4).contains(&item.day_of_week) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("day_of_week {} out of range (0..=4)", item.day_of_week),
            )
                .into_response();
        }
        if !(1..=10).contains(&item.period) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("period {} out of range (1..=10)", item.period),
            )
                .into_response();
        }
        if !matches!(
            item.availability_type.as_str(),
            "available" | "blocked" | "preferred"
        ) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!(
                    "availability_type '{}' must be available, blocked, or preferred",
                    item.availability_type
                ),
            )
                .into_response();
        }
        if !seen.insert((item.day_of_week, item.period)) {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!(
                    "duplicate (day_of_week={}, period={})",
                    item.day_of_week, item.period
                ),
            )
                .into_response();
        }
    }

    if let Err(e) = verify_teacher_in_school(&ctx.db, teacher_id, school_ctx.school.id).await {
        return e.into_response();
    }

    let txn = match ctx.db.begin().await {
        Ok(txn) => txn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Delete existing rows in the target scope
    let mut delete_query = teacher_availabilities::Entity::delete_many()
        .filter(teacher_availabilities::Column::TeacherId.eq(teacher_id));
    delete_query = match q.term_id {
        Some(tid) => delete_query.filter(teacher_availabilities::Column::TermId.eq(tid)),
        None => delete_query.filter(teacher_availabilities::Column::TermId.is_null()),
    };
    if let Err(e) = delete_query.exec(&txn).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    // Insert non-"available" rows
    let now = chrono::Utc::now().into();
    for item in &body {
        if item.availability_type == "available" {
            continue;
        }
        let entry = teacher_availabilities::ActiveModel {
            id: Set(Uuid::new_v4()),
            teacher_id: Set(teacher_id),
            term_id: Set(q.term_id),
            day_of_week: Set(item.day_of_week),
            period: Set(item.period),
            availability_type: Set(item.availability_type.clone()),
            reason: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        };
        if let Err(e) = entry.insert(&txn).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }

    if let Err(e) = txn.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/teachers/{teacher_id}/availabilities")
        .add("/", get(list).put(replace))
}
```

- [ ] **Step 3: Register the module**

Edit `backend/src/controllers/mod.rs` and add `pub mod teacher_availabilities;` in alphabetical order (after `teachers`).

- [ ] **Step 4: Register the route**

Edit `backend/src/app.rs`. Find the chained `.add_route(...)` block and add:

```rust
.add_route(controllers::teacher_availabilities::routes())
```

Place it near `controllers::teachers::routes()`.

- [ ] **Step 5: Build**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
cargo build -p klassenzeit-backend 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/teacher_availabilities.rs backend/src/controllers/mod.rs backend/src/app.rs
git commit -m "feat(backend): teacher availabilities GET/PUT endpoints"
```

---

## Task 2 — Backend: teacher availabilities integration tests

**Files:**
- Create: `backend/tests/requests/teacher_availabilities.rs`
- Modify: `backend/tests/requests/mod.rs`

- [ ] **Step 1: Read the reference test file**

Open `backend/tests/requests/scheduler_settings.rs` and note:
- Imports from `crate::helpers::jwt::{TestKeyPair, TEST_CLIENT_ID, TEST_ISSUER}`
- `valid_claims`, `setup_admin_school`, `setup_teacher_school` helper functions
- Requests need BOTH `authorization: Bearer <token>` AND `x-school-id: <school.id>` headers
- Tests use `#[tokio::test]` + `#[serial]` and wrap bodies in `request::<App, _, _>(|server, ctx| async move { ... }).await`

- [ ] **Step 2: Create the test file**

Create `backend/tests/requests/teacher_availabilities.rs`:

```rust
use axum::http::{header, HeaderName};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::_entities::{teacher_availabilities, teachers};
use klassenzeit_backend::models::{app_users, school_memberships, schools};
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, Set};
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

async fn create_teacher(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    suffix: &str,
) -> teachers::Model {
    let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
    let t = teachers::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        first_name: Set(format!("First-{suffix}")),
        last_name: Set(format!("Last-{suffix}")),
        abbreviation: Set(format!("T{suffix}")),
        email: Set(None),
        max_hours_per_week: Set(28),
        is_part_time: Set(false),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    };
    t.insert(&ctx.db).await.unwrap()
}

fn url(school_id: Uuid, teacher_id: Uuid) -> String {
    format!("/api/schools/{school_id}/teachers/{teacher_id}/availabilities")
}

// ─── GET: returns [] when no rows ────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn get_returns_empty_when_no_rows() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "ta-get-empty").await;
        let teacher = create_teacher(&ctx, school.id, "1").await;

        let resp = server
            .get(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body.as_array().unwrap().len(), 0);
    })
    .await;
}

// ─── PUT: admin persists blocked + preferred, drops "available" ──────────────

#[tokio::test]
#[serial]
async fn put_as_admin_persists_blocked_and_preferred() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ta-put-persist").await;
        let teacher = create_teacher(&ctx, school.id, "1").await;

        let resp = server
            .put(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                { "day_of_week": 0, "period": 1, "availability_type": "blocked" },
                { "day_of_week": 1, "period": 2, "availability_type": "preferred" },
                { "day_of_week": 2, "period": 3, "availability_type": "available" }
            ]))
            .await;
        resp.assert_status(axum::http::StatusCode::NO_CONTENT);

        let get_resp = server
            .get(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        let body: serde_json::Value = get_resp.json();
        let items = body.as_array().unwrap();
        assert_eq!(items.len(), 2, "expected 2 persisted rows, got {items:?}");
        let has_blocked = items
            .iter()
            .any(|i| i["availability_type"] == "blocked" && i["day_of_week"] == 0);
        let has_preferred = items
            .iter()
            .any(|i| i["availability_type"] == "preferred" && i["day_of_week"] == 1);
        assert!(has_blocked, "missing blocked row");
        assert!(has_preferred, "missing preferred row");
    })
    .await;
}

// ─── PUT: replaces existing rows ─────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_replaces_existing_state() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ta-put-replace").await;
        let teacher = create_teacher(&ctx, school.id, "1").await;

        // Seed two existing rows directly
        let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
        for (day, period) in [(0i16, 1i16), (0, 2)] {
            teacher_availabilities::ActiveModel {
                id: Set(Uuid::new_v4()),
                teacher_id: Set(teacher.id),
                term_id: Set(None),
                day_of_week: Set(day),
                period: Set(period),
                availability_type: Set("blocked".into()),
                reason: Set(None),
                created_at: Set(now),
                updated_at: Set(now),
            }
            .insert(&ctx.db)
            .await
            .unwrap();
        }

        // PUT a single different row
        server
            .put(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                { "day_of_week": 3, "period": 5, "availability_type": "preferred" }
            ]))
            .await
            .assert_status(axum::http::StatusCode::NO_CONTENT);

        let get_resp = server
            .get(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        let body: serde_json::Value = get_resp.json();
        let items = body.as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["day_of_week"], 3);
        assert_eq!(items[0]["period"], 5);
        assert_eq!(items[0]["availability_type"], "preferred");
    })
    .await;
}

// ─── PUT: non-admin returns 403 ──────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_as_non_admin_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "ta-put-forbidden").await;
        let teacher = create_teacher(&ctx, school.id, "1").await;

        let resp = server
            .put(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                { "day_of_week": 0, "period": 1, "availability_type": "blocked" }
            ]))
            .await;
        resp.assert_status_forbidden();
    })
    .await;
}

// ─── PUT: invalid day returns 422 ────────────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_with_invalid_day_returns_422() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ta-put-422").await;
        let teacher = create_teacher(&ctx, school.id, "1").await;

        let resp = server
            .put(&url(school.id, teacher.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([
                { "day_of_week": 9, "period": 1, "availability_type": "blocked" }
            ]))
            .await;
        resp.assert_status(axum::http::StatusCode::UNPROCESSABLE_ENTITY);
    })
    .await;
}

// ─── PUT: unknown teacher returns 404 ────────────────────────────────────────

#[tokio::test]
#[serial]
async fn put_with_unknown_teacher_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ta-put-404").await;
        let bogus = Uuid::new_v4();

        let resp = server
            .put(&url(school.id, bogus))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!([]))
            .await;
        resp.assert_status_not_found();
    })
    .await;
}

// ─── GET: teacher from other school returns 404 (tenant isolation) ──────────

#[tokio::test]
#[serial]
async fn get_with_cross_tenant_teacher_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school_a, token_a) = setup_admin_school(&ctx, &kp, "ta-tenant-a").await;
        let (school_b, _) = setup_admin_school(&ctx, &kp, "ta-tenant-b").await;
        let teacher_b = create_teacher(&ctx, school_b.id, "b1").await;

        // School A admin tries to read School B's teacher via school A's tenant context
        let resp = server
            .get(&url(school_a.id, teacher_b.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token_a}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school_a.id.to_string(),
            )
            .await;
        resp.assert_status_not_found();
    })
    .await;
}
```

**Note on `teachers::ActiveModel::new(...)`:** The teachers entity may have a constructor helper like `schools::ActiveModel::new`. If not, use the explicit field-by-field `ActiveModel { ... }` construction shown in `create_teacher`. **Before running tests, check `backend/src/models/teachers.rs` for existing helpers** — if there's a `new()` constructor, prefer that. If not, the explicit form works.

Also verify the exact fields on `teachers::ActiveModel` by reading `backend/src/models/_entities/teachers.rs` — my template assumes fields `id, school_id, first_name, last_name, abbreviation, email, max_hours_per_week, is_part_time, is_active, created_at, updated_at`. If the real schema differs, adjust.

- [ ] **Step 3: Register the test module**

Edit `backend/tests/requests/mod.rs`, add `mod teacher_availabilities;` (match the existing `mod` style).

- [ ] **Step 4: Run the tests**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
just backend-test 2>&1 | tail -30
```

Expected: 7 new tests pass + all existing tests still pass.

If compilation fails on `teachers::ActiveModel` field names, open `backend/src/models/_entities/teachers.rs` and fix the `create_teacher` helper.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/requests/teacher_availabilities.rs backend/tests/requests/mod.rs
git commit -m "test(backend): integration tests for teacher availabilities endpoints"
```

---

## Task 3 — Backend: room suitabilities controller

**Files:**
- Create: `backend/src/controllers/room_suitabilities.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

- [ ] **Step 1: Create the controller file**

Create `backend/src/controllers/room_suitabilities.rs`:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set, TransactionTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{room_subject_suitabilities, rooms, subjects};

#[derive(Debug, Deserialize)]
struct SuitabilityReplaceBody {
    subject_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize)]
struct SuitabilityResponse {
    subject_id: String,
}

async fn verify_room_in_school(
    db: &sea_orm::DatabaseConnection,
    room_id: Uuid,
    school_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let room = rooms::Entity::find_by_id(room_id)
        .filter(rooms::Column::SchoolId.eq(school_id))
        .one(db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    match room {
        Some(_) => Ok(()),
        None => Err((StatusCode::NOT_FOUND, "room not found".to_string())),
    }
}

async fn list(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    if let Err(e) = verify_room_in_school(&ctx.db, room_id, school_ctx.school.id).await {
        return e.into_response();
    }

    match room_subject_suitabilities::Entity::find()
        .filter(room_subject_suitabilities::Column::RoomId.eq(room_id))
        .all(&ctx.db)
        .await
    {
        Ok(items) => {
            let resp: Vec<SuitabilityResponse> = items
                .into_iter()
                .map(|i| SuitabilityResponse {
                    subject_id: i.subject_id.to_string(),
                })
                .collect();
            format::json(resp).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn replace(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, room_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<SuitabilityReplaceBody>,
) -> impl IntoResponse {
    if school_ctx.role != "admin" {
        return AuthError::Forbidden("admin role required".into()).into_response();
    }

    if let Err(e) = verify_room_in_school(&ctx.db, room_id, school_ctx.school.id).await {
        return e.into_response();
    }

    // Dedupe
    let unique_ids: HashSet<Uuid> = body.subject_ids.into_iter().collect();

    // Validate every subject belongs to this school
    if !unique_ids.is_empty() {
        let found = match subjects::Entity::find()
            .filter(subjects::Column::Id.is_in(unique_ids.iter().copied().collect::<Vec<_>>()))
            .filter(subjects::Column::SchoolId.eq(school_ctx.school.id))
            .all(&ctx.db)
            .await
        {
            Ok(s) => s,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };
        if found.len() != unique_ids.len() {
            return (
                StatusCode::UNPROCESSABLE_ENTITY,
                "subject_ids: unknown or cross-tenant".to_string(),
            )
                .into_response();
        }
    }

    let txn = match ctx.db.begin().await {
        Ok(txn) => txn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if let Err(e) = room_subject_suitabilities::Entity::delete_many()
        .filter(room_subject_suitabilities::Column::RoomId.eq(room_id))
        .exec(&txn)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    let now = chrono::Utc::now().into();
    for sid in unique_ids {
        let entry = room_subject_suitabilities::ActiveModel {
            id: Set(Uuid::new_v4()),
            room_id: Set(room_id),
            subject_id: Set(sid),
            notes: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        };
        if let Err(e) = entry.insert(&txn).await {
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    }

    if let Err(e) = txn.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/rooms/{room_id}/suitabilities")
        .add("/", get(list).put(replace))
}
```

- [ ] **Step 2: Register the module**

Edit `backend/src/controllers/mod.rs`, add `pub mod room_suitabilities;` after `room_timeslot_capacities`.

- [ ] **Step 3: Register the route**

Edit `backend/src/app.rs`, add `.add_route(controllers::room_suitabilities::routes())` near the existing room routes.

- [ ] **Step 4: Build**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
cargo build -p klassenzeit-backend 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/room_suitabilities.rs backend/src/controllers/mod.rs backend/src/app.rs
git commit -m "feat(backend): room suitabilities GET/PUT endpoints"
```

---

## Task 4 — Backend: room suitabilities integration tests

**Files:**
- Create: `backend/tests/requests/room_suitabilities.rs`
- Modify: `backend/tests/requests/mod.rs`

- [ ] **Step 1: Create the test file**

Create `backend/tests/requests/room_suitabilities.rs` following the same harness pattern as teacher_availabilities.rs. Include helpers `create_room` and `create_subject`:

```rust
use axum::http::{header, HeaderName};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::_entities::{room_subject_suitabilities, rooms, subjects};
use klassenzeit_backend::models::{app_users, school_memberships, schools};
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, Set};
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

async fn create_room(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    suffix: &str,
) -> rooms::Model {
    let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
    rooms::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(format!("Room-{suffix}")),
        building: Set(None),
        capacity: Set(None),
        is_active: Set(true),
        max_concurrent: Set(1),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap()
}

async fn create_subject(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    suffix: &str,
) -> subjects::Model {
    let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
    subjects::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(format!("Subject-{suffix}")),
        short_name: Set(format!("S{suffix}")),
        color: Set(None),
        needs_special_room: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap()
}

fn url(school_id: Uuid, room_id: Uuid) -> String {
    format!("/api/schools/{school_id}/rooms/{room_id}/suitabilities")
}

#[tokio::test]
#[serial]
async fn get_returns_empty_when_no_rows() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "rs-get-empty").await;
        let room = create_room(&ctx, school.id, "1").await;

        let resp = server
            .get(&url(school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body.as_array().unwrap().len(), 0);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn put_as_admin_persists_subject_list() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "rs-put-persist").await;
        let room = create_room(&ctx, school.id, "1").await;
        let s1 = create_subject(&ctx, school.id, "math").await;
        let s2 = create_subject(&ctx, school.id, "bio").await;

        server
            .put(&url(school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "subject_ids": [s1.id, s2.id] }))
            .await
            .assert_status(axum::http::StatusCode::NO_CONTENT);

        let get_resp = server
            .get(&url(school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        let body: serde_json::Value = get_resp.json();
        let items = body.as_array().unwrap();
        assert_eq!(items.len(), 2);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn put_replaces_existing_state() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "rs-put-replace").await;
        let room = create_room(&ctx, school.id, "1").await;
        let s1 = create_subject(&ctx, school.id, "math").await;
        let s2 = create_subject(&ctx, school.id, "bio").await;
        let s3 = create_subject(&ctx, school.id, "chem").await;

        // Seed with s1, s2
        let now: chrono::DateTime<chrono::FixedOffset> = chrono::Utc::now().into();
        for sid in [s1.id, s2.id] {
            room_subject_suitabilities::ActiveModel {
                id: Set(Uuid::new_v4()),
                room_id: Set(room.id),
                subject_id: Set(sid),
                notes: Set(None),
                created_at: Set(now),
                updated_at: Set(now),
            }
            .insert(&ctx.db)
            .await
            .unwrap();
        }

        // PUT only s3
        server
            .put(&url(school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "subject_ids": [s3.id] }))
            .await
            .assert_status(axum::http::StatusCode::NO_CONTENT);

        let get_resp = server
            .get(&url(school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        let body: serde_json::Value = get_resp.json();
        let items = body.as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["subject_id"], s3.id.to_string());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn put_as_non_admin_returns_403() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_teacher_school(&ctx, &kp, "rs-put-forbidden").await;
        let room = create_room(&ctx, school.id, "1").await;

        let resp = server
            .put(&url(school.id, room.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "subject_ids": [] }))
            .await;
        resp.assert_status_forbidden();
    })
    .await;
}

#[tokio::test]
#[serial]
async fn put_with_cross_tenant_subject_returns_422() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school_a, token_a) = setup_admin_school(&ctx, &kp, "rs-tenant-a").await;
        let (school_b, _) = setup_admin_school(&ctx, &kp, "rs-tenant-b").await;
        let room_a = create_room(&ctx, school_a.id, "a1").await;
        let subject_b = create_subject(&ctx, school_b.id, "bio").await;

        let resp = server
            .put(&url(school_a.id, room_a.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token_a}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school_a.id.to_string(),
            )
            .json(&serde_json::json!({ "subject_ids": [subject_b.id] }))
            .await;
        resp.assert_status(axum::http::StatusCode::UNPROCESSABLE_ENTITY);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn put_with_unknown_room_returns_404() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "rs-put-404").await;
        let bogus = Uuid::new_v4();

        let resp = server
            .put(&url(school.id, bogus))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "subject_ids": [] }))
            .await;
        resp.assert_status_not_found();
    })
    .await;
}
```

**Important:** `create_room` and `create_subject` use explicit `ActiveModel { ... }` construction. Before running, open `backend/src/models/_entities/rooms.rs` and `subjects.rs` to verify the exact field names. If either has fields I didn't list (`description`, `short_code`, etc.), add them with sensible defaults. If a field I included doesn't exist, remove it.

- [ ] **Step 2: Register the test module**

Edit `backend/tests/requests/mod.rs`, add `mod room_suitabilities;`.

- [ ] **Step 3: Run the tests**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
just backend-test 2>&1 | tail -30
```

Expected: 6 new tests pass + everything else still green.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/requests/room_suitabilities.rs backend/tests/requests/mod.rs
git commit -m "test(backend): integration tests for room suitabilities endpoints"
```

---

## Task 5 — Frontend: DTO types

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Append types**

Append to the end of `frontend/src/lib/types.ts`:

```ts
export type AvailabilityType = "available" | "blocked" | "preferred";

export interface TeacherAvailabilityEntry {
  day_of_week: number;
  period: number;
  availability_type: AvailabilityType;
  reason?: string | null;
}

export interface RoomSuitabilityEntry {
  subject_id: string;
}

export interface RoomSuitabilityPutBody {
  subject_ids: string[];
}
```

Match the existing interface-vs-type style in the file (PR1 added `interface ConstraintWeightsDto` so `interface` is the house style — use interfaces here too).

- [ ] **Step 2: Typecheck**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors/frontend
bun run typecheck 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
git add frontend/src/lib/types.ts
git commit -m "feat(frontend): DTO types for preference editors"
```

---

## Task 6 — Frontend: i18n keys

**Files:**
- Modify: `frontend/src/messages/en.json`
- Modify: `frontend/src/messages/de.json`

- [ ] **Step 1: Add English keys**

In `frontend/src/messages/en.json`, locate `settings.teachers` and add a nested `availability` sub-object at the end of it:

```json
"availability": {
  "button_label": "Availability",
  "button_tooltip": "Edit preferred/blocked slots",
  "dialog_title": "Availability for {name}",
  "legend": {
    "available": "Available",
    "preferred": "Preferred",
    "blocked": "Blocked"
  },
  "save": "Save",
  "cancel": "Cancel",
  "saved_toast": "Availability saved",
  "error_toast": "Failed to save availability",
  "loading": "Loading…"
}
```

Locate `settings.rooms` and add:

```json
"suitability": {
  "button_label": "Subjects",
  "button_tooltip": "Edit suitable subjects",
  "dialog_title": "Suitable subjects for {name}",
  "save": "Save",
  "cancel": "Cancel",
  "saved_toast": "Suitability saved",
  "error_toast": "Failed to save suitability",
  "empty_subjects_hint": "No subjects configured for this school yet.",
  "loading": "Loading…"
}
```

- [ ] **Step 2: Add German keys (mirrored structure)**

Add to `frontend/src/messages/de.json` under `settings.teachers`:

```json
"availability": {
  "button_label": "Verfügbarkeit",
  "button_tooltip": "Bevorzugte/blockierte Stunden bearbeiten",
  "dialog_title": "Verfügbarkeit für {name}",
  "legend": {
    "available": "Verfügbar",
    "preferred": "Bevorzugt",
    "blocked": "Blockiert"
  },
  "save": "Speichern",
  "cancel": "Abbrechen",
  "saved_toast": "Verfügbarkeit gespeichert",
  "error_toast": "Verfügbarkeit konnte nicht gespeichert werden",
  "loading": "Lade…"
}
```

And under `settings.rooms`:

```json
"suitability": {
  "button_label": "Fächer",
  "button_tooltip": "Geeignete Fächer bearbeiten",
  "dialog_title": "Geeignete Fächer für {name}",
  "save": "Speichern",
  "cancel": "Abbrechen",
  "saved_toast": "Fächerzuordnung gespeichert",
  "error_toast": "Fächerzuordnung konnte nicht gespeichert werden",
  "empty_subjects_hint": "Für diese Schule sind noch keine Fächer angelegt.",
  "loading": "Lade…"
}
```

Mind JSON commas — don't break the file.

- [ ] **Step 3: Format and typecheck**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
bunx --bun biome format --write frontend/src/messages/en.json frontend/src/messages/de.json 2>&1 | tail -5
cd frontend && bun run typecheck 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
git add frontend/src/messages/en.json frontend/src/messages/de.json
git commit -m "i18n(frontend): keys for preference editors"
```

---

## Task 7 — Frontend: TeacherAvailabilityDialog component

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/teacher-availability-dialog.tsx`

- [ ] **Step 1: Read references**

Read these to match patterns:
- `frontend/src/app/[locale]/schools/[id]/settings/components/scheduler-tab.tsx` (PR1 component — useApiClient pattern, toast handling, loading state)
- `frontend/src/app/[locale]/schools/[id]/settings/components/timeslot-capacity-grid.tsx` (day/period grid pattern, `t.raw("dayNames")` for day labels)
- `frontend/src/app/[locale]/schools/[id]/settings/components/terms-tab.tsx` (Dialog usage with open/close state passed from parent)

- [ ] **Step 2: Create the component**

Create `frontend/src/app/[locale]/schools/[id]/settings/components/teacher-availability-dialog.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiClient } from "@/hooks/use-api-client";
import type {
  AvailabilityType,
  TeacherAvailabilityEntry,
  TeacherResponse,
  TimeSlotResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  teacher: TeacherResponse | null;
  timeslots: TimeSlotResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function cycle(state: AvailabilityType): AvailabilityType {
  if (state === "available") return "preferred";
  if (state === "preferred") return "blocked";
  return "available";
}

function cellClass(state: AvailabilityType): string {
  switch (state) {
    case "preferred":
      return "bg-green-100 hover:bg-green-200 text-green-900";
    case "blocked":
      return "bg-red-100 hover:bg-red-200 text-red-900";
    default:
      return "bg-muted hover:bg-muted/80 text-muted-foreground";
  }
}

export function TeacherAvailabilityDialog({
  teacher,
  timeslots,
  open,
  onOpenChange,
}: Props) {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.teachers.availability");

  const [cells, setCells] = useState<Map<string, AvailabilityType>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { days, periods } = useMemo(() => {
    const daySet = new Set<number>();
    const periodSet = new Set<number>();
    for (const ts of timeslots) {
      if (!ts.is_break) {
        daySet.add(ts.day_of_week);
        periodSet.add(ts.period);
      }
    }
    return {
      days: [...daySet].sort((a, b) => a - b),
      periods: [...periodSet].sort((a, b) => a - b),
    };
  }, [timeslots]);

  const tGrid = useTranslations("settings.rooms");
  const dayNames: string[] = tGrid.raw("dayNames");

  const load = useCallback(() => {
    if (!teacher || !open) return;
    setLoading(true);
    apiClient
      .get<TeacherAvailabilityEntry[]>(
        `/api/schools/${schoolId}/teachers/${teacher.id}/availabilities`,
      )
      .then((entries) => {
        const next = new Map<string, AvailabilityType>();
        for (const e of entries) {
          next.set(`${e.day_of_week}-${e.period}`, e.availability_type);
        }
        setCells(next);
      })
      .catch(() => toast.error(t("error_toast")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, teacher, open, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCells(new Map());
    }
  }, [open]);

  const getCell = (day: number, period: number): AvailabilityType =>
    cells.get(`${day}-${period}`) ?? "available";

  const handleCellClick = (day: number, period: number) => {
    const key = `${day}-${period}`;
    const current = cells.get(key) ?? "available";
    const next = cycle(current);
    const newCells = new Map(cells);
    if (next === "available") {
      newCells.delete(key);
    } else {
      newCells.set(key, next);
    }
    setCells(newCells);
  };

  const handleSave = async () => {
    if (!teacher) return;
    setSaving(true);
    const body: TeacherAvailabilityEntry[] = [];
    for (const [key, value] of cells.entries()) {
      const [day, period] = key.split("-").map(Number);
      body.push({
        day_of_week: day,
        period,
        availability_type: value,
      });
    }
    try {
      await apiClient.put<void>(
        `/api/schools/${schoolId}/teachers/${teacher.id}/availabilities`,
        body,
      );
      toast.success(t("saved_toast"));
      onOpenChange(false);
    } catch {
      toast.error(t("error_toast"));
    } finally {
      setSaving(false);
    }
  };

  if (!teacher) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("dialog_title", {
              name: `${teacher.first_name} ${teacher.last_name}`,
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 items-center text-xs">
          <div className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded bg-muted" />
            {t("legend.available")}
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded bg-green-100" />
            {t("legend.preferred")}
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded bg-red-100" />
            {t("legend.blocked")}
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : (
          <div
            className="overflow-x-auto"
            data-testid="teacher-availability-grid"
          >
            <table className="w-full border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-muted-foreground p-1">
                    #
                  </th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className="text-xs font-medium text-muted-foreground p-1"
                    >
                      {dayNames[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p}>
                    <td className="text-xs font-medium text-muted-foreground p-1 text-right">
                      {p}
                    </td>
                    {days.map((d) => {
                      const state = getCell(d, p);
                      return (
                        <td key={d} className="p-0">
                          <button
                            type="button"
                            data-testid={`cell-${d}-${p}`}
                            onClick={() => handleCellClick(d, p)}
                            className={cn(
                              "w-full h-10 rounded text-xs transition-colors",
                              cellClass(state),
                            )}
                          >
                            {state === "available" ? "" : state.charAt(0).toUpperCase()}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Note:** The `tGrid = useTranslations("settings.rooms"); dayNames: string[] = tGrid.raw("dayNames");` trick borrows `dayNames` from the rooms namespace because that's where `timeslot-capacity-grid.tsx` reads it from. If your project stores `dayNames` under `settings.timeslots` or a different path, adjust — check `timeslot-capacity-grid.tsx` for the correct namespace.

**Also note:** The component accepts `TeacherResponse` and `TimeSlotResponse[]` from the parent rather than fetching them itself. That's deliberate — parents already have these loaded. Avoid duplicate fetches.

- [ ] **Step 3: Typecheck**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors/frontend
bun run typecheck 2>&1 | tail -15
```

Fix any type errors — most likely `TeacherResponse` field names (check `lib/types.ts`) or `TimeSlotResponse.is_break` (might be spelled differently).

- [ ] **Step 4: Commit**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
git add frontend/src/app/\[locale\]/schools/\[id\]/settings/components/teacher-availability-dialog.tsx
git commit -m "feat(frontend): TeacherAvailabilityDialog component"
```

---

## Task 8 — Frontend: RoomSuitabilityDialog component

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/settings/components/room-suitability-dialog.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/app/[locale]/schools/[id]/settings/components/room-suitability-dialog.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useApiClient } from "@/hooks/use-api-client";
import type {
  RoomResponse,
  RoomSuitabilityEntry,
  RoomSuitabilityPutBody,
  SubjectResponse,
} from "@/lib/types";

interface Props {
  room: RoomResponse | null;
  subjects: SubjectResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoomSuitabilityDialog({
  room,
  subjects,
  open,
  onOpenChange,
}: Props) {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.rooms.suitability");

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!room || !open) return;
    setLoading(true);
    apiClient
      .get<RoomSuitabilityEntry[]>(
        `/api/schools/${schoolId}/rooms/${room.id}/suitabilities`,
      )
      .then((entries) => {
        setChecked(new Set(entries.map((e) => e.subject_id)));
      })
      .catch(() => toast.error(t("error_toast")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, room, open, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setChecked(new Set());
    }
  }, [open]);

  const toggle = (subjectId: string) => {
    const next = new Set(checked);
    if (next.has(subjectId)) {
      next.delete(subjectId);
    } else {
      next.add(subjectId);
    }
    setChecked(next);
  };

  const handleSave = async () => {
    if (!room) return;
    setSaving(true);
    const body: RoomSuitabilityPutBody = {
      subject_ids: Array.from(checked),
    };
    try {
      await apiClient.put<void>(
        `/api/schools/${schoolId}/rooms/${room.id}/suitabilities`,
        body,
      );
      toast.success(t("saved_toast"));
      onOpenChange(false);
    } catch {
      toast.error(t("error_toast"));
    } finally {
      setSaving(false);
    }
  };

  if (!room) return null;

  const sorted = [...subjects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("dialog_title", { name: room.name })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : sorted.length === 0 ? (
          <p className="text-muted-foreground">{t("empty_subjects_hint")}</p>
        ) : (
          <div
            className="max-h-80 overflow-y-auto flex flex-col gap-2"
            data-testid="room-suitability-list"
          >
            {sorted.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <Checkbox
                  id={`subj-${s.id}`}
                  data-testid={`subject-${s.id}`}
                  checked={checked.has(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                />
                <Label htmlFor={`subj-${s.id}`} className="cursor-pointer">
                  {s.name}
                </Label>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Note on Checkbox:** Verify `frontend/src/components/ui/checkbox.tsx` exists (`ls frontend/src/components/ui/checkbox.tsx`). If not, run `cd frontend && bunx --bun shadcn@latest add checkbox -y`. Most shadcn projects already have it.

- [ ] **Step 2: Typecheck**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors/frontend
bun run typecheck 2>&1 | tail -15
```

Fix any issues — check `RoomResponse` and `SubjectResponse` field names in `lib/types.ts`.

- [ ] **Step 3: Commit**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
git add frontend/src/app/\[locale\]/schools/\[id\]/settings/components/room-suitability-dialog.tsx
# Include checkbox.tsx if it was freshly added by shadcn
git add frontend/src/components/ui/checkbox.tsx frontend/package.json frontend/bun.lock 2>/dev/null || true
git commit -m "feat(frontend): RoomSuitabilityDialog component"
```

---

## Task 9 — Frontend: wire dialogs into teachers-tab and rooms-tab

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/teachers-tab.tsx`
- Modify: `frontend/src/app/[locale]/schools/[id]/settings/components/rooms-tab.tsx`

- [ ] **Step 1: Add availability button + state to teachers-tab**

Read `teachers-tab.tsx` to find the action column (where Pencil/Trash2 buttons are rendered). Add a Calendar icon button next to them that opens the dialog.

Imports to add:
```tsx
import { Calendar } from "lucide-react";
import { TeacherAvailabilityDialog } from "./teacher-availability-dialog";
import type { TimeSlotResponse } from "@/lib/types";
```

State additions (alongside existing state):
```tsx
const [availabilityTeacher, setAvailabilityTeacher] =
  useState<TeacherResponse | null>(null);
const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);
```

Load timeslots in the initial fetch effect (alongside teachers):
```tsx
useEffect(() => {
  // ... existing teacher fetch
  apiClient
    .get<TimeSlotResponse[]>(`/api/schools/${schoolId}/time-slots`)
    .then(setTimeslots)
    .catch(() => {});
}, [apiClient, schoolId]);
```

Verify the time-slots endpoint URL by grepping existing tabs (`grep -n "time-slots" frontend/src/app/`).

Action column button:
```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={() => setAvailabilityTeacher(item)}
  aria-label={t("availability.button_label")}
>
  <Calendar className="h-4 w-4" />
</Button>
```

Near the end of the returned JSX (after the delete dialog):
```tsx
<TeacherAvailabilityDialog
  teacher={availabilityTeacher}
  timeslots={timeslots}
  open={!!availabilityTeacher}
  onOpenChange={(o) => !o && setAvailabilityTeacher(null)}
/>
```

- [ ] **Step 2: Add suitability button + state to rooms-tab**

Read `rooms-tab.tsx` to find its action column and state structure. Add:

```tsx
import { BookOpen } from "lucide-react";
import { RoomSuitabilityDialog } from "./room-suitability-dialog";
import type { SubjectResponse } from "@/lib/types";
```

```tsx
const [suitabilityRoom, setSuitabilityRoom] = useState<RoomResponse | null>(null);
const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
```

Fetch subjects in the initial effect (they're probably already loaded if the tab shows them elsewhere — reuse existing state if so; otherwise add):
```tsx
apiClient
  .get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`)
  .then(setSubjects)
  .catch(() => {});
```

Action column button:
```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={() => setSuitabilityRoom(item)}
  aria-label={t("suitability.button_label")}
>
  <BookOpen className="h-4 w-4" />
</Button>
```

Dialog mount near end of JSX:
```tsx
<RoomSuitabilityDialog
  room={suitabilityRoom}
  subjects={subjects}
  open={!!suitabilityRoom}
  onOpenChange={(o) => !o && setSuitabilityRoom(null)}
/>
```

- [ ] **Step 3: Typecheck and lint**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors/frontend
bun run typecheck 2>&1 | tail -15
bunx --bun biome check src/app/\[locale\]/schools/\[id\]/settings/components/teachers-tab.tsx src/app/\[locale\]/schools/\[id\]/settings/components/rooms-tab.tsx 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
git add frontend/src/app/\[locale\]/schools/\[id\]/settings/components/teachers-tab.tsx frontend/src/app/\[locale\]/schools/\[id\]/settings/components/rooms-tab.tsx
git commit -m "feat(frontend): wire preference dialogs into tabs"
```

---

## Task 10 — Frontend: component tests

**Files:**
- Create: `frontend/src/__tests__/teacher-availability-dialog.test.tsx`
- Create: `frontend/src/__tests__/room-suitability-dialog.test.tsx`

- [ ] **Step 1: Read existing test file for patterns**

Open `frontend/src/__tests__/scheduler-tab.test.tsx` (from PR1). Note the `vi.mock` setup for `@/hooks/use-api-client`, `next/navigation`, `next-intl`, and `sonner`, plus the `mockApiClient` object pattern.

- [ ] **Step 2: Write `teacher-availability-dialog.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeacherAvailabilityDialog } from "@/app/[locale]/schools/[id]/settings/components/teacher-availability-dialog";
import type { TeacherResponse, TimeSlotResponse } from "@/lib/types";

const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => mockApiClient,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "school-1" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => {
    return (key: string, values?: Record<string, string>) => {
      if (key === "dialog_title" && values?.name) {
        return `Availability for ${values.name}`;
      }
      if (ns === "settings.rooms" && key === "dayNames") {
        return ["Mon", "Tue", "Wed", "Thu", "Fri"];
      }
      return key;
    };
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const TEACHER: TeacherResponse = {
  id: "teacher-1",
  school_id: "school-1",
  first_name: "Anna",
  last_name: "Schmidt",
  abbreviation: "SCH",
  email: null,
  max_hours_per_week: 28,
  is_part_time: false,
  is_active: true,
};

const TIMESLOTS: TimeSlotResponse[] = [
  { id: "ts-1", school_id: "school-1", day_of_week: 0, period: 1, start_time: "08:00", end_time: "08:45", is_break: false },
  { id: "ts-2", school_id: "school-1", day_of_week: 0, period: 2, start_time: "08:50", end_time: "09:35", is_break: false },
  { id: "ts-3", school_id: "school-1", day_of_week: 1, period: 1, start_time: "08:00", end_time: "08:45", is_break: false },
];

describe("TeacherAvailabilityDialog", () => {
  beforeEach(() => {
    mockApiClient.get.mockReset();
    mockApiClient.put.mockReset();
  });

  it("renders all cells as available when GET returns []", async () => {
    mockApiClient.get.mockResolvedValue([]);

    render(
      <TeacherAvailabilityDialog
        teacher={TEACHER}
        timeslots={TIMESLOTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cell-0-1")).toBeInTheDocument();
    });
    // Cell has no text content when "available"
    expect(screen.getByTestId("cell-0-1").textContent).toBe("");
  });

  it("clicking a cell cycles available → preferred → blocked → available", async () => {
    mockApiClient.get.mockResolvedValue([]);

    render(
      <TeacherAvailabilityDialog
        teacher={TEACHER}
        timeslots={TIMESLOTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => screen.getByTestId("cell-0-1"));
    const cell = screen.getByTestId("cell-0-1");

    fireEvent.click(cell);
    expect(cell.textContent).toBe("P"); // preferred

    fireEvent.click(cell);
    expect(cell.textContent).toBe("B"); // blocked

    fireEvent.click(cell);
    expect(cell.textContent).toBe(""); // available
  });

  it("Save issues PUT with only non-available cells", async () => {
    mockApiClient.get.mockResolvedValue([]);
    mockApiClient.put.mockResolvedValue(undefined);

    render(
      <TeacherAvailabilityDialog
        teacher={TEACHER}
        timeslots={TIMESLOTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => screen.getByTestId("cell-0-1"));

    // Set cell (0,1) to preferred
    fireEvent.click(screen.getByTestId("cell-0-1"));
    // Set cell (1,1) to blocked (two clicks)
    fireEvent.click(screen.getByTestId("cell-1-1"));
    fireEvent.click(screen.getByTestId("cell-1-1"));

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mockApiClient.put).toHaveBeenCalledWith(
        "/api/schools/school-1/teachers/teacher-1/availabilities",
        expect.arrayContaining([
          expect.objectContaining({
            day_of_week: 0,
            period: 1,
            availability_type: "preferred",
          }),
          expect.objectContaining({
            day_of_week: 1,
            period: 1,
            availability_type: "blocked",
          }),
        ]),
      );
    });

    // Body should NOT include cell-0-2 (still available)
    const call = mockApiClient.put.mock.calls[0];
    const body = call[1] as Array<{ day_of_week: number; period: number }>;
    expect(body.some((e) => e.day_of_week === 0 && e.period === 2)).toBe(false);
  });

  it("Cancel closes the dialog without calling PUT", async () => {
    mockApiClient.get.mockResolvedValue([]);
    const onOpenChange = vi.fn();

    render(
      <TeacherAvailabilityDialog
        teacher={TEACHER}
        timeslots={TIMESLOTS}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => screen.getByTestId("cell-0-1"));

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockApiClient.put).not.toHaveBeenCalled();
  });
});
```

**Note on TEACHER/TIMESLOTS fixtures:** The exact fields on `TeacherResponse` and `TimeSlotResponse` may differ. Before running the tests, open `frontend/src/lib/types.ts` and make the fixtures match the real interfaces. Fill any required fields that I omitted. The `is_break: false` field in TimeSlotResponse might be named `break: boolean` or similar — verify.

- [ ] **Step 3: Write `room-suitability-dialog.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomSuitabilityDialog } from "@/app/[locale]/schools/[id]/settings/components/room-suitability-dialog";
import type { RoomResponse, SubjectResponse } from "@/lib/types";

const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => mockApiClient,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "school-1" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    return (key: string, values?: Record<string, string>) => {
      if (key === "dialog_title" && values?.name) {
        return `Suitable subjects for ${values.name}`;
      }
      return key;
    };
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ROOM: RoomResponse = {
  id: "room-1",
  school_id: "school-1",
  name: "Gym",
  building: null,
  capacity: null,
  is_active: true,
  max_concurrent: 1,
};

const SUBJECTS: SubjectResponse[] = [
  { id: "subj-1", school_id: "school-1", name: "Math", short_name: "M", color: null, needs_special_room: false },
  { id: "subj-2", school_id: "school-1", name: "Biology", short_name: "BIO", color: null, needs_special_room: true },
];

describe("RoomSuitabilityDialog", () => {
  beforeEach(() => {
    mockApiClient.get.mockReset();
    mockApiClient.put.mockReset();
  });

  it("renders subject list and pre-checks fetched suitabilities", async () => {
    mockApiClient.get.mockResolvedValue([{ subject_id: "subj-2" }]);

    render(
      <RoomSuitabilityDialog
        room={ROOM}
        subjects={SUBJECTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => {
      const subj2 = screen.getByTestId("subject-subj-2") as HTMLInputElement;
      expect(subj2.getAttribute("data-state")).toBe("checked");
    });

    const subj1 = screen.getByTestId("subject-subj-1");
    expect(subj1.getAttribute("data-state")).toBe("unchecked");
  });

  it("toggling a checkbox updates state and Save sends current set", async () => {
    mockApiClient.get.mockResolvedValue([]);
    mockApiClient.put.mockResolvedValue(undefined);

    render(
      <RoomSuitabilityDialog
        room={ROOM}
        subjects={SUBJECTS}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => screen.getByTestId("subject-subj-1"));

    fireEvent.click(screen.getByTestId("subject-subj-1"));
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mockApiClient.put).toHaveBeenCalledWith(
        "/api/schools/school-1/rooms/room-1/suitabilities",
        { subject_ids: ["subj-1"] },
      );
    });
  });
});
```

Same caveat: verify the `RoomResponse` and `SubjectResponse` fixtures match the real types in `lib/types.ts`.

- [ ] **Step 4: Run the frontend tests**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors/frontend
bun run test 2>&1 | tail -20
```

Expected: all new tests pass + previously passing tests still green (24 from PR1 should stay green).

- [ ] **Step 5: Commit**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
git add frontend/src/__tests__/teacher-availability-dialog.test.tsx frontend/src/__tests__/room-suitability-dialog.test.tsx
git commit -m "test(frontend): preference editor component tests"
```

---

## Task 11 — Full verification, docs, and PR

- [ ] **Step 1: Full suite**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
just check 2>&1 | tail -20
just backend-test 2>&1 | grep "^test result" | tail -15
cd frontend && bun run test 2>&1 | tail -10
```

Expected: all green — cargo fmt/clippy clean, biome clean, tsc clean, all backend/frontend tests passing.

- [ ] **Step 2: Update `docs/STATUS.md`**

In the "Completed Steps" section, after the existing "Solver Constraints UI — PR1" block, append:

```markdown
### Preference Editors — PR2 (4a + 4b)
- Spec: `superpowers/specs/2026-04-06-preference-editors-design.md`
- Plan: `superpowers/plans/2026-04-06-preference-editors.md`
- `GET`/`PUT /api/schools/{id}/teachers/{tid}/availabilities` — admin-gated replace-all
- `GET`/`PUT /api/schools/{id}/rooms/{rid}/suitabilities` — admin-gated replace-all with cross-tenant validation
- Availability dialog: weekly grid with single-click cycle (available → preferred → blocked)
- Suitability dialog: subject checkbox list
- Default-scope only; per-term overrides deferred
```

In the "Next Up" section, remove `**4a/4b: Preferred slots + room suitability editors**` and replace with the next highest priority (keep `3a: Production deployment` as top).

- [ ] **Step 3: Update `docs/superpowers/next-steps.md`**

Mark items 4a and 4b as `done`. Their rows look like:

```markdown
| 4a | **Teacher availability UI** | idea | — | M |
| ... |
| 4b | **Room suitability UI** | idea | — | S |
```

Change both to `done` and strike through the titles. Update the "Recommended next priorities" section if 4a/4b appears there.

- [ ] **Step 4: Commit docs**

```bash
cd /home/pascal/Code/Klassenzeit/.worktrees/preference-editors
git add docs/
git commit -m "docs: mark 4a/4b complete"
```

- [ ] **Step 5: Push branch and open PR**

```bash
git push -u origin feat/preference-editors
gh pr create --title "feat(4a+4b): preference editors — teacher availability + room suitability" --body "$(cat <<'EOF'
## Summary

PR2 of the solver-constraints-ui work (PR1 was #55). Adds editors for the two preference datasets the solver already consumes but that today can only be seeded.

- **Backend**
  - `GET`/`PUT /api/schools/{id}/teachers/{tid}/availabilities` — admin-gated replace-all with 422 on invalid day/period/type or duplicate slots, 404 on tenant mismatch. Optional `?term_id=` query param (UI omits it for now).
  - `GET`/`PUT /api/schools/{id}/rooms/{rid}/suitabilities` — admin-gated replace-all with cross-tenant subject validation.
- **Frontend**
  - `TeacherAvailabilityDialog`: weekly grid. Single-click cycles Available → Preferred → Blocked → Available. Launched from a calendar icon in the teachers tab.
  - `RoomSuitabilityDialog`: checkbox list of school subjects. Launched from a book icon in the rooms tab.
  - DE/EN i18n. Vitest component tests.

Per-term availability overrides, bulk selection, and the notes/reason fields are intentionally out of scope.

- Spec: `docs/superpowers/specs/2026-04-06-preference-editors-design.md`
- Plan: `docs/superpowers/plans/2026-04-06-preference-editors.md`

## Test plan

- [x] Backend integration tests: 7 for availabilities + 6 for suitabilities (GET/PUT persist/replace/403/404/422)
- [x] Frontend component tests for both dialogs
- [x] `just check` and `just backend-test` clean
- [x] Manual: dialog opens from tab, loads state, saves, closes, scheduler picks up changes on next solve
EOF
)"
```

- [ ] **Step 6: Fix CI and merge**

Monitor with `gh pr checks <N> --watch`. Fix any failures, then:

```bash
gh pr merge <N> --merge --delete-branch
```

(Squash merge is not allowed on this repo — use `--merge`.)

- [ ] **Step 7: Clean up worktree**

```bash
cd /home/pascal/Code/Klassenzeit
git worktree remove .worktrees/preference-editors
```

- [ ] **Step 8: Ping PR**

```bash
gh pr comment <N> --body "Merged. 4a + 4b are live: teacher availability grid and room suitability matrix."
```

---

## Self-Review Notes

**Spec coverage:**
- Teacher availabilities GET/PUT endpoints → Task 1 ✓
- Teacher availabilities integration tests → Task 2 ✓
- Room suitabilities GET/PUT endpoints → Task 3 ✓
- Room suitabilities integration tests → Task 4 ✓
- Frontend types → Task 5 ✓
- i18n → Task 6 ✓
- TeacherAvailabilityDialog → Task 7 ✓
- RoomSuitabilityDialog → Task 8 ✓
- Tab wiring → Task 9 ✓
- Frontend tests → Task 10 ✓
- Docs + PR → Task 11 ✓

**Type consistency:**
- `AvailabilityType = "available" | "blocked" | "preferred"` used consistently in Task 5 (types), Task 7 (component), Task 10 (tests).
- `TeacherAvailabilityEntry` fields (`day_of_week`, `period`, `availability_type`, `reason?`) match between Tasks 5, 7, 10 and backend JSON.
- `RoomSuitabilityEntry` / `RoomSuitabilityPutBody` consistent.

**Known fuzziness marked for executor judgement:**
- Task 2/4 backend test fixtures use explicit `ActiveModel { ... }` — executor must verify field names against real entity files before running.
- Task 5 assumes `TeacherResponse`, `RoomResponse`, `SubjectResponse`, `TimeSlotResponse` already exist — executor verifies.
- Task 7 uses `t.raw("dayNames")` from `settings.rooms` namespace — executor confirms by reading `timeslot-capacity-grid.tsx`.
- Task 9 `time-slots` API URL — executor greps existing tabs for the exact path.
- Task 10 fixtures need alignment with real type definitions.

These are "look at the neighbour, match it" tasks — not placeholders. Matching existing patterns exactly matters more than my guess.
