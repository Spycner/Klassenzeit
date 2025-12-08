package com.klassenzeit.klassenzeit.room.dto;

import java.util.UUID;

/** Summary DTO for a room subject suitability (for list responses). */
public record RoomSubjectSuitabilitySummary(
    UUID id, UUID subjectId, String subjectName, String subjectColor) {}
