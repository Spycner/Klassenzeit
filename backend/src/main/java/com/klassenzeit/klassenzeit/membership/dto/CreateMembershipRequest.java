package com.klassenzeit.klassenzeit.membership.dto;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Request DTO for adding a user to a school. */
public record CreateMembershipRequest(
    @NotNull UUID userId, @NotNull SchoolRole role, UUID linkedTeacherId) {}
