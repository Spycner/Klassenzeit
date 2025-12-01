package com.klassenzeit.klassenzeit.timeslot.dto;

import java.time.LocalTime;
import java.util.UUID;

/** Summary DTO for a time slot (for list responses). */
public record TimeSlotSummary(
    UUID id, Short dayOfWeek, Short period, LocalTime startTime, LocalTime endTime) {}
