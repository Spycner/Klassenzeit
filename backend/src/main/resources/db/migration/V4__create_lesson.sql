-- V4: Lesson - The actual scheduled timetable entry

-- Lesson: The scheduled timetable entry
CREATE TABLE lesson (
    id UUID PRIMARY KEY,
    term_id UUID NOT NULL REFERENCES term(id) ON DELETE CASCADE,
    school_class_id UUID NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    room_id UUID REFERENCES room(id) ON DELETE SET NULL,
    timeslot_id UUID NOT NULL REFERENCES time_slot(id) ON DELETE CASCADE,
    week_pattern VARCHAR(10) NOT NULL DEFAULT 'EVERY',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_week_pattern CHECK (week_pattern IN ('EVERY', 'A', 'B'))
);

-- A class can't be in two places at the same time
CREATE UNIQUE INDEX uq_lesson_class_timeslot
    ON lesson(term_id, school_class_id, timeslot_id, week_pattern);

-- A teacher can't be in two places at the same time
CREATE UNIQUE INDEX uq_lesson_teacher_timeslot
    ON lesson(term_id, teacher_id, timeslot_id, week_pattern);

-- A room can't be double-booked (only when room is assigned)
CREATE UNIQUE INDEX uq_lesson_room_timeslot
    ON lesson(term_id, room_id, timeslot_id, week_pattern)
    WHERE room_id IS NOT NULL;

-- Query optimization indexes
CREATE INDEX idx_lesson_term ON lesson(term_id);
CREATE INDEX idx_lesson_class ON lesson(school_class_id);
CREATE INDEX idx_lesson_teacher ON lesson(teacher_id);
CREATE INDEX idx_lesson_subject ON lesson(subject_id);
CREATE INDEX idx_lesson_room ON lesson(room_id);
CREATE INDEX idx_lesson_timeslot ON lesson(timeslot_id);
