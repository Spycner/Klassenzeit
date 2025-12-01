package com.klassenzeit.klassenzeit.room.dto;

import java.util.UUID;

/** Summary DTO for a room (for list responses). */
public record RoomSummary(
    UUID id, String name, String building, Integer capacity, Boolean isActive) {}
