package com.klassenzeit.klassenzeit.teacher.dto;

import java.util.UUID;

/** Summary DTO for a teacher (for list responses). */
public record TeacherSummary(
    UUID id, String firstName, String lastName, String abbreviation, Boolean isActive) {}
