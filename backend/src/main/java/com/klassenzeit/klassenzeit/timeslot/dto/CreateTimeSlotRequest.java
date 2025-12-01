package com.klassenzeit.klassenzeit.timeslot.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalTime;

/** Request DTO for creating a new time slot. */
public record CreateTimeSlotRequest(
    @NotNull @Min(0) @Max(4) Short dayOfWeek,
    @NotNull @Min(1) @Max(10) Short period,
    @NotNull LocalTime startTime,
    @NotNull LocalTime endTime,
    Boolean isBreak,
    @Size(max = 50) String label) {}
