package com.klassenzeit.klassenzeit.admin.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Request DTO for assigning a user as school admin. */
public record AssignAdminRequest(@NotNull UUID userId) {}
