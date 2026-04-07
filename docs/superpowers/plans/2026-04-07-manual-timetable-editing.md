# Manual Timetable Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins drag-and-drop applied lessons in `/timetable`, swap occupied cells, and reassign room/teacher via dialog — with server-authoritative re-diagnosis after every edit.

**Architecture:** Two new admin-only backend endpoints (`PATCH .../lessons/{id}` and `POST .../lessons/swap`) reuse the existing `diagnose()` pass to return fresh `Violation[]` after each edit. The list endpoint gains `?include_violations=true` so the page can fetch lessons + violations in one round trip. Frontend wraps `<TimetableGrid>` in `@dnd-kit/core` when `editable` is true; an in-memory undo stack covers the last 10 edits.

**Tech Stack:** Rust/Axum/SeaORM/Loco, `klassenzeit_scheduler` crate (`diagnose`, `to_planning`, `translate_diagnosed`), Next.js 15, React, `@dnd-kit/core`, `@dnd-kit/utilities`, Bun test, Tailwind, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-04-07-manual-timetable-editing-design.md`

---

## File map

### Backend
- **Modify** `backend/src/services/scheduler.rs` — add `evaluate_term_violations(db, school_id, term_id) -> Result<Vec<ViolationDto>>`. Builds a `PlanningSolution` from the DB lessons (instead of the curriculum-derived ones used by `to_planning`) and runs `diagnose` + `translate_diagnosed`.
- **Modify** `backend/src/controllers/lessons.rs` — add `?include_violations=true` to `list`, plus `patch_one` and `swap` handlers, and route them.
- **Modify** `backend/tests/requests/lessons.rs` — new tests for PATCH/swap/list-with-violations.

### Frontend
- **Modify** `frontend/package.json` — add `@dnd-kit/core` and `@dnd-kit/utilities`.
- **Modify** `frontend/src/lib/types.ts` — add `ViolationDto`, `ListLessonsResponse`, `PatchLessonRequest`, `PatchLessonResponse`, `SwapLessonsRequest`, `SwapLessonsResponse`.
- **Modify** `frontend/src/components/timetable/timetable-grid.tsx` — `editable` prop + drag/drop wiring.
- **Create** `frontend/src/components/timetable/lesson-edit-dialog.tsx` — room/teacher reassignment dialog.
- **Create** `frontend/src/components/timetable/undo-toolbar.tsx` — small Undo button.
- **Modify** `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx` — wire edit handlers, undo stack, role gate, fetch with `include_violations=true`, render `<ViolationsPanel>`.
- **Modify** `frontend/messages/en.json` and `frontend/messages/de.json` — strings under a new `timetable.edit.*` namespace.

### Tests
- Backend: extend `backend/tests/requests/lessons.rs`.
- Frontend: `frontend/src/components/timetable/__tests__/timetable-grid.test.tsx` (extend if exists, else create), `frontend/src/components/timetable/__tests__/lesson-edit-dialog.test.tsx`, `frontend/src/components/timetable/__tests__/undo-toolbar.test.tsx`.

---

## Task 1: Backend helper — `evaluate_term_violations`

**Files:**
- Modify: `backend/src/services/scheduler.rs`

Build a helper that, given `(db, school_id, term_id)`, loads applied lessons, runs the existing `diagnose()` constraint pass, and returns `Vec<ViolationDto>`. Reuse `load_schedule_input` (already exists) for facts and `to_planning` for the index maps; then **replace** the planning lessons with the actual DB lesson rows so we evaluate the persisted state, not the curriculum-derived skeleton.

- [ ] **Step 1: Add the helper function**

Append to `backend/src/services/scheduler.rs` (after `to_solve_result`):

```rust
use klassenzeit_scheduler::constraints::diagnose;
use klassenzeit_scheduler::mapper::{to_planning, translate_diagnosed};
use klassenzeit_scheduler::planning::PlanningLesson;

use crate::models::_entities::lessons;

/// Evaluate hard+soft violations for the **applied** lessons of a term.
///
/// Re-uses `load_schedule_input` for facts/index maps but replaces the
/// curriculum-derived planning lessons with the actual DB rows so the
/// diagnosis reflects what's persisted, not what the solver started from.
pub async fn evaluate_term_violations(
    db: &DatabaseConnection,
    school_id: Uuid,
    term_id: Uuid,
) -> Result<Vec<ViolationDto>, sea_orm::DbErr> {
    let input = load_schedule_input(db, school_id, term_id).await?;
    let (mut solution, maps) = to_planning(&input);

    // Replace planning lessons with the actual applied DB rows.
    let db_lessons = lessons::Entity::find()
        .filter(lessons::Column::TermId.eq(term_id))
        .all(db)
        .await?;

    let mut planning_lessons: Vec<PlanningLesson> = Vec::with_capacity(db_lessons.len());
    for (i, l) in db_lessons.iter().enumerate() {
        let class_idx = match maps.class_uuid_to_idx.get(&l.school_class_id) {
            Some(&v) => v,
            None => continue, // class deleted/inactive — skip silently
        };
        let subject_idx = match maps.subject_uuid_to_idx.get(&l.subject_id) {
            Some(&v) => v,
            None => continue,
        };
        let teacher_idx = match maps.teacher_uuid_to_idx.get(&l.teacher_id) {
            Some(&v) => v,
            None => continue,
        };
        let timeslot_idx = match maps.timeslot_uuid_to_idx.get(&l.timeslot_id) {
            Some(&v) => v,
            None => continue,
        };
        let room_idx = l
            .room_id
            .and_then(|rid| maps.room_uuid_to_idx.get(&rid).copied());

        planning_lessons.push(PlanningLesson {
            id: i as u32,
            subject_idx,
            teacher_idx,
            class_idx,
            timeslot: Some(timeslot_idx),
            room: room_idx,
        });
    }

    solution.lessons = planning_lessons;

    let diagnosed = diagnose(&solution.lessons, &solution.facts);
    let violations = translate_diagnosed(diagnosed, &solution, &maps, &input);

    let dtos: Vec<ViolationDto> = violations
        .into_iter()
        .map(|v| ViolationDto {
            kind: v.kind.as_snake_case().to_string(),
            severity: match v.severity {
                sched::Severity::Hard => "hard".to_string(),
                sched::Severity::Soft => "soft".to_string(),
            },
            message: v.message,
            lesson_refs: v
                .lesson_refs
                .into_iter()
                .map(|r| LessonRefDto {
                    class_id: r.class_id,
                    subject_id: r.subject_id,
                    teacher_id: r.teacher_id,
                    room_id: r.room_id,
                    timeslot_id: r.timeslot_id,
                })
                .collect(),
            resources: v
                .resources
                .into_iter()
                .map(|r| match r {
                    sched::ResourceRef::Teacher(id) => ResourceRefDto::Teacher(id),
                    sched::ResourceRef::Class(id) => ResourceRefDto::Class(id),
                    sched::ResourceRef::Room(id) => ResourceRefDto::Room(id),
                    sched::ResourceRef::Subject(id) => ResourceRefDto::Subject(id),
                    sched::ResourceRef::Timeslot(id) => ResourceRefDto::Timeslot(id),
                })
                .collect(),
        })
        .collect();

    Ok(dtos)
}
```

Verify the actual `klassenzeit_scheduler` re-export paths if compilation complains:
- `PlanningLesson` lives in `scheduler/src/planning.rs`.
- `diagnose` in `scheduler/src/constraints.rs` (already public).
- `to_planning` and `translate_diagnosed` in `scheduler/src/mapper.rs` (already public).

If any of these are not currently re-exported, add `pub use` lines in `scheduler/src/lib.rs` for them.

- [ ] **Step 2: Compile**

Run: `cargo check -p klassenzeit-backend`
Expected: clean build. Fix import paths if needed (most likely candidate: `PlanningLesson` may need a different module path — check `scheduler/src/lib.rs`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/scheduler.rs scheduler/src/lib.rs
git commit -m "backend: evaluate_term_violations helper for manual edits"
```

---

## Task 2: Backend — extend `list` with `?include_violations=true`

**Files:**
- Modify: `backend/src/controllers/lessons.rs`

Currently `list` returns `Vec<LessonResponse>`. Behind a query param, switch to a wrapper `{ lessons, violations }`. Default behavior (no query param) is unchanged so existing callers/tests keep working.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/requests/lessons.rs`:

```rust
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p klassenzeit-backend --test mod list_lessons_with_violations_returns_wrapped_object -- --nocapture`
Expected: FAIL — body is currently an array, not an object.

(Reminder: integration tests need `docker compose up -d postgres-dev` plus `just test-db-setup`.)

- [ ] **Step 3: Implement the wrapped response in the handler**

Edit `backend/src/controllers/lessons.rs`. Add a query-param extractor and a new response wrapper, then branch in `list`.

At the top of the file, add:

```rust
use axum::extract::Query;
use serde::Deserialize;

use crate::services::scheduler::{evaluate_term_violations, ViolationDto};

#[derive(Debug, Deserialize, Default)]
struct ListQuery {
    #[serde(default)]
    include_violations: bool,
}

#[derive(Debug, Serialize)]
struct LessonsWithViolations {
    lessons: Vec<LessonResponse>,
    violations: Vec<ViolationDto>,
}
```

Replace the `list` function signature and body with:

```rust
/// GET /api/schools/{school_id}/terms/{term_id}/lessons[?include_violations=true]
async fn list(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ListQuery>,
    school_ctx: SchoolContext,
) -> impl IntoResponse {
    let school_id = school_ctx.school.id;

    // Verify the term belongs to the caller's school via school_years.
    match terms::Entity::find_by_id(term_id)
        .find_also_related(school_years::Entity)
        .one(&ctx.db)
        .await
    {
        Ok(Some((_term, Some(year)))) if year.school_id == school_id => {}
        Ok(_) => {
            return (StatusCode::NOT_FOUND, "term not found".to_string()).into_response();
        }
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    let items = match lessons::Entity::find()
        .filter(lessons::Column::TermId.eq(term_id))
        .all(&ctx.db)
        .await
    {
        Ok(items) => items,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let lesson_responses: Vec<LessonResponse> =
        items.into_iter().map(LessonResponse::from).collect();

    if query.include_violations {
        let violations = match evaluate_term_violations(&ctx.db, school_id, term_id).await {
            Ok(v) => v,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
        };
        axum::Json(LessonsWithViolations {
            lessons: lesson_responses,
            violations,
        })
        .into_response()
    } else {
        axum::Json(lesson_responses).into_response()
    }
}
```

- [ ] **Step 4: Run the new test and the existing list tests**

Run: `cargo test -p klassenzeit-backend --test mod list_lessons -- --nocapture`
Expected: all `list_lessons*` tests pass (the existing array-shape tests still pass because `include_violations` defaults to false).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/lessons.rs backend/tests/requests/lessons.rs
git commit -m "backend(lessons): include_violations query param on list"
```

---

## Task 3: Backend — `PATCH /api/schools/{school_id}/terms/{term_id}/lessons/{lesson_id}`

**Files:**
- Modify: `backend/src/controllers/lessons.rs`
- Modify: `backend/tests/requests/lessons.rs`

- [ ] **Step 1: Write the failing happy-path test**

Append to `backend/tests/requests/lessons.rs`:

```rust
#[tokio::test]
#[serial]
async fn patch_lesson_moves_to_new_timeslot() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "lesson-patch-move").await;
        let term = create_term(&ctx, school.id, "2025/2026", "Term").await;
        let lesson = create_lesson_in_term(&ctx, school.id, term.id, "pm1").await;

        // Create a second timeslot we can move into.
        let new_ts = time_slots::ActiveModel::new(
            school.id,
            2,
            3,
            chrono::NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            chrono::NaiveTime::from_hms_opt(9, 45, 0).unwrap(),
        )
        .insert(&ctx.db)
        .await
        .unwrap();

        let resp = server
            .patch(&format!(
                "/api/schools/{}/terms/{}/lessons/{}",
                school.id, term.id, lesson.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "timeslot_id": new_ts.id }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert_eq!(body["lesson"]["id"], lesson.id.to_string());
        assert_eq!(body["lesson"]["timeslot_id"], new_ts.id.to_string());
        assert!(body["violations"].is_array());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn patch_lesson_rejected_for_non_admin() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) =
            setup_school_with_role(&ctx, &kp, "lesson-patch-noadm", "teacher").await;
        let term = create_term(&ctx, school.id, "2025/2026", "Term").await;
        let lesson = create_lesson_in_term(&ctx, school.id, term.id, "pn1").await;

        let new_ts = time_slots::ActiveModel::new(
            school.id,
            1,
            2,
            chrono::NaiveTime::from_hms_opt(9, 0, 0).unwrap(),
            chrono::NaiveTime::from_hms_opt(9, 45, 0).unwrap(),
        )
        .insert(&ctx.db)
        .await
        .unwrap();

        let resp = server
            .patch(&format!(
                "/api/schools/{}/terms/{}/lessons/{}",
                school.id, term.id, lesson.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({ "timeslot_id": new_ts.id }))
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn patch_lesson_rejected_when_timeslot_belongs_to_other_school() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school_a, token) = setup_admin_school(&ctx, &kp, "lesson-patch-cross").await;
        let term = create_term(&ctx, school_a.id, "2025/2026", "Term").await;
        let lesson = create_lesson_in_term(&ctx, school_a.id, term.id, "pc1").await;

        let school_b = schools::ActiveModel::new(
            "lesson-patch-cross-b".into(),
            "lesson-patch-cross-b-slug".into(),
        )
        .insert(&ctx.db)
        .await
        .unwrap();

        let foreign_ts = time_slots::ActiveModel::new(
            school_b.id,
            0,
            1,
            chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap(),
            chrono::NaiveTime::from_hms_opt(8, 45, 0).unwrap(),
        )
        .insert(&ctx.db)
        .await
        .unwrap();

        let resp = server
            .patch(&format!(
                "/api/schools/{}/terms/{}/lessons/{}",
                school_a.id, term.id, lesson.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school_a.id.to_string(),
            )
            .json(&serde_json::json!({ "timeslot_id": foreign_ts.id }))
            .await;

        resp.assert_status(StatusCode::BAD_REQUEST);
    })
    .await;
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-backend --test mod patch_lesson -- --nocapture`
Expected: FAIL — handler does not exist (404 Method Not Allowed or similar).

- [ ] **Step 3: Implement the PATCH handler**

In `backend/src/controllers/lessons.rs`, add (above `pub fn routes`):

```rust
use crate::models::_entities::{rooms, teachers as teacher_entities};

#[derive(Debug, Deserialize)]
struct PatchLessonRequest {
    #[serde(default)]
    timeslot_id: Option<Uuid>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    room_id: Option<Option<Uuid>>,
    #[serde(default)]
    teacher_id: Option<Uuid>,
}

// Distinguishes "field absent" (None) from "field present and null" (Some(None)).
fn deserialize_double_option<'de, D>(deserializer: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Option<Uuid>>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Serialize)]
struct PatchLessonResponse {
    lesson: LessonResponse,
    violations: Vec<ViolationDto>,
}

async fn require_admin_or_403(school_ctx: &SchoolContext) -> Result<(), (StatusCode, String)> {
    if school_ctx.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Admin access required".to_string()));
    }
    Ok(())
}

/// PATCH /api/schools/{school_id}/terms/{term_id}/lessons/{lesson_id}
async fn patch_one(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id, lesson_id)): Path<(Uuid, Uuid, Uuid)>,
    school_ctx: SchoolContext,
    axum::Json(body): axum::Json<PatchLessonRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_admin_or_403(&school_ctx).await?;
    let school_id = school_ctx.school.id;

    // Confirm term belongs to caller's school.
    match terms::Entity::find_by_id(term_id)
        .find_also_related(school_years::Entity)
        .one(&ctx.db)
        .await
    {
        Ok(Some((_term, Some(year)))) if year.school_id == school_id => {}
        Ok(_) => return Err((StatusCode::NOT_FOUND, "term not found".to_string())),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }

    // Load lesson and verify it belongs to that term.
    let lesson_model = lessons::Entity::find_by_id(lesson_id)
        .one(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "lesson not found".to_string()))?;
    if lesson_model.term_id != term_id {
        return Err((StatusCode::NOT_FOUND, "lesson not in term".to_string()));
    }

    // Validate provided timeslot.
    if let Some(ts_id) = body.timeslot_id {
        let ts = time_slots::Entity::find_by_id(ts_id)
            .one(&ctx.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((StatusCode::BAD_REQUEST, "timeslot not found".to_string()))?;
        if ts.school_id != school_id {
            return Err((
                StatusCode::BAD_REQUEST,
                "timeslot belongs to a different school".to_string(),
            ));
        }
        if ts.is_break {
            return Err((
                StatusCode::BAD_REQUEST,
                "cannot place a lesson on a break timeslot".to_string(),
            ));
        }
    }

    // Validate provided room (Some(Some(_))).
    if let Some(Some(rid)) = body.room_id {
        let room = rooms::Entity::find_by_id(rid)
            .one(&ctx.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((StatusCode::BAD_REQUEST, "room not found".to_string()))?;
        if room.school_id != school_id {
            return Err((
                StatusCode::BAD_REQUEST,
                "room belongs to a different school".to_string(),
            ));
        }
    }

    // Validate provided teacher.
    if let Some(tid) = body.teacher_id {
        let teacher = teacher_entities::Entity::find_by_id(tid)
            .one(&ctx.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((StatusCode::BAD_REQUEST, "teacher not found".to_string()))?;
        if teacher.school_id != school_id {
            return Err((
                StatusCode::BAD_REQUEST,
                "teacher belongs to a different school".to_string(),
            ));
        }
    }

    // Build the update.
    let mut active: lessons::ActiveModel = lesson_model.into();
    if let Some(ts) = body.timeslot_id {
        active.timeslot_id = Set(ts);
    }
    if let Some(room_opt) = body.room_id {
        active.room_id = Set(room_opt);
    }
    if let Some(tch) = body.teacher_id {
        active.teacher_id = Set(tch);
    }
    active.updated_at = Set(chrono::Utc::now().into());

    let updated = active
        .update(&ctx.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let violations = evaluate_term_violations(&ctx.db, school_id, term_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(axum::Json(PatchLessonResponse {
        lesson: LessonResponse::from(updated),
        violations,
    }))
}
```

Add the import at the top:

```rust
use sea_orm::Set;
```

Also add a `Set` import alongside the existing SeaORM imports if not present (currently the file only imports `ColumnTrait, EntityTrait, QueryFilter`).

Then update `routes()`:

```rust
pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}/terms")
        .add("/{term_id}/lessons", get(list))
        .add("/{term_id}/lessons/{lesson_id}", patch(patch_one))
}
```

Add `patch` to the `loco_rs::prelude::*` already imported — `loco_rs::prelude` re-exports the axum routing helpers; if `patch` isn't re-exported, import it explicitly: `use axum::routing::patch;`.

- [ ] **Step 4: Run the PATCH tests**

Run: `cargo test -p klassenzeit-backend --test mod patch_lesson -- --nocapture`
Expected: all three tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/lessons.rs backend/tests/requests/lessons.rs
git commit -m "backend(lessons): admin PATCH endpoint with re-diagnosis"
```

---

## Task 4: Backend — `POST /api/schools/{school_id}/terms/{term_id}/lessons/swap`

**Files:**
- Modify: `backend/src/controllers/lessons.rs`
- Modify: `backend/tests/requests/lessons.rs`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/requests/lessons.rs`:

```rust
#[tokio::test]
#[serial]
async fn swap_lessons_exchanges_timeslot_and_room() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "lesson-swap").await;
        let term = create_term(&ctx, school.id, "2025/2026", "Term").await;
        let l1 = create_lesson_in_term(&ctx, school.id, term.id, "sw1").await;
        let l2 = create_lesson_in_term(&ctx, school.id, term.id, "sw2").await;

        // Pre-assign distinct rooms so we can verify they swap.
        let r1 = klassenzeit_backend::models::rooms::ActiveModel::new(
            school.id,
            "Room A".into(),
        )
        .insert(&ctx.db)
        .await
        .unwrap();
        let r2 = klassenzeit_backend::models::rooms::ActiveModel::new(
            school.id,
            "Room B".into(),
        )
        .insert(&ctx.db)
        .await
        .unwrap();

        // Patch each lesson to its room via SeaORM directly to keep the test focused.
        let mut a1: lessons::ActiveModel = l1.clone().into();
        a1.room_id = sea_orm::ActiveValue::Set(Some(r1.id));
        a1.update(&ctx.db).await.unwrap();
        let mut a2: lessons::ActiveModel = l2.clone().into();
        a2.room_id = sea_orm::ActiveValue::Set(Some(r2.id));
        a2.update(&ctx.db).await.unwrap();

        let original_ts1 = l1.timeslot_id;
        let original_ts2 = l2.timeslot_id;

        let resp = server
            .post(&format!(
                "/api/schools/{}/terms/{}/lessons/swap",
                school.id, term.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "lesson_a_id": l1.id,
                "lesson_b_id": l2.id,
            }))
            .await;

        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        let arr = body["lessons"].as_array().expect("lessons array");
        assert_eq!(arr.len(), 2);

        // Reload from DB and verify the swap landed.
        let after_l1 = lessons::Entity::find_by_id(l1.id)
            .one(&ctx.db)
            .await
            .unwrap()
            .unwrap();
        let after_l2 = lessons::Entity::find_by_id(l2.id)
            .one(&ctx.db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(after_l1.timeslot_id, original_ts2);
        assert_eq!(after_l2.timeslot_id, original_ts1);
        assert_eq!(after_l1.room_id, Some(r2.id));
        assert_eq!(after_l2.room_id, Some(r1.id));

        assert!(body["violations"].is_array());
    })
    .await;
}

#[tokio::test]
#[serial]
async fn swap_lessons_rejected_for_non_admin() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) =
            setup_school_with_role(&ctx, &kp, "lesson-swap-noadm", "teacher").await;
        let term = create_term(&ctx, school.id, "2025/2026", "Term").await;
        let l1 = create_lesson_in_term(&ctx, school.id, term.id, "sn1").await;
        let l2 = create_lesson_in_term(&ctx, school.id, term.id, "sn2").await;

        let resp = server
            .post(&format!(
                "/api/schools/{}/terms/{}/lessons/swap",
                school.id, term.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "lesson_a_id": l1.id,
                "lesson_b_id": l2.id,
            }))
            .await;

        resp.assert_status(StatusCode::FORBIDDEN);
    })
    .await;
}

#[tokio::test]
#[serial]
async fn swap_lessons_rejected_when_terms_differ() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_admin_school(&ctx, &kp, "lesson-swap-terms").await;
        let term_a = create_term(&ctx, school.id, "2025/2026", "Term A").await;
        let term_b = create_term(&ctx, school.id, "2026/2027", "Term B").await;
        let l_a = create_lesson_in_term(&ctx, school.id, term_a.id, "st1").await;
        let l_b = create_lesson_in_term(&ctx, school.id, term_b.id, "st2").await;

        let resp = server
            .post(&format!(
                "/api/schools/{}/terms/{}/lessons/swap",
                school.id, term_a.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token}"))
            .add_header(
                HeaderName::from_static("x-school-id"),
                school.id.to_string(),
            )
            .json(&serde_json::json!({
                "lesson_a_id": l_a.id,
                "lesson_b_id": l_b.id,
            }))
            .await;

        resp.assert_status(StatusCode::BAD_REQUEST);
    })
    .await;
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p klassenzeit-backend --test mod swap_lessons -- --nocapture`
Expected: FAIL — endpoint doesn't exist.

- [ ] **Step 3: Implement the swap handler**

Add to `backend/src/controllers/lessons.rs`:

```rust
use sea_orm::TransactionTrait;

#[derive(Debug, Deserialize)]
struct SwapLessonsRequest {
    lesson_a_id: Uuid,
    lesson_b_id: Uuid,
}

#[derive(Debug, Serialize)]
struct SwapLessonsResponse {
    lessons: Vec<LessonResponse>,
    violations: Vec<ViolationDto>,
}

/// POST /api/schools/{school_id}/terms/{term_id}/lessons/swap
async fn swap(
    State(ctx): State<AppContext>,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
    school_ctx: SchoolContext,
    axum::Json(body): axum::Json<SwapLessonsRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    require_admin_or_403(&school_ctx).await?;
    let school_id = school_ctx.school.id;

    // Verify the term belongs to the caller's school.
    match terms::Entity::find_by_id(term_id)
        .find_also_related(school_years::Entity)
        .one(&ctx.db)
        .await
    {
        Ok(Some((_term, Some(year)))) if year.school_id == school_id => {}
        Ok(_) => return Err((StatusCode::NOT_FOUND, "term not found".to_string())),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }

    if body.lesson_a_id == body.lesson_b_id {
        return Err((
            StatusCode::BAD_REQUEST,
            "cannot swap a lesson with itself".to_string(),
        ));
    }

    let txn = ctx
        .db
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let l_a = lessons::Entity::find_by_id(body.lesson_a_id)
        .one(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "lesson_a not found".to_string()))?;
    let l_b = lessons::Entity::find_by_id(body.lesson_b_id)
        .one(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "lesson_b not found".to_string()))?;

    if l_a.term_id != term_id || l_b.term_id != term_id {
        return Err((
            StatusCode::BAD_REQUEST,
            "both lessons must belong to the requested term".to_string(),
        ));
    }

    let (a_ts, a_room) = (l_a.timeslot_id, l_a.room_id);
    let (b_ts, b_room) = (l_b.timeslot_id, l_b.room_id);
    let now = chrono::Utc::now();

    let mut a_active: lessons::ActiveModel = l_a.into();
    a_active.timeslot_id = Set(b_ts);
    a_active.room_id = Set(b_room);
    a_active.updated_at = Set(now.into());
    let updated_a = a_active
        .update(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut b_active: lessons::ActiveModel = l_b.into();
    b_active.timeslot_id = Set(a_ts);
    b_active.room_id = Set(a_room);
    b_active.updated_at = Set(now.into());
    let updated_b = b_active
        .update(&txn)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    txn.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let violations = evaluate_term_violations(&ctx.db, school_id, term_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(axum::Json(SwapLessonsResponse {
        lessons: vec![
            LessonResponse::from(updated_a),
            LessonResponse::from(updated_b),
        ],
        violations,
    }))
}
```

Update `routes()`:

```rust
pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{school_id}/terms")
        .add("/{term_id}/lessons", get(list))
        .add("/{term_id}/lessons/swap", post(swap))
        .add("/{term_id}/lessons/{lesson_id}", patch(patch_one))
}
```

Note the route order: `/lessons/swap` must be declared before `/lessons/{lesson_id}` so axum's matcher prefers the literal segment. (Loco's `Routes` is order-preserving — verify with the existing scheduler controller pattern; if matcher complains about ambiguity, rename swap to `/lessons-swap` to sidestep it.)

- [ ] **Step 4: Run swap tests**

Run: `cargo test -p klassenzeit-backend --test mod swap_lessons -- --nocapture`
Expected: all three tests pass.

- [ ] **Step 5: Run full lessons test module**

Run: `cargo test -p klassenzeit-backend --test mod lessons -- --nocapture`
Expected: every test in `tests/requests/lessons.rs` passes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/lessons.rs backend/tests/requests/lessons.rs
git commit -m "backend(lessons): admin swap endpoint with transactional update"
```

---

## Task 5: Frontend — install drag library and add types

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Install dnd-kit**

```bash
cd frontend && bun add @dnd-kit/core @dnd-kit/utilities && cd -
```

Expected: both packages added to `dependencies` in `frontend/package.json`.

- [ ] **Step 2: Add types**

Edit `frontend/src/lib/types.ts`. Find the existing `LessonResponse` and add below it:

```ts
export interface ViolationLessonRef {
  class_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string | null;
  timeslot_id: string;
}

export interface ViolationResourceRef {
  type: "teacher" | "class" | "room" | "subject" | "timeslot";
  id: string;
}

export interface ViolationDto {
  kind: string;
  severity: "hard" | "soft";
  message: string;
  lesson_refs: ViolationLessonRef[];
  resources: ViolationResourceRef[];
}

export interface ListLessonsResponse {
  lessons: LessonResponse[];
  violations: ViolationDto[];
}

export interface PatchLessonRequest {
  timeslot_id?: string;
  room_id?: string | null;
  teacher_id?: string;
}

export interface PatchLessonResponse {
  lesson: LessonResponse;
  violations: ViolationDto[];
}

export interface SwapLessonsRequest {
  lesson_a_id: string;
  lesson_b_id: string;
}

export interface SwapLessonsResponse {
  lessons: LessonResponse[];
  violations: ViolationDto[];
}
```

If `ViolationDto` (or an equivalent) already exists from PR 2d, **reuse it**: search the file (`grep -n "Violation" frontend/src/lib/types.ts`) and skip the duplicate definition. The other types are new regardless.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && bunx tsc --noEmit && cd -`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/bun.lock frontend/src/lib/types.ts
git commit -m "frontend: add @dnd-kit/core and edit-lesson types"
```

---

## Task 6: Frontend — `<LessonEditDialog>`

**Files:**
- Create: `frontend/src/components/timetable/lesson-edit-dialog.tsx`
- Create: `frontend/src/components/timetable/__tests__/lesson-edit-dialog.test.tsx`

A simple modal with two selects (room, teacher), an Apply button, and a Cancel button. It does NOT call the API itself — it calls a callback with the **changed fields only**.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/timetable/__tests__/lesson-edit-dialog.test.tsx`:

```tsx
import { describe, expect, test, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { LessonEditDialog } from "../lesson-edit-dialog";
import type { LessonResponse, RoomResponse, TeacherResponse } from "@/lib/types";

const lesson: LessonResponse = {
  id: "lesson-1",
  term_id: "term-1",
  class_id: "class-1",
  teacher_id: "teacher-1",
  subject_id: "subject-1",
  room_id: "room-1",
  timeslot_id: "ts-1",
  week_pattern: "every",
};

const teachers: TeacherResponse[] = [
  { id: "teacher-1", first_name: "A", last_name: "X", abbreviation: "AX" } as TeacherResponse,
  { id: "teacher-2", first_name: "B", last_name: "Y", abbreviation: "BY" } as TeacherResponse,
];

const rooms: RoomResponse[] = [
  { id: "room-1", name: "R1" } as RoomResponse,
  { id: "room-2", name: "R2" } as RoomResponse,
];

describe("LessonEditDialog", () => {
  test("submits only the changed teacher_id", () => {
    const onSubmit = mock();
    const { getByLabelText, getByText } = render(
      <LessonEditDialog
        open
        lesson={lesson}
        teachers={teachers}
        rooms={rooms}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(getByLabelText("Teacher"), { target: { value: "teacher-2" } });
    fireEvent.click(getByText("Apply"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({ teacher_id: "teacher-2" });
  });

  test("submits room_id: null when room is cleared", () => {
    const onSubmit = mock();
    const { getByLabelText, getByText } = render(
      <LessonEditDialog
        open
        lesson={lesson}
        teachers={teachers}
        rooms={rooms}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(getByLabelText("Room"), { target: { value: "" } });
    fireEvent.click(getByText("Apply"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({ room_id: null });
  });

  test("does nothing when no fields changed", () => {
    const onSubmit = mock();
    const { getByText } = render(
      <LessonEditDialog
        open
        lesson={lesson}
        teachers={teachers}
        rooms={rooms}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(getByText("Apply"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && bun test src/components/timetable/__tests__/lesson-edit-dialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dialog**

Create `frontend/src/components/timetable/lesson-edit-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  LessonResponse,
  PatchLessonRequest,
  RoomResponse,
  TeacherResponse,
} from "@/lib/types";

interface Props {
  open: boolean;
  lesson: LessonResponse | null;
  teachers: TeacherResponse[];
  rooms: RoomResponse[];
  onClose: () => void;
  onSubmit: (changes: PatchLessonRequest) => void;
}

export function LessonEditDialog({
  open,
  lesson,
  teachers,
  rooms,
  onClose,
  onSubmit,
}: Props) {
  const t = useTranslations("timetable.edit");
  const [teacherId, setTeacherId] = useState<string>(lesson?.teacher_id ?? "");
  const [roomId, setRoomId] = useState<string>(lesson?.room_id ?? "");

  // Reset local state when the lesson changes (parent reuses the same dialog).
  if (lesson && lesson.teacher_id !== teacherId && teacherId === "") {
    setTeacherId(lesson.teacher_id);
  }

  function handleApply() {
    if (!lesson) return;
    const changes: PatchLessonRequest = {};
    if (teacherId && teacherId !== lesson.teacher_id) {
      changes.teacher_id = teacherId;
    }
    const currentRoom = lesson.room_id ?? "";
    if (roomId !== currentRoom) {
      changes.room_id = roomId === "" ? null : roomId;
    }
    if (Object.keys(changes).length === 0) {
      return; // nothing to submit
    }
    onSubmit(changes);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="lesson-edit-teacher">Teacher</Label>
            <select
              id="lesson-edit-teacher"
              aria-label="Teacher"
              className="rounded border px-2 py-1"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              {teachers.map((tch) => (
                <option key={tch.id} value={tch.id}>
                  {tch.first_name} {tch.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="lesson-edit-room">Room</Label>
            <select
              id="lesson-edit-room"
              aria-label="Room"
              className="rounded border px-2 py-1"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              <option value="">{t("noRoom")}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={handleApply}>{t("apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

If `next-intl`'s `useTranslations` is unavailable in the test environment, the existing test setup in this repo already mocks it (verify by checking `frontend/bunfig.toml` or `frontend/test-setup.ts`). If not, the test failure will be obvious and the fix is to replace `t("apply")` etc. with literals — but check the existing pattern first since it'll already be set up for the other timetable component tests.

- [ ] **Step 4: Add i18n strings**

Edit `frontend/messages/en.json`. Add under `timetable`:

```json
"edit": {
  "title": "Edit lesson",
  "apply": "Apply",
  "cancel": "Cancel",
  "noRoom": "— No room —",
  "undo": "Undo",
  "moveError": "Could not move lesson",
  "swapError": "Could not swap lessons",
  "patchError": "Could not update lesson"
}
```

Edit `frontend/messages/de.json`. Add under `timetable`:

```json
"edit": {
  "title": "Stunde bearbeiten",
  "apply": "Übernehmen",
  "cancel": "Abbrechen",
  "noRoom": "— Kein Raum —",
  "undo": "Rückgängig",
  "moveError": "Stunde konnte nicht verschoben werden",
  "swapError": "Stunden konnten nicht getauscht werden",
  "patchError": "Stunde konnte nicht aktualisiert werden"
}
```

- [ ] **Step 5: Run the dialog test**

Run: `cd frontend && bun test src/components/timetable/__tests__/lesson-edit-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/timetable/lesson-edit-dialog.tsx \
        frontend/src/components/timetable/__tests__/lesson-edit-dialog.test.tsx \
        frontend/messages/en.json frontend/messages/de.json
git commit -m "frontend(timetable): LessonEditDialog with diff-only submit"
```

---

## Task 7: Frontend — `<UndoToolbar>`

**Files:**
- Create: `frontend/src/components/timetable/undo-toolbar.tsx`
- Create: `frontend/src/components/timetable/__tests__/undo-toolbar.test.tsx`

A button — disabled when stack is empty, calls `onUndo` otherwise.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/timetable/__tests__/undo-toolbar.test.tsx`:

```tsx
import { describe, expect, test, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { UndoToolbar } from "../undo-toolbar";

describe("UndoToolbar", () => {
  test("button disabled when canUndo is false", () => {
    const { getByRole } = render(<UndoToolbar canUndo={false} onUndo={() => {}} />);
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  test("calls onUndo when clicked", () => {
    const onUndo = mock();
    const { getByRole } = render(<UndoToolbar canUndo={true} onUndo={onUndo} />);
    fireEvent.click(getByRole("button"));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verify it fails**

Run: `cd frontend && bun test src/components/timetable/__tests__/undo-toolbar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `frontend/src/components/timetable/undo-toolbar.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";

interface Props {
  canUndo: boolean;
  onUndo: () => void;
}

export function UndoToolbar({ canUndo, onUndo }: Props) {
  const t = useTranslations("timetable.edit");
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!canUndo}
      onClick={onUndo}
      aria-label={t("undo")}
    >
      <Undo2 className="mr-1 h-4 w-4" />
      {t("undo")}
    </Button>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `cd frontend && bun test src/components/timetable/__tests__/undo-toolbar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/timetable/undo-toolbar.tsx \
        frontend/src/components/timetable/__tests__/undo-toolbar.test.tsx
git commit -m "frontend(timetable): UndoToolbar component"
```

---

## Task 8: Frontend — make `<TimetableGrid>` editable

**Files:**
- Modify: `frontend/src/components/timetable/timetable-grid.tsx`
- Modify or Create: `frontend/src/components/timetable/__tests__/timetable-grid.test.tsx`

Add an `editable` prop. When true, wrap the table in `<DndContext>`, make filled cells draggable and all non-break cells droppable, and call `onLessonMove`/`onLessonSwap`/`onLessonEdit`.

- [ ] **Step 1: Write the failing test for editable affordances**

If `frontend/src/components/timetable/__tests__/timetable-grid.test.tsx` already exists, append. Otherwise create it.

```tsx
import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { TimetableGrid } from "../timetable-grid";
import type {
  LessonResponse,
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TimeSlotResponse,
} from "@/lib/types";

const baseProps = {
  lessons: [
    {
      id: "l1",
      term_id: "t",
      class_id: "c1",
      teacher_id: "tch1",
      subject_id: "sub1",
      room_id: "r1",
      timeslot_id: "ts1",
      week_pattern: "every",
    } satisfies LessonResponse,
  ],
  viewMode: "class" as const,
  selectedEntityId: "c1",
  timeslots: [
    {
      id: "ts1",
      day_of_week: 0,
      period: 1,
      is_break: false,
    } as unknown as TimeSlotResponse,
  ],
  subjects: [{ id: "sub1", abbreviation: "M" } as SubjectResponse],
  teachers: [{ id: "tch1", abbreviation: "AB" } as TeacherResponse],
  rooms: [{ id: "r1", name: "R1" } as RoomResponse],
  classes: [{ id: "c1", name: "1a" } as SchoolClassResponse],
  locale: "en",
};

describe("TimetableGrid editable mode", () => {
  test("renders no edit kebab when editable is false", () => {
    const { queryAllByLabelText } = render(<TimetableGrid {...baseProps} />);
    expect(queryAllByLabelText("Edit lesson")).toHaveLength(0);
  });

  test("renders edit kebab on each lesson when editable is true", () => {
    const { queryAllByLabelText } = render(
      <TimetableGrid {...baseProps} editable onLessonEdit={() => {}} />,
    );
    expect(queryAllByLabelText("Edit lesson")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Verify the new tests fail**

Run: `cd frontend && bun test src/components/timetable/__tests__/timetable-grid.test.tsx`
Expected: FAIL — `editable` prop unknown / kebab not rendered.

- [ ] **Step 3: Add drag-and-drop wiring**

Edit `frontend/src/components/timetable/timetable-grid.tsx`. Replace the file contents with:

```tsx
"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { MoreVertical } from "lucide-react";
import type {
  LessonResponse,
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TimeSlotResponse,
  TimetableLesson,
  TimetableViewMode,
} from "@/lib/types";

const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_LABELS_DE = ["Mo", "Di", "Mi", "Do", "Fr"];

interface TimetableGridProps {
  lessons: TimetableLesson[];
  viewMode: TimetableViewMode;
  selectedEntityId: string | null;
  timeslots: TimeSlotResponse[];
  subjects: SubjectResponse[];
  teachers: TeacherResponse[];
  rooms: RoomResponse[];
  classes: SchoolClassResponse[];
  locale: string;
  highlightedCells?: Set<string>;
  highlightTone?: "error" | "warn";
  editable?: boolean;
  onLessonMove?: (lessonId: string, targetTimeslotId: string) => void;
  onLessonSwap?: (lessonAId: string, lessonBId: string) => void;
  onLessonEdit?: (lessonId: string) => void;
}

interface DraggableLessonProps {
  lesson: TimetableLesson;
  children: React.ReactNode;
}

function DraggableLesson({ lesson, children }: DraggableLessonProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lesson:${lesson.id}`,
    data: { lessonId: lesson.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab ${isDragging ? "opacity-40" : ""}`}
    >
      {children}
    </div>
  );
}

interface DropCellProps {
  timeslotId: string;
  occupantLessonId: string | null;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function DropCell({
  timeslotId,
  occupantLessonId,
  className,
  style,
  children,
}: DropCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${timeslotId}`,
    data: { timeslotId, occupantLessonId },
  });
  return (
    <td
      ref={setNodeRef}
      className={`${className} ${
        isOver ? "outline outline-2 outline-dashed outline-blue-400" : ""
      }`}
      style={style}
    >
      {children}
    </td>
  );
}

export function TimetableGrid({
  lessons,
  viewMode,
  selectedEntityId,
  timeslots,
  subjects,
  teachers,
  rooms,
  classes,
  locale,
  highlightedCells,
  highlightTone = "error",
  editable = false,
  onLessonMove,
  onLessonSwap,
  onLessonEdit,
}: TimetableGridProps) {
  const dayLabels = locale === "de" ? DAY_LABELS_DE : DAY_LABELS_EN;
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const timeslotMap = new Map(timeslots.map((ts) => [ts.id, ts]));

  const periods = [
    ...new Set(timeslots.filter((ts) => !ts.is_break).map((ts) => ts.period)),
  ].sort((a, b) => a - b);

  // Pointer activation distance prevents accidental drags during clicks on the kebab.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function lessonMatchesEntity(lesson: TimetableLesson): boolean {
    if (!selectedEntityId) return false;
    switch (viewMode) {
      case "class":
        return lesson.class_id === selectedEntityId;
      case "teacher":
        return lesson.teacher_id === selectedEntityId;
      case "room":
        return lesson.room_id === selectedEntityId;
    }
  }

  function getLessonForCell(day: number, period: number) {
    return lessons.find((lesson) => {
      const ts = timeslotMap.get(lesson.timeslot_id);
      return (
        ts &&
        ts.day_of_week === day &&
        ts.period === period &&
        lessonMatchesEntity(lesson)
      );
    });
  }

  function findTimeslotIdFor(day: number, period: number): string | null {
    const ts = timeslots.find(
      (t) => !t.is_break && t.day_of_week === day && t.period === period,
    );
    return ts?.id ?? null;
  }

  function renderCellContent(lesson: TimetableLesson) {
    const subject = subjectMap.get(lesson.subject_id);
    const teacher = teacherMap.get(lesson.teacher_id);
    const room = lesson.room_id ? roomMap.get(lesson.room_id) : null;
    const cls = classMap.get(lesson.class_id);

    let bottom = "";
    switch (viewMode) {
      case "class":
        bottom = `${teacher?.abbreviation ?? ""}${room ? ` - ${room.name}` : ""}`;
        break;
      case "teacher":
        bottom = `${cls?.name ?? ""}${room ? ` - ${room.name}` : ""}`;
        break;
      case "room":
        bottom = `${cls?.name ?? ""}${teacher ? ` - ${teacher.abbreviation}` : ""}`;
        break;
    }

    const inner = (
      <div className="text-center">
        <div className="font-medium">{subject?.abbreviation ?? ""}</div>
        <div className="text-xs text-muted-foreground">{bottom}</div>
      </div>
    );

    if (!editable) return inner;

    return (
      <div className="relative">
        <DraggableLesson lesson={lesson}>{inner}</DraggableLesson>
        <button
          type="button"
          aria-label="Edit lesson"
          className="absolute right-0 top-0 rounded p-0.5 text-muted-foreground hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation();
            onLessonEdit?.(lesson.id);
          }}
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </div>
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const lessonId = (e.active.data.current as { lessonId?: string } | undefined)
      ?.lessonId;
    const targetTimeslotId = (
      e.over.data.current as { timeslotId?: string } | undefined
    )?.timeslotId;
    const occupantLessonId = (
      e.over.data.current as { occupantLessonId?: string | null } | undefined
    )?.occupantLessonId;
    if (!lessonId || !targetTimeslotId) return;
    if (occupantLessonId && occupantLessonId !== lessonId) {
      onLessonSwap?.(lessonId, occupantLessonId);
    } else if (!occupantLessonId) {
      onLessonMove?.(lessonId, targetTimeslotId);
    }
  }

  const grid = (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-2 text-left font-medium" />
            {dayLabels.map((day) => (
              <th key={day} className="p-2 text-center font-medium">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={`period-${period}`} className="border-b">
              <td className="p-2 text-center font-medium text-muted-foreground">
                {period}
              </td>
              {[0, 1, 2, 3, 4].map((day) => {
                const lesson = getLessonForCell(day, period);
                const cellKey = `${day}-${period}`;
                const isHighlighted = highlightedCells?.has(cellKey) ?? false;
                const ringClass = isHighlighted
                  ? highlightTone === "warn"
                    ? "ring-2 ring-amber-500 ring-offset-1 animate-[pulse_600ms_ease-out_1]"
                    : "ring-2 ring-red-500 ring-offset-1 animate-[pulse_600ms_ease-out_1]"
                  : "";
                const baseClass = `border-l p-2 ${ringClass}`;
                const subject = lesson
                  ? subjectMap.get(lesson.subject_id)
                  : null;
                const color = subject?.color ?? null;
                const style = color
                  ? { backgroundColor: `${color}20` }
                  : undefined;

                if (!editable) {
                  return (
                    <td
                      key={`cell-${day}-${period}`}
                      className={baseClass}
                      style={style}
                    >
                      {lesson ? renderCellContent(lesson) : null}
                    </td>
                  );
                }

                const tsId = findTimeslotIdFor(day, period);
                if (!tsId) {
                  return (
                    <td key={`cell-${day}-${period}`} className={baseClass} />
                  );
                }
                return (
                  <DropCell
                    key={`cell-${day}-${period}`}
                    timeslotId={tsId}
                    occupantLessonId={lesson?.id ?? null}
                    className={baseClass}
                    style={style}
                  >
                    {lesson ? renderCellContent(lesson) : null}
                  </DropCell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!editable) return grid;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {grid}
    </DndContext>
  );
}
```

- [ ] **Step 4: Run grid tests**

Run: `cd frontend && bun test src/components/timetable/__tests__/timetable-grid.test.tsx`
Expected: PASS for both new tests; any pre-existing tests in the file still pass.

- [ ] **Step 5: Run frontend full test suite + typecheck**

Run: `cd frontend && bun test && bunx tsc --noEmit && cd -`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/timetable/timetable-grid.tsx \
        frontend/src/components/timetable/__tests__/timetable-grid.test.tsx
git commit -m "frontend(timetable): editable mode with drag, drop, swap, edit kebab"
```

---

## Task 9: Frontend — wire `/timetable` page (edit handlers, undo, role gate, violations)

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx`

This is the integration step. The page needs to:
1. Fetch lessons with `?include_violations=true` (returns the wrapped object).
2. Hold both `lessons` and `violations` in state.
3. Get the user's role for the school (gate edit features behind admin).
4. Implement `handleMove`, `handleSwap`, `handleEdit` with optimistic updates and rollback.
5. Maintain an in-memory undo stack (capped at 10) and a `handleUndo` function that issues the inverse PATCH.
6. Render `<UndoToolbar>`, `<LessonEditDialog>`, and (if it's already mounted on this page from PR 2d) feed the fresh `violations` to `<ViolationsPanel>`. If `<ViolationsPanel>` is not yet mounted on `/timetable`, mount it.

- [ ] **Step 1: Find the role/membership hook**

Find how role is exposed for the current school. Run:

```bash
grep -rn "role" frontend/src/hooks frontend/src/lib --include="*.ts" --include="*.tsx" | grep -i "school\|membership" | head -20
```

Likely outcomes:
- A hook like `useSchoolMembership(schoolId)` returning `{ role }`.
- Or a context provider used by the schools layout.

Use whichever pattern the *Settings* page uses (since admin gating already exists there): `grep -n "admin" frontend/src/app/\[locale\]/schools/\[id\]/settings/*.tsx`. Mirror that pattern verbatim. Do **not** invent a new hook.

- [ ] **Step 2: Find ViolationsPanel usage**

```bash
grep -rn "ViolationsPanel" frontend/src --include="*.tsx"
```

Note its prop signature (likely `violations: ViolationDto[]` plus callbacks for highlight/fix). Mount it on `/timetable` if it isn't already, copying the existing usage from `/schedule` page so the visual treatment matches.

- [ ] **Step 3: Update the page**

Edit `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx`. Apply these targeted edits:

(a) Add imports at the top:

```ts
import { LessonEditDialog } from "@/components/timetable/lesson-edit-dialog";
import { UndoToolbar } from "@/components/timetable/undo-toolbar";
import type {
  ListLessonsResponse,
  PatchLessonRequest,
  PatchLessonResponse,
  SwapLessonsResponse,
  ViolationDto,
} from "@/lib/types";
// (plus whatever role hook the settings page uses)
```

(b) Add new state next to the existing `useState` block:

```ts
const [violations, setViolations] = useState<ViolationDto[]>([]);
const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

interface UndoEntry {
  lessonId: string;
  prev: { timeslot_id: string; room_id: string | null; teacher_id: string };
}
const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

// Role from existing hook (replace with actual hook name)
const role = /* ...useSchoolMembership(schoolId)?.role ?? */ null;
const isAdmin = role === "admin";
```

(c) Replace the lessons-fetching `useEffect` (the second one in the file) with a version that hits the new wrapped endpoint:

```ts
useEffect(() => {
  if (!selectedTermId) return;
  apiClient
    .get<ListLessonsResponse>(
      `/api/schools/${schoolId}/terms/${selectedTermId}/lessons?include_violations=true`,
    )
    .then((data) => {
      setLessons(data.lessons);
      setViolations(data.violations);
      setUndoStack([]); // term changed → wipe undo
    })
    .catch(() => {
      setLessons([]);
      setViolations([]);
      toast.error(tc("errorGeneric"));
    });
}, [apiClient, schoolId, selectedTermId, tc]);
```

(d) Add edit-handler functions before the JSX `return`:

```ts
function snapshotLesson(id: string): UndoEntry["prev"] | null {
  const l = lessons.find((x) => x.id === id);
  if (!l) return null;
  return {
    timeslot_id: l.timeslot_id,
    room_id: l.room_id ?? null,
    teacher_id: l.teacher_id,
  };
}

function pushUndo(entry: UndoEntry) {
  setUndoStack((prev) => {
    const next = [...prev, entry];
    return next.length > 10 ? next.slice(next.length - 10) : next;
  });
}

async function patchLesson(
  lessonId: string,
  changes: PatchLessonRequest,
  { trackUndo = true }: { trackUndo?: boolean } = {},
) {
  if (!selectedTermId) return;
  const prev = snapshotLesson(lessonId);
  // optimistic
  setLessons((cur) =>
    cur.map((l) =>
      l.id === lessonId
        ? {
            ...l,
            ...(changes.timeslot_id ? { timeslot_id: changes.timeslot_id } : {}),
            ...(changes.teacher_id ? { teacher_id: changes.teacher_id } : {}),
            ...(changes.room_id !== undefined
              ? { room_id: changes.room_id ?? null }
              : {}),
          }
        : l,
    ),
  );
  try {
    const resp = await apiClient.patch<PatchLessonResponse>(
      `/api/schools/${schoolId}/terms/${selectedTermId}/lessons/${lessonId}`,
      changes,
    );
    setLessons((cur) => cur.map((l) => (l.id === lessonId ? resp.lesson : l)));
    setViolations(resp.violations);
    if (trackUndo && prev) pushUndo({ lessonId, prev });
  } catch {
    // rollback
    setLessons((cur) =>
      cur.map((l) =>
        l.id === lessonId && prev
          ? { ...l, ...prev, room_id: prev.room_id }
          : l,
      ),
    );
    toast.error(t("edit.patchError"));
  }
}

async function handleMove(lessonId: string, targetTimeslotId: string) {
  await patchLesson(lessonId, { timeslot_id: targetTimeslotId });
}

async function handleSwap(lessonAId: string, lessonBId: string) {
  if (!selectedTermId) return;
  const prevA = snapshotLesson(lessonAId);
  const prevB = snapshotLesson(lessonBId);
  // optimistic swap (timeslot + room)
  setLessons((cur) => {
    const a = cur.find((x) => x.id === lessonAId);
    const b = cur.find((x) => x.id === lessonBId);
    if (!a || !b) return cur;
    return cur.map((l) => {
      if (l.id === a.id)
        return { ...l, timeslot_id: b.timeslot_id, room_id: b.room_id };
      if (l.id === b.id)
        return { ...l, timeslot_id: a.timeslot_id, room_id: a.room_id };
      return l;
    });
  });
  try {
    const resp = await apiClient.post<SwapLessonsResponse>(
      `/api/schools/${schoolId}/terms/${selectedTermId}/lessons/swap`,
      { lesson_a_id: lessonAId, lesson_b_id: lessonBId },
    );
    const map = new Map(resp.lessons.map((l) => [l.id, l]));
    setLessons((cur) => cur.map((l) => map.get(l.id) ?? l));
    setViolations(resp.violations);
    if (prevA) pushUndo({ lessonId: lessonAId, prev: prevA });
    if (prevB) pushUndo({ lessonId: lessonBId, prev: prevB });
  } catch {
    setLessons((cur) =>
      cur.map((l) => {
        if (l.id === lessonAId && prevA) return { ...l, ...prevA };
        if (l.id === lessonBId && prevB) return { ...l, ...prevB };
        return l;
      }),
    );
    toast.error(t("edit.swapError"));
  }
}

function handleEdit(lessonId: string) {
  setEditingLessonId(lessonId);
}

async function handleUndo() {
  const entry = undoStack[undoStack.length - 1];
  if (!entry) return;
  setUndoStack((cur) => cur.slice(0, -1));
  await patchLesson(
    entry.lessonId,
    {
      timeslot_id: entry.prev.timeslot_id,
      room_id: entry.prev.room_id,
      teacher_id: entry.prev.teacher_id,
    },
    { trackUndo: false },
  );
}
```

(e) In the JSX, render the toolbar near the term selector and pass the new props to `<TimetableGrid>`:

```tsx
{isAdmin && (
  <UndoToolbar canUndo={undoStack.length > 0} onUndo={handleUndo} />
)}

<TimetableGrid
  lessons={lessons}
  viewMode={viewMode}
  selectedEntityId={selectedEntityId}
  timeslots={timeslots}
  subjects={subjects}
  teachers={teachers}
  rooms={rooms}
  classes={classes}
  locale={locale}
  editable={isAdmin}
  onLessonMove={handleMove}
  onLessonSwap={handleSwap}
  onLessonEdit={handleEdit}
/>

<LessonEditDialog
  open={editingLessonId !== null}
  lesson={lessons.find((l) => l.id === editingLessonId) ?? null}
  teachers={teachers}
  rooms={rooms}
  onClose={() => setEditingLessonId(null)}
  onSubmit={(changes) => {
    if (editingLessonId) {
      void patchLesson(editingLessonId, changes);
    }
    setEditingLessonId(null);
  }}
/>
```

(f) If `<ViolationsPanel>` is already mounted (look in the existing JSX), pass `violations={violations}`. If not, mount it next to the grid using the same pattern as `/schedule`.

- [ ] **Step 4: Typecheck and run frontend tests**

Run: `cd frontend && bunx tsc --noEmit && bun test && cd -`
Expected: clean. Type errors here usually point to (i) the wrong role hook or (ii) missing fields on `PatchLessonResponse`/`SwapLessonsResponse` in `lib/types.ts`.

- [ ] **Step 5: Manual smoke test**

```bash
just dev
```

In the browser:
1. Log in as an admin.
2. Open `/timetable` for a school with applied lessons.
3. Drag a lesson from one cell to an empty cell — should snap to new slot and persist on refresh.
4. Drag onto an occupied cell — should swap.
5. Click the kebab → change room → Apply → cell updates.
6. Click Undo → state restores.
7. Log in as a non-admin (or open as a teacher seed user) — no kebab, no drag, no Undo.

If anything is broken, fix inline.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/timetable/page.tsx
git commit -m "frontend(timetable): wire drag, swap, edit, undo on /timetable"
```

---

## Task 10: Final checks, push, PR

- [ ] **Step 1: Run the full check suite**

```bash
just check && just test
```

Expected: clean. `just check` runs Biome + clippy + fmt; `just test` runs `cargo test --workspace` plus frontend tests. (Backend integration tests still need `docker compose up -d postgres-dev` and `just test-db-setup` first.)

- [ ] **Step 2: Push branch and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: manual timetable editing (2c)" --body "$(cat <<'EOF'
## Summary
- Drag-and-drop lesson editing on `/timetable` for admins, with optimistic updates and rollback
- Two new admin endpoints (`PATCH /lessons/{id}`, `POST /lessons/swap`) reuse `diagnose()` to return fresh violations after every edit
- `?include_violations=true` query param on the list endpoint so the page fetches lessons + violations in one round trip
- In-session Undo stack (last 10 edits)
- Edit dialog for room/teacher reassignment

## Test plan
- [ ] `cargo test -p klassenzeit-backend --test mod lessons` passes
- [ ] `cd frontend && bun test` passes
- [ ] Manual: drag lesson to empty cell persists across refresh
- [ ] Manual: drop on occupied cell swaps
- [ ] Manual: edit dialog reassigns room and clears with "no room"
- [ ] Manual: introducing a hard violation (e.g., teacher conflict) shows up in the violations panel immediately
- [ ] Manual: non-admin sees the read-only grid
EOF
)"
```

- [ ] **Step 3: Watch CI, fix anything red, then merge**

Per `CLAUDE.md`: after merging, update `docs/STATUS.md` and `docs/superpowers/next-steps.md` to mark 2c done, then ping the user on the PR thread.

---

## Self-review notes

- **Spec coverage:** Backend endpoints (PATCH, swap, list+violations) → Tasks 2-4. `evaluate_term_violations` reuse → Task 1. Drag library, editable grid, dialog, undo, role gate → Tasks 5-9. Tests for every backend endpoint and every new frontend component included.
- **Out-of-scope items from the spec stay out of scope:** no add/remove lessons, no audit log, no concurrency control, no mobile drag.
- **Type consistency:** `PatchLessonResponse`/`SwapLessonsResponse` shapes match between backend (`PatchLessonResponse { lesson, violations }`, `SwapLessonsResponse { lessons, violations }`) and the TS interfaces in Task 5. `ViolationDto` field names match (`kind`, `severity`, `message`, `lesson_refs`, `resources`).
- **Risk hotspots flagged inline:** route ordering (Task 4 step 3), `next-intl` mock in tests (Task 6 step 3), correct role hook (Task 9 step 1), `PlanningLesson` re-export (Task 1 step 1).
