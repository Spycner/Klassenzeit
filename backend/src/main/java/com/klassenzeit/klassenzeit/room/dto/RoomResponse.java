package com.klassenzeit.klassenzeit.room.dto;

import java.time.Instant;
import java.util.UUID;

/** Response DTO for a room. */
public record RoomResponse(
    UUID id,
    String name,
    String building,
    Integer capacity,
    String features,
    Boolean isActive,
    Instant createdAt,
    Instant updatedAt) {}
