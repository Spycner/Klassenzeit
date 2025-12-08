package com.klassenzeit.klassenzeit.room.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Request DTO for creating a room subject suitability. */
public record CreateRoomSubjectSuitabilityRequest(
    @NotNull UUID subjectId, @Size(max = 255) String notes) {}
