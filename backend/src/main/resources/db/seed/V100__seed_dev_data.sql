-- V100: Development seed data
-- This migration only runs in dev profile (via Flyway locations config)
-- Creates sample data for local development and testing

-- Use a fixed UUID for the demo school so we can reference it consistently
-- Demo Grundschule
INSERT INTO school (id, name, slug, school_type, min_grade, max_grade, timezone, settings, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Demo Grundschule',
    'demo-grundschule',
    'GRUNDSCHULE',
    1,
    4,
    'Europe/Berlin',
    '{"defaultLessonDuration": 45}',
    NOW(),
    NOW()
);

-- School Year 2024/2025
INSERT INTO school_year (id, school_id, name, start_date, end_date, is_current, created_at, updated_at)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    '2024/2025',
    '2024-09-01',
    '2025-07-31',
    TRUE,
    NOW(),
    NOW()
);

-- Terms (Semesters)
INSERT INTO term (id, school_year_id, name, start_date, end_date, is_current, created_at, updated_at)
VALUES
    ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222222', '1. Halbjahr', '2024-09-01', '2025-01-31', FALSE, NOW(), NOW()),
    ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', '2. Halbjahr', '2025-02-01', '2025-07-31', TRUE, NOW(), NOW());

-- Subjects (Standard German primary school subjects)
INSERT INTO subject (id, school_id, name, abbreviation, color, created_at, updated_at)
VALUES
    ('44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111111', 'Deutsch', 'DE', '#4CAF50', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444402', '11111111-1111-1111-1111-111111111111', 'Mathematik', 'MA', '#2196F3', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444403', '11111111-1111-1111-1111-111111111111', 'Sachunterricht', 'SU', '#FF9800', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444404', '11111111-1111-1111-1111-111111111111', 'Sport', 'SP', '#F44336', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444405', '11111111-1111-1111-1111-111111111111', 'Kunst', 'KU', '#9C27B0', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444406', '11111111-1111-1111-1111-111111111111', 'Musik', 'MU', '#E91E63', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444407', '11111111-1111-1111-1111-111111111111', 'Religion', 'RE', '#795548', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444408', '11111111-1111-1111-1111-111111111111', 'Ethik', 'ET', '#607D8B', NOW(), NOW()),
    ('44444444-4444-4444-4444-444444444409', '11111111-1111-1111-1111-111111111111', 'Englisch', 'EN', '#00BCD4', NOW(), NOW());

-- Rooms
INSERT INTO room (id, school_id, name, building, capacity, features, is_active, created_at, updated_at)
VALUES
    -- Klassenräume (Classrooms)
    ('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111111', 'Raum 101', 'Hauptgebäude', 28, '["whiteboard", "beamer"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111111', 'Raum 102', 'Hauptgebäude', 28, '["whiteboard", "beamer"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555503', '11111111-1111-1111-1111-111111111111', 'Raum 103', 'Hauptgebäude', 28, '["whiteboard", "beamer"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555504', '11111111-1111-1111-1111-111111111111', 'Raum 104', 'Hauptgebäude', 28, '["whiteboard", "beamer"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555505', '11111111-1111-1111-1111-111111111111', 'Raum 201', 'Hauptgebäude', 28, '["whiteboard", "beamer"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555506', '11111111-1111-1111-1111-111111111111', 'Raum 202', 'Hauptgebäude', 28, '["whiteboard", "beamer"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555507', '11111111-1111-1111-1111-111111111111', 'Raum 203', 'Hauptgebäude', 28, '["whiteboard", "beamer"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555508', '11111111-1111-1111-1111-111111111111', 'Raum 204', 'Hauptgebäude', 28, '["whiteboard", "beamer"]', TRUE, NOW(), NOW()),
    -- Fachräume (Specialized rooms)
    ('55555555-5555-5555-5555-555555555509', '11111111-1111-1111-1111-111111111111', 'Turnhalle', 'Nebengebäude', 60, '["sports_equipment"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555510', '11111111-1111-1111-1111-111111111111', 'Musikraum', 'Hauptgebäude', 30, '["piano", "instruments"]', TRUE, NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555511', '11111111-1111-1111-1111-111111111111', 'Kunstraum', 'Hauptgebäude', 25, '["sink", "art_supplies"]', TRUE, NOW(), NOW());

-- Teachers (8 teachers for a small primary school)
INSERT INTO teacher (id, school_id, first_name, last_name, email, abbreviation, max_hours_per_week, is_part_time, is_active, created_at, updated_at)
VALUES
    ('66666666-6666-6666-6666-666666666601', '11111111-1111-1111-1111-111111111111', 'Anna', 'Müller', 'anna.mueller@demo-grundschule.de', 'MÜL', 28, FALSE, TRUE, NOW(), NOW()),
    ('66666666-6666-6666-6666-666666666602', '11111111-1111-1111-1111-111111111111', 'Thomas', 'Schmidt', 'thomas.schmidt@demo-grundschule.de', 'SCH', 28, FALSE, TRUE, NOW(), NOW()),
    ('66666666-6666-6666-6666-666666666603', '11111111-1111-1111-1111-111111111111', 'Maria', 'Weber', 'maria.weber@demo-grundschule.de', 'WEB', 28, FALSE, TRUE, NOW(), NOW()),
    ('66666666-6666-6666-6666-666666666604', '11111111-1111-1111-1111-111111111111', 'Klaus', 'Fischer', 'klaus.fischer@demo-grundschule.de', 'FIS', 28, FALSE, TRUE, NOW(), NOW()),
    ('66666666-6666-6666-6666-666666666605', '11111111-1111-1111-1111-111111111111', 'Sabine', 'Wagner', 'sabine.wagner@demo-grundschule.de', 'WAG', 20, TRUE, TRUE, NOW(), NOW()),
    ('66666666-6666-6666-6666-666666666606', '11111111-1111-1111-1111-111111111111', 'Michael', 'Becker', 'michael.becker@demo-grundschule.de', 'BEC', 28, FALSE, TRUE, NOW(), NOW()),
    ('66666666-6666-6666-6666-666666666607', '11111111-1111-1111-1111-111111111111', 'Julia', 'Hoffmann', 'julia.hoffmann@demo-grundschule.de', 'HOF', 14, TRUE, TRUE, NOW(), NOW()),
    ('66666666-6666-6666-6666-666666666608', '11111111-1111-1111-1111-111111111111', 'Peter', 'Koch', 'peter.koch@demo-grundschule.de', 'KOC', 28, FALSE, TRUE, NOW(), NOW());

-- School Classes (8 classes: 1a, 1b, 2a, 2b, 3a, 3b, 4a, 4b)
INSERT INTO school_class (id, school_id, name, grade_level, student_count, class_teacher_id, is_active, created_at, updated_at)
VALUES
    ('77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111111', '1a', 1, 24, '66666666-6666-6666-6666-666666666601', TRUE, NOW(), NOW()),
    ('77777777-7777-7777-7777-777777777702', '11111111-1111-1111-1111-111111111111', '1b', 1, 23, '66666666-6666-6666-6666-666666666602', TRUE, NOW(), NOW()),
    ('77777777-7777-7777-7777-777777777703', '11111111-1111-1111-1111-111111111111', '2a', 2, 25, '66666666-6666-6666-6666-666666666603', TRUE, NOW(), NOW()),
    ('77777777-7777-7777-7777-777777777704', '11111111-1111-1111-1111-111111111111', '2b', 2, 24, '66666666-6666-6666-6666-666666666604', TRUE, NOW(), NOW()),
    ('77777777-7777-7777-7777-777777777705', '11111111-1111-1111-1111-111111111111', '3a', 3, 26, '66666666-6666-6666-6666-666666666605', TRUE, NOW(), NOW()),
    ('77777777-7777-7777-7777-777777777706', '11111111-1111-1111-1111-111111111111', '3b', 3, 25, '66666666-6666-6666-6666-666666666606', TRUE, NOW(), NOW()),
    ('77777777-7777-7777-7777-777777777707', '11111111-1111-1111-1111-111111111111', '4a', 4, 27, '66666666-6666-6666-6666-666666666607', TRUE, NOW(), NOW()),
    ('77777777-7777-7777-7777-777777777708', '11111111-1111-1111-1111-111111111111', '4b', 4, 26, '66666666-6666-6666-6666-666666666608', TRUE, NOW(), NOW());

-- Teacher Subject Qualifications
-- Anna Müller (class 1a teacher) - Primary: Deutsch, Mathe, Sachunterricht
INSERT INTO teacher_subject_qualification (id, teacher_id, subject_id, qualification_level, can_teach_grades, max_hours_per_week, created_at, updated_at)
VALUES
    ('88888888-8888-8888-8888-888888880101', '66666666-6666-6666-6666-666666666601', '44444444-4444-4444-4444-444444444401', 'PRIMARY', '{1,2,3,4}', 12, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880102', '66666666-6666-6666-6666-666666666601', '44444444-4444-4444-4444-444444444402', 'PRIMARY', '{1,2,3,4}', 10, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880103', '66666666-6666-6666-6666-666666666601', '44444444-4444-4444-4444-444444444403', 'PRIMARY', '{1,2,3,4}', 6, NOW(), NOW());

-- Thomas Schmidt (class 1b teacher) - Primary: Deutsch, Mathe, Sport
INSERT INTO teacher_subject_qualification (id, teacher_id, subject_id, qualification_level, can_teach_grades, max_hours_per_week, created_at, updated_at)
VALUES
    ('88888888-8888-8888-8888-888888880201', '66666666-6666-6666-6666-666666666602', '44444444-4444-4444-4444-444444444401', 'PRIMARY', '{1,2,3,4}', 12, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880202', '66666666-6666-6666-6666-666666666602', '44444444-4444-4444-4444-444444444402', 'PRIMARY', '{1,2,3,4}', 10, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880203', '66666666-6666-6666-6666-666666666602', '44444444-4444-4444-4444-444444444404', 'PRIMARY', '{1,2,3,4}', 8, NOW(), NOW());

-- Maria Weber (class 2a teacher) - Primary: Deutsch, Sachunterricht, Kunst
INSERT INTO teacher_subject_qualification (id, teacher_id, subject_id, qualification_level, can_teach_grades, max_hours_per_week, created_at, updated_at)
VALUES
    ('88888888-8888-8888-8888-888888880301', '66666666-6666-6666-6666-666666666603', '44444444-4444-4444-4444-444444444401', 'PRIMARY', '{1,2,3,4}', 12, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880302', '66666666-6666-6666-6666-666666666603', '44444444-4444-4444-4444-444444444403', 'PRIMARY', '{1,2,3,4}', 8, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880303', '66666666-6666-6666-6666-666666666603', '44444444-4444-4444-4444-444444444405', 'PRIMARY', '{1,2,3,4}', 6, NOW(), NOW());

-- Klaus Fischer (class 2b teacher) - Primary: Mathe, Sachunterricht, Sport
INSERT INTO teacher_subject_qualification (id, teacher_id, subject_id, qualification_level, can_teach_grades, max_hours_per_week, created_at, updated_at)
VALUES
    ('88888888-8888-8888-8888-888888880401', '66666666-6666-6666-6666-666666666604', '44444444-4444-4444-4444-444444444402', 'PRIMARY', '{1,2,3,4}', 12, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880402', '66666666-6666-6666-6666-666666666604', '44444444-4444-4444-4444-444444444403', 'PRIMARY', '{1,2,3,4}', 8, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880403', '66666666-6666-6666-6666-666666666604', '44444444-4444-4444-4444-444444444404', 'PRIMARY', '{1,2,3,4}', 8, NOW(), NOW());

-- Sabine Wagner (class 3a teacher, part-time) - Primary: Deutsch, Mathe
INSERT INTO teacher_subject_qualification (id, teacher_id, subject_id, qualification_level, can_teach_grades, max_hours_per_week, created_at, updated_at)
VALUES
    ('88888888-8888-8888-8888-888888880501', '66666666-6666-6666-6666-666666666605', '44444444-4444-4444-4444-444444444401', 'PRIMARY', '{1,2,3,4}', 10, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880502', '66666666-6666-6666-6666-666666666605', '44444444-4444-4444-4444-444444444402', 'PRIMARY', '{1,2,3,4}', 10, NOW(), NOW());

-- Michael Becker (class 3b teacher) - Primary: Deutsch, Mathe, Englisch
INSERT INTO teacher_subject_qualification (id, teacher_id, subject_id, qualification_level, can_teach_grades, max_hours_per_week, created_at, updated_at)
VALUES
    ('88888888-8888-8888-8888-888888880601', '66666666-6666-6666-6666-666666666606', '44444444-4444-4444-4444-444444444401', 'PRIMARY', '{1,2,3,4}', 10, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880602', '66666666-6666-6666-6666-666666666606', '44444444-4444-4444-4444-444444444402', 'PRIMARY', '{1,2,3,4}', 10, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880603', '66666666-6666-6666-6666-666666666606', '44444444-4444-4444-4444-444444444409', 'PRIMARY', '{3,4}', 8, NOW(), NOW());

-- Julia Hoffmann (class 4a teacher, part-time) - Primary: Musik, Kunst, Religion
INSERT INTO teacher_subject_qualification (id, teacher_id, subject_id, qualification_level, can_teach_grades, max_hours_per_week, created_at, updated_at)
VALUES
    ('88888888-8888-8888-8888-888888880701', '66666666-6666-6666-6666-666666666607', '44444444-4444-4444-4444-444444444406', 'PRIMARY', '{1,2,3,4}', 6, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880702', '66666666-6666-6666-6666-666666666607', '44444444-4444-4444-4444-444444444405', 'PRIMARY', '{1,2,3,4}', 4, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880703', '66666666-6666-6666-6666-666666666607', '44444444-4444-4444-4444-444444444407', 'PRIMARY', '{1,2,3,4}', 4, NOW(), NOW());

-- Peter Koch (class 4b teacher) - Primary: Mathe, Sachunterricht, Ethik
INSERT INTO teacher_subject_qualification (id, teacher_id, subject_id, qualification_level, can_teach_grades, max_hours_per_week, created_at, updated_at)
VALUES
    ('88888888-8888-8888-8888-888888880801', '66666666-6666-6666-6666-666666666608', '44444444-4444-4444-4444-444444444402', 'PRIMARY', '{1,2,3,4}', 12, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880802', '66666666-6666-6666-6666-666666666608', '44444444-4444-4444-4444-444444444403', 'PRIMARY', '{1,2,3,4}', 8, NOW(), NOW()),
    ('88888888-8888-8888-8888-888888880803', '66666666-6666-6666-6666-666666666608', '44444444-4444-4444-4444-444444444408', 'PRIMARY', '{1,2,3,4}', 4, NOW(), NOW());

-- Time Slots (Monday-Friday, 6 periods per day)
-- Period times for a typical German primary school
-- day_of_week: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday
INSERT INTO time_slot (id, school_id, day_of_week, period, start_time, end_time, is_break, label, created_at, updated_at)
VALUES
    -- Monday
    ('99999999-9999-9999-9999-999999990001', '11111111-1111-1111-1111-111111111111', 0, 1, '08:00', '08:45', FALSE, '1. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990002', '11111111-1111-1111-1111-111111111111', 0, 2, '08:50', '09:35', FALSE, '2. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990003', '11111111-1111-1111-1111-111111111111', 0, 3, '09:55', '10:40', FALSE, '3. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990004', '11111111-1111-1111-1111-111111111111', 0, 4, '10:45', '11:30', FALSE, '4. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990005', '11111111-1111-1111-1111-111111111111', 0, 5, '11:45', '12:30', FALSE, '5. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990006', '11111111-1111-1111-1111-111111111111', 0, 6, '12:35', '13:20', FALSE, '6. Stunde', NOW(), NOW()),
    -- Tuesday
    ('99999999-9999-9999-9999-999999990011', '11111111-1111-1111-1111-111111111111', 1, 1, '08:00', '08:45', FALSE, '1. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990012', '11111111-1111-1111-1111-111111111111', 1, 2, '08:50', '09:35', FALSE, '2. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990013', '11111111-1111-1111-1111-111111111111', 1, 3, '09:55', '10:40', FALSE, '3. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990014', '11111111-1111-1111-1111-111111111111', 1, 4, '10:45', '11:30', FALSE, '4. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990015', '11111111-1111-1111-1111-111111111111', 1, 5, '11:45', '12:30', FALSE, '5. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990016', '11111111-1111-1111-1111-111111111111', 1, 6, '12:35', '13:20', FALSE, '6. Stunde', NOW(), NOW()),
    -- Wednesday
    ('99999999-9999-9999-9999-999999990021', '11111111-1111-1111-1111-111111111111', 2, 1, '08:00', '08:45', FALSE, '1. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990022', '11111111-1111-1111-1111-111111111111', 2, 2, '08:50', '09:35', FALSE, '2. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990023', '11111111-1111-1111-1111-111111111111', 2, 3, '09:55', '10:40', FALSE, '3. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990024', '11111111-1111-1111-1111-111111111111', 2, 4, '10:45', '11:30', FALSE, '4. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990025', '11111111-1111-1111-1111-111111111111', 2, 5, '11:45', '12:30', FALSE, '5. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990026', '11111111-1111-1111-1111-111111111111', 2, 6, '12:35', '13:20', FALSE, '6. Stunde', NOW(), NOW()),
    -- Thursday
    ('99999999-9999-9999-9999-999999990031', '11111111-1111-1111-1111-111111111111', 3, 1, '08:00', '08:45', FALSE, '1. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990032', '11111111-1111-1111-1111-111111111111', 3, 2, '08:50', '09:35', FALSE, '2. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990033', '11111111-1111-1111-1111-111111111111', 3, 3, '09:55', '10:40', FALSE, '3. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990034', '11111111-1111-1111-1111-111111111111', 3, 4, '10:45', '11:30', FALSE, '4. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990035', '11111111-1111-1111-1111-111111111111', 3, 5, '11:45', '12:30', FALSE, '5. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990036', '11111111-1111-1111-1111-111111111111', 3, 6, '12:35', '13:20', FALSE, '6. Stunde', NOW(), NOW()),
    -- Friday
    ('99999999-9999-9999-9999-999999990041', '11111111-1111-1111-1111-111111111111', 4, 1, '08:00', '08:45', FALSE, '1. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990042', '11111111-1111-1111-1111-111111111111', 4, 2, '08:50', '09:35', FALSE, '2. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990043', '11111111-1111-1111-1111-111111111111', 4, 3, '09:55', '10:40', FALSE, '3. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990044', '11111111-1111-1111-1111-111111111111', 4, 4, '10:45', '11:30', FALSE, '4. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990045', '11111111-1111-1111-1111-111111111111', 4, 5, '11:45', '12:30', FALSE, '5. Stunde', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999990046', '11111111-1111-1111-1111-111111111111', 4, 6, '12:35', '13:20', FALSE, '6. Stunde', NOW(), NOW());

-- Sample Teacher Availability (blocked time slots)
-- Sabine Wagner (part-time): blocked on Wednesday and Friday afternoons
INSERT INTO teacher_availability (id, teacher_id, term_id, day_of_week, period, availability_type, reason, created_at, updated_at)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', '66666666-6666-6666-6666-666666666605', NULL, 2, 5, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002', '66666666-6666-6666-6666-666666666605', NULL, 2, 6, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003', '66666666-6666-6666-6666-666666666605', NULL, 4, 5, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa004', '66666666-6666-6666-6666-666666666605', NULL, 4, 6, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW());

-- Julia Hoffmann (part-time): only available Monday through Wednesday
INSERT INTO teacher_availability (id, teacher_id, term_id, day_of_week, period, availability_type, reason, created_at, updated_at)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa011', '66666666-6666-6666-6666-666666666607', NULL, 3, 1, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa012', '66666666-6666-6666-6666-666666666607', NULL, 3, 2, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa013', '66666666-6666-6666-6666-666666666607', NULL, 3, 3, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa014', '66666666-6666-6666-6666-666666666607', NULL, 3, 4, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa015', '66666666-6666-6666-6666-666666666607', NULL, 3, 5, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa016', '66666666-6666-6666-6666-666666666607', NULL, 3, 6, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa017', '66666666-6666-6666-6666-666666666607', NULL, 4, 1, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa018', '66666666-6666-6666-6666-666666666607', NULL, 4, 2, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa019', '66666666-6666-6666-6666-666666666607', NULL, 4, 3, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa020', '66666666-6666-6666-6666-666666666607', NULL, 4, 4, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa021', '66666666-6666-6666-6666-666666666607', NULL, 4, 5, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa022', '66666666-6666-6666-6666-666666666607', NULL, 4, 6, 'BLOCKED', 'Teilzeit - nicht verfügbar', NOW(), NOW());

-- Preferred time slots
-- Anna Müller prefers early morning classes
INSERT INTO teacher_availability (id, teacher_id, term_id, day_of_week, period, availability_type, reason, created_at, updated_at)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa101', '66666666-6666-6666-6666-666666666601', NULL, 0, 1, 'PREFERRED', 'Bevorzugte Unterrichtszeit', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa102', '66666666-6666-6666-6666-666666666601', NULL, 0, 2, 'PREFERRED', 'Bevorzugte Unterrichtszeit', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa103', '66666666-6666-6666-6666-666666666601', NULL, 1, 1, 'PREFERRED', 'Bevorzugte Unterrichtszeit', NOW(), NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa104', '66666666-6666-6666-6666-666666666601', NULL, 1, 2, 'PREFERRED', 'Bevorzugte Unterrichtszeit', NOW(), NOW());
