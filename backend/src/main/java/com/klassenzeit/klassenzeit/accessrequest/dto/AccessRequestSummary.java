package com.klassenzeit.klassenzeit.accessrequest.dto;

import com.klassenzeit.klassenzeit.accessrequest.AccessRequestStatus;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.time.Instant;
import java.util.UUID;

/** Summary DTO for list responses. */
public record AccessRequestSummary(
    UUID id,
    UUID userId,
    String userDisplayName,
    String userEmail,
    SchoolRole requestedRole,
    AccessRequestStatus status,
    String message,
    Instant createdAt) {}
