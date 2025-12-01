package com.klassenzeit.klassenzeit.teacher.dto;

import com.klassenzeit.klassenzeit.common.AvailabilityType;
import java.util.UUID;

/** Summary DTO for a teacher availability (for list responses). */
public record AvailabilitySummary(
    UUID id, Short dayOfWeek, Short period, AvailabilityType availabilityType, Boolean isGlobal) {}
