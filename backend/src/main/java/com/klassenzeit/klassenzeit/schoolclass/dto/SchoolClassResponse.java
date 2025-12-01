package com.klassenzeit.klassenzeit.schoolclass.dto;

import java.time.Instant;
import java.util.UUID;

/** Response DTO for a school class. */
public record SchoolClassResponse(
    UUID id,
    String name,
    Short gradeLevel,
    Integer studentCount,
    UUID classTeacherId,
    String classTeacherName,
    Boolean isActive,
    Instant createdAt,
    Instant updatedAt) {}
