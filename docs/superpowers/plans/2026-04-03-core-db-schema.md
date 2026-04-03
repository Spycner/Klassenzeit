# Core DB Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Loco's scaffolded `users` table with three core tables (`schools`, `app_users`, `school_memberships`) that establish multi-tenancy and Keycloak-based auth.

**Architecture:** Single SeaORM migration creates all three tables with UUID primary keys and proper foreign keys. Loco's built-in password auth scaffolding (controllers, models, mailers, views, tests) is fully removed. SeaORM entities are hand-written (not code-generated) to match the new schema.

**Tech Stack:** Loco (Rust/Axum), SeaORM migrations, PostgreSQL

---

## File Structure

**Create:**
- `backend/migration/src/m20250403_000001_core_tables.rs` — migration: schools, app_users, school_memberships
- `backend/src/models/_entities/schools.rs` — SeaORM entity for schools
- `backend/src/models/_entities/app_users.rs` — SeaORM entity for app_users
- `backend/src/models/_entities/school_memberships.rs` — SeaORM entity for school_memberships
- `backend/src/models/schools.rs` — model logic for schools
- `backend/src/models/app_users.rs` — model logic for app_users
- `backend/src/models/school_memberships.rs` — model logic for school_memberships
- `backend/tests/models/schools.rs` — tests for schools
- `backend/tests/models/app_users.rs` — tests for app_users
- `backend/tests/models/school_memberships.rs` — tests for school_memberships

**Delete:**
- `backend/migration/src/m20220101_000001_users.rs`
- `backend/src/models/_entities/users.rs`
- `backend/src/models/users.rs`
- `backend/src/controllers/auth.rs`
- `backend/src/views/auth.rs`
- `backend/src/mailers/auth.rs`
- `backend/src/mailers/auth/` (entire directory with templates)
- `backend/tests/models/users.rs`
- `backend/tests/models/snapshots/` (all user snapshots)
- `backend/tests/requests/auth.rs`
- `backend/tests/requests/prepare_data.rs`
- `backend/tests/requests/snapshots/` (all auth request snapshots)

**Modify:**
- `backend/migration/src/lib.rs` — swap migration reference
- `backend/src/models/_entities/mod.rs` — swap module declarations
- `backend/src/models/_entities/prelude.rs` — swap re-exports
- `backend/src/models/mod.rs` — swap module declarations
- `backend/src/controllers/mod.rs` — remove auth
- `backend/src/views/mod.rs` — remove auth
- `backend/src/mailers/mod.rs` — remove auth
- `backend/src/app.rs` — remove auth routes, users references, update truncate/seed
- `backend/tests/mod.rs` — keep structure, modules will point to new files
- `backend/tests/models/mod.rs` — swap module declarations
- `backend/tests/requests/mod.rs` — remove auth and prepare_data

---

### Task 1: Remove Loco Auth Scaffolding

Remove all Loco-generated auth code so the project compiles with a clean slate.

**Files:**
- Delete: `backend/src/controllers/auth.rs`
- Delete: `backend/src/views/auth.rs`
- Delete: `backend/src/mailers/auth.rs`
- Delete: `backend/src/mailers/auth/` (entire directory)
- Delete: `backend/src/models/users.rs`
- Delete: `backend/src/models/_entities/users.rs`
- Delete: `backend/migration/src/m20220101_000001_users.rs`
- Delete: `backend/tests/models/users.rs`
- Delete: `backend/tests/models/snapshots/` (all files)
- Delete: `backend/tests/requests/auth.rs`
- Delete: `backend/tests/requests/prepare_data.rs`
- Delete: `backend/tests/requests/snapshots/` (all files)
- Modify: `backend/src/controllers/mod.rs`
- Modify: `backend/src/views/mod.rs`
- Modify: `backend/src/mailers/mod.rs`
- Modify: `backend/src/models/mod.rs`
- Modify: `backend/src/models/_entities/mod.rs`
- Modify: `backend/src/models/_entities/prelude.rs`
- Modify: `backend/src/app.rs`
- Modify: `backend/migration/src/lib.rs`
- Modify: `backend/tests/models/mod.rs`
- Modify: `backend/tests/requests/mod.rs`

- [ ] **Step 1: Delete auth controller, view, mailer, and templates**

```bash
rm backend/src/controllers/auth.rs
rm backend/src/views/auth.rs
rm backend/src/mailers/auth.rs
rm -r backend/src/mailers/auth/
```

- [ ] **Step 2: Delete user model files**

```bash
rm backend/src/models/users.rs
rm backend/src/models/_entities/users.rs
rm backend/migration/src/m20220101_000001_users.rs
```

- [ ] **Step 3: Delete old tests and snapshots**

```bash
rm backend/tests/models/users.rs
rm -r backend/tests/models/snapshots/
rm backend/tests/requests/auth.rs
rm backend/tests/requests/prepare_data.rs
rm -r backend/tests/requests/snapshots/
```

- [ ] **Step 4: Update module declarations**

`backend/src/controllers/mod.rs` — replace entire contents:
```rust
```

(Empty file — no controllers yet. We'll add them in Step 3 of the roadmap.)

`backend/src/views/mod.rs` — replace entire contents:
```rust
```

(Empty file — no views yet.)

`backend/src/mailers/mod.rs` — replace entire contents:
```rust
```

(Empty file — no mailers yet.)

`backend/src/models/mod.rs` — replace entire contents:
```rust
pub mod _entities;
```

(Removed `users` module. New model modules will be added in Task 4.)

`backend/src/models/_entities/mod.rs` — replace entire contents:
```rust
pub mod prelude;
```

(Removed `users` module. New entity modules will be added in Task 3.)

`backend/src/models/_entities/prelude.rs` — replace entire contents:
```rust
```

(Empty for now. New entity re-exports will be added in Task 3.)

`backend/migration/src/lib.rs` — replace entire contents:
```rust
#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            // inject-above (do not remove this comment)
        ]
    }
}
```

`backend/tests/models/mod.rs` — replace entire contents:
```rust
```

(Empty — new test modules will be added in Task 5.)

`backend/tests/requests/mod.rs` — replace entire contents:
```rust
```

(Empty — no request tests yet.)

- [ ] **Step 5: Update app.rs**

Replace `backend/src/app.rs` with:
```rust
use async_trait::async_trait;
use loco_rs::{
    app::{AppContext, Hooks, Initializer},
    bgworker::{BackgroundWorker, Queue},
    boot::{create_app, BootResult, StartMode},
    config::Config,
    controller::AppRoutes,
    environment::Environment,
    task::Tasks,
    Result,
};
use migration::Migrator;
use std::path::Path;

#[allow(unused_imports)]
use crate::{controllers, tasks, workers::downloader::DownloadWorker};

pub struct App;
#[async_trait]
impl Hooks for App {
    fn app_name() -> &'static str {
        env!("CARGO_CRATE_NAME")
    }

    fn app_version() -> String {
        format!(
            "{} ({})",
            env!("CARGO_PKG_VERSION"),
            option_env!("BUILD_SHA")
                .or(option_env!("GITHUB_SHA"))
                .unwrap_or("dev")
        )
    }

    async fn boot(
        mode: StartMode,
        environment: &Environment,
        config: Config,
    ) -> Result<BootResult> {
        create_app::<Self, Migrator>(mode, environment, config).await
    }

    async fn initializers(_ctx: &AppContext) -> Result<Vec<Box<dyn Initializer>>> {
        Ok(vec![])
    }

    fn routes(_ctx: &AppContext) -> AppRoutes {
        AppRoutes::with_default_routes()
    }

    async fn connect_workers(ctx: &AppContext, queue: &Queue) -> Result<()> {
        queue.register(DownloadWorker::build(ctx)).await?;
        Ok(())
    }

    #[allow(unused_variables)]
    fn register_tasks(tasks: &mut Tasks) {
        // tasks-inject (do not remove)
    }

    async fn truncate(_ctx: &AppContext) -> Result<()> {
        Ok(())
    }

    async fn seed(_ctx: &AppContext, _base: &Path) -> Result<()> {
        Ok(())
    }
}
```

- [ ] **Step 6: Verify project compiles**

Run: `cd /home/pascal/Code/Klassenzeit && cargo check --workspace`
Expected: compiles with no errors (warnings are OK)

- [ ] **Step 7: Commit**

```bash
git add -A backend/
git commit -m "Remove Loco auth scaffolding (users table, controllers, mailers, views, tests)"
```

---

### Task 2: Write Core Tables Migration

Create the SeaORM migration for `schools`, `app_users`, and `school_memberships`.

**Files:**
- Create: `backend/migration/src/m20250403_000001_core_tables.rs`
- Modify: `backend/migration/src/lib.rs`

- [ ] **Step 1: Create the migration file**

Create `backend/migration/src/m20250403_000001_core_tables.rs`:
```rust
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Schools table
        manager
            .create_table(
                Table::create()
                    .table(Schools::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Schools::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(Schools::Name).string_len(255).not_null())
                    .col(
                        ColumnDef::new(Schools::Slug)
                            .string_len(100)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(Schools::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Schools::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        // App users table
        manager
            .create_table(
                Table::create()
                    .table(AppUsers::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(AppUsers::Id).uuid().not_null().primary_key())
                    .col(
                        ColumnDef::new(AppUsers::KeycloakId)
                            .string_len(255)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(AppUsers::Email)
                            .string_len(255)
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(AppUsers::DisplayName)
                            .string_len(255)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AppUsers::IsActive)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(ColumnDef::new(AppUsers::LastLoginAt).timestamp_with_time_zone())
                    .col(
                        ColumnDef::new(AppUsers::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(AppUsers::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        // School memberships table
        manager
            .create_table(
                Table::create()
                    .table(SchoolMemberships::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(SchoolMemberships::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::UserId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::SchoolId)
                            .uuid()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::Role)
                            .string_len(20)
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::IsActive)
                            .boolean()
                            .not_null()
                            .default(true),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(SchoolMemberships::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_school_memberships_user")
                            .from(SchoolMemberships::Table, SchoolMemberships::UserId)
                            .to(AppUsers::Table, AppUsers::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_school_memberships_school")
                            .from(SchoolMemberships::Table, SchoolMemberships::SchoolId)
                            .to(Schools::Table, Schools::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Unique constraint: one membership per user per school
        manager
            .create_index(
                Index::create()
                    .name("uq_school_membership_user_school")
                    .table(SchoolMemberships::Table)
                    .col(SchoolMemberships::UserId)
                    .col(SchoolMemberships::SchoolId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // Index on school_memberships.school_id for tenant queries
        manager
            .create_index(
                Index::create()
                    .name("idx_school_memberships_school")
                    .table(SchoolMemberships::Table)
                    .col(SchoolMemberships::SchoolId)
                    .to_owned(),
            )
            .await?;

        // Check constraint on role column (raw SQL — SeaQuery doesn't support CHECK constraints)
        let db = manager.get_connection();
        db.execute_unprepared(
            "ALTER TABLE school_memberships ADD CONSTRAINT ck_membership_role CHECK (role IN ('admin', 'teacher', 'viewer'))"
        ).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(SchoolMemberships::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(AppUsers::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Schools::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(Iden)]
enum Schools {
    Table,
    Id,
    Name,
    Slug,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum AppUsers {
    Table,
    Id,
    KeycloakId,
    Email,
    DisplayName,
    IsActive,
    LastLoginAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum SchoolMemberships {
    Table,
    Id,
    UserId,
    SchoolId,
    Role,
    IsActive,
    CreatedAt,
    UpdatedAt,
}
```

- [ ] **Step 2: Register the migration**

Update `backend/migration/src/lib.rs`:
```rust
#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;
mod m20250403_000001_core_tables;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20250403_000001_core_tables::Migration),
            // inject-above (do not remove this comment)
        ]
    }
}
```

- [ ] **Step 3: Verify project compiles**

Run: `cd /home/pascal/Code/Klassenzeit && cargo check --workspace`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add backend/migration/
git commit -m "Add core tables migration (schools, app_users, school_memberships)"
```

---

### Task 3: Write SeaORM Entities

Create the SeaORM entity definitions for the three new tables.

**Files:**
- Create: `backend/src/models/_entities/schools.rs`
- Create: `backend/src/models/_entities/app_users.rs`
- Create: `backend/src/models/_entities/school_memberships.rs`
- Modify: `backend/src/models/_entities/mod.rs`
- Modify: `backend/src/models/_entities/prelude.rs`

- [ ] **Step 1: Create schools entity**

Create `backend/src/models/_entities/schools.rs`:
```rust
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "schools")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub name: String,
    #[sea_orm(unique)]
    pub slug: String,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::school_memberships::Entity")]
    SchoolMemberships,
}

impl Related<super::school_memberships::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolMemberships.def()
    }
}

```

- [ ] **Step 2: Create app_users entity**

Create `backend/src/models/_entities/app_users.rs`:
```rust
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "app_users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(unique)]
    pub keycloak_id: String,
    #[sea_orm(unique)]
    pub email: String,
    pub display_name: String,
    pub is_active: bool,
    pub last_login_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::school_memberships::Entity")]
    SchoolMemberships,
}

impl Related<super::school_memberships::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SchoolMemberships.def()
    }
}
```

- [ ] **Step 3: Create school_memberships entity**

Create `backend/src/models/_entities/school_memberships.rs`:
```rust
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "school_memberships")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub user_id: Uuid,
    pub school_id: Uuid,
    pub role: String,
    pub is_active: bool,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::app_users::Entity",
        from = "Column::UserId",
        to = "super::app_users::Column::Id"
    )]
    AppUser,
    #[sea_orm(
        belongs_to = "super::schools::Entity",
        from = "Column::SchoolId",
        to = "super::schools::Column::Id"
    )]
    School,
}

impl Related<super::app_users::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::AppUser.def()
    }
}

impl Related<super::schools::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::School.def()
    }
}
```

- [ ] **Step 4: Update entity module declarations**

Update `backend/src/models/_entities/mod.rs`:
```rust
pub mod prelude;
pub mod app_users;
pub mod school_memberships;
pub mod schools;
```

Update `backend/src/models/_entities/prelude.rs`:
```rust
pub use super::app_users::Entity as AppUsers;
pub use super::school_memberships::Entity as SchoolMemberships;
pub use super::schools::Entity as Schools;
```

- [ ] **Step 5: Verify project compiles**

Run: `cd /home/pascal/Code/Klassenzeit && cargo check --workspace`
Expected: compiles with no errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/_entities/
git commit -m "Add SeaORM entities for schools, app_users, school_memberships"
```

---

### Task 4: Write Model Logic

Add model modules with basic creation helpers for each entity.

**Files:**
- Create: `backend/src/models/schools.rs`
- Create: `backend/src/models/app_users.rs`
- Create: `backend/src/models/school_memberships.rs`
- Modify: `backend/src/models/mod.rs`
- Modify: `backend/src/app.rs`

- [ ] **Step 1: Create schools model**

Create `backend/src/models/schools.rs`:
```rust
use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::schools::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl Model {
    pub async fn find_by_slug(db: &DatabaseConnection, slug: &str) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(schools::Column::Slug.eq(slug))
            .one(db)
            .await
    }
}

impl ActiveModel {
    pub fn new(name: String, slug: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            name: sea_orm::ActiveValue::Set(name),
            slug: sea_orm::ActiveValue::Set(slug),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
```

- [ ] **Step 2: Create app_users model**

Create `backend/src/models/app_users.rs`:
```rust
use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::app_users::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl Model {
    pub async fn find_by_keycloak_id(
        db: &DatabaseConnection,
        keycloak_id: &str,
    ) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(app_users::Column::KeycloakId.eq(keycloak_id))
            .one(db)
            .await
    }

    pub async fn find_by_email(
        db: &DatabaseConnection,
        email: &str,
    ) -> Result<Option<Self>, DbErr> {
        Entity::find()
            .filter(app_users::Column::Email.eq(email))
            .one(db)
            .await
    }
}

impl ActiveModel {
    pub fn new(keycloak_id: String, email: String, display_name: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            keycloak_id: sea_orm::ActiveValue::Set(keycloak_id),
            email: sea_orm::ActiveValue::Set(email),
            display_name: sea_orm::ActiveValue::Set(display_name),
            is_active: sea_orm::ActiveValue::Set(true),
            last_login_at: sea_orm::ActiveValue::Set(None),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
```

- [ ] **Step 3: Create school_memberships model**

Create `backend/src/models/school_memberships.rs`:
```rust
use sea_orm::entity::prelude::*;
use uuid::Uuid;

pub use super::_entities::school_memberships::{self, ActiveModel, Entity, Model};

impl ActiveModelBehavior for ActiveModel {}

impl ActiveModel {
    pub fn new(user_id: Uuid, school_id: Uuid, role: String) -> Self {
        let now = chrono::Utc::now().into();
        Self {
            id: sea_orm::ActiveValue::Set(Uuid::new_v4()),
            user_id: sea_orm::ActiveValue::Set(user_id),
            school_id: sea_orm::ActiveValue::Set(school_id),
            role: sea_orm::ActiveValue::Set(role),
            is_active: sea_orm::ActiveValue::Set(true),
            created_at: sea_orm::ActiveValue::Set(now),
            updated_at: sea_orm::ActiveValue::Set(now),
        }
    }
}
```

- [ ] **Step 4: Update models/mod.rs**

Update `backend/src/models/mod.rs`:
```rust
pub mod _entities;
pub mod app_users;
pub mod school_memberships;
pub mod schools;
```

- [ ] **Step 5: Update app.rs truncate and seed**

Update the `truncate` and `seed` methods in `backend/src/app.rs`:

Replace the `truncate` method:
```rust
    async fn truncate(ctx: &AppContext) -> Result<()> {
        truncate_table(&ctx.db, school_memberships::Entity).await?;
        truncate_table(&ctx.db, app_users::Entity).await?;
        truncate_table(&ctx.db, schools::Entity).await?;
        Ok(())
    }
```

And update the imports at the top of `app.rs`:
```rust
use loco_rs::{
    app::{AppContext, Hooks, Initializer},
    bgworker::{BackgroundWorker, Queue},
    boot::{create_app, BootResult, StartMode},
    config::Config,
    controller::AppRoutes,
    db::truncate_table,
    environment::Environment,
    task::Tasks,
    Result,
};
use migration::Migrator;
use std::path::Path;

use crate::{
    models::_entities::{app_users, school_memberships, schools},
    tasks,
    workers::downloader::DownloadWorker,
};
```

Keep `seed` as a no-op for now:
```rust
    async fn seed(_ctx: &AppContext, _base: &Path) -> Result<()> {
        Ok(())
    }
```

- [ ] **Step 6: Verify project compiles**

Run: `cd /home/pascal/Code/Klassenzeit && cargo check --workspace`
Expected: compiles with no errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/ backend/src/app.rs
git commit -m "Add model logic for schools, app_users, school_memberships"
```

---

### Task 5: Write Model Tests

Write integration tests that verify the schema and models work correctly against a real database.

**Files:**
- Create: `backend/tests/models/schools.rs`
- Create: `backend/tests/models/app_users.rs`
- Create: `backend/tests/models/school_memberships.rs`
- Modify: `backend/tests/models/mod.rs`

- [ ] **Step 1: Update test module declarations**

Update `backend/tests/models/mod.rs`:
```rust
mod app_users;
mod school_memberships;
mod schools;
```

- [ ] **Step 2: Write schools tests**

Create `backend/tests/models/schools.rs`:
```rust
use klassenzeit_backend::app::App;
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, EntityTrait};
use serial_test::serial;

use klassenzeit_backend::models::schools;

#[tokio::test]
#[serial]
async fn can_create_school() {
    let boot = boot_test::<App>().await.unwrap();

    let school = schools::ActiveModel::new("Test School".to_string(), "test-school".to_string());
    let school = school.insert(&boot.app_context.db).await.unwrap();

    assert_eq!(school.name, "Test School");
    assert_eq!(school.slug, "test-school");
}

#[tokio::test]
#[serial]
async fn can_find_school_by_slug() {
    let boot = boot_test::<App>().await.unwrap();

    let school = schools::ActiveModel::new("Slug School".to_string(), "slug-school".to_string());
    school.insert(&boot.app_context.db).await.unwrap();

    let found = schools::Model::find_by_slug(&boot.app_context.db, "slug-school")
        .await
        .unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().name, "Slug School");
}

#[tokio::test]
#[serial]
async fn slug_must_be_unique() {
    let boot = boot_test::<App>().await.unwrap();

    let school1 = schools::ActiveModel::new("School A".to_string(), "unique-slug".to_string());
    school1.insert(&boot.app_context.db).await.unwrap();

    let school2 = schools::ActiveModel::new("School B".to_string(), "unique-slug".to_string());
    let result = school2.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}
```

- [ ] **Step 3: Write app_users tests**

Create `backend/tests/models/app_users.rs`:
```rust
use klassenzeit_backend::app::App;
use loco_rs::testing::prelude::*;
use sea_orm::ActiveModelTrait;
use serial_test::serial;

use klassenzeit_backend::models::app_users;

#[tokio::test]
#[serial]
async fn can_create_app_user() {
    let boot = boot_test::<App>().await.unwrap();

    let user = app_users::ActiveModel::new(
        "kc-123".to_string(),
        "test@example.com".to_string(),
        "Test User".to_string(),
    );
    let user = user.insert(&boot.app_context.db).await.unwrap();

    assert_eq!(user.keycloak_id, "kc-123");
    assert_eq!(user.email, "test@example.com");
    assert_eq!(user.display_name, "Test User");
    assert!(user.is_active);
    assert!(user.last_login_at.is_none());
}

#[tokio::test]
#[serial]
async fn can_find_by_keycloak_id() {
    let boot = boot_test::<App>().await.unwrap();

    let user = app_users::ActiveModel::new(
        "kc-find-me".to_string(),
        "findme@example.com".to_string(),
        "Find Me".to_string(),
    );
    user.insert(&boot.app_context.db).await.unwrap();

    let found = app_users::Model::find_by_keycloak_id(&boot.app_context.db, "kc-find-me")
        .await
        .unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().email, "findme@example.com");
}

#[tokio::test]
#[serial]
async fn can_find_by_email() {
    let boot = boot_test::<App>().await.unwrap();

    let user = app_users::ActiveModel::new(
        "kc-email".to_string(),
        "email@example.com".to_string(),
        "Email User".to_string(),
    );
    user.insert(&boot.app_context.db).await.unwrap();

    let found = app_users::Model::find_by_email(&boot.app_context.db, "email@example.com")
        .await
        .unwrap();
    assert!(found.is_some());
}

#[tokio::test]
#[serial]
async fn keycloak_id_must_be_unique() {
    let boot = boot_test::<App>().await.unwrap();

    let user1 = app_users::ActiveModel::new(
        "kc-dupe".to_string(),
        "user1@example.com".to_string(),
        "User 1".to_string(),
    );
    user1.insert(&boot.app_context.db).await.unwrap();

    let user2 = app_users::ActiveModel::new(
        "kc-dupe".to_string(),
        "user2@example.com".to_string(),
        "User 2".to_string(),
    );
    let result = user2.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}

#[tokio::test]
#[serial]
async fn email_must_be_unique() {
    let boot = boot_test::<App>().await.unwrap();

    let user1 = app_users::ActiveModel::new(
        "kc-a".to_string(),
        "dupe@example.com".to_string(),
        "User A".to_string(),
    );
    user1.insert(&boot.app_context.db).await.unwrap();

    let user2 = app_users::ActiveModel::new(
        "kc-b".to_string(),
        "dupe@example.com".to_string(),
        "User B".to_string(),
    );
    let result = user2.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}
```

- [ ] **Step 4: Write school_memberships tests**

Create `backend/tests/models/school_memberships.rs`:
```rust
use klassenzeit_backend::app::App;
use loco_rs::testing::prelude::*;
use sea_orm::{ActiveModelTrait, EntityTrait, ModelTrait};
use serial_test::serial;

use klassenzeit_backend::models::{app_users, school_memberships, schools};

async fn create_school_and_user(
    db: &sea_orm::DatabaseConnection,
) -> (schools::Model, app_users::Model) {
    let school = schools::ActiveModel::new(
        "Membership School".to_string(),
        format!("membership-school-{}", uuid::Uuid::new_v4()),
    );
    let school = school.insert(db).await.unwrap();

    let user = app_users::ActiveModel::new(
        format!("kc-{}", uuid::Uuid::new_v4()),
        format!("{}@example.com", uuid::Uuid::new_v4()),
        "Test User".to_string(),
    );
    let user = user.insert(db).await.unwrap();

    (school, user)
}

#[tokio::test]
#[serial]
async fn can_create_membership() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let membership = school_memberships::ActiveModel::new(
        user.id,
        school.id,
        "admin".to_string(),
    );
    let membership = membership.insert(&boot.app_context.db).await.unwrap();

    assert_eq!(membership.user_id, user.id);
    assert_eq!(membership.school_id, school.id);
    assert_eq!(membership.role, "admin");
    assert!(membership.is_active);
}

#[tokio::test]
#[serial]
async fn membership_user_school_must_be_unique() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let m1 = school_memberships::ActiveModel::new(user.id, school.id, "admin".to_string());
    m1.insert(&boot.app_context.db).await.unwrap();

    let m2 = school_memberships::ActiveModel::new(user.id, school.id, "teacher".to_string());
    let result = m2.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}

#[tokio::test]
#[serial]
async fn deleting_school_cascades_to_memberships() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let membership = school_memberships::ActiveModel::new(
        user.id,
        school.id,
        "teacher".to_string(),
    );
    let membership = membership.insert(&boot.app_context.db).await.unwrap();
    let membership_id = membership.id;

    // Delete the school
    school.delete(&boot.app_context.db).await.unwrap();

    // Membership should be gone
    let found = school_memberships::Entity::find_by_id(membership_id)
        .one(&boot.app_context.db)
        .await
        .unwrap();
    assert!(found.is_none());
}

#[tokio::test]
#[serial]
async fn deleting_user_cascades_to_memberships() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let membership = school_memberships::ActiveModel::new(
        user.id,
        school.id,
        "viewer".to_string(),
    );
    let membership = membership.insert(&boot.app_context.db).await.unwrap();
    let membership_id = membership.id;

    // Delete the user
    user.delete(&boot.app_context.db).await.unwrap();

    // Membership should be gone
    let found = school_memberships::Entity::find_by_id(membership_id)
        .one(&boot.app_context.db)
        .await
        .unwrap();
    assert!(found.is_none());
}

#[tokio::test]
#[serial]
async fn role_check_constraint_rejects_invalid_role() {
    let boot = boot_test::<App>().await.unwrap();
    let (school, user) = create_school_and_user(&boot.app_context.db).await;

    let membership = school_memberships::ActiveModel::new(
        user.id,
        school.id,
        "superadmin".to_string(), // invalid role
    );
    let result = membership.insert(&boot.app_context.db).await;
    assert!(result.is_err());
}
```

- [ ] **Step 5: Run all tests**

Run: `cd /home/pascal/Code/Klassenzeit && cargo test --workspace`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/tests/
git commit -m "Add integration tests for core tables (schools, app_users, school_memberships)"
```

---

### Task 6: Final Verification

Run a full check to make sure everything is clean.

- [ ] **Step 1: Run full linter/formatter check**

Run: `cd /home/pascal/Code/Klassenzeit && just check`
Expected: all checks pass

- [ ] **Step 2: Run full test suite**

Run: `cd /home/pascal/Code/Klassenzeit && just test`
Expected: all tests pass

- [ ] **Step 3: Fix any issues found**

If linters or tests fail, fix the issues and re-run.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A backend/
git commit -m "Fix lint/test issues from core tables implementation"
```
