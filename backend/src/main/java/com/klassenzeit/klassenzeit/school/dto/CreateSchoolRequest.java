package com.klassenzeit.klassenzeit.school.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request DTO for creating a school. */
public record CreateSchoolRequest(
    @NotBlank @Size(max = 255) String name,
    @NotBlank
        @Size(max = 100)
        @Pattern(
            regexp = "^[a-z0-9-]+$",
            message = "Slug must contain only lowercase letters, numbers, and hyphens")
        String slug,
    @NotBlank @Size(max = 50) String schoolType,
    @NotNull @Min(1) @Max(13) Short minGrade,
    @NotNull @Min(1) @Max(13) Short maxGrade,
    @Size(max = 50) String timezone,
    String settings) {}
