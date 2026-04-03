# Domain Tables Migration — Design Spec

## Goal

Port the v1 domain tables to SeaORM migrations in v2, and create comprehensive ERD + constraint documentation in mdBook for domain discussions.

## Context

- v2 currently has 3 tables: `schools`, `app_users`, `school_memberships`
- v1 had a full timetabling domain across 11 Flyway migrations
- We port the domain model faithfully, dropping only v1 fields that aren't needed yet (optimistic locking `version`, `school_type`/`min_grade`/`max_grade`, `school_slug_history`)

## New Tables

One migration: `m20250403_000002_domain_tables.rs`

### Organizational Hierarchy

**school_years**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| school_id | UUID | FK → schools, NOT NULL |
| name | VARCHAR(50) | NOT NULL |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL |
| is_current | BOOLEAN | NOT NULL, DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (school_id, name)
- CHECK (start_date < end_date)
- INDEX on school_id

**terms**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| school_year_id | UUID | FK → school_years CASCADE, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL |
| is_current | BOOLEAN | NOT NULL, DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- CHECK (start_date < end_date)
- INDEX on school_year_id

### Core Resources

**teachers**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| school_id | UUID | FK → schools CASCADE, NOT NULL |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(255) | |
| abbreviation | VARCHAR(5) | NOT NULL |
| max_hours_per_week | INTEGER | NOT NULL, DEFAULT 28 |
| is_part_time | BOOLEAN | NOT NULL, DEFAULT false |
| is_active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (school_id, abbreviation)
- UNIQUE (school_id, email) — partial, WHERE email IS NOT NULL
- INDEX on school_id

**subjects**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| school_id | UUID | FK → schools CASCADE, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| abbreviation | VARCHAR(10) | NOT NULL |
| color | VARCHAR(7) | |
| needs_special_room | BOOLEAN | NOT NULL, DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (school_id, abbreviation)
- INDEX on school_id

**rooms**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| school_id | UUID | FK → schools CASCADE, NOT NULL |
| name | VARCHAR(50) | NOT NULL |
| building | VARCHAR(100) | |
| capacity | INTEGER | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (school_id, name)
- INDEX on school_id

Note: v1 had a `features` JSONB column on rooms. Dropping it for now — room-subject suitability covers the main use case. Can add back if needed.

**school_classes**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| school_id | UUID | FK → schools CASCADE, NOT NULL |
| name | VARCHAR(20) | NOT NULL |
| grade_level | SMALLINT | NOT NULL |
| student_count | INTEGER | |
| class_teacher_id | UUID | FK → teachers SET NULL |
| is_active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (school_id, name)
- INDEX on school_id, class_teacher_id

**time_slots**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| school_id | UUID | FK → schools CASCADE, NOT NULL |
| day_of_week | SMALLINT | NOT NULL |
| period | SMALLINT | NOT NULL |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL |
| is_break | BOOLEAN | NOT NULL, DEFAULT false |
| label | VARCHAR(50) | |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (school_id, day_of_week, period)
- CHECK (day_of_week >= 0 AND day_of_week <= 4)
- CHECK (period >= 1 AND period <= 10)
- CHECK (start_time < end_time)
- INDEX on school_id

### Relationship Tables

**teacher_subject_qualifications**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| teacher_id | UUID | FK → teachers CASCADE, NOT NULL |
| subject_id | UUID | FK → subjects CASCADE, NOT NULL |
| qualification_level | VARCHAR(20) | NOT NULL, CHECK IN ('primary', 'secondary', 'substitute') |
| max_hours_per_week | INTEGER | |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (teacher_id, subject_id)
- INDEX on teacher_id, subject_id

Note: v1 had `can_teach_grades INTEGER[]`. Dropping for now — grade filtering can use the class's grade_level + teacher qualification at query time. Simpler model.

**teacher_availabilities**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| teacher_id | UUID | FK → teachers CASCADE, NOT NULL |
| term_id | UUID | FK → terms CASCADE, nullable |
| day_of_week | SMALLINT | NOT NULL |
| period | SMALLINT | NOT NULL |
| availability_type | VARCHAR(20) | NOT NULL, CHECK IN ('available', 'blocked', 'preferred') |
| reason | VARCHAR(255) | |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (teacher_id, day_of_week, period) WHERE term_id IS NULL — global availability
- UNIQUE (teacher_id, term_id, day_of_week, period) WHERE term_id IS NOT NULL — term-specific
- CHECK (day_of_week >= 0 AND day_of_week <= 4)
- CHECK (period >= 1 AND period <= 10)
- INDEX on teacher_id, term_id

**room_subject_suitabilities**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| room_id | UUID | FK → rooms CASCADE, NOT NULL |
| subject_id | UUID | FK → subjects CASCADE, NOT NULL |
| notes | VARCHAR(255) | |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (room_id, subject_id)
- INDEX on room_id, subject_id

### Timetable Output

**lessons**
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| term_id | UUID | FK → terms CASCADE, NOT NULL |
| school_class_id | UUID | FK → school_classes CASCADE, NOT NULL |
| teacher_id | UUID | FK → teachers CASCADE, NOT NULL |
| subject_id | UUID | FK → subjects CASCADE, NOT NULL |
| room_id | UUID | FK → rooms SET NULL, nullable |
| timeslot_id | UUID | FK → time_slots CASCADE, NOT NULL |
| week_pattern | VARCHAR(10) | NOT NULL, DEFAULT 'every', CHECK IN ('every', 'a', 'b') |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

- UNIQUE (term_id, school_class_id, timeslot_id, week_pattern) — no class double-booking
- UNIQUE (term_id, teacher_id, timeslot_id, week_pattern) — no teacher double-booking
- UNIQUE (term_id, room_id, timeslot_id, week_pattern) WHERE room_id IS NOT NULL — no room double-booking
- INDEX on term_id, school_class_id, teacher_id, subject_id, room_id, timeslot_id

## ERD Documentation

New mdBook page: `docs/src/database-schema.md`

Contents:
1. **Mermaid ERD** — all tables with relationships, grouped visually
2. **Table descriptions** — one-paragraph purpose for each table
3. **Hard constraints** — database-enforced rules (CHECK, UNIQUE, FK)
4. **Soft constraints** — application/scheduler-level rules not enforced by DB
5. **Enum values** — all VARCHAR enum columns with valid values and descriptions
6. **Multi-tenancy model** — how school_id scoping works

### Hard Constraints (DB-enforced)

| Constraint | Table(s) | Rule |
|-----------|----------|------|
| Date ordering | school_years, terms | start_date < end_date |
| Valid day_of_week | time_slots, teacher_availabilities | 0 (Mon) through 4 (Fri) |
| Valid period | time_slots, teacher_availabilities | 1 through 10 |
| Time ordering | time_slots | start_time < end_time |
| Unique abbreviation per school | teachers, subjects | (school_id, abbreviation) |
| Unique name per school | rooms, school_classes, school_years | (school_id, name) |
| Unique time slot | time_slots | (school_id, day_of_week, period) |
| One qualification per teacher-subject | teacher_subject_qualifications | (teacher_id, subject_id) |
| One suitability per room-subject | room_subject_suitabilities | (room_id, subject_id) |
| No class double-booking | lessons | (term_id, school_class_id, timeslot_id, week_pattern) |
| No teacher double-booking | lessons | (term_id, teacher_id, timeslot_id, week_pattern) |
| No room double-booking | lessons | (term_id, room_id, timeslot_id, week_pattern) WHERE room_id IS NOT NULL |
| Valid role | school_memberships | role IN ('admin', 'teacher', 'viewer') |
| Valid qualification | teacher_subject_qualifications | qualification_level IN ('primary', 'secondary', 'substitute') |
| Valid availability | teacher_availabilities | availability_type IN ('available', 'blocked', 'preferred') |
| Valid week pattern | lessons | week_pattern IN ('every', 'a', 'b') |
| Tenant isolation | all domain tables | school_id FK or inherited through parent FK |

### Soft Constraints (scheduler/application-level)

| Constraint | Description | Enforcement |
|-----------|-------------|-------------|
| Teacher max hours | Teachers should not exceed max_hours_per_week | Scheduler |
| Teacher availability preference | Teachers prefer certain time slots (availability_type = 'preferred') | Scheduler (soft score) |
| Teacher blocked slots | Teachers cannot teach in blocked slots (availability_type = 'blocked') | Scheduler (hard score) |
| Room capacity | Room capacity should match or exceed class student_count | Scheduler |
| Room-subject suitability | Subjects needing special rooms should be assigned to suitable rooms | Scheduler |
| Teacher qualification | Teachers should teach subjects they're qualified for | Scheduler |
| Part-time teacher distribution | Part-time teachers should have compact schedules | Scheduler (soft score) |
| Class teacher assignment | Class teachers should teach their own class when possible | Scheduler (soft score) |
| Consecutive lessons | Same subject for same class should ideally be in consecutive periods | Scheduler (soft score) |
| Daily subject distribution | Avoid same subject multiple times per day for a class | Scheduler (soft score) |

## Deliverables

1. Migration file: `backend/migration/src/m20250403_000002_domain_tables.rs`
2. Updated migration lib.rs to register new migration
3. Generated SeaORM entities for all new tables
4. mdBook page: `docs/src/database-schema.md` with ERD, constraints, descriptions
5. Updated `docs/src/SUMMARY.md` to include new page
