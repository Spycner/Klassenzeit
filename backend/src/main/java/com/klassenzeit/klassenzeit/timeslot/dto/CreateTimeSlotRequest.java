package com.klassenzeit.klassenzeit.timeslot.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalTime;

/** Request DTO for creating a new time slot. */
public record CreateTimeSlotRequest(
    @NotNull Short dayOfWeek,
    @NotNull Short period,
    @NotNull LocalTime startTime,
    @NotNull LocalTime endTime,
    Boolean isBreak,
    @Size(max = 50) String label) {}
