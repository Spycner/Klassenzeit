package com.klassenzeit.klassenzeit.user.dto;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.util.List;
import java.util.UUID;

/** Response DTO for the current user's profile. */
public record UserProfileResponse(
    UUID id,
    String email,
    String displayName,
    boolean isPlatformAdmin,
    List<SchoolMembershipSummary> schools) {

  /** Summary of a school membership for the user profile. */
  public record SchoolMembershipSummary(UUID schoolId, String schoolName, SchoolRole role) {}
}
