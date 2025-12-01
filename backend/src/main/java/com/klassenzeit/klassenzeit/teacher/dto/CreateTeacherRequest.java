package com.klassenzeit.klassenzeit.teacher.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Request DTO for creating a teacher. */
public record CreateTeacherRequest(
    @NotBlank @Size(max = 100) String firstName,
    @NotBlank @Size(max = 100) String lastName,
    @Email @Size(max = 255) String email,
    @NotBlank @Size(max = 5) String abbreviation,
    @Min(1) @Max(50) Integer maxHoursPerWeek,
    Boolean isPartTime) {}
