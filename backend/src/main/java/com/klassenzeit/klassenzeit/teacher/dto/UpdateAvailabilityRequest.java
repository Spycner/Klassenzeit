package com.klassenzeit.klassenzeit.teacher.dto;

import com.klassenzeit.klassenzeit.common.AvailabilityType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/** Request DTO for updating a teacher availability. */
public record UpdateAvailabilityRequest(
    @Min(1) @Max(7) Short dayOfWeek,
    @Min(1) @Max(15) Short period,
    AvailabilityType availabilityType,
    @Size(max = 255) String reason) {}
