# Core DB Schema — Design Spec

## Overview

Replace Loco's scaffolded `users` table with three core tables that establish multi-tenancy and Keycloak-based auth: `schools`, `app_users`, `school_memberships`. This is the minimal foundation needed before wiring up JWT middleware (Step 3) and frontend auth (Step 4).

Domain tables (teachers, subjects, rooms, etc.) are deferred to a separate brainstorm after domain research.

## Decisions

- **Scope**: Core auth/tenancy tables only — `schools`, `app_users`, `school_memberships`
- **Migration strategy**: Single migration replaces Loco's `users` migration. Clean up all dead auth scaffolding.
- **Primary keys**: UUID everywhere (multi-tenant friendly, no sequential ID leaking)
- **Roles**: VARCHAR(20) with CHECK constraint (`admin`, `teacher`, `viewer`). No Postgres ENUM — easier to evolve.
- **No invitations/access requests**: Admin manually assigns roles for now.

## Schema

### `schools`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(255) NOT NULL | |
| slug | VARCHAR(100) NOT NULL UNIQUE | URL-friendly identifier |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |

Minimal compared to v1 — `school_type`, `min_grade`, `max_grade`, `timezone`, `settings` deferred until domain research.

### `app_users`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| keycloak_id | VARCHAR(255) NOT NULL UNIQUE | Keycloak subject ID |
| email | VARCHAR(255) NOT NULL UNIQUE | |
| display_name | VARCHAR(255) NOT NULL | |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | Soft-disable without touching Keycloak |
| last_login_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |

No password, api_key, or magic link fields — Keycloak handles identity.

### `school_memberships`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID NOT NULL FK → app_users ON DELETE CASCADE | |
| school_id | UUID NOT NULL FK → schools ON DELETE CASCADE | |
| role | VARCHAR(20) NOT NULL | CHECK: `admin`, `teacher`, `viewer` |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |
| UNIQUE(user_id, school_id) | | One role per school per user |

## Loco Cleanup

### Delete

- `backend/migration/src/m20220101_000001_users.rs`
- `backend/src/models/_entities/users.rs`
- `backend/src/models/users.rs`
- `backend/src/controllers/auth.rs`
- `backend/src/mailers/auth.rs`
- `backend/src/views/auth.rs`

### Update

- `backend/migration/src/lib.rs` — replace users migration with new core migration
- `backend/src/models/_entities/mod.rs` and `prelude.rs` — remove users, add new entities
- `backend/src/models/mod.rs` — remove users module
- `backend/src/controllers/mod.rs` — remove auth controller
- `backend/src/mailers/mod.rs` — remove auth mailer
- `backend/src/views/mod.rs` — remove auth views
- `backend/src/app.rs` — remove auth routes registration

## Testing

### Migration tests

- Migration runs up — all three tables exist
- Migration runs down — tables are dropped
- Unique constraints: slug, keycloak_id, email, (user_id, school_id)
- Role check constraint rejects invalid values

### Model tests

- CRUD for each entity
- Foreign key relationships (membership → user, membership → school)
- Cascading deletes: deleting a school/user removes memberships

Auth middleware and API endpoint tests are out of scope — those belong to Step 3.
