package com.klassenzeit.klassenzeit.teacher.dto;

import java.time.Instant;
import java.util.UUID;

/** Response DTO for a teacher. */
public record TeacherResponse(
    UUID id,
    String firstName,
    String lastName,
    String email,
    String abbreviation,
    Integer maxHoursPerWeek,
    Boolean isPartTime,
    Boolean isActive,
    Instant createdAt,
    Instant updatedAt,
    Long version) {}
