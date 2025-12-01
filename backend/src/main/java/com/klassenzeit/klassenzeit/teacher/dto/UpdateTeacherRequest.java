package com.klassenzeit.klassenzeit.teacher.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/** Request DTO for updating a teacher. */
public record UpdateTeacherRequest(
    @Size(max = 100) String firstName,
    @Size(max = 100) String lastName,
    @Email @Size(max = 255) String email,
    @Size(max = 5) String abbreviation,
    @Min(1) @Max(50) Integer maxHoursPerWeek,
    Boolean isPartTime,
    Boolean isActive) {}
