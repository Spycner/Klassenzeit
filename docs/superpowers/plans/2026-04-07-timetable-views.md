# Timetable Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-class, per-teacher and per-room timetable views, plus a stable `/timetable` route that loads the applied timetable from the database.

**Architecture:** New `GET /api/schools/{id}/terms/{term_id}/lessons` backend endpoint feeds a new shared `<TimetableGrid>` React component. The grid takes a `viewMode` and `selectedEntityId` and filters lessons accordingly. Both the existing `/schedule` page (preview, in-memory) and a new read-only `/timetable` page render through this same component.

**Tech Stack:** Loco/Axum + SeaORM (Rust) backend, Next.js 15 + React + TypeScript + Tailwind frontend, Vitest for frontend tests, `loco_rs::testing` for backend integration tests.

**Spec:** `docs/superpowers/specs/2026-04-07-timetable-views-design.md`

---

## File Structure

**Backend (new):**
- `backend/src/controllers/lessons.rs` — `list` handler + `routes()` for `GET /api/schools/{id}/terms/{term_id}/lessons`
- `backend/tests/requests/lessons.rs` — integration tests

**Backend (modify):**
- `backend/src/controllers/mod.rs` — register `lessons` module
- `backend/src/app.rs` — add `controllers::lessons::routes()` to the router
- `backend/tests/requests/mod.rs` — register the new test module

**Frontend (new):**
- `frontend/src/components/timetable/timetable-grid.tsx` — pure presentational grid
- `frontend/src/components/timetable/view-mode-selector.tsx` — view mode + entity selector
- `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx` — read-only `/timetable` route
- `frontend/src/__tests__/timetable-grid.test.tsx`
- `frontend/src/__tests__/view-mode-selector.test.tsx`
- `frontend/src/__tests__/timetable-page.test.tsx`

**Frontend (modify):**
- `frontend/src/lib/types.ts` — add `LessonResponse` and `ViewMode`
- `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx` — replace inline `<table>` with `<TimetableGrid>`, add `<ViewModeSelector>` above the grid
- `frontend/src/app/[locale]/schools/[id]/layout.tsx` — add "Timetable" sidebar entry
- `frontend/src/messages/en.json` — add `timetable.*` section
- `frontend/src/messages/de.json` — add `timetable.*` section

---

## Task 1: Backend — `LessonResponse` DTO + read-only controller skeleton

**Files:**
- Create: `backend/src/controllers/lessons.rs`
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/app.rs`

- [ ] **Step 1: Create the controller file with the DTO and an unimplemented `list` handler**

Create `backend/src/controllers/lessons.rs`:

```rust
use axum::extract::Path;
use loco_rs::prelude::*;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::Serialize;
use uuid::Uuid;

use crate::keycloak::extractors::SchoolContext;
use crate::models::_entities::{lessons, terms};

#[derive(Debug, Serialize)]
pub struct LessonResponse {
    pub id: String,
    pub term_id: String,
    pub class_id: String,
    pub teacher_id: String,
    pub subject_id: String,
    pub room_id: Option<String>,
    pub timeslot_id: String,
    pub week_pattern: String,
}

impl LessonResponse {
    fn from_model(m: &lessons::Model) -> Self {
        Self {
            id: m.id.to_string(),
            term_id: m.term_id.to_string(),
            class_id: m.school_class_id.to_string(),
            teacher_id: m.teacher_id.to_string(),
            subject_id: m.subject_id.to_string(),
            room_id: m.room_id.map(|id| id.to_string()),
            timeslot_id: m.timeslot_id.to_string(),
            week_pattern: m.week_pattern.clone(),
        }
    }
}

/// GET /api/schools/{school_id}/terms/{term_id}/lessons
async fn list(
    State(ctx): State<AppContext>,
    school_ctx: SchoolContext,
    Path((_school_id, term_id)): Path<(Uuid, Uuid)>,
) -> Result<Response> {
    // Verify the term belongs to the caller's school (tenant scoping).
    let term = terms::Entity::find_by_id(term_id)
        .filter(terms::Column::SchoolId.eq(school_ctx.school.id))
        .one(&ctx.db)
        .await?;

    if term.is_none() {
        return Err(loco_rs::Error::NotFound);
    }

    let items = lessons::Entity::find()
        .filter(lessons::Column::TermId.eq(term_id))
        .all(&ctx.db)
        .await?;

    let resp: Vec<LessonResponse> = items.iter().map(LessonResponse::from_model).collect();
    format::json(resp)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/schools/{id}/terms/{term_id}/lessons")
        .add("/", get(list))
}
```

- [ ] **Step 2: Register the module in `backend/src/controllers/mod.rs`**

Add `pub mod lessons;` in alphabetical order between `example_data` and `members`:

```rust
pub mod auth;
pub mod classes;
pub mod curriculum;
pub mod example_data;
pub mod lessons;
pub mod members;
```

- [ ] **Step 3: Wire the route into `backend/src/app.rs`**

In the `routes(_ctx)` function, add the new route. Place it next to `curriculum`:

```rust
.add_route(controllers::curriculum::routes())
.add_route(controllers::lessons::routes())
.add_route(controllers::scheduler::routes())
```

- [ ] **Step 4: Verify the backend compiles**

Run:

```bash
cargo check -p klassenzeit-backend
```

Expected: compiles cleanly (warnings ok). If `terms::Column::SchoolId` doesn't exist, check `backend/src/models/_entities/terms.rs` for the actual column name and adjust.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/lessons.rs backend/src/controllers/mod.rs backend/src/app.rs
git commit -m "feat(backend): add GET /lessons endpoint scaffold"
```

---

## Task 2: Backend — Integration tests for `GET /lessons`

**Files:**
- Create: `backend/tests/requests/lessons.rs`
- Modify: `backend/tests/requests/mod.rs`

- [ ] **Step 1: Register the new test module**

In `backend/tests/requests/mod.rs`, add `mod lessons;` (keep alphabetical):

```rust
mod auth;
mod classes;
mod example_data;
mod lessons;
mod members;
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/requests/lessons.rs`:

```rust
use axum::http::{header, HeaderName, StatusCode};
use chrono::{Duration, NaiveDate, Utc};
use klassenzeit_backend::app::App;
use klassenzeit_backend::keycloak::claims::AuthClaims;
use klassenzeit_backend::keycloak::middleware::AuthState;
use klassenzeit_backend::models::{
    app_users, lessons, school_classes, school_memberships, school_years, schools, subjects,
    teachers, terms, time_slots,
};
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
        exp: (Utc::now().timestamp() + 300) as usize,
        iss: TEST_ISSUER.to_string(),
        aud: serde_json::json!(TEST_CLIENT_ID),
    }
}

/// Helper: create a school with a member of the given role.
async fn setup_member_school(
    ctx: &loco_rs::app::AppContext,
    kp: &TestKeyPair,
    prefix: &str,
    role: &str,
) -> (schools::Model, String) {
    let user = app_users::ActiveModel::new(
        format!("kc-{prefix}"),
        format!("{prefix}@example.com"),
        "Test".into(),
    );
    let user = user.insert(&ctx.db).await.unwrap();

    let school = schools::ActiveModel::new(
        format!("{prefix}-school"),
        format!("{prefix}-school-slug"),
    );
    let school = school.insert(&ctx.db).await.unwrap();

    let m = school_memberships::ActiveModel::new(user.id, school.id, role.into());
    m.insert(&ctx.db).await.unwrap();

    let claims = valid_claims(&format!("kc-{prefix}"), &format!("{prefix}@example.com"));
    let token = kp.create_token(&claims);
    (school, token)
}

/// Insert a school year + term and return the term.
async fn setup_term(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    name: &str,
) -> terms::Model {
    let now = Utc::now().into();
    let sy = school_years::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(format!("{name}-year")),
        start_date: Set(NaiveDate::from_ymd_opt(2026, 8, 1).unwrap()),
        end_date: Set(NaiveDate::from_ymd_opt(2027, 7, 31).unwrap()),
        is_current: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    };
    let sy = sy.insert(&ctx.db).await.unwrap();

    let term = terms::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        school_year_id: Set(sy.id),
        name: Set(name.into()),
        start_date: Set(NaiveDate::from_ymd_opt(2026, 8, 1).unwrap()),
        end_date: Set(NaiveDate::from_ymd_opt(2027, 1, 31).unwrap()),
        is_current: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    };
    term.insert(&ctx.db).await.unwrap()
}

/// Insert a lesson row with the given resource ids.
#[allow(clippy::too_many_arguments)]
async fn insert_lesson(
    ctx: &loco_rs::app::AppContext,
    term_id: Uuid,
    class_id: Uuid,
    teacher_id: Uuid,
    subject_id: Uuid,
    room_id: Option<Uuid>,
    timeslot_id: Uuid,
) -> lessons::Model {
    let now = Utc::now().into();
    let m = lessons::ActiveModel {
        id: Set(Uuid::new_v4()),
        term_id: Set(term_id),
        school_class_id: Set(class_id),
        teacher_id: Set(teacher_id),
        subject_id: Set(subject_id),
        room_id: Set(room_id),
        timeslot_id: Set(timeslot_id),
        week_pattern: Set("WEEKLY".into()),
        created_at: Set(now),
        updated_at: Set(now),
    };
    m.insert(&ctx.db).await.unwrap()
}

/// Insert minimal class/teacher/subject/timeslot rows and return their ids.
async fn insert_resources(
    ctx: &loco_rs::app::AppContext,
    school_id: Uuid,
    prefix: &str,
) -> (Uuid, Uuid, Uuid, Uuid) {
    let now = Utc::now().into();
    let class = school_classes::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(format!("{prefix}-5a")),
        grade_level: Set(5),
        student_count: Set(Some(20)),
        class_teacher_id: Set(None),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap();

    let teacher = teachers::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        first_name: Set(format!("{prefix}-Anne")),
        last_name: Set("Mueller".into()),
        email: Set(None),
        abbreviation: Set(format!("{prefix}AM").chars().take(5).collect()),
        max_hours_per_week: Set(28),
        is_part_time: Set(false),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap();

    let subject = subjects::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        name: Set(format!("{prefix}-Math")),
        abbreviation: Set(format!("{prefix}M").chars().take(5).collect()),
        color: Set(None),
        needs_special_room: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap();

    let ts = time_slots::ActiveModel {
        id: Set(Uuid::new_v4()),
        school_id: Set(school_id),
        day_of_week: Set(0),
        period: Set(1),
        start_time: Set("08:00:00".parse().unwrap()),
        end_time: Set("08:45:00".parse().unwrap()),
        is_break: Set(false),
        label: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&ctx.db)
    .await
    .unwrap();

    (class.id, teacher.id, subject.id, ts.id)
}

#[tokio::test]
#[serial]
async fn list_lessons_returns_empty_for_term_with_no_lessons() {
    request::<App, _, _>(|server, ctx| async move {
        let kp = TestKeyPair::generate();
        let auth_state = ctx.shared_store.get_ref::<AuthState>().unwrap();
        auth_state.jwks.set_keys(kp.jwk_set.clone()).await;

        let (school, token) = setup_member_school(&ctx, &kp, "lsn-empty", "admin").await;
        let term = setup_term(&ctx, school.id, "T1").await;

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

        resp.assert_status(StatusCode::OK);
        let body: serde_json::Value = resp.json();
        assert!(body.is_array());
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

        let (school, token) = setup_member_school(&ctx, &kp, "lsn-iso", "admin").await;
        let term_a = setup_term(&ctx, school.id, "TA").await;
        let term_b = setup_term(&ctx, school.id, "TB").await;
        let (class_id, teacher_id, subject_id, ts_id) =
            insert_resources(&ctx, school.id, "iso").await;

        // 2 lessons in term A, 1 in term B
        insert_lesson(&ctx, term_a.id, class_id, teacher_id, subject_id, None, ts_id).await;
        insert_lesson(&ctx, term_a.id, class_id, teacher_id, subject_id, None, ts_id).await;
        insert_lesson(&ctx, term_b.id, class_id, teacher_id, subject_id, None, ts_id).await;

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

        resp.assert_status(StatusCode::OK);
        let body: serde_json::Value = resp.json();
        assert_eq!(body.as_array().unwrap().len(), 2);
        for lesson in body.as_array().unwrap() {
            assert_eq!(lesson["term_id"], term_a.id.to_string());
        }
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

        let (school_a, token_a) = setup_member_school(&ctx, &kp, "lsn-tenA", "admin").await;
        let (school_b, _token_b) = setup_member_school(&ctx, &kp, "lsn-tenB", "admin").await;
        let term_b = setup_term(&ctx, school_b.id, "TB").await;

        let resp = server
            .get(&format!(
                "/api/schools/{}/terms/{}/lessons",
                school_a.id, term_b.id
            ))
            .add_header(header::AUTHORIZATION, format!("Bearer {token_a}"))
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
    request::<App, _, _>(|server, _ctx| async move {
        let resp = server
            .get(&format!(
                "/api/schools/{}/terms/{}/lessons",
                Uuid::new_v4(),
                Uuid::new_v4()
            ))
            .await;
        assert!(
            resp.status_code() == StatusCode::UNAUTHORIZED
                || resp.status_code() == StatusCode::FORBIDDEN
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

        let (school, token) = setup_member_school(&ctx, &kp, "lsn-teacher", "teacher").await;
        let term = setup_term(&ctx, school.id, "TT").await;

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

        resp.assert_status(StatusCode::OK);
    })
    .await;
}
```

Note: the exact field names in `school_years::ActiveModel`, `terms::ActiveModel`, etc. should match the SeaORM entity files in `backend/src/models/_entities/`. If a field is missing or named differently (e.g., `is_current` vs `current`), open the entity file and adjust. The schema fields shown above match the production entities at the time of writing — verify before adapting.

- [ ] **Step 3: Run the tests, expect failures because the route or DB isolation may not yet be correct**

Run:

```bash
just backend-test 2>&1 | tail -40
```

Expected: the new test module compiles and the 5 lessons tests run. They should all pass now (the route was added in Task 1). If they fail, fix the controller to match — typical issues:
- `terms` entity column might be `school_id` directly, otherwise use a join through `school_years`. Check `backend/src/models/_entities/terms.rs`.
- `school_years::ActiveModel::new` may exist instead of struct construction; either form is fine.

- [ ] **Step 4: Iterate until all 5 lessons tests pass**

If the term-isolation logic in the controller is wrong (e.g., terms have `school_year_id` not `school_id`), update Task 1's `list` handler. For example, if needed, do a join:

```rust
let term = terms::Entity::find_by_id(term_id)
    .find_also_related(school_years::Entity)
    .one(&ctx.db)
    .await?
    .filter(|(_t, sy)| sy.as_ref().map(|y| y.school_id) == Some(school_ctx.school.id));
```

Re-run `just backend-test` until all green.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/requests/lessons.rs backend/tests/requests/mod.rs backend/src/controllers/lessons.rs
git commit -m "test(backend): integration tests for GET /lessons"
```

---

## Task 3: Frontend — `LessonResponse` type and `ViewMode`

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add the new type and view mode**

Append to `frontend/src/lib/types.ts` at the end of the file:

```ts
export interface LessonResponse {
  id: string;
  term_id: string;
  class_id: string;
  teacher_id: string;
  subject_id: string;
  room_id: string | null;
  timeslot_id: string;
  week_pattern: string;
}

export type TimetableViewMode = "class" | "teacher" | "room";

/**
 * Common shape used by `<TimetableGrid>` so it can render either a
 * SolveLesson (preview) or a LessonResponse (persisted).
 */
export interface TimetableLesson {
  class_id: string;
  teacher_id: string;
  subject_id: string;
  room_id: string | null;
  timeslot_id: string;
}
```

- [ ] **Step 2: Verify TS compiles**

Run:

```bash
cd frontend && bun run typecheck 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(frontend): add LessonResponse and TimetableViewMode types"
```

---

## Task 4: Frontend — `<TimetableGrid>` component (TDD)

**Files:**
- Create: `frontend/src/components/timetable/timetable-grid.tsx`
- Test: `frontend/src/__tests__/timetable-grid.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/timetable-grid.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import type {
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TimeSlotResponse,
  TimetableLesson,
} from "@/lib/types";

const subjects: SubjectResponse[] = [
  {
    id: "sub-1",
    name: "Math",
    abbreviation: "M",
    color: "#ff0000",
    needs_special_room: false,
  },
];

const teachers: TeacherResponse[] = [
  {
    id: "tch-1",
    first_name: "Anne",
    last_name: "Mueller",
    email: null,
    abbreviation: "AM",
    max_hours_per_week: 28,
    is_part_time: false,
    is_active: true,
  },
];

const classes: SchoolClassResponse[] = [
  {
    id: "cls-1",
    name: "5a",
    grade_level: 5,
    student_count: 20,
    class_teacher_id: null,
    is_active: true,
  },
];

const rooms: RoomResponse[] = [
  {
    id: "rm-1",
    name: "R101",
    building: null,
    capacity: 30,
    max_concurrent: 1,
    is_active: true,
  },
];

const timeslots: TimeSlotResponse[] = [
  {
    id: "ts-1",
    day_of_week: 0,
    period: 1,
    start_time: "08:00:00",
    end_time: "08:45:00",
    is_break: false,
    label: null,
  },
  {
    id: "ts-2",
    day_of_week: 1,
    period: 1,
    start_time: "08:00:00",
    end_time: "08:45:00",
    is_break: false,
    label: null,
  },
];

const lessons: TimetableLesson[] = [
  {
    class_id: "cls-1",
    teacher_id: "tch-1",
    subject_id: "sub-1",
    room_id: "rm-1",
    timeslot_id: "ts-1",
  },
  {
    class_id: "cls-1",
    teacher_id: "tch-1",
    subject_id: "sub-1",
    room_id: null,
    timeslot_id: "ts-2",
  },
];

const baseProps = {
  lessons,
  timeslots,
  subjects,
  teachers,
  rooms,
  classes,
  locale: "en",
};

describe("TimetableGrid", () => {
  it("renders a class-view cell with subject, teacher and room", () => {
    render(
      <TimetableGrid
        {...baseProps}
        viewMode="class"
        selectedEntityId="cls-1"
      />,
    );
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText(/AM.*R101/)).toBeInTheDocument();
  });

  it("renders a teacher-view cell with subject, class and room", () => {
    render(
      <TimetableGrid
        {...baseProps}
        viewMode="teacher"
        selectedEntityId="tch-1"
      />,
    );
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText(/5a.*R101/)).toBeInTheDocument();
  });

  it("hides lessons with null room_id in room view", () => {
    render(
      <TimetableGrid
        {...baseProps}
        viewMode="room"
        selectedEntityId="rm-1"
      />,
    );
    // lesson 1 (ts-1) has room rm-1 → visible
    // lesson 2 (ts-2) has no room → hidden
    expect(screen.getAllByText("M")).toHaveLength(1);
  });

  it("renders day headers", () => {
    render(
      <TimetableGrid
        {...baseProps}
        viewMode="class"
        selectedEntityId="cls-1"
      />,
    );
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
  });

  it("uses German day labels when locale is de", () => {
    render(
      <TimetableGrid
        {...baseProps}
        locale="de"
        viewMode="class"
        selectedEntityId="cls-1"
      />,
    );
    expect(screen.getByText("Mo")).toBeInTheDocument();
    expect(screen.getByText("Fr")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run:

```bash
cd frontend && bun test src/__tests__/timetable-grid.test.tsx 2>&1 | tail -20
```

Expected: import error — `@/components/timetable/timetable-grid` does not exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/timetable/timetable-grid.tsx`:

```tsx
"use client";

import type {
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

    return (
      <div className="text-center">
        <div className="font-medium">{subject?.abbreviation ?? ""}</div>
        <div className="text-xs text-muted-foreground">{bottom}</div>
      </div>
    );
  }

  return (
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
                if (!lesson) {
                  return (
                    <td
                      key={`cell-${day}-${period}`}
                      className="border-l p-2"
                    />
                  );
                }
                const subject = subjectMap.get(lesson.subject_id);
                const color = subject?.color ?? null;
                return (
                  <td
                    key={`cell-${day}-${period}`}
                    className="border-l p-2"
                    style={
                      color ? { backgroundColor: `${color}20` } : undefined
                    }
                  >
                    {renderCellContent(lesson)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run tests until they pass**

Run:

```bash
cd frontend && bun test src/__tests__/timetable-grid.test.tsx
```

Expected: all 5 grid tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/timetable/timetable-grid.tsx frontend/src/__tests__/timetable-grid.test.tsx
git commit -m "feat(frontend): add reusable TimetableGrid component"
```

---

## Task 5: Frontend — `<ViewModeSelector>` component (TDD)

**Files:**
- Create: `frontend/src/components/timetable/view-mode-selector.tsx`
- Test: `frontend/src/__tests__/view-mode-selector.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/view-mode-selector.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewModeSelector } from "@/components/timetable/view-mode-selector";
import type {
  RoomResponse,
  SchoolClassResponse,
  TeacherResponse,
} from "@/lib/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

const classes: SchoolClassResponse[] = [
  { id: "cls-1", name: "5a", grade_level: 5, student_count: 20, class_teacher_id: null, is_active: true },
  { id: "cls-2", name: "5b", grade_level: 5, student_count: 22, class_teacher_id: null, is_active: true },
];

const teachers: TeacherResponse[] = [
  { id: "tch-1", first_name: "Anne", last_name: "M", email: null, abbreviation: "AM", max_hours_per_week: 28, is_part_time: false, is_active: true },
];

const rooms: RoomResponse[] = [
  { id: "rm-1", name: "R101", building: null, capacity: 30, max_concurrent: 1, is_active: true },
];

describe("ViewModeSelector", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("calls onChange when toggling to teacher mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ViewModeSelector
        schoolId="school-1"
        viewMode="class"
        selectedEntityId="cls-1"
        classes={classes}
        teachers={teachers}
        rooms={rooms}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /teacher/i }));

    expect(onChange).toHaveBeenCalledWith({
      viewMode: "teacher",
      selectedEntityId: "tch-1",
    });
  });

  it("persists the last view to localStorage", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ViewModeSelector
        schoolId="school-1"
        viewMode="class"
        selectedEntityId="cls-1"
        classes={classes}
        teachers={teachers}
        rooms={rooms}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /room/i }));

    expect(localStorage.getItem("timetable:lastView:school-1")).toContain(
      '"viewMode":"room"',
    );
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run:

```bash
cd frontend && bun test src/__tests__/view-mode-selector.test.tsx 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/timetable/view-mode-selector.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  RoomResponse,
  SchoolClassResponse,
  TeacherResponse,
  TimetableViewMode,
} from "@/lib/types";

interface ViewModeSelectorProps {
  schoolId: string;
  viewMode: TimetableViewMode;
  selectedEntityId: string | null;
  classes: SchoolClassResponse[];
  teachers: TeacherResponse[];
  rooms: RoomResponse[];
  onChange: (next: {
    viewMode: TimetableViewMode;
    selectedEntityId: string | null;
  }) => void;
}

interface PersistedView {
  viewMode: TimetableViewMode;
  selectedEntityId: string | null;
}

function storageKey(schoolId: string) {
  return `timetable:lastView:${schoolId}`;
}

export function loadPersistedView(schoolId: string): PersistedView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedView;
    if (
      parsed &&
      ["class", "teacher", "room"].includes(parsed.viewMode) &&
      (typeof parsed.selectedEntityId === "string" ||
        parsed.selectedEntityId === null)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function ViewModeSelector({
  schoolId,
  viewMode,
  selectedEntityId,
  classes,
  teachers,
  rooms,
  onChange,
}: ViewModeSelectorProps) {
  const t = useTranslations("timetable");

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      storageKey(schoolId),
      JSON.stringify({ viewMode, selectedEntityId }),
    );
  }, [schoolId, viewMode, selectedEntityId]);

  function firstEntityId(mode: TimetableViewMode): string | null {
    switch (mode) {
      case "class":
        return classes[0]?.id ?? null;
      case "teacher":
        return teachers[0]?.id ?? null;
      case "room":
        return rooms[0]?.id ?? null;
    }
  }

  function handleModeChange(mode: TimetableViewMode) {
    onChange({ viewMode: mode, selectedEntityId: firstEntityId(mode) });
  }

  const entityOptions: { id: string; label: string }[] =
    viewMode === "class"
      ? classes.map((c) => ({ id: c.id, label: c.name }))
      : viewMode === "teacher"
        ? teachers.map((tc) => ({
            id: tc.id,
            label: `${tc.first_name} ${tc.last_name}`,
          }))
        : rooms.map((r) => ({ id: r.id, label: r.name }));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border p-0.5">
        {(["class", "teacher", "room"] as TimetableViewMode[]).map((mode) => (
          <Button
            key={mode}
            type="button"
            variant={viewMode === mode ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange(mode)}
          >
            {t(`viewMode.${mode}`)}
          </Button>
        ))}
      </div>

      {entityOptions.length > 0 && (
        <Select
          value={selectedEntityId ?? ""}
          onValueChange={(val) =>
            onChange({ viewMode, selectedEntityId: val })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {entityOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests until they pass**

Run:

```bash
cd frontend && bun test src/__tests__/view-mode-selector.test.tsx
```

If the test that asserts `getByRole("button", { name: /teacher/i })` fails because the i18n mock returns the key `viewMode.teacher`, the regex `/teacher/i` still matches — keep as is. If the regex fails, check the rendered button text and adjust the regex.

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/timetable/view-mode-selector.tsx frontend/src/__tests__/view-mode-selector.test.tsx
git commit -m "feat(frontend): add ViewModeSelector component"
```

---

## Task 6: Frontend — i18n strings

**Files:**
- Modify: `frontend/src/messages/en.json`
- Modify: `frontend/src/messages/de.json`

- [ ] **Step 1: Add the `timetable` namespace to en.json**

In `frontend/src/messages/en.json`, after the closing brace of the `scheduler` section (line ~108) and before `settings`, insert:

```json
  "timetable": {
    "title": "Timetable",
    "description": "View the published timetable",
    "noTimetable": "No timetable has been published yet.",
    "goToSchedule": "Generate a timetable",
    "viewMode": {
      "class": "Class",
      "teacher": "Teacher",
      "room": "Room"
    },
    "selectEntity": {
      "class": "Select class",
      "teacher": "Select teacher",
      "room": "Select room"
    }
  },
```

Make sure trailing commas are correct — the previous block ends with `}` and the next block starts with `"settings": {`.

- [ ] **Step 2: Add the `timetable` namespace to de.json**

Mirror the same structure in `frontend/src/messages/de.json` with German strings:

```json
  "timetable": {
    "title": "Stundenplan",
    "description": "Den veröffentlichten Stundenplan ansehen",
    "noTimetable": "Es wurde noch kein Stundenplan veröffentlicht.",
    "goToSchedule": "Stundenplan erstellen",
    "viewMode": {
      "class": "Klasse",
      "teacher": "Lehrkraft",
      "room": "Raum"
    },
    "selectEntity": {
      "class": "Klasse wählen",
      "teacher": "Lehrkraft wählen",
      "room": "Raum wählen"
    }
  },
```

- [ ] **Step 3: Verify JSON is valid**

Run:

```bash
cd frontend && bun run typecheck 2>&1 | tail -10
```

Then:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/messages/en.json'));JSON.parse(require('fs').readFileSync('src/messages/de.json'));console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/messages/en.json frontend/src/messages/de.json
git commit -m "feat(frontend): add timetable i18n strings"
```

---

## Task 7: Frontend — `/timetable` route page (TDD)

**Files:**
- Create: `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx`
- Test: `frontend/src/__tests__/timetable-page.test.tsx`

- [ ] **Step 1: Write the failing page test**

Create `frontend/src/__tests__/timetable-page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LessonResponse,
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TermResponse,
  TimeSlotResponse,
} from "@/lib/types";

const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "school-1", locale: "en" }),
}));

vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => mockApiClient,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import TimetablePage from "@/app/[locale]/schools/[id]/timetable/page";

const term: TermResponse = {
  id: "term-1",
  school_year_id: "sy-1",
  name: "Fall",
  start_date: "2026-08-01",
  end_date: "2027-01-31",
  is_current: true,
};

const subject: SubjectResponse = {
  id: "sub-1",
  name: "Math",
  abbreviation: "M",
  color: null,
  needs_special_room: false,
};

const teacher: TeacherResponse = {
  id: "tch-1",
  first_name: "Anne",
  last_name: "M",
  email: null,
  abbreviation: "AM",
  max_hours_per_week: 28,
  is_part_time: false,
  is_active: true,
};

const cls: SchoolClassResponse = {
  id: "cls-1",
  name: "5a",
  grade_level: 5,
  student_count: 20,
  class_teacher_id: null,
  is_active: true,
};

const room: RoomResponse = {
  id: "rm-1",
  name: "R101",
  building: null,
  capacity: 30,
  max_concurrent: 1,
  is_active: true,
};

const ts: TimeSlotResponse = {
  id: "ts-1",
  day_of_week: 0,
  period: 1,
  start_time: "08:00:00",
  end_time: "08:45:00",
  is_break: false,
  label: null,
};

const lesson: LessonResponse = {
  id: "l-1",
  term_id: "term-1",
  class_id: "cls-1",
  teacher_id: "tch-1",
  subject_id: "sub-1",
  room_id: "rm-1",
  timeslot_id: "ts-1",
  week_pattern: "WEEKLY",
};

function mockReferenceData(lessons: LessonResponse[]) {
  mockApiClient.get.mockImplementation((url: string) => {
    if (url.includes("/terms/term-1/lessons")) return Promise.resolve(lessons);
    if (url.endsWith("/terms")) return Promise.resolve([term]);
    if (url.endsWith("/classes")) return Promise.resolve([cls]);
    if (url.endsWith("/subjects")) return Promise.resolve([subject]);
    if (url.endsWith("/teachers")) return Promise.resolve([teacher]);
    if (url.endsWith("/rooms")) return Promise.resolve([room]);
    if (url.endsWith("/timeslots")) return Promise.resolve([ts]);
    return Promise.resolve([]);
  });
}

describe("TimetablePage", () => {
  beforeEach(() => {
    mockApiClient.get.mockReset();
    localStorage.clear();
  });

  it("renders the empty state when no lessons are persisted", async () => {
    mockReferenceData([]);
    render(<TimetablePage />);
    await waitFor(() => {
      expect(screen.getByText("noTimetable")).toBeInTheDocument();
    });
  });

  it("renders the grid when lessons are present", async () => {
    mockReferenceData([lesson]);
    render(<TimetablePage />);
    await waitFor(() => {
      expect(screen.getByText("M")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run:

```bash
cd frontend && bun test src/__tests__/timetable-page.test.tsx 2>&1 | tail -10
```

Expected: import error — page does not exist.

- [ ] **Step 3: Implement the page**

Create `frontend/src/app/[locale]/schools/[id]/timetable/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import {
  loadPersistedView,
  ViewModeSelector,
} from "@/components/timetable/view-mode-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiClient } from "@/hooks/use-api-client";
import type {
  LessonResponse,
  RoomResponse,
  SchoolClassResponse,
  SubjectResponse,
  TeacherResponse,
  TermResponse,
  TimeSlotResponse,
  TimetableViewMode,
} from "@/lib/types";

export default function TimetablePage() {
  const params = useParams<{ id: string; locale: string }>();
  const schoolId = params.id;
  const locale = params.locale;
  const apiClient = useApiClient();
  const t = useTranslations("timetable");
  const tc = useTranslations("common");

  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [classes, setClasses] = useState<SchoolClassResponse[]>([]);
  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [teachers, setTeachers] = useState<TeacherResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [timeslots, setTimeslots] = useState<TimeSlotResponse[]>([]);
  const [lessons, setLessons] = useState<LessonResponse[]>([]);

  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<TimetableViewMode>("class");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load reference data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<TermResponse[]>(`/api/schools/${schoolId}/terms`),
      apiClient.get<SchoolClassResponse[]>(`/api/schools/${schoolId}/classes`),
      apiClient.get<SubjectResponse[]>(`/api/schools/${schoolId}/subjects`),
      apiClient.get<TeacherResponse[]>(`/api/schools/${schoolId}/teachers`),
      apiClient.get<RoomResponse[]>(`/api/schools/${schoolId}/rooms`),
      apiClient.get<TimeSlotResponse[]>(`/api/schools/${schoolId}/timeslots`),
    ])
      .then(([termsData, cls, subs, tchs, rms, tss]) => {
        setTerms(termsData);
        setClasses(cls);
        setSubjects(subs);
        setTeachers(tchs);
        setRooms(rms);
        setTimeslots(tss);
        const current = termsData.find((term) => term.is_current);
        const initialTerm = current ?? termsData[0];
        if (initialTerm) setSelectedTermId(initialTerm.id);

        // Restore view from localStorage if valid; otherwise default to first class.
        const persisted = loadPersistedView(schoolId);
        if (persisted && persisted.viewMode === "class") {
          setViewMode("class");
          setSelectedEntityId(persisted.selectedEntityId ?? cls[0]?.id ?? null);
        } else if (persisted && persisted.viewMode === "teacher") {
          setViewMode("teacher");
          setSelectedEntityId(
            persisted.selectedEntityId ?? tchs[0]?.id ?? null,
          );
        } else if (persisted && persisted.viewMode === "room") {
          setViewMode("room");
          setSelectedEntityId(persisted.selectedEntityId ?? rms[0]?.id ?? null);
        } else if (cls.length > 0) {
          setSelectedEntityId(cls[0].id);
        }
      })
      .catch(() => {
        toast.error(tc("errorGeneric"));
      })
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, tc]);

  // Load lessons for the selected term
  useEffect(() => {
    if (!selectedTermId) return;
    apiClient
      .get<LessonResponse[]>(
        `/api/schools/${schoolId}/terms/${selectedTermId}/lessons`,
      )
      .then(setLessons)
      .catch(() => {
        setLessons([]);
        toast.error(tc("errorGeneric"));
      });
  }, [apiClient, schoolId, selectedTermId, tc]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {terms.length > 0 && selectedTermId && (
          <Select
            value={selectedTermId}
            onValueChange={(val) => setSelectedTermId(val)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ViewModeSelector
        schoolId={schoolId}
        viewMode={viewMode}
        selectedEntityId={selectedEntityId}
        classes={classes}
        teachers={teachers}
        rooms={rooms}
        onChange={({ viewMode: m, selectedEntityId: e }) => {
          setViewMode(m);
          setSelectedEntityId(e);
        }}
      />

      {lessons.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">{t("noTimetable")}</p>
        </div>
      ) : (
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
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run page tests until they pass**

Run:

```bash
cd frontend && bun test src/__tests__/timetable-page.test.tsx
```

Expected: both tests pass. If `loadPersistedView` runs before lessons load and `selectedEntityId` is `cls-1` (which matches the test fixture), the grid should render.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/timetable/page.tsx frontend/src/__tests__/timetable-page.test.tsx
git commit -m "feat(frontend): add /timetable read-only viewer page"
```

---

## Task 8: Frontend — Refactor `/schedule` page to use `<TimetableGrid>` and `<ViewModeSelector>`

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx`
- Modify: `frontend/src/__tests__/schedule-page.test.tsx` (only if assertions break)

- [ ] **Step 1: Replace inline grid + class selector with the shared components**

In `frontend/src/app/[locale]/schools/[id]/schedule/page.tsx`:

1. Remove the local constants `DAY_LABELS_EN`, `DAY_LABELS_DE`, `dayLabels`, the local `subjectMap` / `teacherMap` / `roomMap` / `timeslotMap` / `periods` / `getLessonForCell` (the grid has its own copies). Keep them only if used elsewhere — they aren't.
2. Add a new state pair next to `selectedClassId`:

   ```tsx
   const [viewMode, setViewMode] = useState<TimetableViewMode>("class");
   const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
   ```

   Replace `selectedClassId` usage with `selectedEntityId` (initialised in the existing reference-data load to the first class id, same default as before). Remove `selectedClassId` entirely.

3. Replace the inline class selector + `<table>` block (the section between `{/* Class selector + timetable grid */}` and the closing `</div>` of the timetable grid container) with:

   ```tsx
   <ViewModeSelector
     schoolId={schoolId}
     viewMode={viewMode}
     selectedEntityId={selectedEntityId}
     classes={classes}
     teachers={teachers}
     rooms={rooms}
     onChange={({ viewMode: m, selectedEntityId: e }) => {
       setViewMode(m);
       setSelectedEntityId(e);
     }}
   />

   <TimetableGrid
     lessons={solution.timetable}
     viewMode={viewMode}
     selectedEntityId={selectedEntityId}
     timeslots={timeslots}
     subjects={subjects}
     teachers={teachers}
     rooms={rooms}
     classes={classes}
     locale={locale}
   />
   ```

4. Add imports at the top:

   ```tsx
   import { TimetableGrid } from "@/components/timetable/timetable-grid";
   import { ViewModeSelector } from "@/components/timetable/view-mode-selector";
   import type { TimetableViewMode } from "@/lib/types";
   ```

5. Remove the now-unused imports for the inline grid (they're inside the existing JSX so they may already be used). Run the typechecker after to clean up.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd frontend && bun run typecheck 2>&1 | tail -15
```

Expected: no errors. If errors remain (unused imports), delete them.

- [ ] **Step 3: Run the existing schedule-page tests**

Run:

```bash
cd frontend && bun test src/__tests__/schedule-page.test.tsx
```

Expected: tests still pass. If they assert on text inside the inline class dropdown (e.g., `selectClass`), update them to interact with the new `viewMode.class` button or just verify the grid still shows `M`. Make minimal edits — keep the existing intent.

- [ ] **Step 4: Run the full frontend test suite**

Run:

```bash
cd frontend && bun test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/schedule/page.tsx frontend/src/__tests__/schedule-page.test.tsx
git commit -m "refactor(frontend): use TimetableGrid+ViewModeSelector on schedule page"
```

---

## Task 9: Frontend — Sidebar nav entry for `/timetable`

**Files:**
- Modify: `frontend/src/app/[locale]/schools/[id]/layout.tsx`

- [ ] **Step 1: Add nav item between Schedule and Settings**

In `frontend/src/app/[locale]/schools/[id]/layout.tsx`, near the top with other imports add:

```tsx
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
```

Add a `tTimetable` translations hook next to the existing ones:

```tsx
const tTimetable = useTranslations("timetable");
```

In the `navItems` array, add a new entry right after the `tScheduler("title")` entry:

```tsx
{
  title: tTimetable("title"),
  href: `/${locale}/schools/${schoolId}/timetable`,
  icon: CalendarDays,
},
```

- [ ] **Step 2: Verify typecheck and dev render**

Run:

```bash
cd frontend && bun run typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/[locale]/schools/[id]/layout.tsx
git commit -m "feat(frontend): add Timetable sidebar nav entry"
```

---

## Task 10: Verification — full check + lint + tests

**Files:** none (verification only)

- [ ] **Step 1: Run backend tests**

```bash
just backend-test 2>&1 | tail -30
```

Expected: all tests pass, including the 5 new lessons tests.

- [ ] **Step 2: Run all linters**

```bash
just check
```

Expected: clean.

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && bun test
```

Expected: all green.

- [ ] **Step 4: Manual smoke test (only if dev env is running)**

```bash
just dev
```

Then in the browser, on a school with seeded data:

1. Visit `/schedule`, generate a timetable, switch view modes, confirm grid changes.
2. Apply the solution.
3. Visit `/timetable`, confirm the same lessons render. Switch term if multiple. Refresh — view persists.
4. Switch to a non-admin user — `/timetable` still loads.

- [ ] **Step 5: Update docs/STATUS.md**

Open `docs/STATUS.md`. Under "Completed Steps", insert a new section after "Onboarding Wizard (2a)":

```markdown
### Timetable Views (2b)
- Spec: `superpowers/specs/2026-04-07-timetable-views-design.md`
- Plan: `superpowers/plans/2026-04-07-timetable-views.md`
- New `GET /api/schools/{id}/terms/{term_id}/lessons` endpoint
- Shared `<TimetableGrid>` component + `<ViewModeSelector>` (Class/Teacher/Room toggle, localStorage-persisted)
- New read-only `/timetable` route fed by the lessons endpoint
- `/schedule` preview now supports all three view modes
```

Under "Next Up", remove the `2b: Timetable views` bullet.

- [ ] **Step 6: Update next-steps.md**

In `docs/superpowers/next-steps.md`, mark item `2b` as done:
- Change `**Timetable views**` to `~~**Timetable views**~~` and status `idea` to `done`.
- Remove `2b: Timetable views` from the "Recommended next priorities" list.

- [ ] **Step 7: Commit doc updates**

```bash
git add docs/STATUS.md docs/superpowers/next-steps.md
git commit -m "docs: mark 2b (timetable views) complete"
```

---

## Task 11: Open the PR

**Files:** none

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: per-class/teacher/room timetable views (2b)" --body "$(cat <<'EOF'
## Summary
- New `GET /api/schools/{id}/terms/{term_id}/lessons` endpoint serving the persisted timetable
- Shared `<TimetableGrid>` component used by both the generation preview and a new read-only `/timetable` route
- View-mode toggle (Class / Teacher / Room) with `localStorage`-persisted last view per school

## Test plan
- [ ] `just backend-test` green (incl. 5 new lessons tests)
- [ ] `bun test` green in frontend
- [ ] Manual: generate → switch view modes → apply → visit /timetable → all three modes render correctly
- [ ] Manual: non-admin member can read /timetable
EOF
)"
```

- [ ] **Step 2: Address CI failures and review feedback until mergeable**

Per CLAUDE.md autonomous workflow: fix everything, then merge.

- [ ] **Step 3: Merge and clean up**

```bash
gh pr merge --squash --delete-branch
```

After merge: per CLAUDE.md, review and update CLAUDE.md, `docs/superpowers/next-steps.md`, and any stale docs (Tasks 10.5/10.6 already cover this).
