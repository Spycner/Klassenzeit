-- Performance indexes for common query patterns

-- Teacher email lookups (authentication, uniqueness checks)
CREATE INDEX idx_teacher_email ON teacher(email);

-- Subject name searches/filtering
CREATE INDEX idx_subject_name ON subject(name);

-- SchoolClass grade level filtering (common for grade-based queries)
CREATE INDEX idx_school_class_grade_level ON school_class(grade_level);
