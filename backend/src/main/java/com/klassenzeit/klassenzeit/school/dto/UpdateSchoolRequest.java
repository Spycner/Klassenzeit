package com.klassenzeit.klassenzeit.school.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request DTO for updating a school. */
public record UpdateSchoolRequest(
    @Size(max = 255) String name,
    @Size(max = 100)
        @Pattern(
            regexp = "^[a-z0-9-]+$",
            message = "Slug must contain only lowercase letters, numbers, and hyphens")
        String slug,
    @Size(max = 50) String schoolType,
    @Min(1) @Max(13) Short minGrade,
    @Min(1) @Max(13) Short maxGrade,
    @Size(max = 50) String timezone,
    @Size(max = 4000) String settings) {}
