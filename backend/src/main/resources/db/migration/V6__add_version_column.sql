-- Add version column for optimistic locking to all entity tables
-- The version column is used by JPA's @Version annotation to detect
-- concurrent modifications and prevent lost updates.

ALTER TABLE school ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE school_year ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE term ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE teacher ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE teacher_subject_qualification ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE teacher_availability ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE subject ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE room ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE school_class ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE time_slot ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE lesson ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
