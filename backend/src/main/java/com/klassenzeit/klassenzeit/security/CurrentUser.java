package com.klassenzeit.klassenzeit.security;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;

/**
 * Represents the currently authenticated user with their school roles.
 *
 * <p>This is populated from the JWT token and the application database, and is available in the
 * security context for authorization decisions.
 */
public record CurrentUser(
    UUID id,
    String keycloakId,
    String email,
    String displayName,
    boolean isPlatformAdmin,
    Map<UUID, SchoolRole> schoolRoles) {

  /** Check if the user has access to the given school. */
  public boolean hasSchoolAccess(UUID schoolId) {
    return schoolRoles.containsKey(schoolId);
  }

  /** Check if the user has one of the specified roles in the given school. */
  public boolean hasRole(UUID schoolId, SchoolRole... roles) {
    SchoolRole userRole = schoolRoles.get(schoolId);
    return userRole != null && Arrays.asList(roles).contains(userRole);
  }

  /** Check if the user is a school admin for the given school. */
  public boolean isSchoolAdmin(UUID schoolId) {
    return hasRole(schoolId, SchoolRole.SCHOOL_ADMIN);
  }

  /** Check if the user can manage the school (admin or planner). */
  public boolean canManageSchool(UUID schoolId) {
    return hasRole(schoolId, SchoolRole.SCHOOL_ADMIN, SchoolRole.PLANNER);
  }

  /** Get the user's role in a specific school, or null if no membership. */
  public SchoolRole getRoleInSchool(UUID schoolId) {
    return schoolRoles.get(schoolId);
  }
}
