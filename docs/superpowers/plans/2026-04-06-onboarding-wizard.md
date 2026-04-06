# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dismissible/resumable onboarding wizard for first-time school admins, plus a "load example data" backend endpoint and a dashboard checklist that resumes setup.

**Architecture:** Pure-frontend wizard built around the existing settings tab components. State derives from entity counts via a single hook. One new backend endpoint loads canonical example data into an empty school in a transaction. Zero schema changes.

**Tech Stack:** Rust/Loco/SeaORM (backend), Next.js/React/next-intl/Tailwind (frontend), TypeScript, Bun for frontend tests.

**Spec:** `docs/superpowers/specs/2026-04-06-onboarding-wizard-design.md`

---

## File Map

### Backend (new)
- `backend/src/services/example_data.rs` — `load_example_school_data(txn, school_id)` builds the canonical example dataset.
- `backend/src/controllers/example_data.rs` — `POST /api/schools/{school_id}/load-example` handler (admin-gated, refuses non-empty schools, runs in a transaction).
- `backend/tests/requests/example_data.rs` — integration tests.

### Backend (modified)
- `backend/src/services/mod.rs` — declare `pub mod example_data;`.
- `backend/src/controllers/mod.rs` — declare `pub mod example_data;`.
- `backend/src/app.rs` — register `controllers::example_data::routes()`.
- `backend/tests/requests/mod.rs` — declare `mod example_data;`.

### Frontend (new)
- `frontend/src/hooks/use-onboarding-progress.ts` — fetches counts and derives step state.
- `frontend/src/hooks/use-onboarding-progress.test.ts`
- `frontend/src/components/onboarding/wizard-steps.tsx` — ordered step registry (id, titleKey, descKey, TabComponent, deepLinkHref).
- `frontend/src/components/onboarding/wizard-shell.tsx` — header, progress, footer (Back/Skip/Next/Finish).
- `frontend/src/components/onboarding/wizard-dialog.tsx` — `<Dialog>` wrapper, owns step index.
- `frontend/src/components/onboarding/wizard-dialog.test.tsx`
- `frontend/src/components/onboarding/checklist-card.tsx` — dashboard card with check icons + Resume button.
- `frontend/src/components/onboarding/checklist-card.test.tsx`
- `frontend/src/components/onboarding/load-example-button.tsx` — POSTs `/load-example`, toasts, refetches.
- `frontend/src/components/onboarding/load-example-button.test.tsx`

### Frontend (modified)
- `frontend/src/app/[locale]/schools/[id]/page.tsx` — auto-launch effect + render `<OnboardingChecklist>`.
- `frontend/src/messages/en.json` — add `onboarding` namespace.
- `frontend/src/messages/de.json` — add `onboarding` namespace.

---

## Conventions

- **TDD:** for every code-producing task, the failing test step comes first.
- **Commit cadence:** one commit per task (or per logical sub-step if a task is large). Commit messages follow the existing repo style: `feat:`, `test:`, `chore:`. **Do not** add AI co-author lines.
- **Backend test runs:** `cargo test --workspace` is incomplete — integration tests need `just backend-test` (which runs `just test-db-setup` first).
- **Frontend test runs:** `cd frontend && bun test <path>` for component tests, `bun test` for the full suite.
- **Lint gate:** before each commit, `just check` runs cargo fmt + clippy + biome + tsc. The pre-commit hook also runs these — do not bypass.
- **i18n:** every new user-visible string MUST exist in both `en.json` and `de.json` under the `onboarding` namespace.

---

## Task 1 — Backend: example_data service module

**Goal:** Pure function that, given a `&DatabaseTransaction` and a `school_id: Uuid`, populates the school with the canonical example dataset (mirror of `docker/seeds/dev-seed.sql`, but UUIDs generated fresh and `school_id` injected).

**Files:**
- Create: `backend/src/services/example_data.rs`
- Modify: `backend/src/services/mod.rs`

**Reference for content:** `docker/seeds/dev-seed.sql` is the canonical example data. The Rust function must produce **the same content**: 1 school year (`2025/2026`), 2 terms (1./2. Halbjahr), 8 teachers, 8 subjects, 6 rooms, 4 classes, 30 timeslots (5 days × 6 periods), 16 teacher-subject qualifications, 24 teacher availability blocks (Becker on Thu/Fri, Klein on Mon/Tue — `term_id = NULL`), 2 room-subject suitabilities (Turnhalle→Sport, Musikraum→Musik), 30 curriculum entries (1. Halbjahr only). All `created_at`/`updated_at` use `chrono::Utc::now()`.

For each insert, use `<entity>::ActiveModel { … }.insert(txn).await?` from the existing SeaORM models in `backend/src/models/_entities/`.

- [ ] **Step 1: Read and re-confirm the seed contents**

```bash
cat docker/seeds/dev-seed.sql | head -270
```

Read the entire SQL file. Note all values that need to be ported. Note especially that:
- `terms.is_current = TRUE` for `1. Halbjahr`, `FALSE` for `2. Halbjahr`.
- `school_classes.class_teacher_id` references the class teacher.
- `teacher_availabilities.term_id` is `NULL` (these are default availabilities, not per-term overrides).
- `curriculum_entries` only exist for the `1. Halbjahr` term.
- The columns on each model are visible in `backend/src/models/_entities/<entity>.rs`.

- [ ] **Step 2: Create the service module skeleton**

Create `backend/src/services/example_data.rs`:

```rust
//! Builds the canonical example dataset for a school.
//!
//! Mirrors `docker/seeds/dev-seed.sql` but generates fresh UUIDs and accepts an
//! arbitrary `school_id`, so it can be invoked at runtime by the onboarding wizard.

use chrono::{NaiveDate, NaiveTime, Utc};
use loco_rs::Result;
use sea_orm::{ActiveModelTrait, DatabaseTransaction, Set};
use uuid::Uuid;

use crate::models::_entities::{
    curriculum_entries, room_subject_suitabilities, rooms, school_classes, school_years, subjects,
    teacher_availabilities, teacher_subject_qualifications, teachers, terms, time_slots,
};

/// Populate the given (assumed-empty) school with the canonical example dataset.
///
/// All inserts run in the supplied transaction. Caller is responsible for
/// committing or rolling back.
pub async fn load_example_school_data(
    txn: &DatabaseTransaction,
    school_id: Uuid,
) -> Result<()> {
    let now = Utc::now();

    // ── School Year ─────────────────────────────────────────────────────────
    let school_year_id = Uuid::new_v4();
    school_years::ActiveModel {
        id: Set(school_year_id),
        school_id: Set(school_id),
        name: Set("2025/2026".to_string()),
        start_date: Set(NaiveDate::from_ymd_opt(2025, 8, 1).unwrap()),
        end_date: Set(NaiveDate::from_ymd_opt(2026, 7, 31).unwrap()),
        is_current: Set(true),
        created_at: Set(now.into()),
        updated_at: Set(now.into()),
    }
    .insert(txn)
    .await?;

    // ── Terms ───────────────────────────────────────────────────────────────
    let term1_id = Uuid::new_v4();
    let term2_id = Uuid::new_v4();
    terms::ActiveModel {
        id: Set(term1_id),
        school_year_id: Set(school_year_id),
        name: Set("1. Halbjahr".to_string()),
        start_date: Set(NaiveDate::from_ymd_opt(2025, 8, 1).unwrap()),
        end_date: Set(NaiveDate::from_ymd_opt(2026, 1, 31).unwrap()),
        is_current: Set(true),
        created_at: Set(now.into()),
        updated_at: Set(now.into()),
    }
    .insert(txn)
    .await?;
    terms::ActiveModel {
        id: Set(term2_id),
        school_year_id: Set(school_year_id),
        name: Set("2. Halbjahr".to_string()),
        start_date: Set(NaiveDate::from_ymd_opt(2026, 2, 1).unwrap()),
        end_date: Set(NaiveDate::from_ymd_opt(2026, 7, 31).unwrap()),
        is_current: Set(false),
        created_at: Set(now.into()),
        updated_at: Set(now.into()),
    }
    .insert(txn)
    .await?;

    // ── Teachers ────────────────────────────────────────────────────────────
    // Port the 8 INSERTs from docker/seeds/dev-seed.sql lines 43-53.
    // Each teacher needs: first_name, last_name, email, abbreviation,
    // max_hours_per_week, is_part_time, is_active.
    // Generate fresh UUIDs and capture them in local variables for later use:
    //   teacher_mueller, teacher_schmidt, teacher_weber, teacher_fischer,
    //   teacher_becker, teacher_hoffmann, teacher_klein, teacher_wagner.
    // Email domain stays "@grundschule-am-see.de".
    let teacher_mueller = Uuid::new_v4();
    teachers::ActiveModel {
        id: Set(teacher_mueller),
        school_id: Set(school_id),
        first_name: Set("Anna".to_string()),
        last_name: Set("Müller".to_string()),
        email: Set(Some("a.mueller@grundschule-am-see.de".to_string())),
        abbreviation: Set("MÜL".to_string()),
        max_hours_per_week: Set(28),
        is_part_time: Set(false),
        is_active: Set(true),
        created_at: Set(now.into()),
        updated_at: Set(now.into()),
    }
    .insert(txn)
    .await?;
    // … repeat for the remaining 7 teachers.

    // ── Subjects ────────────────────────────────────────────────────────────
    // Port lines 58-68. 8 subjects: DE, MA, EN, SU, SP (needs_special_room),
    // MU (needs_special_room), KU, RE. Capture UUIDs as
    //   subject_de, subject_ma, subject_en, subject_su, subject_sp,
    //   subject_mu, subject_ku, subject_re.

    // ── Rooms ───────────────────────────────────────────────────────────────
    // Port lines 73-81. 6 rooms: 101-104 (Hauptgebäude, cap 30), Turnhalle
    // (Nebengebäude, cap 60), Musikraum (Hauptgebäude, cap 30). Capture UUIDs
    // as room_101, room_102, room_103, room_104, room_turnhalle, room_musikraum.

    // ── School Classes ──────────────────────────────────────────────────────
    // Port lines 86-92. 4 classes (1a-4a) with class_teacher_id pointing at
    // Müller, Schmidt, Weber, Fischer respectively. Capture UUIDs as
    // class_1a, class_2a, class_3a, class_4a.

    // ── Time Slots (30 rows: 5 days × 6 periods) ────────────────────────────
    // Port lines 99-136. day_of_week 0..=4, period 1..=6. Times exactly as
    // in the SQL. is_break = false, label = "{period}. Stunde".
    // Iterate with two nested loops; do not capture individual IDs.

    // ── Teacher-Subject Qualifications (16 rows) ────────────────────────────
    // Port lines 141-167. Use the teacher_* and subject_* UUIDs captured above.
    // qualification_level is "primary" or "secondary"; max_hours_per_week NULL.

    // ── Teacher Availabilities (24 rows: Becker Thu+Fri, Klein Mon+Tue) ─────
    // Port lines 173-203. term_id = None (default availability).
    // availability_type = "blocked", reason = "Teilzeit — nicht verfügbar".

    // ── Room-Subject Suitabilities (2 rows) ─────────────────────────────────
    // Turnhalle→Sport, Musikraum→Musik.

    // ── Curriculum Entries (30 rows, 1. Halbjahr only) ──────────────────────
    // Port lines 225-263. school_id, term_id = term1_id. The teacher
    // assignments per row are documented in the SQL header comment.

    Ok(())
}
```

Replace the `// …` comment blocks with the actual `ActiveModel` inserts following the same pattern as the first teacher. **Each entity must be inserted individually inside `txn`** so the transaction wraps everything atomically.

> **Tip:** when in doubt about a column name or whether it is `Option<T>`, `Read` the matching `backend/src/models/_entities/<entity>.rs` file.

- [ ] **Step 3: Wire the new module into `services/mod.rs`**

Modify `backend/src/services/mod.rs` to add:

```rust
pub mod example_data;
```

(Place it alphabetically among the existing `pub mod` declarations.)

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p klassenzeit-backend`
Expected: clean compile (warnings about an unused public function are acceptable; the controller will use it in Task 2).

- [ ] **Step 5: Run formatter and clippy**

Run: `cargo fmt -p klassenzeit-backend && cargo clippy -p klassenzeit-backend -- -D warnings`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/example_data.rs backend/src/services/mod.rs
git commit -m "feat(backend): add example_data service for onboarding wizard"
```

---

## Task 2 — Backend: example_data controller + route

**Goal:** Expose `POST /api/schools/{school_id}/load-example` — admin-gated, refuses non-empty schools with `409`, otherwise calls `load_example_school_data` inside a transaction.

**Files:**
- Create: `backend/src/controllers/example_data.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

The "is empty?" check tests the seven entities the wizard cares about: `terms`, `school_classes`, `subjects`, `teachers`, `rooms`, `time_slots`, `curriculum_entries`. (We do **not** check `school_years` — the wizard does not require school_year to be a step, and it is harmless if a school year already exists; but the seed creates one, so we should be safe by checking the broader set.)

> **Decision:** also check `school_years` for emptiness. If anything related exists, refuse — keeps the postcondition simple ("you only get example data into a virgin school").

- [ ] **Step 1: Write the failing integration test (skeleton only — full tests in Task 3)**

We'll write the full test suite in Task 3. For now, in Task 2 we add a single smoke test so the controller is exercised end-to-end.

Create `backend/tests/requests/example_data.rs` with:

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

        let resp = server
            .post(&url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;

        resp.assert_status(StatusCode::NO_CONTENT);

        // Sanity: at least one of each entity now exists.
        use klassenzeit_backend::models::_entities::{
            curriculum_entries, school_classes, subjects, teachers, terms, time_slots,
        };
        use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter};
        assert!(
            terms::Entity::find()
                .count(&ctx.db)
                .await
                .unwrap()
                > 0
        );
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
```

Add to `backend/tests/requests/mod.rs`:

```rust
mod example_data;
```

- [ ] **Step 2: Run the test, expect a route-not-found failure**

Run: `just backend-test -- example_data`
Expected: FAIL — the route doesn't exist yet (404 from the test server).

- [ ] **Step 3: Create the controller**

Create `backend/src/controllers/example_data.rs`:

```rust
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, TransactionTrait};
use uuid::Uuid;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{
    curriculum_entries, rooms, school_classes, school_years, subjects, teachers, terms, time_slots,
};
use crate::services::example_data::load_example_school_data;

fn require_admin(school_ctx: &SchoolContext) -> Result<(), (StatusCode, String)> {
    if school_ctx.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin access required".to_string()));
    }
    Ok(())
}

async fn school_has_any_data(
    db: &impl sea_orm::ConnectionTrait,
    school_id: Uuid,
) -> Result<bool, sea_orm::DbErr> {
    macro_rules! any {
        ($entity:path, $col:path) => {{
            let n = <$entity>::find()
                .filter(<$col>.eq(school_id))
                .count(db)
                .await?;
            if n > 0 {
                return Ok(true);
            }
        }};
    }
    any!(school_years::Entity, school_years::Column::SchoolId);
    any!(teachers::Entity, teachers::Column::SchoolId);
    any!(subjects::Entity, subjects::Column::SchoolId);
    any!(rooms::Entity, rooms::Column::SchoolId);
    any!(school_classes::Entity, school_classes::Column::SchoolId);
    any!(time_slots::Entity, time_slots::Column::SchoolId);
    any!(curriculum_entries::Entity, curriculum_entries::Column::SchoolId);

    // `terms` has no school_id column directly — it joins through school_years.
    // If we got here and any school_year exists for this school, we already
    // returned true above. So no terms can exist without a school_year for
    // this school. Skip the explicit check.

    Ok(false)
}

/// POST /api/schools/{school_id}/load-example
async fn load_example(
    State(ctx): State<AppContext>,
    Path(_school_id): Path<Uuid>,
    school_ctx: SchoolContext,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_admin(&school_ctx)?;
    let school_id = school_ctx.school.id;

    if school_has_any_data(&ctx.db, school_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    {
        return Err((
            StatusCode::CONFLICT,
            "School already has data — example loader skipped".to_string(),
        ));
    }

    let txn = ctx
        .db
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Err(e) = load_example_school_data(&txn, school_id).await {
        let _ = txn.rollback().await;
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }

    txn.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}")
        .add("/load-example", post(load_example))
}
```

> **Note on terms emptiness:** the `terms` table is keyed via `school_year_id`, not `school_id` directly. The check above relies on the fact that any term for this school must hang off a school_year owned by this school, which we already check. If a future migration changes that relationship, update this check.

- [ ] **Step 4: Wire the controller module**

Modify `backend/src/controllers/mod.rs` — add `pub mod example_data;` alphabetically.

- [ ] **Step 5: Register the route**

Modify `backend/src/app.rs` `routes()` function. Add the new route after `controllers::schools::routes()`:

```rust
            .add_route(controllers::schools::routes())
            .add_route(controllers::example_data::routes())
```

- [ ] **Step 6: Re-run the smoke test, expect pass**

Run: `just backend-test -- example_data`
Expected: PASS.

- [ ] **Step 7: Run the full backend test suite**

Run: `just backend-test`
Expected: all tests pass (no regressions).

- [ ] **Step 8: Commit**

```bash
git add backend/src/controllers/example_data.rs backend/src/controllers/mod.rs \
        backend/src/app.rs \
        backend/tests/requests/example_data.rs backend/tests/requests/mod.rs
git commit -m "feat(backend): POST /api/schools/{id}/load-example endpoint"
```

---

## Task 3 — Backend: example_data full integration tests

**Goal:** Cover the remaining behaviors specified in the design: 403 for non-admin, 409 if school has any one of the seven entities, cross-tenant isolation, transactionality regression guard.

**Files:**
- Modify: `backend/tests/requests/example_data.rs`

- [ ] **Step 1: Add the non-admin test**

Append to `backend/tests/requests/example_data.rs`:

```rust
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
```

Run: `just backend-test -- example_data::non_admin`
Expected: PASS.

- [ ] **Step 2: Add the "second call returns 409" test**

```rust
#[tokio::test]
#[serial]
async fn second_load_returns_conflict() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ld-twice").await;

        // First call: 204
        let r1 = server
            .post(&url(school.id))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .await;
        r1.assert_status(StatusCode::NO_CONTENT);

        // Second call: 409
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
```

Run: `just backend-test -- example_data::second_load`
Expected: PASS.

- [ ] **Step 3: Add a "pre-existing single entity blocks" test**

Use a teacher as the canary entity (cheap to insert, exercises the `school_id` filter path).

```rust
#[tokio::test]
#[serial]
async fn pre_existing_teacher_blocks_load() {
    use klassenzeit_backend::models::_entities::teachers;
    use sea_orm::Set;

    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "ld-pre-teacher").await;

        // Insert a single teacher to make the school non-empty.
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
```

Run: `just backend-test -- example_data::pre_existing_teacher`
Expected: PASS.

- [ ] **Step 4: Add cross-tenant isolation test**

```rust
#[tokio::test]
#[serial]
async fn admin_of_other_school_cannot_load() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        // Admin of school A
        let (_school_a, token_a) = setup_admin_school(&ctx, &kp, "ld-tenant-a").await;
        // School B (no membership for token_a)
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

        // The school context middleware rejects the request before our handler.
        // Either 403 or 404 is acceptable as long as it is not 204.
        assert_ne!(resp.status_code(), StatusCode::NO_CONTENT);
        assert!(
            resp.status_code() == StatusCode::FORBIDDEN
                || resp.status_code() == StatusCode::NOT_FOUND
        );
    })
    .await;
}
```

Run: `just backend-test -- example_data::admin_of_other_school`
Expected: PASS.

- [ ] **Step 5: Run the full example_data suite**

Run: `just backend-test -- example_data`
Expected: 5 tests pass.

- [ ] **Step 6: Run the full backend test suite**

Run: `just backend-test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/tests/requests/example_data.rs
git commit -m "test(backend): integration tests for /load-example endpoint"
```

---

## Task 4 — Frontend: `useOnboardingProgress` hook + tests

**Goal:** A single hook that fetches counts for the seven entities in parallel and derives `OnboardingProgress`.

**Endpoint mapping** (verified by reading the existing controllers):

| Step       | List endpoint                                                      | Notes                                                        |
|------------|--------------------------------------------------------------------|--------------------------------------------------------------|
| term       | `GET /api/schools/{schoolId}/terms`                                | Array; `done` = `length > 0`.                                |
| classes    | `GET /api/schools/{schoolId}/classes`                              |                                                               |
| subjects   | `GET /api/schools/{schoolId}/subjects`                             |                                                               |
| teachers   | `GET /api/schools/{schoolId}/teachers`                             |                                                               |
| rooms      | `GET /api/schools/{schoolId}/rooms`                                |                                                               |
| timeslots  | `GET /api/schools/{schoolId}/time-slots`                           |                                                               |
| curriculum | `GET /api/schools/{schoolId}/terms/{termId}/curriculum`            | Needs a `term_id`. Use first term from `terms` response. If terms is empty, treat curriculum as `done: false, count: 0` without making the request. |

**Files:**
- Create: `frontend/src/hooks/use-onboarding-progress.ts`
- Create: `frontend/src/hooks/use-onboarding-progress.test.ts`

- [ ] **Step 1: Write the failing hook tests**

Create `frontend/src/hooks/use-onboarding-progress.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { useOnboardingProgress } from "./use-onboarding-progress";

type FakeApi = {
  get: ReturnType<typeof mock>;
};

function mockApi(responses: Record<string, unknown>): FakeApi {
  return {
    get: mock((path: string) => {
      const key = Object.keys(responses).find((k) => path.startsWith(k));
      if (!key) throw new Error(`unexpected GET ${path}`);
      return Promise.resolve(responses[key]);
    }),
  };
}

mock.module("@/hooks/use-api-client", () => ({
  useApiClient: () => currentApi,
}));

let currentApi: FakeApi = mockApi({});

describe("useOnboardingProgress", () => {
  it("reports isEmpty when every count is zero", async () => {
    currentApi = mockApi({
      "/api/schools/s1/terms": [],
      "/api/schools/s1/classes": [],
      "/api/schools/s1/subjects": [],
      "/api/schools/s1/teachers": [],
      "/api/schools/s1/rooms": [],
      "/api/schools/s1/time-slots": [],
    });

    const { result } = renderHook(() => useOnboardingProgress("s1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.allComplete).toBe(false);
    expect(result.current.firstIncomplete).toBe("term");
    for (const id of ["term", "classes", "subjects", "teachers", "rooms", "timeslots", "curriculum"] as const) {
      expect(result.current.steps[id].done).toBe(false);
      expect(result.current.steps[id].count).toBe(0);
    }
  });

  it("marks term done and curriculum still empty when only a term exists", async () => {
    currentApi = mockApi({
      "/api/schools/s1/terms": [{ id: "t1" }],
      "/api/schools/s1/classes": [],
      "/api/schools/s1/subjects": [],
      "/api/schools/s1/teachers": [],
      "/api/schools/s1/rooms": [],
      "/api/schools/s1/time-slots": [],
      "/api/schools/s1/terms/t1/curriculum": [],
    });

    const { result } = renderHook(() => useOnboardingProgress("s1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.steps.term.done).toBe(true);
    expect(result.current.steps.curriculum.done).toBe(false);
    expect(result.current.firstIncomplete).toBe("classes");
  });

  it("marks allComplete when every entity has at least one row", async () => {
    currentApi = mockApi({
      "/api/schools/s1/terms": [{ id: "t1" }],
      "/api/schools/s1/classes": [{}],
      "/api/schools/s1/subjects": [{}],
      "/api/schools/s1/teachers": [{}],
      "/api/schools/s1/rooms": [{}],
      "/api/schools/s1/time-slots": [{}],
      "/api/schools/s1/terms/t1/curriculum": [{}],
    });

    const { result } = renderHook(() => useOnboardingProgress("s1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allComplete).toBe(true);
    expect(result.current.firstIncomplete).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `cd frontend && bun test src/hooks/use-onboarding-progress.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/use-onboarding-progress.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { useApiClient } from "@/hooks/use-api-client";

export const ONBOARDING_STEP_IDS = [
  "term",
  "classes",
  "subjects",
  "teachers",
  "rooms",
  "timeslots",
  "curriculum",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingStepState = {
  done: boolean;
  count: number;
};

export type OnboardingProgress = {
  loading: boolean;
  error: string | null;
  steps: Record<OnboardingStepId, OnboardingStepState>;
  allComplete: boolean;
  isEmpty: boolean;
  firstIncomplete: OnboardingStepId | null;
  refetch: () => Promise<void>;
};

const EMPTY_STEPS: Record<OnboardingStepId, OnboardingStepState> = {
  term: { done: false, count: 0 },
  classes: { done: false, count: 0 },
  subjects: { done: false, count: 0 },
  teachers: { done: false, count: 0 },
  rooms: { done: false, count: 0 },
  timeslots: { done: false, count: 0 },
  curriculum: { done: false, count: 0 },
};

export function useOnboardingProgress(schoolId: string): OnboardingProgress {
  const apiClient = useApiClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<OnboardingStepId, OnboardingStepState>>(EMPTY_STEPS);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [terms, classes, subjects, teachers, rooms, timeslots] = await Promise.all([
        apiClient.get<unknown[]>(`/api/schools/${schoolId}/terms`),
        apiClient.get<unknown[]>(`/api/schools/${schoolId}/classes`),
        apiClient.get<unknown[]>(`/api/schools/${schoolId}/subjects`),
        apiClient.get<unknown[]>(`/api/schools/${schoolId}/teachers`),
        apiClient.get<unknown[]>(`/api/schools/${schoolId}/rooms`),
        apiClient.get<unknown[]>(`/api/schools/${schoolId}/time-slots`),
      ]);

      let curriculum: unknown[] = [];
      const firstTerm = terms[0] as { id?: string } | undefined;
      if (firstTerm?.id) {
        curriculum = await apiClient.get<unknown[]>(
          `/api/schools/${schoolId}/terms/${firstTerm.id}/curriculum`,
        );
      }

      const next: Record<OnboardingStepId, OnboardingStepState> = {
        term: { count: terms.length, done: terms.length > 0 },
        classes: { count: classes.length, done: classes.length > 0 },
        subjects: { count: subjects.length, done: subjects.length > 0 },
        teachers: { count: teachers.length, done: teachers.length > 0 },
        rooms: { count: rooms.length, done: rooms.length > 0 },
        timeslots: { count: timeslots.length, done: timeslots.length > 0 },
        curriculum: { count: curriculum.length, done: curriculum.length > 0 },
      };
      setSteps(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load onboarding progress");
    } finally {
      setLoading(false);
    }
  }, [apiClient, schoolId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const allComplete = ONBOARDING_STEP_IDS.every((id) => steps[id].done);
  const isEmpty = ONBOARDING_STEP_IDS.every((id) => steps[id].count === 0);
  const firstIncomplete: OnboardingStepId | null =
    ONBOARDING_STEP_IDS.find((id) => !steps[id].done) ?? null;

  return {
    loading,
    error,
    steps,
    allComplete,
    isEmpty,
    firstIncomplete,
    refetch: fetchAll,
  };
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `cd frontend && bun test src/hooks/use-onboarding-progress.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck + biome**

Run: `cd frontend && bunx tsc --noEmit && bunx biome check src/hooks/use-onboarding-progress.ts src/hooks/use-onboarding-progress.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/use-onboarding-progress.ts frontend/src/hooks/use-onboarding-progress.test.ts
git commit -m "feat(frontend): useOnboardingProgress hook"
```

---

## Task 5 — Frontend: wizard step registry

**Goal:** A single ordered list of step descriptors used by both the wizard and the checklist.

**Files:**
- Create: `frontend/src/components/onboarding/wizard-steps.tsx`

- [ ] **Step 1: Create the registry**

```tsx
import type { ComponentType } from "react";
import { ClassesTab } from "@/app/[locale]/schools/[id]/settings/components/classes-tab";
import { RoomsTab } from "@/app/[locale]/schools/[id]/settings/components/rooms-tab";
import { SubjectsTab } from "@/app/[locale]/schools/[id]/settings/components/subjects-tab";
import { TeachersTab } from "@/app/[locale]/schools/[id]/settings/components/teachers-tab";
import { TermsTab } from "@/app/[locale]/schools/[id]/settings/components/terms-tab";
import { TimeslotsTab } from "@/app/[locale]/schools/[id]/settings/components/timeslots-tab";
import type { OnboardingStepId } from "@/hooks/use-onboarding-progress";

export type WizardStep = {
  id: OnboardingStepId;
  /** i18n key under `onboarding.steps.<id>.title` — stored as string for grep-ability */
  titleKey: string;
  descriptionKey: string;
  /** Either an embedded component (settings tabs) or null for steps that need custom rendering. */
  Component: ComponentType | null;
  /** Path (without locale prefix) for the dashboard checklist deep-link. `{schoolId}` placeholder is replaced at render time. */
  href: string;
};

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: "term",
    titleKey: "onboarding.steps.term.title",
    descriptionKey: "onboarding.steps.term.description",
    Component: TermsTab,
    href: "/schools/{schoolId}/settings?tab=terms",
  },
  {
    id: "classes",
    titleKey: "onboarding.steps.classes.title",
    descriptionKey: "onboarding.steps.classes.description",
    Component: ClassesTab,
    href: "/schools/{schoolId}/settings?tab=classes",
  },
  {
    id: "subjects",
    titleKey: "onboarding.steps.subjects.title",
    descriptionKey: "onboarding.steps.subjects.description",
    Component: SubjectsTab,
    href: "/schools/{schoolId}/settings?tab=subjects",
  },
  {
    id: "teachers",
    titleKey: "onboarding.steps.teachers.title",
    descriptionKey: "onboarding.steps.teachers.description",
    Component: TeachersTab,
    href: "/schools/{schoolId}/settings?tab=teachers",
  },
  {
    id: "rooms",
    titleKey: "onboarding.steps.rooms.title",
    descriptionKey: "onboarding.steps.rooms.description",
    Component: RoomsTab,
    href: "/schools/{schoolId}/settings?tab=rooms",
  },
  {
    id: "timeslots",
    titleKey: "onboarding.steps.timeslots.title",
    descriptionKey: "onboarding.steps.timeslots.description",
    Component: TimeslotsTab,
    href: "/schools/{schoolId}/settings?tab=timeslots",
  },
  {
    id: "curriculum",
    titleKey: "onboarding.steps.curriculum.title",
    descriptionKey: "onboarding.steps.curriculum.description",
    // Curriculum lives at its own page, not a settings tab. The wizard step
    // renders a friendly "open the curriculum editor" call-to-action instead
    // of embedding the page (which would be circular and pulls in routing).
    Component: null,
    href: "/schools/{schoolId}/curriculum",
  },
] as const;

export function resolveHref(step: WizardStep, schoolId: string, locale: string): string {
  return `/${locale}${step.href.replace("{schoolId}", schoolId)}`;
}
```

- [ ] **Step 2: Verify import paths compile**

Run: `cd frontend && bunx tsc --noEmit`
Expected: clean. If any of the settings tab components are not exported as named exports, fix the imports (read the matching file and adjust).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/onboarding/wizard-steps.tsx
git commit -m "feat(frontend): wizard step registry"
```

---

## Task 6 — Frontend: `WizardShell` + `WizardDialog`

**Goal:** Dialog wrapper with header, progress bar, and footer; renders the embedded tab for the current step.

**Files:**
- Create: `frontend/src/components/onboarding/wizard-shell.tsx`
- Create: `frontend/src/components/onboarding/wizard-dialog.tsx`
- Create: `frontend/src/components/onboarding/wizard-dialog.test.tsx`

- [ ] **Step 1: Write the failing dialog test**

Create `frontend/src/components/onboarding/wizard-dialog.test.tsx`:

```tsx
import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { WizardDialog } from "./wizard-dialog";

mock.module("@/hooks/use-api-client", () => ({
  useApiClient: () => ({ get: mock(() => Promise.resolve([])), post: mock(() => Promise.resolve()) }),
}));

mock.module("next/navigation", () => ({
  useParams: () => ({ id: "s1" }),
  useRouter: () => ({ push: mock(() => {}) }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderDialog(initialStep = 0) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WizardDialog
        schoolId="s1"
        open
        initialStep={initialStep}
        onClose={() => {}}
        onProgressChange={async () => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("WizardDialog", () => {
  it("renders the title for the initial step", () => {
    renderDialog(0);
    expect(screen.getByText(/term/i)).toBeTruthy();
  });

  it("Skip advances to the next step", () => {
    renderDialog(0);
    const skip = screen.getByRole("button", { name: /skip/i });
    fireEvent.click(skip);
    // Step counter should now show "2 of 7"
    expect(screen.getByText(/2.*7/)).toBeTruthy();
  });

  it("Back is disabled on step 0", () => {
    renderDialog(0);
    const back = screen.getByRole("button", { name: /back/i }) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd frontend && bun test src/components/onboarding/wizard-dialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `WizardShell`**

Create `frontend/src/components/onboarding/wizard-shell.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Props = {
  stepIndex: number;
  totalSteps: number;
  title: string;
  description: string;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
  isLast: boolean;
  children: ReactNode;
};

export function WizardShell({
  stepIndex,
  totalSteps,
  title,
  description,
  onBack,
  onSkip,
  onNext,
  isLast,
  children,
}: Props) {
  const t = useTranslations("onboarding.buttons");
  const tw = useTranslations("onboarding.wizard");
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {tw("stepCounter", { current: stepIndex + 1, total: totalSteps })}
        </p>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
            aria-label={tw("progressLabel", { percent: progress })}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-3">{children}</div>
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack} disabled={stepIndex === 0}>
          {t("back")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSkip}>
            {t("skip")}
          </Button>
          <Button onClick={onNext}>{isLast ? t("finish") : t("next")}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `WizardDialog`**

Create `frontend/src/components/onboarding/wizard-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadExampleButton } from "./load-example-button";
import { WIZARD_STEPS, resolveHref } from "./wizard-steps";
import { WizardShell } from "./wizard-shell";

type Props = {
  schoolId: string;
  open: boolean;
  initialStep?: number;
  onClose: () => void;
  onProgressChange: () => Promise<void>;
};

export function WizardDialog({
  schoolId,
  open,
  initialStep = 0,
  onClose,
  onProgressChange,
}: Props) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const [stepIndex, setStepIndex] = useState(initialStep);
  const step = WIZARD_STEPS[stepIndex];
  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  const advance = async () => {
    await onProgressChange();
    if (isLast) {
      onClose();
    } else {
      setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
    }
  };

  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t("wizard.title")}</DialogTitle>
        </DialogHeader>
        <WizardShell
          stepIndex={stepIndex}
          totalSteps={WIZARD_STEPS.length}
          title={t(step.titleKey.replace("onboarding.", "") as never)}
          description={t(step.descriptionKey.replace("onboarding.", "") as never)}
          onBack={back}
          onSkip={advance}
          onNext={advance}
          isLast={isLast}
        >
          {step.id === "term" && (
            <div className="mb-4">
              <LoadExampleButton schoolId={schoolId} onLoaded={async () => {
                await onProgressChange();
                onClose();
              }} />
            </div>
          )}
          {step.Component ? (
            <step.Component />
          ) : (
            <div className="flex flex-col items-start gap-3 p-4 text-sm">
              <p>{t("steps.curriculum.openHint")}</p>
              <Button asChild>
                <Link href={resolveHref(step, schoolId, locale)}>
                  {t("steps.curriculum.openButton")}
                </Link>
              </Button>
            </div>
          )}
        </WizardShell>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run the dialog test, expect pass**

Run: `cd frontend && bun test src/components/onboarding/wizard-dialog.test.tsx`
Expected: PASS. If the test sees "Loading…" because settings tabs fetch on mount, the mocked api client returns `[]` for everything and the tabs should render empty states. Adjust the assertions if a tab uses a different empty-state string than the regex matches.

- [ ] **Step 6: Typecheck + lint**

Run: `cd frontend && bunx tsc --noEmit && bunx biome check src/components/onboarding/`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/onboarding/wizard-shell.tsx \
        frontend/src/components/onboarding/wizard-dialog.tsx \
        frontend/src/components/onboarding/wizard-dialog.test.tsx
git commit -m "feat(frontend): onboarding wizard dialog + shell"
```

---

## Task 7 — Frontend: `LoadExampleButton`

**Goal:** A button that POSTs to `/load-example` and surfaces success/conflict toasts.

**Files:**
- Create: `frontend/src/components/onboarding/load-example-button.tsx`
- Create: `frontend/src/components/onboarding/load-example-button.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { LoadExampleButton } from "./load-example-button";

const post = mock(() => Promise.resolve());

mock.module("@/hooks/use-api-client", () => ({
  useApiClient: () => ({ post }),
}));

const toastError = mock(() => {});
const toastSuccess = mock(() => {});

mock.module("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

function renderButton(onLoaded = async () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoadExampleButton schoolId="s1" onLoaded={onLoaded} />
    </NextIntlClientProvider>,
  );
}

describe("LoadExampleButton", () => {
  it("calls POST /load-example and runs onLoaded on success", async () => {
    const onLoaded = mock(() => Promise.resolve());
    renderButton(onLoaded);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toBe("/api/schools/s1/load-example");
    await waitFor(() => expect(onLoaded).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
  });
});
```

> If the existing api-client throws on non-2xx with an error containing the status code in the message, conflict handling means inspecting the error message. Read `frontend/src/hooks/use-api-client.ts` to confirm before writing the conflict-handling branch.

- [ ] **Step 2: Run, expect failure**

Run: `cd frontend && bun test src/components/onboarding/load-example-button.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the button**

Create `frontend/src/components/onboarding/load-example-button.tsx`:

```tsx
"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiClient } from "@/hooks/use-api-client";

type Props = {
  schoolId: string;
  onLoaded: () => Promise<void> | void;
};

export function LoadExampleButton({ schoolId, onLoaded }: Props) {
  const t = useTranslations("onboarding.exampleData");
  const apiClient = useApiClient();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await apiClient.post(`/api/schools/${schoolId}/load-example`, undefined);
      toast.success(t("success"));
      await onLoaded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("409") || msg.toLowerCase().includes("conflict")) {
        toast.error(t("alreadyHasData"));
      } else {
        toast.error(msg || t("genericError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={loading}>
      <Sparkles className="mr-2 h-4 w-4" />
      {loading ? t("loading") : t("button")}
    </Button>
  );
}
```

> **If `useApiClient().post` doesn't accept `undefined` as a body**, pass `{}` instead. Quick check: `Read frontend/src/hooks/use-api-client.ts` and adjust.

- [ ] **Step 4: Run the test, expect pass**

Run: `cd frontend && bun test src/components/onboarding/load-example-button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/onboarding/load-example-button.tsx \
        frontend/src/components/onboarding/load-example-button.test.tsx
git commit -m "feat(frontend): LoadExampleButton for onboarding wizard"
```

---

## Task 8 — Frontend: `ChecklistCard`

**Goal:** Dashboard card showing the seven steps with check icons, deep-link buttons, and a "Resume setup" button.

**Files:**
- Create: `frontend/src/components/onboarding/checklist-card.tsx`
- Create: `frontend/src/components/onboarding/checklist-card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { ChecklistCard } from "./checklist-card";
import type { OnboardingProgress } from "@/hooks/use-onboarding-progress";

function makeProgress(overrides: Partial<OnboardingProgress["steps"]> = {}): OnboardingProgress {
  const base = {
    term: { done: false, count: 0 },
    classes: { done: false, count: 0 },
    subjects: { done: false, count: 0 },
    teachers: { done: false, count: 0 },
    rooms: { done: false, count: 0 },
    timeslots: { done: false, count: 0 },
    curriculum: { done: false, count: 0 },
  };
  const steps = { ...base, ...overrides } as OnboardingProgress["steps"];
  return {
    loading: false,
    error: null,
    steps,
    allComplete: Object.values(steps).every((s) => s.done),
    isEmpty: Object.values(steps).every((s) => s.count === 0),
    firstIncomplete: (Object.entries(steps).find(([, s]) => !s.done)?.[0] as never) ?? null,
    refetch: async () => {},
  };
}

describe("ChecklistCard", () => {
  it("renders all seven steps", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChecklistCard
          schoolId="s1"
          progress={makeProgress()}
          onResume={() => {}}
        />
      </NextIntlClientProvider>,
    );
    // Each step has a row with its localized title
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });

  it("renders nothing when allComplete", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChecklistCard
          schoolId="s1"
          progress={makeProgress({
            term: { done: true, count: 1 },
            classes: { done: true, count: 1 },
            subjects: { done: true, count: 1 },
            teachers: { done: true, count: 1 },
            rooms: { done: true, count: 1 },
            timeslots: { done: true, count: 1 },
            curriculum: { done: true, count: 1 },
          })}
          onResume={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd frontend && bun test src/components/onboarding/checklist-card.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the card**

Create `frontend/src/components/onboarding/checklist-card.tsx`:

```tsx
"use client";

import { Check, Circle, Play } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OnboardingProgress } from "@/hooks/use-onboarding-progress";
import { WIZARD_STEPS, resolveHref } from "./wizard-steps";

type Props = {
  schoolId: string;
  progress: OnboardingProgress;
  onResume: () => void;
};

export function ChecklistCard({ schoolId, progress, onResume }: Props) {
  const t = useTranslations("onboarding");
  const locale = useLocale();

  if (progress.allComplete) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("checklist.title")}</CardTitle>
        <Button size="sm" onClick={onResume}>
          <Play className="mr-2 h-4 w-4" />
          {t("checklist.resume")}
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {WIZARD_STEPS.map((step) => {
            const state = progress.steps[step.id];
            const Icon = state.done ? Check : Circle;
            return (
              <li
                key={step.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={
                      state.done
                        ? "h-4 w-4 text-primary"
                        : "h-4 w-4 text-muted-foreground"
                    }
                  />
                  <span className="text-sm">
                    {t(step.titleKey.replace("onboarding.", "") as never)}
                  </span>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href={resolveHref(step, schoolId, locale)}>
                    {state.done
                      ? t("checklist.review")
                      : t("checklist.open")}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `cd frontend && bun test src/components/onboarding/checklist-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/onboarding/checklist-card.tsx \
        frontend/src/components/onboarding/checklist-card.test.tsx
git commit -m "feat(frontend): onboarding checklist card"
```

---

## Task 9 — Frontend: i18n keys (en + de)

**Goal:** All onboarding strings exist in both locale files.

**Files:**
- Modify: `frontend/src/messages/en.json`
- Modify: `frontend/src/messages/de.json`

- [ ] **Step 1: Add the `onboarding` namespace to `en.json`**

Insert into `frontend/src/messages/en.json` (place after the existing top-level namespaces, e.g. after `"settings"`):

```json
"onboarding": {
  "wizard": {
    "title": "Set up your school",
    "stepCounter": "Step {current} of {total}",
    "progressLabel": "{percent}% complete"
  },
  "buttons": {
    "back": "Back",
    "skip": "Skip",
    "next": "Next",
    "finish": "Finish",
    "close": "Close"
  },
  "steps": {
    "term": {
      "title": "Create a term",
      "description": "Most other settings need at least one term."
    },
    "classes": {
      "title": "Add classes",
      "description": "List the school classes that need a timetable."
    },
    "subjects": {
      "title": "Add subjects",
      "description": "Define the subjects taught at your school."
    },
    "teachers": {
      "title": "Add teachers",
      "description": "Add the teachers who will be assigned lessons."
    },
    "rooms": {
      "title": "Add rooms",
      "description": "Where will lessons take place?"
    },
    "timeslots": {
      "title": "Configure timeslots",
      "description": "Set up the school's weekly periods."
    },
    "curriculum": {
      "title": "Set up curriculum",
      "description": "Decide which subjects each class gets, how often, and with whom.",
      "openHint": "The curriculum editor is on its own page.",
      "openButton": "Open curriculum editor"
    }
  },
  "exampleData": {
    "button": "Try with example data",
    "loading": "Loading example…",
    "success": "Example data loaded",
    "alreadyHasData": "School already has data — example loader skipped",
    "genericError": "Failed to load example data"
  },
  "checklist": {
    "title": "Set up your school",
    "resume": "Resume setup",
    "open": "Open",
    "review": "Review"
  }
}
```

- [ ] **Step 2: Add the `onboarding` namespace to `de.json`**

Insert the German equivalents:

```json
"onboarding": {
  "wizard": {
    "title": "Schule einrichten",
    "stepCounter": "Schritt {current} von {total}",
    "progressLabel": "{percent}% abgeschlossen"
  },
  "buttons": {
    "back": "Zurück",
    "skip": "Überspringen",
    "next": "Weiter",
    "finish": "Fertig",
    "close": "Schließen"
  },
  "steps": {
    "term": {
      "title": "Halbjahr anlegen",
      "description": "Die meisten Einstellungen benötigen mindestens ein Halbjahr."
    },
    "classes": {
      "title": "Klassen hinzufügen",
      "description": "Liste die Klassen auf, die einen Stundenplan brauchen."
    },
    "subjects": {
      "title": "Fächer hinzufügen",
      "description": "Lege die an deiner Schule unterrichteten Fächer an."
    },
    "teachers": {
      "title": "Lehrkräfte hinzufügen",
      "description": "Füge die Lehrkräfte hinzu, denen Stunden zugewiesen werden."
    },
    "rooms": {
      "title": "Räume hinzufügen",
      "description": "Wo finden die Stunden statt?"
    },
    "timeslots": {
      "title": "Stundenraster festlegen",
      "description": "Definiere die wöchentlichen Stunden deiner Schule."
    },
    "curriculum": {
      "title": "Lehrplan einrichten",
      "description": "Bestimme, welche Fächer jede Klasse bekommt, wie oft und von wem.",
      "openHint": "Der Lehrplaneditor liegt auf einer eigenen Seite.",
      "openButton": "Lehrplaneditor öffnen"
    }
  },
  "exampleData": {
    "button": "Mit Beispieldaten ausprobieren",
    "loading": "Beispiel wird geladen…",
    "success": "Beispieldaten geladen",
    "alreadyHasData": "Schule enthält bereits Daten — Beispielloader übersprungen",
    "genericError": "Beispieldaten konnten nicht geladen werden"
  },
  "checklist": {
    "title": "Schule einrichten",
    "resume": "Einrichtung fortsetzen",
    "open": "Öffnen",
    "review": "Ansehen"
  }
}
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `cd frontend && bunx biome check src/messages/`
Expected: clean.

- [ ] **Step 4: Re-run all onboarding tests**

Run: `cd frontend && bun test src/components/onboarding src/hooks/use-onboarding-progress.test.ts`
Expected: all pass (no missing-key warnings).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/messages/en.json frontend/src/messages/de.json
git commit -m "i18n(frontend): onboarding wizard strings (en/de)"
```

---

## Task 10 — Frontend: wire dashboard (auto-launch + checklist)

**Goal:** The school dashboard renders the checklist and auto-launches the wizard when the school is empty and the user is admin.

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/page.tsx`

- [ ] **Step 1: Read the current page**

Run: `cat frontend/src/app/[locale]/schools/[id]/page.tsx` (already inspected — has `school` state, `isAdmin = school?.role === "admin"`, and the JSX returns a single `<div>` wrapping the title + edit button + details card).

- [ ] **Step 2: Add the wizard + checklist wiring**

Modify `frontend/src/app/[locale]/schools/[id]/page.tsx`. Add imports at the top of the file (preserve existing imports):

```tsx
import { ChecklistCard } from "@/components/onboarding/checklist-card";
import { WizardDialog } from "@/components/onboarding/wizard-dialog";
import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";
```

Also add to the imports:

```tsx
import { ONBOARDING_STEP_IDS, useOnboardingProgress } from "@/hooks/use-onboarding-progress";
```

(Replaces the earlier `useOnboardingProgress`-only import line — combine them into one.)

Inside the `SchoolDashboardPage` component, after the existing `useState` declarations, add:

```tsx
const progress = useOnboardingProgress(schoolId);
const [wizardOpen, setWizardOpen] = useState(false);
const [autoLaunchedOnce, setAutoLaunchedOnce] = useState(false);

useEffect(() => {
  if (
    !progress.loading &&
    progress.isEmpty &&
    school?.role === "admin" &&
    !autoLaunchedOnce
  ) {
    setWizardOpen(true);
    setAutoLaunchedOnce(true);
  }
}, [progress.loading, progress.isEmpty, school?.role, autoLaunchedOnce]);
```

In the returned JSX, **after** the existing details `<Card>` (i.e. inside the outer `<div className="flex flex-1 flex-col gap-6 p-6">`), add:

```tsx
{isAdmin && !progress.loading && (
  <ChecklistCard
    schoolId={schoolId}
    progress={progress}
    onResume={() => setWizardOpen(true)}
  />
)}
{isAdmin && (
  <WizardDialog
    schoolId={schoolId}
    open={wizardOpen}
    initialStep={
      progress.firstIncomplete
        ? ONBOARDING_STEP_IDS.indexOf(progress.firstIncomplete)
        : 0
    }
    onClose={() => setWizardOpen(false)}
    onProgressChange={progress.refetch}
  />
)}
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd frontend && bunx tsc --noEmit && bunx biome check src/app/[locale]/schools/[id]/page.tsx`
Expected: clean.

- [ ] **Step 4: Manually exercise via dev server (smoke check)**

Run: `just dev`
- Log in as a user with no schools, create a fresh school, navigate to the dashboard.
- Wizard should auto-open at step 1 with the "Try with example data" button visible.
- Click "Try with example data". Toast appears, wizard closes, checklist hides (allComplete).
- Refresh the page. Wizard does **not** re-open. Checklist is gone.
- Create another fresh school. Wizard auto-opens. Click ×. Checklist is visible with "Resume setup" button. Click "Resume setup" — wizard re-opens at the first incomplete step.

Document the manual test in the PR description, since we have no e2e test for this flow yet.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && bun test`
Expected: all pass.

- [ ] **Step 6: Run the full quality gate**

Run: `just check`
Expected: clean (cargo fmt, clippy, biome, tsc).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/page.tsx
git commit -m "feat(frontend): auto-launch onboarding wizard from school dashboard"
```

---

## Task 11 — Final verification + PR

**Goal:** Confirm the full feature works end-to-end and open a PR.

- [ ] **Step 1: Run all tests one more time**

```bash
just backend-test
cd frontend && bun test && cd ..
just check
```

Expected: all green.

- [ ] **Step 2: Update `docs/STATUS.md`**

Add an entry under "Completed Steps" (in the project-conventional position):

```markdown
### Onboarding Wizard (2a)
- Spec: `superpowers/specs/2026-04-06-onboarding-wizard-design.md`
- Plan: `superpowers/plans/2026-04-06-onboarding-wizard.md`
- `useOnboardingProgress` derives 7-step status from existing entity counts.
- `WizardDialog` embeds existing settings tabs; per-step Skip; auto-launches once on empty schools.
- `ChecklistCard` on the dashboard with deep-links and resume button.
- New `POST /api/schools/{id}/load-example` endpoint loads canonical example data into an empty school.
```

Also remove `2a` from the "Next Up" list.

Commit:

```bash
git add docs/STATUS.md
git commit -m "docs: mark 2a (onboarding wizard) complete"
```

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: onboarding wizard for new schools (2a)" --body "$(cat <<'EOF'
## Summary

- Adds a dismissible/resumable onboarding wizard that auto-launches once for empty schools.
- New `POST /api/schools/{id}/load-example` endpoint populates a virgin school with canonical example data in a single transaction.
- Dashboard checklist surfaces remaining setup steps with deep-links.

## Spec / Plan

- Spec: `docs/superpowers/specs/2026-04-06-onboarding-wizard-design.md`
- Plan: `docs/superpowers/plans/2026-04-06-onboarding-wizard.md`

## Test plan

- [ ] `just backend-test` — full backend suite green (incl. new `example_data` integration tests)
- [ ] `cd frontend && bun test` — full frontend suite green (incl. hook + 3 component tests)
- [ ] `just check` — fmt/clippy/biome/tsc clean
- [ ] Manual: empty school → wizard auto-opens → "Try example data" → all steps checked → wizard hides
- [ ] Manual: empty school → dismiss wizard → checklist visible → Resume opens at first incomplete step
- [ ] Manual: school with data → wizard does NOT auto-open
EOF
)"
```

- [ ] **Step 4: Watch CI, fix any failures, merge**

After PR is open, monitor `gh pr checks`. Fix any CI failures by creating new commits (do **not** force-push). When green, merge with `gh pr merge --squash --delete-branch`.

---

## Cross-task notes

- **Why no school_year wizard step?** The Term step's `TermsTab` already creates a school_year inline if none exists, or lets the user pick one. Adding a separate school_year step would be redundant.
- **Why curriculum has no embedded component?** The curriculum editor lives at `/schools/{id}/curriculum` and uses URL params from that route. Embedding it in the wizard would require refactoring it into a controlled component, which is out of scope. The wizard step shows a CTA button instead.
- **Why no per-user dismissal flag?** See spec section "Auto-launch rule". The implicit "school is empty" rule is sufficient and avoids a schema change.
- **What if a tab fetches data on mount and the wizard takes a while to render?** The existing tabs already handle their own loading states. The wizard does not need to wait for them.
