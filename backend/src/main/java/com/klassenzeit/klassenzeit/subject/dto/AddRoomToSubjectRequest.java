package com.klassenzeit.klassenzeit.subject.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Request DTO for adding a room to a subject. */
public record AddRoomToSubjectRequest(@NotNull UUID roomId, @Size(max = 255) String notes) {}
