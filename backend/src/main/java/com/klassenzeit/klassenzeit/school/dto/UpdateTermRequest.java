package com.klassenzeit.klassenzeit.school.dto;

import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Request DTO for updating a term. */
public record UpdateTermRequest(
    @Size(max = 100) String name, LocalDate startDate, LocalDate endDate, Boolean isCurrent) {}
