package com.klassenzeit.klassenzeit.timeslot.dto;

import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

/** Response DTO for a time slot. */
public record TimeSlotResponse(
    UUID id,
    Short dayOfWeek,
    Short period,
    LocalTime startTime,
    LocalTime endTime,
    Boolean isBreak,
    String label,
    Instant createdAt,
    Instant updatedAt) {}
