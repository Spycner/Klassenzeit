-- V3: Constraint entities - TeacherSubjectQualification, TeacherAvailability, TimeSlot
-- Note: Using VARCHAR with CHECK constraints instead of PostgreSQL native ENUM
-- for better JPA compatibility

-- TeacherSubjectQualification: Which subjects a teacher can teach
CREATE TABLE teacher_subject_qualification (
    id UUID PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    qualification_level VARCHAR(20) NOT NULL,
    can_teach_grades INTEGER[],
    max_hours_per_week INTEGER,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_teacher_subject UNIQUE (teacher_id, subject_id),
    CONSTRAINT ck_qualification_level CHECK (qualification_level IN ('PRIMARY', 'SECONDARY', 'SUBSTITUTE'))
);

CREATE INDEX idx_teacher_subject_qualification_teacher ON teacher_subject_qualification(teacher_id);
CREATE INDEX idx_teacher_subject_qualification_subject ON teacher_subject_qualification(subject_id);

-- TeacherAvailability: When teachers are available/blocked
CREATE TABLE teacher_availability (
    id UUID PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
    term_id UUID REFERENCES term(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL,
    period SMALLINT NOT NULL,
    availability_type VARCHAR(20) NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 4),
    CONSTRAINT ck_period CHECK (period >= 1 AND period <= 10),
    CONSTRAINT ck_availability_type CHECK (availability_type IN ('AVAILABLE', 'BLOCKED', 'PREFERRED'))
);

-- Partial unique index for when term_id is NULL (applies to all terms)
CREATE UNIQUE INDEX uq_teacher_availability_global
    ON teacher_availability(teacher_id, day_of_week, period)
    WHERE term_id IS NULL;

-- Partial unique index for when term_id is NOT NULL
CREATE UNIQUE INDEX uq_teacher_availability_term
    ON teacher_availability(teacher_id, term_id, day_of_week, period)
    WHERE term_id IS NOT NULL;

CREATE INDEX idx_teacher_availability_teacher ON teacher_availability(teacher_id);
CREATE INDEX idx_teacher_availability_term ON teacher_availability(term_id);

-- TimeSlot: Defines the weekly time grid (periods)
CREATE TABLE time_slot (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL,
    period SMALLINT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_break BOOLEAN NOT NULL DEFAULT FALSE,
    label VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_time_slot UNIQUE (school_id, day_of_week, period),
    CONSTRAINT ck_time_slot_day CHECK (day_of_week >= 0 AND day_of_week <= 4),
    CONSTRAINT ck_time_slot_times CHECK (start_time < end_time)
);

CREATE INDEX idx_time_slot_school ON time_slot(school_id);
