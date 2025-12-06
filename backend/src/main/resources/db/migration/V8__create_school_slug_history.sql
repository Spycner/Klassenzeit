-- V8: School slug history for redirect support
-- Tracks old slugs so URLs continue to work after slug changes

CREATE TABLE school_slug_history (
    id UUID PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES school(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,

    -- Each slug can only exist once in history (prevents conflicts)
    CONSTRAINT uq_slug_history_slug UNIQUE (slug)
);

-- Index for fast lookup by slug (the primary use case)
CREATE INDEX idx_school_slug_history_slug ON school_slug_history(slug);

-- Index for finding all history for a school (cleanup operations)
CREATE INDEX idx_school_slug_history_school ON school_slug_history(school_id);
