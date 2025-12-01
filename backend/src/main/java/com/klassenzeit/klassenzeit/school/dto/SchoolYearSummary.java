package com.klassenzeit.klassenzeit.school.dto;

import java.time.LocalDate;
import java.util.UUID;

/** Summary DTO for a school year (for list responses). */
public record SchoolYearSummary(
    UUID id, String name, LocalDate startDate, LocalDate endDate, Boolean isCurrent) {}
