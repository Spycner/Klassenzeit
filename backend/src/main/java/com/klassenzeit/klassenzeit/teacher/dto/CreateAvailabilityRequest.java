package com.klassenzeit.klassenzeit.teacher.dto;

import com.klassenzeit.klassenzeit.common.AvailabilityType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Request DTO for creating a teacher availability. */
public record CreateAvailabilityRequest(
    UUID termId,
    @NotNull @Min(0) @Max(4) Short dayOfWeek,
    @NotNull @Min(1) @Max(10) Short period,
    @NotNull AvailabilityType availabilityType,
    @Size(max = 255) String reason) {}
