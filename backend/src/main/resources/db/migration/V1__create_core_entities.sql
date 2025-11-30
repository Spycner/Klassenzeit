-- V1: Core entities - School (tenant), SchoolYear, Term

-- School: Root tenant entity
CREATE TABLE school (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    school_type VARCHAR(50) NOT NULL,
    min_grade SMALLINT NOT NULL,
    max_grade SMALLINT NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Berlin',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_school_grade_range CHECK (min_grade <= max_grade)
);

CREATE INDEX idx_school_slug ON school(slug);

-- SchoolYear: Academic year container
CREATE TABLE school_year (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_school_year_name UNIQUE (school_id, name),
    CONSTRAINT ck_school_year_dates CHECK (start_date < end_date)
);

CREATE INDEX idx_school_year_school ON school_year(school_id);
CREATE INDEX idx_school_year_current ON school_year(school_id, is_current) WHERE is_current = TRUE;

-- Term: Period within a school year (semester, quarter, etc.)
CREATE TABLE term (
    id UUID PRIMARY KEY,
    school_year_id UUID NOT NULL REFERENCES school_year(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_term_dates CHECK (start_date < end_date)
);

CREATE INDEX idx_term_school_year ON term(school_year_id);
CREATE INDEX idx_term_current ON term(school_year_id, is_current) WHERE is_current = TRUE;
