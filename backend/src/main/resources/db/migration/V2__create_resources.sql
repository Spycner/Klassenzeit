-- V2: Resource entities - Teacher, Subject, Room, SchoolClass

-- Teacher
CREATE TABLE teacher (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    abbreviation VARCHAR(5) NOT NULL,
    max_hours_per_week INTEGER NOT NULL DEFAULT 28,
    is_part_time BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_teacher_abbreviation UNIQUE (school_id, abbreviation),
    CONSTRAINT uq_teacher_email UNIQUE (school_id, email)
);

CREATE INDEX idx_teacher_school ON teacher(school_id);
CREATE INDEX idx_teacher_active ON teacher(school_id, is_active) WHERE is_active = TRUE;

-- Subject
CREATE TABLE subject (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    abbreviation VARCHAR(10) NOT NULL,
    color VARCHAR(7),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_subject_abbreviation UNIQUE (school_id, abbreviation)
);

CREATE INDEX idx_subject_school ON subject(school_id);

-- Room
CREATE TABLE room (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    building VARCHAR(100),
    capacity INTEGER,
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_room_name UNIQUE (school_id, name)
);

CREATE INDEX idx_room_school ON room(school_id);
CREATE INDEX idx_room_features ON room USING GIN (features);

-- SchoolClass (named school_class to avoid SQL reserved word)
CREATE TABLE school_class (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    name VARCHAR(20) NOT NULL,
    grade_level SMALLINT NOT NULL,
    student_count INTEGER,
    class_teacher_id UUID REFERENCES teacher(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_school_class_name UNIQUE (school_id, name)
);

CREATE INDEX idx_school_class_school ON school_class(school_id);
CREATE INDEX idx_school_class_teacher ON school_class(class_teacher_id);
