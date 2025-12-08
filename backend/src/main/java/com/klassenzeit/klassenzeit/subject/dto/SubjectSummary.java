package com.klassenzeit.klassenzeit.subject.dto;

import java.util.UUID;

/** Summary DTO for a subject (for list responses). */
public record SubjectSummary(
    UUID id, String name, String abbreviation, String color, Boolean needsSpecialRoom) {}
