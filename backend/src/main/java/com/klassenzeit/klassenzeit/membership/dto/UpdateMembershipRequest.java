package com.klassenzeit.klassenzeit.membership.dto;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Request DTO for updating a membership (role or linked teacher). */
public record UpdateMembershipRequest(@NotNull SchoolRole role, UUID linkedTeacherId) {}
