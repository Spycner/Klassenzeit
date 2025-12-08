-- Room Subject Suitability: Which subjects can be taught in which rooms
CREATE TABLE room_subject_suitability (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES room(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    notes VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT uq_room_subject UNIQUE (room_id, subject_id)
);

CREATE INDEX idx_room_subject_suitability_room ON room_subject_suitability(room_id);
CREATE INDEX idx_room_subject_suitability_subject ON room_subject_suitability(subject_id);
