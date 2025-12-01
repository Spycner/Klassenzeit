package com.klassenzeit.klassenzeit.schoolclass.dto;

import java.util.UUID;

/** Summary DTO for a school class (for list responses). */
public record SchoolClassSummary(
    UUID id, String name, Short gradeLevel, Integer studentCount, Boolean isActive) {}
