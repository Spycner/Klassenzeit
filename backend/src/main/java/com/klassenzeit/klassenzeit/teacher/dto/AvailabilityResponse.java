package com.klassenzeit.klassenzeit.teacher.dto;

import com.klassenzeit.klassenzeit.common.AvailabilityType;
import java.time.Instant;
import java.util.UUID;

/** Response DTO for a teacher availability. */
public record AvailabilityResponse(
    UUID id,
    UUID termId,
    String termName,
    Short dayOfWeek,
    Short period,
    AvailabilityType availabilityType,
    String reason,
    Boolean isGlobal,
    Instant createdAt,
    Instant updatedAt) {}
