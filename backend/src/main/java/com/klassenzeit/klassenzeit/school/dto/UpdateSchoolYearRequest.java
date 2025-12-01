package com.klassenzeit.klassenzeit.school.dto;

import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Request DTO for updating a school year. */
public record UpdateSchoolYearRequest(
    @Size(max = 50) String name,
    LocalDate startDate,
    LocalDate endDate,
    Boolean isCurrent,
    Long version) {}
