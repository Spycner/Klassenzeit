package com.klassenzeit.klassenzeit.schoolclass.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Request DTO for updating a school class. */
public record UpdateSchoolClassRequest(
    @Size(max = 20) String name,
    @Min(1) @Max(13) Short gradeLevel,
    @Min(1) @Max(100) Integer studentCount,
    UUID classTeacherId,
    Boolean clearClassTeacher,
    Boolean isActive,
    Long version) {}
