package com.klassenzeit.klassenzeit.membership.dto;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.time.Instant;
import java.util.UUID;

/** Full response DTO for a school membership. */
public record MembershipResponse(
    UUID id,
    UUID userId,
    String userDisplayName,
    String userEmail,
    UUID schoolId,
    SchoolRole role,
    UUID linkedTeacherId,
    String linkedTeacherName,
    boolean isActive,
    UUID grantedById,
    String grantedByName,
    Instant grantedAt,
    Instant createdAt,
    Instant updatedAt) {}
