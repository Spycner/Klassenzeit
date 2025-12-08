-- Add needsSpecialRoom column to subject table
ALTER TABLE subject ADD COLUMN needs_special_room BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrate existing data: if any RoomSubjectSuitability has isRequired=true for a subject,
-- set that subject's needsSpecialRoom to true
UPDATE subject s
SET needs_special_room = TRUE
WHERE EXISTS (
    SELECT 1 FROM room_subject_suitability rss
    WHERE rss.subject_id = s.id AND rss.is_required = TRUE
);

-- Drop the is_required column from room_subject_suitability
ALTER TABLE room_subject_suitability DROP COLUMN is_required;
