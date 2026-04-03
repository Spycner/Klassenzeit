# Step 5: First CRUD Endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the full stack works end-to-end with schools CRUD, membership management, and frontend pages built on shadcn/ui with the Klassenzeit theme.

**Architecture:** Backend adds two new controller modules (schools, members) using existing `AuthUser`/`SchoolContext` extractors. Frontend gets shadcn/ui with the website's OKLch theme, a `useApiClient` hook, a school context provider, and three pages (school list, dashboard, members).

**Tech Stack:** Loco/Axum/SeaORM (backend), Next.js 16/React 19/shadcn/ui/Tailwind v4 (frontend)

---

## File Map

### Backend — New Files

| File | Purpose |
|------|---------|
| `backend/src/controllers/schools.rs` | Schools CRUD endpoints |
| `backend/src/controllers/members.rs` | Membership CRUD endpoints |
| `backend/tests/requests/schools.rs` | Integration tests for schools endpoints |
| `backend/tests/requests/members.rs` | Integration tests for members endpoints |

### Backend — Modified Files

| File | Change |
|------|--------|
| `backend/src/controllers/mod.rs` | Add `pub mod schools; pub mod members;` |
| `backend/src/app.rs` | Register new route modules |
| `backend/src/models/schools.rs` | Add `generate_slug`, `find_schools_for_user` methods |
| `backend/src/models/school_memberships.rs` | Add `find_members_for_school`, `count_admins` methods |
| `backend/src/keycloak/errors.rs` | Add `Forbidden` variant for admin-only checks |

### Frontend — New Files

| File | Purpose |
|------|---------|
| `frontend/components.json` | shadcn/ui configuration |
| `frontend/src/lib/utils.ts` | `cn()` utility for shadcn/ui |
| `frontend/src/components/ui/*.tsx` | shadcn/ui components (button, card, input, label, table, dialog, select, toast, sidebar, dropdown-menu) |
| `frontend/src/hooks/use-api-client.ts` | Memoized API client hook |
| `frontend/src/providers/school-provider.tsx` | School context (selected school state) |
| `frontend/src/hooks/use-school.ts` | Hook to consume school context |
| `frontend/src/app/schools/page.tsx` | School list page |
| `frontend/src/app/schools/[id]/layout.tsx` | School layout with sidebar |
| `frontend/src/app/schools/[id]/page.tsx` | School dashboard |
| `frontend/src/app/schools/[id]/members/page.tsx` | Member management page |
| `frontend/src/lib/types.ts` | Shared API response types |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `frontend/src/app/globals.css` | Replace with website theme (OKLch variables) |
| `frontend/src/app/layout.tsx` | Add ThemeProvider, swap fonts to Quicksand/Lora |
| `frontend/src/app/page.tsx` | Redirect to `/schools` instead of `/dashboard` |
| `frontend/package.json` | Add shadcn/ui dependencies |

---

## Task 1: Backend — Add slug generation and model helpers

**Files:**
- Modify: `backend/src/models/schools.rs`
- Modify: `backend/src/models/school_memberships.rs`
- Modify: `backend/src/keycloak/errors.rs`
- Test: `backend/tests/models/schools.rs`
- Test: `backend/tests/models/school_memberships.rs`

- [ ] **Step 1: Write failing test for slug generation**

Add to `backend/tests/models/schools.rs`:

```rust
use klassenzeit_backend::models::schools;

#[test]
fn generate_slug_from_name() {
    assert_eq!(schools::generate_slug("My School"), "my-school");
    assert_eq!(schools::generate_slug("  Spaces  Everywhere  "), "spaces-everywhere");
    assert_eq!(schools::generate_slug("Special Ch@rs & More!"), "special-chrs--more");
    assert_eq!(schools::generate_slug("Über Schule"), "ber-schule");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend generate_slug_from_name -- --nocapture`
Expected: FAIL — `generate_slug` does not exist.

- [ ] **Step 3: Implement slug generation**

In `backend/src/models/schools.rs`, add above the `impl ActiveModelBehavior` line:

```rust
/// Generate a URL-friendly slug from a school name.
/// Lowercases, replaces whitespace with hyphens, strips non-alphanumeric/hyphen chars, collapses multiple hyphens.
pub fn generate_slug(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    // Collapse multiple hyphens
    let mut result = String::new();
    let mut prev_hyphen = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_hyphen {
                result.push(c);
            }
            prev_hyphen = true;
        } else {
            result.push(c);
            prev_hyphen = false;
        }
    }
    result.trim_matches('-').to_string()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend generate_slug_from_name -- --nocapture`
Expected: PASS

- [ ] **Step 5: Write failing test for `find_schools_for_user`**

Add to `backend/tests/models/schools.rs`:

```rust
use klassenzeit_backend::models::{app_users, school_memberships};

#[tokio::test]
#[serial]
async fn find_schools_for_user_returns_memberships() {
    let boot = boot_test::<App>().await.unwrap();

    let user = app_users::ActiveModel::new(
        "kc-list-user".into(),
        "listuser@example.com".into(),
        "List User".into(),
    );
    let user = user.insert(&boot.app_context.db).await.unwrap();

    let school1 = schools::ActiveModel::new("School A".into(), "school-a".into());
    let school1 = school1.insert(&boot.app_context.db).await.unwrap();

    let school2 = schools::ActiveModel::new("School B".into(), "school-b".into());
    let school2 = school2.insert(&boot.app_context.db).await.unwrap();

    school_memberships::ActiveModel::new(user.id, school1.id, "admin".into())
        .insert(&boot.app_context.db)
        .await
        .unwrap();
    school_memberships::ActiveModel::new(user.id, school2.id, "teacher".into())
        .insert(&boot.app_context.db)
        .await
        .unwrap();

    let results = schools::Model::find_schools_for_user(&boot.app_context.db, user.id)
        .await
        .unwrap();
    assert_eq!(results.len(), 2);
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend find_schools_for_user -- --nocapture`
Expected: FAIL — method does not exist.

- [ ] **Step 7: Implement `find_schools_for_user`**

Add to `backend/src/models/schools.rs` inside `impl Model`:

```rust
/// Find all schools where a given user has an active membership.
/// Returns Vec of (school, membership_role).
pub async fn find_schools_for_user(
    db: &DatabaseConnection,
    user_id: Uuid,
) -> Result<Vec<(Self, String)>, DbErr> {
    use crate::models::_entities::school_memberships;

    let memberships = school_memberships::Entity::find()
        .filter(school_memberships::Column::UserId.eq(user_id))
        .filter(school_memberships::Column::IsActive.eq(true))
        .find_also_related(Entity)
        .all(db)
        .await?;

    Ok(memberships
        .into_iter()
        .filter_map(|(membership, school)| {
            school.map(|s| (s, membership.role))
        })
        .collect())
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend find_schools_for_user -- --nocapture`
Expected: PASS

- [ ] **Step 9: Write failing test for `find_members_for_school`**

Add to `backend/tests/models/school_memberships.rs`:

```rust
use klassenzeit_backend::app::App;
use klassenzeit_backend::models::{app_users, school_memberships, schools};
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;

#[tokio::test]
#[serial]
async fn find_members_for_school_returns_all_active() {
    let boot = boot_test::<App>().await.unwrap();

    let school = schools::ActiveModel::new("Members School".into(), "members-school".into());
    let school = school.insert(&boot.app_context.db).await.unwrap();

    let user1 = app_users::ActiveModel::new("kc-m1".into(), "m1@example.com".into(), "User One".into());
    let user1 = user1.insert(&boot.app_context.db).await.unwrap();

    let user2 = app_users::ActiveModel::new("kc-m2".into(), "m2@example.com".into(), "User Two".into());
    let user2 = user2.insert(&boot.app_context.db).await.unwrap();

    school_memberships::ActiveModel::new(user1.id, school.id, "admin".into())
        .insert(&boot.app_context.db).await.unwrap();
    school_memberships::ActiveModel::new(user2.id, school.id, "teacher".into())
        .insert(&boot.app_context.db).await.unwrap();

    let members = school_memberships::Model::find_members_for_school(&boot.app_context.db, school.id)
        .await
        .unwrap();
    assert_eq!(members.len(), 2);
}
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend find_members_for_school -- --nocapture`
Expected: FAIL — method does not exist.

- [ ] **Step 11: Implement `find_members_for_school` and `count_admins`**

Add to `backend/src/models/school_memberships.rs` inside `impl Model`:

```rust
/// Find all active members of a school, joined with their user data.
pub async fn find_members_for_school(
    db: &DatabaseConnection,
    school_id: Uuid,
) -> Result<Vec<(Self, Option<crate::models::_entities::app_users::Model>)>, DbErr> {
    use crate::models::_entities::app_users;

    Entity::find()
        .filter(school_memberships::Column::SchoolId.eq(school_id))
        .filter(school_memberships::Column::IsActive.eq(true))
        .find_also_related(app_users::Entity)
        .all(db)
        .await
}

/// Count how many active admins a school has.
pub async fn count_admins(db: &DatabaseConnection, school_id: Uuid) -> Result<u64, DbErr> {
    Entity::find()
        .filter(school_memberships::Column::SchoolId.eq(school_id))
        .filter(school_memberships::Column::Role.eq("admin"))
        .filter(school_memberships::Column::IsActive.eq(true))
        .count(db)
        .await
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend find_members_for_school -- --nocapture`
Expected: PASS

- [ ] **Step 13: Add `Forbidden` variant to `AuthError`**

In `backend/src/keycloak/errors.rs`, add to the `AuthError` enum:

```rust
Forbidden(String),
```

And in the `IntoResponse` match:

```rust
Self::Forbidden(ref msg) => (StatusCode::FORBIDDEN, msg.as_str()),
```

- [ ] **Step 14: Run full test suite**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test --workspace`
Expected: All tests pass.

- [ ] **Step 15: Commit**

```bash
git add backend/src/models/schools.rs backend/src/models/school_memberships.rs backend/src/keycloak/errors.rs backend/tests/models/schools.rs backend/tests/models/school_memberships.rs
git commit -m "Add slug generation, model query helpers, and Forbidden error variant"
```

---

## Task 2: Backend — Schools CRUD controller

**Files:**
- Create: `backend/src/controllers/schools.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`
- Create: `backend/tests/requests/schools.rs`
- Modify: `backend/tests/requests/mod.rs`

- [ ] **Step 1: Write failing integration test for POST /api/schools**

Create `backend/tests/requests/schools.rs`:

```rust
use axum::http::{header, HeaderName, StatusCode};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{app_users, school_memberships, schools};
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, EntityTrait};
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
            .json(&serde_json::json!({ "name": "My Test School" }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "My Test School");
        assert_eq!(body["slug"], "my-test-school");
        assert_eq!(body["role"], "admin");

        // Verify membership was created
        let school_id = uuid::Uuid::parse_str(body["id"].as_str().unwrap()).unwrap();
        let user = app_users::Model::find_by_keycloak_id(&ctx.db, "kc-create-school")
            .await
            .unwrap()
            .unwrap();
        let membership =
            school_memberships::Model::find_active_membership(&ctx.db, user.id, school_id)
                .await
                .unwrap();
        assert!(membership.is_some());
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
```

Add to `backend/tests/requests/mod.rs`:

```rust
mod schools;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend --test mod create_school_returns_201 -- --nocapture`
Expected: FAIL — route does not exist (404).

- [ ] **Step 3: Implement schools controller with POST endpoint**

Create `backend/src/controllers/schools.rs`:

```rust
use axum::http::StatusCode;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, TransactionTrait};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::keycloak::extractors::{AuthUser, SchoolContext};
use crate::keycloak::errors::AuthError;
use crate::models::{school_memberships, schools};

#[derive(Debug, Deserialize)]
struct CreateSchoolRequest {
    name: String,
}

#[derive(Debug, Serialize)]
struct SchoolResponse {
    id: String,
    name: String,
    slug: String,
    role: String,
    created_at: String,
}

/// POST /api/schools — Create a new school. Any authenticated user can create one.
async fn create(auth: AuthUser, State(ctx): State<AppContext>, Json(body): Json<CreateSchoolRequest>) -> Result<Response> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(Error::BadRequest("name is required".into()));
    }

    let base_slug = schools::generate_slug(&name);
    let db = &ctx.db;

    // Find a unique slug
    let mut slug = base_slug.clone();
    let mut suffix = 2u32;
    while schools::Model::find_by_slug(db, &slug).await?.is_some() {
        slug = format!("{}-{}", base_slug, suffix);
        suffix += 1;
    }

    // Create school + admin membership in a transaction
    let txn = db.begin().await?;

    let school = schools::ActiveModel::new(name, slug);
    let school = school.insert(&txn).await?;

    let membership = school_memberships::ActiveModel::new(auth.user.id, school.id, "admin".into());
    membership.insert(&txn).await?;

    txn.commit().await?;

    let resp = SchoolResponse {
        id: school.id.to_string(),
        name: school.name,
        slug: school.slug,
        role: "admin".to_string(),
        created_at: school.created_at.to_rfc3339(),
    };

    format::json(resp).map(|r| (StatusCode::CREATED, r).into_response())
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools")
        .add("/", post(create))
}
```

Add to `backend/src/controllers/mod.rs`:

```rust
pub mod schools;
```

Register in `backend/src/app.rs` in the `routes()` method:

```rust
AppRoutes::with_default_routes()
    .add_route(controllers::auth::routes())
    .add_route(controllers::schools::routes())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend --test mod create_school_returns_201 -- --nocapture`
Expected: PASS

- [ ] **Step 5: Write failing test for GET /api/schools (list)**

Add to `backend/tests/requests/schools.rs`:

```rust
#[tokio::test]
#[serial]
async fn list_schools_returns_user_memberships() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Create user, two schools, memberships
        let user = app_users::ActiveModel::new("kc-list".into(), "list@example.com".into(), "Lister".into());
        let user = user.insert(&ctx.db).await.unwrap();

        let s1 = schools::ActiveModel::new("School One".into(), "school-one".into());
        let s1 = s1.insert(&ctx.db).await.unwrap();
        let s2 = schools::ActiveModel::new("School Two".into(), "school-two".into());
        let s2 = s2.insert(&ctx.db).await.unwrap();

        school_memberships::ActiveModel::new(user.id, s1.id, "admin".into())
            .insert(&ctx.db).await.unwrap();
        school_memberships::ActiveModel::new(user.id, s2.id, "teacher".into())
            .insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-list", "list@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get("/api/schools")
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .await;

        resp.assert_status_ok();
        let body: Vec<serde_json::Value> = resp.json();
        assert_eq!(body.len(), 2);
    })
    .await;
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend --test mod list_schools_returns_user -- --nocapture`
Expected: FAIL — 404 or method not allowed.

- [ ] **Step 7: Implement GET /api/schools**

Add to `backend/src/controllers/schools.rs`:

```rust
/// GET /api/schools — List schools the authenticated user belongs to.
async fn list(auth: AuthUser, State(ctx): State<AppContext>) -> Result<Response> {
    let schools = schools::Model::find_schools_for_user(&ctx.db, auth.user.id).await?;

    let resp: Vec<SchoolResponse> = schools
        .into_iter()
        .map(|(school, role)| SchoolResponse {
            id: school.id.to_string(),
            name: school.name,
            slug: school.slug,
            role,
            created_at: school.created_at.to_rfc3339(),
        })
        .collect();

    format::json(resp)
}
```

Add to `routes()`:

```rust
.add("/", get(list).post(create))
```

(Replace the existing `.add("/", post(create))` line.)

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend --test mod list_schools_returns_user -- --nocapture`
Expected: PASS

- [ ] **Step 9: Write failing tests for GET and PUT /api/schools/:id**

Add to `backend/tests/requests/schools.rs`:

```rust
#[tokio::test]
#[serial]
async fn get_school_returns_details() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let user = app_users::ActiveModel::new("kc-get-school".into(), "getschool@example.com".into(), "Getter".into());
        let user = user.insert(&ctx.db).await.unwrap();
        let school = schools::ActiveModel::new("Get School".into(), "get-school".into());
        let school = school.insert(&ctx.db).await.unwrap();
        school_memberships::ActiveModel::new(user.id, school.id, "teacher".into())
            .insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-get-school", "getschool@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get(&format!("/api/schools/{}", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "Get School");
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

        let user = app_users::ActiveModel::new("kc-update-noadmin".into(), "noadmin@example.com".into(), "NoAdmin".into());
        let user = user.insert(&ctx.db).await.unwrap();
        let school = schools::ActiveModel::new("Update School".into(), "update-school".into());
        let school = school.insert(&ctx.db).await.unwrap();
        school_memberships::ActiveModel::new(user.id, school.id, "teacher".into())
            .insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-update-noadmin", "noadmin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .put(&format!("/api/schools/{}", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "name": "New Name" }))
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

        let user = app_users::ActiveModel::new("kc-update-admin".into(), "admin@example.com".into(), "Admin".into());
        let user = user.insert(&ctx.db).await.unwrap();
        let school = schools::ActiveModel::new("Old Name".into(), "old-name".into());
        let school = school.insert(&ctx.db).await.unwrap();
        school_memberships::ActiveModel::new(user.id, school.id, "admin".into())
            .insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-update-admin", "admin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .put(&format!("/api/schools/{}", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "name": "New Name" }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["name"], "New Name");
        assert_eq!(body["slug"], "new-name");
    })
    .await;
}
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend --test mod get_school_returns update_school -- --nocapture`
Expected: FAIL — routes don't exist.

- [ ] **Step 11: Implement GET and PUT /api/schools/:id**

Add to `backend/src/controllers/schools.rs`:

```rust
use axum::extract::Path;
use sea_orm::Set;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct UpdateSchoolRequest {
    name: Option<String>,
}

fn require_admin(ctx: &SchoolContext) -> std::result::Result<(), AuthError> {
    if ctx.role != "admin" {
        return Err(AuthError::Forbidden("admin role required".into()));
    }
    Ok(())
}

/// GET /api/schools/:id — Get school details (any member).
async fn get_one(ctx: SchoolContext) -> Result<Response> {
    let resp = SchoolResponse {
        id: ctx.school.id.to_string(),
        name: ctx.school.name.clone(),
        slug: ctx.school.slug.clone(),
        role: ctx.role.clone(),
        created_at: ctx.school.created_at.to_rfc3339(),
    };
    format::json(resp)
}

/// PUT /api/schools/:id — Update school (admin only).
async fn update(
    ctx: SchoolContext,
    State(app_ctx): State<AppContext>,
    Json(body): Json<UpdateSchoolRequest>,
) -> Result<Response> {
    require_admin(&ctx).map_err(|e| Error::Unauthorized(e.to_string()))?;

    let db = &app_ctx.db;
    let mut school: schools::ActiveModel = ctx.school.into();

    if let Some(name) = body.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(Error::BadRequest("name cannot be empty".into()));
        }
        let base_slug = schools::generate_slug(&name);
        let mut slug = base_slug.clone();
        let mut suffix = 2u32;
        while let Some(existing) = schools::Model::find_by_slug(db, &slug).await? {
            // If the slug belongs to this school already, it's fine
            if existing.id == school.id.clone().unwrap() {
                break;
            }
            slug = format!("{}-{}", base_slug, suffix);
            suffix += 1;
        }
        school.name = Set(name);
        school.slug = Set(slug);
    }

    school.updated_at = Set(chrono::Utc::now().into());
    let updated = school.update(db).await?;

    let resp = SchoolResponse {
        id: updated.id.to_string(),
        name: updated.name,
        slug: updated.slug,
        role: ctx.role,
        created_at: updated.created_at.to_rfc3339(),
    };
    format::json(resp)
}
```

Update `routes()`:

```rust
pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools")
        .add("/", get(list).post(create))
        .add("/:id", get(get_one).put(update))
}
```

- [ ] **Step 12: Run all schools tests**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend --test mod schools -- --nocapture`
Expected: All pass.

- [ ] **Step 13: Commit**

```bash
git add backend/src/controllers/schools.rs backend/src/controllers/mod.rs backend/src/app.rs backend/tests/requests/schools.rs backend/tests/requests/mod.rs
git commit -m "Add schools CRUD controller with create, list, get, update endpoints"
```

---

## Task 3: Backend — Members CRUD controller

**Files:**
- Create: `backend/src/controllers/members.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`
- Create: `backend/tests/requests/members.rs`
- Modify: `backend/tests/requests/mod.rs`

- [ ] **Step 1: Write failing tests for members endpoints**

Create `backend/tests/requests/members.rs`:

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

/// Helper: create a user, school, and admin membership. Returns (user, school).
async fn setup_admin(
    db: &sea_orm::DatabaseConnection,
    kc_id: &str,
    email: &str,
) -> (app_users::Model, schools::Model) {
    let user = app_users::ActiveModel::new(kc_id.into(), email.into(), "Admin".into());
    let user = user.insert(db).await.unwrap();
    let school = schools::ActiveModel::new("Test School".into(), format!("test-school-{}", kc_id));
    let school = school.insert(db).await.unwrap();
    school_memberships::ActiveModel::new(user.id, school.id, "admin".into())
        .insert(db).await.unwrap();
    (user, school)
}

#[tokio::test]
#[serial]
async fn list_members_returns_school_members() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (admin, school) = setup_admin(&ctx.db, "kc-list-members", "listmembers@example.com").await;

        // Add another member
        let user2 = app_users::ActiveModel::new("kc-member2".into(), "member2@example.com".into(), "Member Two".into());
        let user2 = user2.insert(&ctx.db).await.unwrap();
        school_memberships::ActiveModel::new(user2.id, school.id, "teacher".into())
            .insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-list-members", "listmembers@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .get(&format!("/api/schools/{}/members", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status_ok();
        let body: Vec<serde_json::Value> = resp.json();
        assert_eq!(body.len(), 2);
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

        let user = app_users::ActiveModel::new("kc-add-noadmin".into(), "addnoadmin@example.com".into(), "NoAdmin".into());
        let user = user.insert(&ctx.db).await.unwrap();
        let school = schools::ActiveModel::new("No Admin School".into(), "no-admin-school".into());
        let school = school.insert(&ctx.db).await.unwrap();
        school_memberships::ActiveModel::new(user.id, school.id, "teacher".into())
            .insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-add-noadmin", "addnoadmin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .post(&format!("/api/schools/{}/members", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "email": "new@example.com", "role": "teacher" }))
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

        let (admin, school) = setup_admin(&ctx.db, "kc-add-admin", "addadmin@example.com").await;

        // The user to be added must exist in the system
        let new_user = app_users::ActiveModel::new("kc-newmember".into(), "newmember@example.com".into(), "New Member".into());
        new_user.insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-add-admin", "addadmin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .post(&format!("/api/schools/{}/members", school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "email": "newmember@example.com", "role": "teacher" }))
            .await;

        resp.assert_status(StatusCode::CREATED);
        let body: serde_json::Value = resp.json();
        assert_eq!(body["email"], "newmember@example.com");
        assert_eq!(body["role"], "teacher");
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

        let (admin, school) = setup_admin(&ctx.db, "kc-role-admin", "roleadmin@example.com").await;

        let member = app_users::ActiveModel::new("kc-role-target".into(), "roletarget@example.com".into(), "Target".into());
        let member = member.insert(&ctx.db).await.unwrap();
        school_memberships::ActiveModel::new(member.id, school.id, "teacher".into())
            .insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-role-admin", "roleadmin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .put(&format!("/api/schools/{}/members/{}", school.id, member.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .json(&serde_json::json!({ "role": "viewer" }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["role"], "viewer");
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

        let (admin, school) = setup_admin(&ctx.db, "kc-last-admin", "lastadmin@example.com").await;

        let claims = valid_claims("kc-last-admin", "lastadmin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .delete(&format!("/api/schools/{}/members/{}", school.id, admin.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
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

        let (admin, school) = setup_admin(&ctx.db, "kc-remove-admin", "removeadmin@example.com").await;

        let member = app_users::ActiveModel::new("kc-removable".into(), "removable@example.com".into(), "Removable".into());
        let member = member.insert(&ctx.db).await.unwrap();
        school_memberships::ActiveModel::new(member.id, school.id, "teacher".into())
            .insert(&ctx.db).await.unwrap();

        let claims = valid_claims("kc-remove-admin", "removeadmin@example.com");
        let token = kp.create_token(&claims);

        let resp = server
            .delete(&format!("/api/schools/{}/members/{}", school.id, member.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(HeaderName::from_static("x-school-id"), school.id.to_string())
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);
    })
    .await;
}
```

Add to `backend/tests/requests/mod.rs`:

```rust
mod members;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend --test mod members -- --nocapture`
Expected: FAIL — routes don't exist.

- [ ] **Step 3: Implement members controller**

Create `backend/src/controllers/members.rs`:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use loco_rs::prelude::*;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::keycloak::errors::AuthError;
use crate::keycloak::extractors::SchoolContext;
use crate::models::{app_users, school_memberships};

#[derive(Debug, Serialize)]
struct MemberResponse {
    user_id: String,
    email: String,
    display_name: String,
    role: String,
    is_active: bool,
    joined_at: String,
}

#[derive(Debug, Deserialize)]
struct AddMemberRequest {
    email: String,
    role: String,
}

#[derive(Debug, Deserialize)]
struct UpdateMemberRoleRequest {
    role: String,
}

const VALID_ROLES: &[&str] = &["admin", "teacher", "viewer"];

fn require_admin(ctx: &SchoolContext) -> std::result::Result<(), AuthError> {
    if ctx.role != "admin" {
        return Err(AuthError::Forbidden("admin role required".into()));
    }
    Ok(())
}

fn validate_role(role: &str) -> Result<()> {
    if !VALID_ROLES.contains(&role) {
        return Err(Error::BadRequest(format!(
            "role must be one of: {}",
            VALID_ROLES.join(", ")
        )));
    }
    Ok(())
}

/// GET /api/schools/:id/members — List all active members.
async fn list(ctx: SchoolContext) -> Result<Response> {
    let members =
        school_memberships::Model::find_members_for_school(&ctx.db_context, ctx.school.id).await?;

    let resp: Vec<MemberResponse> = members
        .into_iter()
        .filter_map(|(membership, user)| {
            let user = user?;
            Some(MemberResponse {
                user_id: user.id.to_string(),
                email: user.email,
                display_name: user.display_name,
                role: membership.role,
                is_active: membership.is_active,
                joined_at: membership.created_at.to_rfc3339(),
            })
        })
        .collect();

    format::json(resp)
}

/// POST /api/schools/:id/members — Add a member by email (admin only).
async fn add(
    ctx: SchoolContext,
    State(app_ctx): State<AppContext>,
    Json(body): Json<AddMemberRequest>,
) -> Result<Response> {
    require_admin(&ctx).map_err(|e| Error::Unauthorized(e.to_string()))?;
    validate_role(&body.role)?;

    let db = &app_ctx.db;
    let target_user = app_users::Model::find_by_email(db, &body.email)
        .await?
        .ok_or_else(|| Error::NotFound)?;

    // Check if already a member
    let existing =
        school_memberships::Model::find_active_membership(db, target_user.id, ctx.school.id)
            .await?;
    if existing.is_some() {
        return Err(Error::BadRequest("user is already a member of this school".into()));
    }

    let membership =
        school_memberships::ActiveModel::new(target_user.id, ctx.school.id, body.role);
    let membership = membership.insert(db).await?;

    let resp = MemberResponse {
        user_id: target_user.id.to_string(),
        email: target_user.email,
        display_name: target_user.display_name,
        role: membership.role,
        is_active: membership.is_active,
        joined_at: membership.created_at.to_rfc3339(),
    };

    format::json(resp).map(|r| (StatusCode::CREATED, r).into_response())
}

/// PUT /api/schools/:id/members/:user_id — Change a member's role (admin only).
async fn update_role(
    ctx: SchoolContext,
    State(app_ctx): State<AppContext>,
    Path((_school_id, user_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateMemberRoleRequest>,
) -> Result<Response> {
    require_admin(&ctx).map_err(|e| Error::Unauthorized(e.to_string()))?;
    validate_role(&body.role)?;

    let db = &app_ctx.db;

    let membership =
        school_memberships::Model::find_active_membership(db, user_id, ctx.school.id)
            .await?
            .ok_or_else(|| Error::NotFound)?;

    // If demoting from admin, check we're not removing the last admin
    if membership.role == "admin" && body.role != "admin" {
        let admin_count =
            school_memberships::Model::count_admins(db, ctx.school.id).await?;
        if admin_count <= 1 {
            return Err(Error::Unauthorized("cannot remove the last admin".into()));
        }
    }

    let mut active: school_memberships::ActiveModel = membership.into();
    active.role = Set(body.role);
    active.updated_at = Set(chrono::Utc::now().into());
    let updated = active.update(db).await?;

    let user = app_users::Entity::find_by_id(user_id)
        .one(db)
        .await?
        .ok_or_else(|| Error::NotFound)?;

    let resp = MemberResponse {
        user_id: user.id.to_string(),
        email: user.email,
        display_name: user.display_name,
        role: updated.role,
        is_active: updated.is_active,
        joined_at: updated.created_at.to_rfc3339(),
    };

    format::json(resp)
}

/// DELETE /api/schools/:id/members/:user_id — Remove a member (admin only).
async fn remove(
    ctx: SchoolContext,
    State(app_ctx): State<AppContext>,
    Path((_school_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<Response> {
    require_admin(&ctx).map_err(|e| Error::Unauthorized(e.to_string()))?;

    let db = &app_ctx.db;

    let membership =
        school_memberships::Model::find_active_membership(db, user_id, ctx.school.id)
            .await?
            .ok_or_else(|| Error::NotFound)?;

    // Prevent removing the last admin
    if membership.role == "admin" {
        let admin_count =
            school_memberships::Model::count_admins(db, ctx.school.id).await?;
        if admin_count <= 1 {
            return Err(Error::Unauthorized("cannot remove the last admin".into()));
        }
    }

    let mut active: school_memberships::ActiveModel = membership.into();
    active.is_active = Set(false);
    active.updated_at = Set(chrono::Utc::now().into());
    active.update(db).await?;

    Ok(StatusCode::NO_CONTENT.into_response())
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/:id/members")
        .add("/", get(list).post(add))
        .add("/:user_id", put(update_role).delete(remove))
}
```

Add to `backend/src/controllers/mod.rs`:

```rust
pub mod members;
```

Register in `backend/src/app.rs`:

```rust
AppRoutes::with_default_routes()
    .add_route(controllers::auth::routes())
    .add_route(controllers::schools::routes())
    .add_route(controllers::members::routes())
```

**Important:** The members controller accesses `ctx.db` via the `SchoolContext`. However, `SchoolContext` doesn't currently expose the db connection. The controller needs `State(app_ctx): State<AppContext>` alongside `SchoolContext` to access `app_ctx.db`. Update the `list` handler to use `State(app_ctx): State<AppContext>` and `app_ctx.db` instead of `ctx.db_context`.

- [ ] **Step 4: Fix compilation errors and run tests**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test -p klassenzeit-backend --test mod members -- --nocapture`

Fix any compilation issues — the most likely ones:
- `SchoolContext` doesn't have a `db_context` field — use `State(app_ctx)` extractor alongside it
- Import paths that need adjustment
- Loco `Error` variants may differ — check what `Error::NotFound` looks like

Expected after fixes: All member tests pass.

- [ ] **Step 5: Run full backend test suite**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test --workspace`
Expected: All tests pass (auth, schools, members, models).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/members.rs backend/src/controllers/mod.rs backend/src/app.rs backend/tests/requests/members.rs backend/tests/requests/mod.rs
git commit -m "Add members CRUD controller with list, add, role change, remove endpoints"
```

---

## Task 4: Frontend — shadcn/ui setup and theme

**Files:**
- Create: `frontend/components.json`
- Create: `frontend/src/lib/utils.ts`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install shadcn/ui dependencies**

Run from `frontend/` directory:

```bash
cd /home/pascal/Code/Klassenzeit/frontend && bun add next-themes class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 2: Create components.json**

Create `frontend/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {}
}
```

- [ ] **Step 3: Create cn() utility**

Create `frontend/src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Replace globals.css with website theme**

Replace `frontend/src/app/globals.css` with the full OKLch theme from the website (`/home/pascal/Code/website/app/globals.css`), but remove the Wordle-specific CSS (wordle-correct, wordle-present, animate-shake). Keep all shadcn/ui CSS variables, shadows, tracking, radius, fonts, and the `@theme inline` block.

- [ ] **Step 5: Update layout.tsx for theme and fonts**

Replace `frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Quicksand, Lora } from "next/font/google";
import "./globals.css";
import { KeycloakProvider } from "@/providers/keycloak-provider";
import { ThemeProvider } from "next-themes";

const quicksand = Quicksand({
  variable: "--font-sans",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Klassenzeit",
  description: "Klassenzeit - Stundenplanverwaltung",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${quicksand.variable} ${lora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <KeycloakProvider>{children}</KeycloakProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Add shadcn/ui components needed for this step**

Run from `frontend/` directory:

```bash
cd /home/pascal/Code/Klassenzeit/frontend && bunx --bun shadcn@latest add button card input label table dialog select sonner dropdown-menu sidebar
```

If the CLI prompts, accept defaults.

- [ ] **Step 7: Add Toaster to layout**

In `frontend/src/app/layout.tsx`, add the Sonner toaster inside the `ThemeProvider`:

```tsx
import { Toaster } from "@/components/ui/sonner";

// Inside ThemeProvider, after KeycloakProvider:
<Toaster />
```

- [ ] **Step 8: Verify build**

Run: `cd /home/pascal/Code/Klassenzeit/frontend && bun run build`
Expected: Build succeeds without errors.

- [ ] **Step 9: Commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/components.json frontend/src/lib/utils.ts frontend/src/app/globals.css frontend/src/app/layout.tsx frontend/package.json frontend/bun.lock frontend/src/components/
git commit -m "Set up shadcn/ui with OKLch theme from website, Quicksand/Lora fonts"
```

---

## Task 5: Frontend — useApiClient hook and school context

**Files:**
- Create: `frontend/src/hooks/use-api-client.ts`
- Create: `frontend/src/providers/school-provider.tsx`
- Create: `frontend/src/hooks/use-school.ts`
- Create: `frontend/src/lib/types.ts`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Create shared API response types**

Create `frontend/src/lib/types.ts`:

```typescript
export interface SchoolResponse {
  id: string;
  name: string;
  slug: string;
  role: string;
  created_at: string;
}

export interface MemberResponse {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}
```

- [ ] **Step 2: Create useApiClient hook**

Create `frontend/src/hooks/use-api-client.ts`:

```typescript
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSchool } from "@/hooks/use-school";
import { type ApiClient, createApiClient } from "@/lib/api-client";

export function useApiClient(): ApiClient {
  const { token } = useAuth();
  const { selectedSchoolId } = useSchool();

  return useMemo(
    () =>
      createApiClient(
        () => token,
        () => selectedSchoolId,
      ),
    [token, selectedSchoolId],
  );
}
```

- [ ] **Step 3: Create school context provider**

Create `frontend/src/providers/school-provider.tsx`:

```typescript
"use client";

import { createContext, useCallback, useState } from "react";

export interface SchoolContextValue {
  selectedSchoolId: string | null;
  selectSchool: (id: string | null) => void;
}

export const SchoolContext = createContext<SchoolContextValue>({
  selectedSchoolId: null,
  selectSchool: () => {},
});

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

  const selectSchool = useCallback((id: string | null) => {
    setSelectedSchoolId(id);
  }, []);

  return (
    <SchoolContext value={{ selectedSchoolId, selectSchool }}>
      {children}
    </SchoolContext>
  );
}
```

- [ ] **Step 4: Create useSchool hook**

Create `frontend/src/hooks/use-school.ts`:

```typescript
import { use } from "react";
import { type SchoolContextValue, SchoolContext } from "@/providers/school-provider";

export function useSchool(): SchoolContextValue {
  return use(SchoolContext);
}
```

- [ ] **Step 5: Wire SchoolProvider into layout and update redirect**

In `frontend/src/app/layout.tsx`, add `SchoolProvider` wrapping around `KeycloakProvider`:

```tsx
import { SchoolProvider } from "@/providers/school-provider";

// Inside the return, wrap KeycloakProvider with SchoolProvider:
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <SchoolProvider>
    <KeycloakProvider>{children}</KeycloakProvider>
  </SchoolProvider>
</ThemeProvider>
```

Update `frontend/src/app/page.tsx` to redirect to `/schools`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/schools");
}
```

- [ ] **Step 6: Verify build**

Run: `cd /home/pascal/Code/Klassenzeit/frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/src/hooks/use-api-client.ts frontend/src/providers/school-provider.tsx frontend/src/hooks/use-school.ts frontend/src/lib/types.ts frontend/src/app/page.tsx frontend/src/app/layout.tsx
git commit -m "Add useApiClient hook, school context provider, and shared API types"
```

---

## Task 6: Frontend — Schools list page

**Files:**
- Create: `frontend/src/app/schools/page.tsx`

- [ ] **Step 1: Create the schools list page**

Create `frontend/src/app/schools/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useApiClient } from "@/hooks/use-api-client";
import { useSchool } from "@/hooks/use-school";
import type { SchoolResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, School, LogOut } from "lucide-react";

export default function SchoolsPage() {
  const { user, logout } = useAuth();
  const client = useApiClient();
  const router = useRouter();
  const { selectSchool } = useSchool();
  const [schools, setSchools] = useState<SchoolResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchSchools = useCallback(async () => {
    try {
      const data = await client.get<SchoolResponse[]>("/api/schools");
      setSchools(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schools");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  const handleCreate = async () => {
    if (!newSchoolName.trim()) return;
    setCreating(true);
    try {
      const school = await client.post<SchoolResponse>("/api/schools", {
        name: newSchoolName.trim(),
      });
      setCreateOpen(false);
      setNewSchoolName("");
      selectSchool(school.id);
      router.push(`/schools/${school.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create school");
    } finally {
      setCreating(false);
    }
  };

  const handleSelectSchool = (school: SchoolResponse) => {
    selectSchool(school.id);
    router.push(`/schools/${school.id}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading schools...</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Schools</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, {user?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create School
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new school</DialogTitle>
                <DialogDescription>
                  You'll be the admin of this school.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">School name</Label>
                  <Input
                    id="name"
                    value={newSchoolName}
                    onChange={(e) => setNewSchoolName(e.target.value)}
                    placeholder="e.g. Grundschule am Park"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={creating || !newSchoolName.trim()}>
                  {creating ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="icon" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      )}

      {schools.length === 0 && !error && (
        <div className="mt-12 text-center">
          <School className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">No schools yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first school to get started.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-4">
        {schools.map((school) => (
          <Card
            key={school.id}
            className="cursor-pointer transition-colors hover:bg-accent/50"
            onClick={() => handleSelectSchool(school)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{school.name}</CardTitle>
                <span className="text-xs font-medium text-muted-foreground capitalize">
                  {school.role}
                </span>
              </div>
              <CardDescription>/{school.slug}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /home/pascal/Code/Klassenzeit/frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/src/app/schools/page.tsx
git commit -m "Add schools list page with create school dialog"
```

---

## Task 7: Frontend — School dashboard and sidebar layout

**Files:**
- Create: `frontend/src/app/schools/[id]/layout.tsx`
- Create: `frontend/src/app/schools/[id]/page.tsx`

- [ ] **Step 1: Create the school layout with sidebar**

Create `frontend/src/app/schools/[id]/layout.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSchool } from "@/hooks/use-school";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, ArrowLeft, LogOut } from "lucide-react";
import Link from "next/link";

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();
  const { selectSchool } = useSchool();
  const schoolId = params.id as string;

  useEffect(() => {
    selectSchool(schoolId);
  }, [schoolId, selectSchool]);

  const navItems = [
    {
      title: "Dashboard",
      href: `/schools/${schoolId}`,
      icon: LayoutDashboard,
    },
    {
      title: "Members",
      href: `/schools/${schoolId}/members`,
      icon: Users,
    },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link
            href="/schools"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All Schools
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 2: Create the school dashboard page**

Create `frontend/src/app/schools/[id]/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useApiClient } from "@/hooks/use-api-client";
import type { SchoolResponse } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";

export default function SchoolDashboardPage() {
  const params = useParams();
  const schoolId = params.id as string;
  const client = useApiClient();
  const [school, setSchool] = useState<SchoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchSchool = useCallback(async () => {
    try {
      const data = await client.get<SchoolResponse>(`/api/schools/${schoolId}`);
      setSchool(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load school");
    } finally {
      setLoading(false);
    }
  }, [client, schoolId]);

  useEffect(() => {
    fetchSchool();
  }, [fetchSchool]);

  const handleEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const updated = await client.put<SchoolResponse>(`/api/schools/${schoolId}`, {
        name: editName.trim(),
      });
      setSchool(updated);
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update school");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!school) return null;

  const isAdmin = school.role === "admin";

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{school.name}</h1>
          <p className="text-sm text-muted-foreground">/{school.slug}</p>
        </div>
        {isAdmin && (
          <Dialog open={editOpen} onOpenChange={(open) => {
            setEditOpen(open);
            if (open) setEditName(school.name);
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit school</DialogTitle>
                <DialogDescription>
                  Update the school name. The slug will be regenerated.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">School name</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEdit();
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleEdit} disabled={saving || !editName.trim()}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>School Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{school.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Slug</dt>
                <dd className="font-mono text-xs">{school.slug}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Your Role</dt>
                <dd className="font-medium capitalize">{school.role}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{new Date(school.created_at).toLocaleDateString("de-DE")}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd /home/pascal/Code/Klassenzeit/frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/src/app/schools/\[id\]/layout.tsx frontend/src/app/schools/\[id\]/page.tsx
git commit -m "Add school dashboard page with sidebar layout and edit dialog"
```

---

## Task 8: Frontend — Members management page

**Files:**
- Create: `frontend/src/app/schools/[id]/members/page.tsx`

- [ ] **Step 1: Create the members page**

Create `frontend/src/app/schools/[id]/members/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useApiClient } from "@/hooks/use-api-client";
import type { MemberResponse, SchoolResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, UserPlus } from "lucide-react";

const ROLES = ["admin", "teacher", "viewer"] as const;

export default function MembersPage() {
  const params = useParams();
  const schoolId = params.id as string;
  const client = useApiClient();

  const [school, setSchool] = useState<SchoolResponse | null>(null);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add member dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("teacher");
  const [adding, setAdding] = useState(false);

  // Remove confirmation
  const [removeTarget, setRemoveTarget] = useState<MemberResponse | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [schoolData, memberData] = await Promise.all([
        client.get<SchoolResponse>(`/api/schools/${schoolId}`),
        client.get<MemberResponse[]>(`/api/schools/${schoolId}/members`),
      ]);
      setSchool(schoolData);
      setMembers(memberData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [client, schoolId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isAdmin = school?.role === "admin";

  const handleAddMember = async () => {
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      await client.post(`/api/schools/${schoolId}/members`, {
        email: newEmail.trim(),
        role: newRole,
      });
      setAddOpen(false);
      setNewEmail("");
      setNewRole("teacher");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await client.put(`/api/schools/${schoolId}/members/${userId}`, { role });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change role");
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await client.delete(`/api/schools/${schoolId}/members/${removeTarget.user_id}`);
      setRemoveTarget(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <main className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Members</h1>
          <p className="text-sm text-muted-foreground">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a member</DialogTitle>
                <DialogDescription>
                  The user must already have a Klassenzeit account.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="teacher@example.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddMember} disabled={adding || !newEmail.trim()}>
                  {adding ? "Adding..." : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      )}

      <div className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {isAdmin && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.user_id}>
                <TableCell className="font-medium">
                  {member.display_name}
                </TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Select
                      value={member.role}
                      onValueChange={(role) =>
                        handleRoleChange(member.user_id, role)
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="capitalize">{member.role}</span>
                  )}
                </TableCell>
                <TableCell>
                  {new Date(member.joined_at).toLocaleDateString("de-DE")}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRemoveTarget(member)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Remove confirmation dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {removeTarget?.display_name} ({removeTarget?.email}) from this school?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /home/pascal/Code/Klassenzeit/frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add frontend/src/app/schools/\[id\]/members/page.tsx
git commit -m "Add members management page with add, role change, and remove"
```

---

## Task 9: Frontend — Clean up old dashboard and run checks

**Files:**
- Delete: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Remove old dashboard page**

Delete `frontend/src/app/dashboard/page.tsx` — it's replaced by the schools pages.

- [ ] **Step 2: Run linter and type checks**

```bash
cd /home/pascal/Code/Klassenzeit/frontend && bun run check && bun run typecheck
```

Fix any issues found. Common ones:
- Biome formatting (run `bun run check:fix`)
- Unused imports
- Type errors from shadcn/ui components

- [ ] **Step 3: Run frontend tests**

```bash
cd /home/pascal/Code/Klassenzeit/frontend && bun test
```

Fix any broken tests — existing dashboard tests may reference the removed page.

- [ ] **Step 4: Run full build**

```bash
cd /home/pascal/Code/Klassenzeit/frontend && bun run build
```

Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
cd /home/pascal/Code/Klassenzeit
git add -A frontend/
git commit -m "Remove old dashboard, fix linting and type errors"
```

---

## Task 10: Full integration test — run everything together

- [ ] **Step 1: Run full backend test suite**

```bash
cd /home/pascal/Code/Klassenzeit && cargo test --workspace
```

Expected: All tests pass.

- [ ] **Step 2: Run full frontend checks**

```bash
cd /home/pascal/Code/Klassenzeit/frontend && bun run check && bun run typecheck && bun test && bun run build
```

Expected: All pass.

- [ ] **Step 3: Verify the backend serves the new routes**

```bash
cd /home/pascal/Code/Klassenzeit && cargo run -p klassenzeit-backend -- routes
```

Verify output includes:
- `POST /api/schools`
- `GET /api/schools`
- `GET /api/schools/:id`
- `PUT /api/schools/:id`
- `GET /api/schools/:id/members`
- `POST /api/schools/:id/members`
- `PUT /api/schools/:id/members/:user_id`
- `DELETE /api/schools/:id/members/:user_id`

- [ ] **Step 4: Commit any remaining fixes**

If any fixes were needed, commit them:

```bash
git add -A && git commit -m "Fix integration issues from full test run"
```
