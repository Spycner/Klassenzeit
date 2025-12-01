package com.klassenzeit.klassenzeit.school.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Response DTO for a school year. */
public record SchoolYearResponse(
    UUID id,
    String name,
    LocalDate startDate,
    LocalDate endDate,
    Boolean isCurrent,
    Instant createdAt,
    Instant updatedAt,
    Long version) {}
