package com.klassenzeit.klassenzeit.school.dto;

import java.time.Instant;
import java.util.UUID;

/** Response DTO for a school. */
public record SchoolResponse(
    UUID id,
    String name,
    String slug,
    String schoolType,
    Short minGrade,
    Short maxGrade,
    String timezone,
    String settings,
    Instant createdAt,
    Instant updatedAt) {}
