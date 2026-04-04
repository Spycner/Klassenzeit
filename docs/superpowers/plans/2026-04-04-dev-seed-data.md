# Dev Seed Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the dev database with realistic German primary school data so `just dev-setup` gives a fully usable app.

**Architecture:** Two-part seeding — a SQL file for reference data (idempotent INSERTs) and a shell script that fetches Keycloak user IDs to create app_users + school_memberships. Justfile recipes wire it all together.

**Tech Stack:** PostgreSQL, Bash, curl/jq (Keycloak admin API), Docker

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `docker/seeds/dev-seed.sql` | All reference data INSERTs |
| Create | `docker/seeds/bootstrap.sh` | Keycloak user lookup + app_users/memberships |
| Modify | `docker-compose.yml` | Mount seeds directory into postgres container |
| Modify | `justfile` | Add `db-seed`, `db-bootstrap`, `dev-setup` recipes |

---

### Task 1: SQL Seed File — Core Tables

**Files:**
- Modify: `docker/seeds/dev-seed.sql`

- [ ] **Step 1: Write the school and school_years/terms inserts**

Replace the contents of `docker/seeds/dev-seed.sql` with:

```sql
-- Dev seed data for Klassenzeit
-- Idempotent: safe to run multiple times (ON CONFLICT DO NOTHING)
-- Requires: migrations have been run first

-- Well-known UUIDs (consistent across dev environments)
-- School:       00000000-0000-0000-0000-000000000001
-- School Year:  00000000-0000-0000-0000-000000000101
-- Terms:        00000000-0000-0000-0000-000000000201/202
-- Teachers:     00000000-0000-0000-0000-000000000301..308
-- Subjects:     00000000-0000-0000-0000-000000000401..408
-- Rooms:        00000000-0000-0000-0000-000000000501..506
-- Classes:      00000000-0000-0000-0000-000000000601..604

BEGIN;

-- =============================================================================
-- School
-- =============================================================================
INSERT INTO schools (id, name, slug, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Grundschule am See',
  'grundschule-am-see',
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- School Year
-- =============================================================================
INSERT INTO school_years (id, school_id, name, start_date, end_date, is_current, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  '2025/2026',
  '2025-08-01',
  '2026-07-31',
  true,
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Terms
-- =============================================================================
INSERT INTO terms (id, school_year_id, name, start_date, end_date, is_current, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000201',
   '00000000-0000-0000-0000-000000000101',
   '1. Halbjahr', '2025-08-01', '2026-01-31', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000202',
   '00000000-0000-0000-0000-000000000101',
   '2. Halbjahr', '2026-02-01', '2026-07-31', false, NOW(), NOW())
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verify SQL syntax**

Run:
```bash
docker exec klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev -c "\dt schools"
```
Expected: the schools table exists (migrations have been run). If not, run `just db-migrate` first.

Then test the SQL so far:
```bash
docker exec klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev -f /seeds/dev-seed.sql
```
Expected: `INSERT 0 1` (or `INSERT 0 0` if already seeded). No errors.

Note: this step will fail until Task 4 mounts the seeds directory. You can alternatively run:
```bash
cat docker/seeds/dev-seed.sql | docker exec -i klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev
```

- [ ] **Step 3: Commit**

```bash
git add docker/seeds/dev-seed.sql
git commit -m "feat: add dev seed data — school, school year, terms"
```

---

### Task 2: SQL Seed File — Teachers and Subjects

**Files:**
- Modify: `docker/seeds/dev-seed.sql`

- [ ] **Step 1: Append teachers inserts**

Add to `docker/seeds/dev-seed.sql` before the closing `COMMIT;` (note: we'll add COMMIT at the end in Task 3):

```sql
-- =============================================================================
-- Teachers
-- =============================================================================
INSERT INTO teachers (id, school_id, first_name, last_name, email, abbreviation, max_hours_per_week, is_part_time, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000001',
   'Anna', 'Müller', 'a.mueller@grundschule-am-see.de', 'MÜL', 28, false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000302',
   '00000000-0000-0000-0000-000000000001',
   'Thomas', 'Schmidt', 't.schmidt@grundschule-am-see.de', 'SCH', 28, false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000303',
   '00000000-0000-0000-0000-000000000001',
   'Maria', 'Weber', 'm.weber@grundschule-am-see.de', 'WEB', 28, false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000304',
   '00000000-0000-0000-0000-000000000001',
   'Klaus', 'Fischer', 'k.fischer@grundschule-am-see.de', 'FIS', 28, false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000305',
   '00000000-0000-0000-0000-000000000001',
   'Sabine', 'Becker', 's.becker@grundschule-am-see.de', 'BEC', 14, true, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000306',
   '00000000-0000-0000-0000-000000000001',
   'Peter', 'Hoffmann', 'p.hoffmann@grundschule-am-see.de', 'HOF', 28, false, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000307',
   '00000000-0000-0000-0000-000000000001',
   'Laura', 'Klein', 'l.klein@grundschule-am-see.de', 'KLE', 14, true, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000308',
   '00000000-0000-0000-0000-000000000001',
   'Markus', 'Wagner', 'm.wagner@grundschule-am-see.de', 'WAG', 28, false, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Subjects
-- =============================================================================
INSERT INTO subjects (id, school_id, name, abbreviation, color, needs_special_room, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000401',
   '00000000-0000-0000-0000-000000000001',
   'Deutsch', 'DE', '#4A90D9', false, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000402',
   '00000000-0000-0000-0000-000000000001',
   'Mathematik', 'MA', '#E74C3C', false, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000403',
   '00000000-0000-0000-0000-000000000001',
   'Englisch', 'EN', '#2ECC71', false, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000404',
   '00000000-0000-0000-0000-000000000001',
   'Sachunterricht', 'SU', '#F39C12', false, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000405',
   '00000000-0000-0000-0000-000000000001',
   'Sport', 'SP', '#9B59B6', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000406',
   '00000000-0000-0000-0000-000000000001',
   'Musik', 'MU', '#1ABC9C', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000407',
   '00000000-0000-0000-0000-000000000001',
   'Kunst', 'KU', '#E67E22', false, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000408',
   '00000000-0000-0000-0000-000000000001',
   'Religion', 'RE', '#95A5A6', false, NOW(), NOW())
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Test the SQL**

```bash
cat docker/seeds/dev-seed.sql | docker exec -i klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev
```
Expected: INSERT statements succeed, no errors.

- [ ] **Step 3: Commit**

```bash
git add docker/seeds/dev-seed.sql
git commit -m "feat: add teachers and subjects seed data"
```

---

### Task 3: SQL Seed File — Rooms, Classes, Time Slots

**Files:**
- Modify: `docker/seeds/dev-seed.sql`

- [ ] **Step 1: Append rooms, classes, and time slots**

Add to `docker/seeds/dev-seed.sql`:

```sql
-- =============================================================================
-- Rooms
-- =============================================================================
INSERT INTO rooms (id, school_id, name, building, capacity, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000501',
   '00000000-0000-0000-0000-000000000001',
   '101', 'Hauptgebäude', 30, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000502',
   '00000000-0000-0000-0000-000000000001',
   '102', 'Hauptgebäude', 30, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000503',
   '00000000-0000-0000-0000-000000000001',
   '103', 'Hauptgebäude', 30, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000504',
   '00000000-0000-0000-0000-000000000001',
   '104', 'Hauptgebäude', 30, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000505',
   '00000000-0000-0000-0000-000000000001',
   'Turnhalle', 'Nebengebäude', 60, true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000506',
   '00000000-0000-0000-0000-000000000001',
   'Musikraum', 'Hauptgebäude', 30, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- =============================================================================
-- School Classes (class_teacher_id references teachers)
-- =============================================================================
INSERT INTO school_classes (id, school_id, name, grade_level, student_count, class_teacher_id, is_active, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000601',
   '00000000-0000-0000-0000-000000000001',
   '1a', 1, 24, '00000000-0000-0000-0000-000000000301', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000602',
   '00000000-0000-0000-0000-000000000001',
   '2a', 2, 26, '00000000-0000-0000-0000-000000000302', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000603',
   '00000000-0000-0000-0000-000000000001',
   '3a', 3, 25, '00000000-0000-0000-0000-000000000303', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000604',
   '00000000-0000-0000-0000-000000000001',
   '4a', 4, 22, '00000000-0000-0000-0000-000000000304', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Time Slots (6 periods × 5 days = 30 slots)
-- day_of_week: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
-- =============================================================================
INSERT INTO time_slots (id, school_id, day_of_week, period, start_time, end_time, is_break, label, created_at, updated_at)
VALUES
  -- Monday
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 0, 1, '08:00', '08:45', false, '1. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 0, 2, '08:50', '09:35', false, '2. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 0, 3, '09:55', '10:40', false, '3. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 0, 4, '10:45', '11:30', false, '4. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 0, 5, '11:45', '12:30', false, '5. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0000-000000000001', 0, 6, '12:35', '13:20', false, '6. Stunde', NOW(), NOW()),
  -- Tuesday
  ('00000000-0000-0000-0001-000000000011', '00000000-0000-0000-0000-000000000001', 1, 1, '08:00', '08:45', false, '1. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0000-000000000001', 1, 2, '08:50', '09:35', false, '2. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0000-000000000001', 1, 3, '09:55', '10:40', false, '3. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000014', '00000000-0000-0000-0000-000000000001', 1, 4, '10:45', '11:30', false, '4. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000015', '00000000-0000-0000-0000-000000000001', 1, 5, '11:45', '12:30', false, '5. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000016', '00000000-0000-0000-0000-000000000001', 1, 6, '12:35', '13:20', false, '6. Stunde', NOW(), NOW()),
  -- Wednesday
  ('00000000-0000-0000-0001-000000000021', '00000000-0000-0000-0000-000000000001', 2, 1, '08:00', '08:45', false, '1. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000022', '00000000-0000-0000-0000-000000000001', 2, 2, '08:50', '09:35', false, '2. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000023', '00000000-0000-0000-0000-000000000001', 2, 3, '09:55', '10:40', false, '3. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000024', '00000000-0000-0000-0000-000000000001', 2, 4, '10:45', '11:30', false, '4. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000025', '00000000-0000-0000-0000-000000000001', 2, 5, '11:45', '12:30', false, '5. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000026', '00000000-0000-0000-0000-000000000001', 2, 6, '12:35', '13:20', false, '6. Stunde', NOW(), NOW()),
  -- Thursday
  ('00000000-0000-0000-0001-000000000031', '00000000-0000-0000-0000-000000000001', 3, 1, '08:00', '08:45', false, '1. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000032', '00000000-0000-0000-0000-000000000001', 3, 2, '08:50', '09:35', false, '2. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000033', '00000000-0000-0000-0000-000000000001', 3, 3, '09:55', '10:40', false, '3. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000034', '00000000-0000-0000-0000-000000000001', 3, 4, '10:45', '11:30', false, '4. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000035', '00000000-0000-0000-0000-000000000001', 3, 5, '11:45', '12:30', false, '5. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000036', '00000000-0000-0000-0000-000000000001', 3, 6, '12:35', '13:20', false, '6. Stunde', NOW(), NOW()),
  -- Friday
  ('00000000-0000-0000-0001-000000000041', '00000000-0000-0000-0000-000000000001', 4, 1, '08:00', '08:45', false, '1. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000042', '00000000-0000-0000-0000-000000000001', 4, 2, '08:50', '09:35', false, '2. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000043', '00000000-0000-0000-0000-000000000001', 4, 3, '09:55', '10:40', false, '3. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000044', '00000000-0000-0000-0000-000000000001', 4, 4, '10:45', '11:30', false, '4. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000045', '00000000-0000-0000-0000-000000000001', 4, 5, '11:45', '12:30', false, '5. Stunde', NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000046', '00000000-0000-0000-0000-000000000001', 4, 6, '12:35', '13:20', false, '6. Stunde', NOW(), NOW())
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Test the SQL**

```bash
cat docker/seeds/dev-seed.sql | docker exec -i klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev
```
Expected: all INSERTs succeed.

- [ ] **Step 3: Commit**

```bash
git add docker/seeds/dev-seed.sql
git commit -m "feat: add rooms, classes, and time slots seed data"
```

---

### Task 4: SQL Seed File — Qualifications, Availabilities, Suitabilities, Curriculum

**Files:**
- Modify: `docker/seeds/dev-seed.sql`

- [ ] **Step 1: Append relationship and curriculum data**

Add to `docker/seeds/dev-seed.sql`:

```sql
-- =============================================================================
-- Teacher Subject Qualifications
-- Class teachers: Deutsch (primary) + Mathematik (primary)
-- Specialist teachers: see spec
-- =============================================================================
INSERT INTO teacher_subject_qualifications (id, teacher_id, subject_id, qualification_level, max_hours_per_week, created_at, updated_at)
VALUES
  -- Müller (1a): Deutsch + Mathe
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000401', 'primary', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000402', 'primary', NULL, NOW(), NOW()),
  -- Schmidt (2a): Deutsch + Mathe
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000401', 'primary', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000402', 'primary', NULL, NOW(), NOW()),
  -- Weber (3a): Deutsch + Mathe
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000401', 'primary', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000402', 'primary', NULL, NOW(), NOW()),
  -- Fischer (4a): Deutsch + Mathe
  ('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000401', 'primary', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000402', 'primary', NULL, NOW(), NOW()),
  -- Becker: Sport (primary) + Kunst (secondary)
  ('00000000-0000-0000-0002-000000000009', '00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000405', 'primary', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000407', 'secondary', NULL, NOW(), NOW()),
  -- Hoffmann: Englisch (primary) + Sachunterricht (secondary)
  ('00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000403', 'primary', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000404', 'secondary', NULL, NOW(), NOW()),
  -- Klein: Musik (primary) + Religion (secondary)
  ('00000000-0000-0000-0002-000000000013', '00000000-0000-0000-0000-000000000307', '00000000-0000-0000-0000-000000000406', 'primary', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000014', '00000000-0000-0000-0000-000000000307', '00000000-0000-0000-0000-000000000408', 'secondary', NULL, NOW(), NOW()),
  -- Wagner: Sachunterricht (primary) + Englisch (secondary)
  ('00000000-0000-0000-0002-000000000015', '00000000-0000-0000-0000-000000000308', '00000000-0000-0000-0000-000000000404', 'primary', NULL, NOW(), NOW()),
  ('00000000-0000-0000-0002-000000000016', '00000000-0000-0000-0000-000000000308', '00000000-0000-0000-0000-000000000403', 'secondary', NULL, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Teacher Availabilities (part-time blocked slots)
-- Becker: blocked Thursdays and Fridays
-- Klein: blocked Mondays and Tuesdays
-- =============================================================================
INSERT INTO teacher_availabilities (id, teacher_id, term_id, day_of_week, period, availability_type, reason, created_at, updated_at)
VALUES
  -- Becker blocked Thursday all periods
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000305', NULL, 3, 1, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000305', NULL, 3, 2, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000305', NULL, 3, 3, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000305', NULL, 3, 4, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000305', NULL, 3, 5, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000006', '00000000-0000-0000-0000-000000000305', NULL, 3, 6, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  -- Becker blocked Friday all periods
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000305', NULL, 4, 1, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000008', '00000000-0000-0000-0000-000000000305', NULL, 4, 2, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000009', '00000000-0000-0000-0000-000000000305', NULL, 4, 3, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0000-000000000305', NULL, 4, 4, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0000-000000000305', NULL, 4, 5, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0000-000000000305', NULL, 4, 6, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  -- Klein blocked Monday all periods
  ('00000000-0000-0000-0003-000000000013', '00000000-0000-0000-0000-000000000307', NULL, 0, 1, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000014', '00000000-0000-0000-0000-000000000307', NULL, 0, 2, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000015', '00000000-0000-0000-0000-000000000307', NULL, 0, 3, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000016', '00000000-0000-0000-0000-000000000307', NULL, 0, 4, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000017', '00000000-0000-0000-0000-000000000307', NULL, 0, 5, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000018', '00000000-0000-0000-0000-000000000307', NULL, 0, 6, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  -- Klein blocked Tuesday all periods
  ('00000000-0000-0000-0003-000000000019', '00000000-0000-0000-0000-000000000307', NULL, 1, 1, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000020', '00000000-0000-0000-0000-000000000307', NULL, 1, 2, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000021', '00000000-0000-0000-0000-000000000307', NULL, 1, 3, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000022', '00000000-0000-0000-0000-000000000307', NULL, 1, 4, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000023', '00000000-0000-0000-0000-000000000307', NULL, 1, 5, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW()),
  ('00000000-0000-0000-0003-000000000024', '00000000-0000-0000-0000-000000000307', NULL, 1, 6, 'blocked', 'Teilzeit — nicht verfügbar', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Room Subject Suitabilities
-- =============================================================================
INSERT INTO room_subject_suitabilities (id, room_id, subject_id, notes, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0004-000000000001',
   '00000000-0000-0000-0000-000000000505',
   '00000000-0000-0000-0000-000000000405',
   'Turnhalle für Sportunterricht', NOW(), NOW()),
  ('00000000-0000-0000-0004-000000000002',
   '00000000-0000-0000-0000-000000000506',
   '00000000-0000-0000-0000-000000000406',
   'Musikraum mit Instrumenten', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Curriculum Entries (1. Halbjahr)
-- Grades 1-2: no Englisch; Grades 3-4: with Englisch
-- =============================================================================
INSERT INTO curriculum_entries (id, school_id, term_id, school_class_id, subject_id, teacher_id, hours_per_week, created_at, updated_at)
VALUES
  -- Class 1a (grade 1): 23h total, no Englisch
  ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', 6, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000301', 5, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000308', 3, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000305', 3, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000307', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000006', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000407', '00000000-0000-0000-0000-000000000305', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000007', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000408', '00000000-0000-0000-0000-000000000307', 2, NOW(), NOW()),

  -- Class 2a (grade 2): 23h total, no Englisch
  ('00000000-0000-0000-0005-000000000008', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000302', 6, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000009', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000302', 5, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000010', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000308', 3, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000305', 3, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000012', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000307', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000013', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000407', '00000000-0000-0000-0000-000000000305', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000014', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000408', '00000000-0000-0000-0000-000000000307', 2, NOW(), NOW()),

  -- Class 3a (grade 3): 25h total, with Englisch
  ('00000000-0000-0000-0005-000000000015', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000303', 6, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000016', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000303', 5, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000017', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000306', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000018', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000308', 3, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000019', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000305', 3, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000307', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000021', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000407', '00000000-0000-0000-0000-000000000305', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000022', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000408', '00000000-0000-0000-0000-000000000307', 2, NOW(), NOW()),

  -- Class 4a (grade 4): 25h total, with Englisch
  ('00000000-0000-0000-0005-000000000023', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000304', 6, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000024', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000304', 5, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000025', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000306', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000026', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000308', 3, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000027', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000305', 3, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000028', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000307', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000029', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000407', '00000000-0000-0000-0000-000000000305', 2, NOW(), NOW()),
  ('00000000-0000-0000-0005-000000000030', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000408', '00000000-0000-0000-0000-000000000307', 2, NOW(), NOW())
ON CONFLICT DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Test the complete SQL file**

```bash
cat docker/seeds/dev-seed.sql | docker exec -i klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev
```
Expected: all INSERTs succeed. Verify row counts:
```bash
docker exec klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev -c "
  SELECT 'schools' as t, count(*) FROM schools
  UNION ALL SELECT 'teachers', count(*) FROM teachers
  UNION ALL SELECT 'subjects', count(*) FROM subjects
  UNION ALL SELECT 'rooms', count(*) FROM rooms
  UNION ALL SELECT 'school_classes', count(*) FROM school_classes
  UNION ALL SELECT 'time_slots', count(*) FROM time_slots
  UNION ALL SELECT 'curriculum_entries', count(*) FROM curriculum_entries;
"
```
Expected counts: schools=1, teachers=8, subjects=8, rooms=6, school_classes=4, time_slots=30, curriculum_entries=30.

- [ ] **Step 3: Commit**

```bash
git add docker/seeds/dev-seed.sql
git commit -m "feat: add qualifications, availabilities, suitabilities, curriculum seed data"
```

---

### Task 5: Bootstrap Script

**Files:**
- Create: `docker/seeds/bootstrap.sh`

- [ ] **Step 1: Write the bootstrap script**

Create `docker/seeds/bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Bootstrap dev users from Keycloak into the app database.
# Fetches real Keycloak user IDs and creates app_users + school_memberships.
# Idempotent: safe to run multiple times.

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="klassenzeit"
SCHOOL_ID="00000000-0000-0000-0000-000000000001"

PG_CONTAINER="klassenzeit-postgres-dev"
PG_USER="postgres"
PG_DB="klassenzeit_dev"

# --- Wait for Keycloak ---
echo "Waiting for Keycloak at ${KEYCLOAK_URL}..."
for i in $(seq 1 30); do
  if curl -sf "${KEYCLOAK_URL}/health/ready" > /dev/null 2>&1; then
    echo "Keycloak is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Keycloak not ready after 30 attempts."
    exit 1
  fi
  sleep 2
done

# --- Get admin token ---
TOKEN=$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${KEYCLOAK_ADMIN}" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Failed to get Keycloak admin token."
  exit 1
fi

# --- Fetch users from realm ---
USERS_JSON=$(curl -sf "${KEYCLOAK_URL}/admin/realms/${REALM}/users?max=100" \
  -H "Authorization: Bearer ${TOKEN}")

# --- Map email -> keycloak_id and role ---
declare -A EMAIL_ROLE_MAP=(
  ["admin@test.com"]="admin"
  ["teacher@test.com"]="teacher"
  ["viewer@test.com"]="viewer"
)

declare -A EMAIL_DISPLAY_MAP=(
  ["admin@test.com"]="Admin User"
  ["teacher@test.com"]="Teacher User"
  ["viewer@test.com"]="Viewer User"
)

SQL=""

for EMAIL in "${!EMAIL_ROLE_MAP[@]}"; do
  KC_ID=$(echo "$USERS_JSON" | jq -r ".[] | select(.email == \"${EMAIL}\") | .id")

  if [ -z "$KC_ID" ] || [ "$KC_ID" = "null" ]; then
    echo "WARNING: User ${EMAIL} not found in Keycloak realm. Skipping."
    continue
  fi

  ROLE="${EMAIL_ROLE_MAP[$EMAIL]}"
  DISPLAY="${EMAIL_DISPLAY_MAP[$EMAIL]}"

  echo "Found ${EMAIL} -> ${KC_ID} (${ROLE})"

  SQL+="
    INSERT INTO app_users (id, keycloak_id, email, display_name, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), '${KC_ID}', '${EMAIL}', '${DISPLAY}', true, NOW(), NOW())
    ON CONFLICT (keycloak_id) DO NOTHING;

    INSERT INTO school_memberships (id, user_id, school_id, role, is_active, created_at, updated_at)
    SELECT gen_random_uuid(), u.id, '${SCHOOL_ID}', '${ROLE}', true, NOW(), NOW()
    FROM app_users u
    WHERE u.keycloak_id = '${KC_ID}'
    AND NOT EXISTS (
      SELECT 1 FROM school_memberships sm
      WHERE sm.user_id = u.id AND sm.school_id = '${SCHOOL_ID}'
    );
  "
done

if [ -z "$SQL" ]; then
  echo "No users to bootstrap."
  exit 0
fi

docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" <<< "$SQL"
echo "Bootstrap complete."
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x docker/seeds/bootstrap.sh
```

- [ ] **Step 3: Test the bootstrap script**

Requires Keycloak and Postgres to be running (`just dev`).

```bash
bash docker/seeds/bootstrap.sh
```
Expected output:
```
Waiting for Keycloak at http://localhost:8080...
Keycloak is ready.
Found admin@test.com -> <uuid> (admin)
Found teacher@test.com -> <uuid> (teacher)
Found viewer@test.com -> <uuid> (viewer)
Bootstrap complete.
```

Verify:
```bash
docker exec klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev -c "SELECT email, display_name FROM app_users;"
docker exec klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev -c "SELECT u.email, sm.role FROM school_memberships sm JOIN app_users u ON u.id = sm.user_id;"
```

- [ ] **Step 4: Commit**

```bash
git add docker/seeds/bootstrap.sh
git commit -m "feat: add bootstrap script for Keycloak user provisioning"
```

---

### Task 6: Docker Compose and Justfile Integration

**Files:**
- Modify: `docker-compose.yml`
- Modify: `justfile`

- [ ] **Step 1: Mount seeds directory in docker-compose.yml**

In `docker-compose.yml`, add the seeds volume to the `postgres-dev` service. Change:

```yaml
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
```

To:

```yaml
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
      - ./docker/seeds:/seeds:ro
```

- [ ] **Step 2: Add justfile recipes**

Add these recipes to `justfile` (before the `# Staging` section):

```just
# Seed dev database with sample data (requires running postgres + migrations)
db-seed:
    cat docker/seeds/dev-seed.sql | docker exec -i klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev

# Bootstrap user accounts from Keycloak (requires running keycloak + postgres)
db-bootstrap:
    bash docker/seeds/bootstrap.sh

# Full dev setup: start containers, migrate, seed, bootstrap users
dev-setup:
    just dev
    @echo "Waiting for services to start..."
    @sleep 10
    just db-migrate
    just db-seed
    just db-bootstrap
    @echo "Dev environment ready! Open http://localhost:3000"
```

- [ ] **Step 3: Test `just db-seed`**

First, clear existing seed data to test fresh:
```bash
docker exec klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev -c "DELETE FROM curriculum_entries; DELETE FROM teacher_availabilities; DELETE FROM teacher_subject_qualifications; DELETE FROM room_subject_suitabilities; DELETE FROM school_classes; DELETE FROM time_slots; DELETE FROM rooms; DELETE FROM subjects; DELETE FROM teachers; DELETE FROM terms; DELETE FROM school_years; DELETE FROM school_memberships; DELETE FROM app_users; DELETE FROM schools;"
```

Then:
```bash
just db-seed
```
Expected: INSERT statements succeed. Verify with count query from Task 4.

- [ ] **Step 4: Test `just db-bootstrap`**

```bash
just db-bootstrap
```
Expected: 3 users created with correct roles.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml justfile
git commit -m "feat: add db-seed, db-bootstrap, dev-setup justfile recipes"
```

---

### Task 7: Final Verification and Documentation

**Files:**
- Modify: `docs/superpowers/next-steps.md` (mark dev seed data as done)
- Modify: `docs/STATUS.md` (update status)

- [ ] **Step 1: Full reset test**

Run a complete dev-reset to verify everything works from scratch:
```bash
just dev-reset
sleep 10
just db-migrate
just db-seed
just db-bootstrap
```

Verify all data:
```bash
docker exec klassenzeit-postgres-dev psql -U postgres -d klassenzeit_dev -c "
  SELECT 'schools' as t, count(*) FROM schools
  UNION ALL SELECT 'app_users', count(*) FROM app_users
  UNION ALL SELECT 'school_memberships', count(*) FROM school_memberships
  UNION ALL SELECT 'school_years', count(*) FROM school_years
  UNION ALL SELECT 'terms', count(*) FROM terms
  UNION ALL SELECT 'teachers', count(*) FROM teachers
  UNION ALL SELECT 'subjects', count(*) FROM subjects
  UNION ALL SELECT 'rooms', count(*) FROM rooms
  UNION ALL SELECT 'school_classes', count(*) FROM school_classes
  UNION ALL SELECT 'time_slots', count(*) FROM time_slots
  UNION ALL SELECT 'qualifications', count(*) FROM teacher_subject_qualifications
  UNION ALL SELECT 'availabilities', count(*) FROM teacher_availabilities
  UNION ALL SELECT 'room_suitabilities', count(*) FROM room_subject_suitabilities
  UNION ALL SELECT 'curriculum_entries', count(*) FROM curriculum_entries;
"
```

Expected:
```
schools=1, app_users=3, school_memberships=3, school_years=1, terms=2,
teachers=8, subjects=8, rooms=6, school_classes=4, time_slots=30,
qualifications=16, availabilities=24, room_suitabilities=2, curriculum_entries=30
```

- [ ] **Step 2: Test idempotency**

Run seed + bootstrap again:
```bash
just db-seed
just db-bootstrap
```
Expected: no errors, no duplicate rows (ON CONFLICT DO NOTHING).

- [ ] **Step 3: Update next-steps.md**

Mark "Dev seed data" as done in `docs/superpowers/next-steps.md`:

Change:
```markdown
- [ ] **Dev seed data** — Seed `schools`, `app_users`, `school_memberships`, and all reference data tables so local development and demos have realistic data to work with. Blocked on CRUD or direct DB seeds.
```

To:
```markdown
- [x] **Dev seed data** — PR #XX. SQL seed file + Keycloak bootstrap script. `just dev-setup` for full automated setup.
```

- [ ] **Step 4: Update STATUS.md**

Add to the "Completed Steps" section in `docs/STATUS.md`:

```markdown
### Dev Seed Data
- Spec: `superpowers/specs/2026-04-04-dev-seed-data-design.md`
- Plan: `superpowers/plans/2026-04-04-dev-seed-data.md`
- PR: #XX (merged)
```

Update the "Next Up" section:
```markdown
## Next Up

Deployment pipeline setup. Remaining work is testing infrastructure, deployment, and optimization.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/next-steps.md docs/STATUS.md
git commit -m "docs: mark dev seed data as complete, update next steps"
```
