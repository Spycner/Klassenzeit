package com.klassenzeit.klassenzeit.timeslot.dto;

import jakarta.validation.constraints.Size;
import java.time.LocalTime;

/** Request DTO for updating a time slot. */
public record UpdateTimeSlotRequest(
    Short dayOfWeek,
    Short period,
    LocalTime startTime,
    LocalTime endTime,
    Boolean isBreak,
    @Size(max = 50) String label) {}
