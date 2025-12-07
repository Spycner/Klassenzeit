package com.klassenzeit.klassenzeit.accessrequest.dto;

import com.klassenzeit.klassenzeit.accessrequest.AccessRequestStatus;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.time.Instant;
import java.util.UUID;

/** Full response DTO for a school access request. */
public record AccessRequestResponse(
    UUID id,
    UUID userId,
    String userDisplayName,
    String userEmail,
    UUID schoolId,
    String schoolName,
    SchoolRole requestedRole,
    AccessRequestStatus status,
    String message,
    String responseMessage,
    UUID reviewedById,
    String reviewedByName,
    Instant reviewedAt,
    Instant createdAt,
    Instant updatedAt) {}
