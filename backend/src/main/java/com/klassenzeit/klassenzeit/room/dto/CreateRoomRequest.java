package com.klassenzeit.klassenzeit.room.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Request DTO for creating a new room. */
public record CreateRoomRequest(
    @NotBlank @Size(max = 50) String name,
    @Size(max = 100) String building,
    @Min(1) Integer capacity,
    @Size(max = 4000) String features) {}
