package com.klassenzeit.klassenzeit.schoolclass.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Request DTO for creating a school class. */
public record CreateSchoolClassRequest(
    @NotBlank @Size(max = 20) String name,
    @NotNull @Min(1) @Max(13) Short gradeLevel,
    @Min(1) @Max(100) Integer studentCount,
    UUID classTeacherId) {}
