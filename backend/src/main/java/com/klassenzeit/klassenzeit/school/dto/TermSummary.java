package com.klassenzeit.klassenzeit.school.dto;

import java.time.LocalDate;
import java.util.UUID;

/** Summary DTO for a term (for list responses). */
public record TermSummary(
    UUID id, String name, LocalDate startDate, LocalDate endDate, Boolean isCurrent) {}
