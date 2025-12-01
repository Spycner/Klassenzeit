package com.klassenzeit.klassenzeit.room.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/** Request DTO for updating a room. */
public record UpdateRoomRequest(
    @Size(max = 50) String name,
    @Size(max = 100) String building,
    @Min(1) Integer capacity,
    String features,
    Boolean isActive,
    Long version) {}
