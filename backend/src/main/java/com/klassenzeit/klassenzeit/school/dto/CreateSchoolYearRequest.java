package com.klassenzeit.klassenzeit.school.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Request DTO for creating a school year. */
public record CreateSchoolYearRequest(
    @NotBlank @Size(max = 50) String name,
    @NotNull LocalDate startDate,
    @NotNull LocalDate endDate,
    Boolean isCurrent) {}
