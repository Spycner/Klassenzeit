package com.klassenzeit.klassenzeit.membership.dto;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.util.UUID;

/** Summary DTO for list responses. */
public record MembershipSummary(
    UUID id,
    UUID userId,
    String userDisplayName,
    String userEmail,
    SchoolRole role,
    boolean isActive) {}
