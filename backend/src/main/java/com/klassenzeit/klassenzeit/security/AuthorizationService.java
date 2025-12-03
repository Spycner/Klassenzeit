package com.klassenzeit.klassenzeit.security;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Authorization service for use in @PreAuthorize expressions.
 *
 * <p>Usage in controllers:
 *
 * <pre>{@code
 * @PreAuthorize("@authz.canAccessSchool(#schoolId)")
 * public List<TeacherSummary> findAll(@PathVariable UUID schoolId) { ... }
 * }</pre>
 */
@Service("authz")
public class AuthorizationService {

  /** Check if the current user is a platform admin. */
  public boolean isPlatformAdmin() {
    return getCurrentUser().isPlatformAdmin();
  }

  /** Check if the current user can access the given school. */
  public boolean canAccessSchool(UUID schoolId) {
    CurrentUser user = getCurrentUser();
    return user.isPlatformAdmin() || user.hasSchoolAccess(schoolId);
  }

  /** Check if the current user can manage the school (admin or planner). */
  public boolean canManageSchool(UUID schoolId) {
    CurrentUser user = getCurrentUser();
    return user.canManageSchool(schoolId);
  }

  /** Check if the current user is a school admin for the given school. */
  public boolean isSchoolAdmin(UUID schoolId) {
    return getCurrentUser().isSchoolAdmin(schoolId);
  }

  /** Check if the current user has one of the specified roles in the given school. */
  public boolean hasRole(UUID schoolId, SchoolRole... roles) {
    return getCurrentUser().hasRole(schoolId, roles);
  }

  /** Check if the user can list schools (has any school membership or is platform admin). */
  public boolean canListSchools() {
    CurrentUser user = getCurrentUser();
    return user.isPlatformAdmin() || !user.schoolRoles().isEmpty();
  }

  /** Get the current authenticated user from the security context. */
  public CurrentUser getCurrentUser() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth instanceof CurrentUserAuthentication cua) {
      return cua.getCurrentUser();
    }
    throw new AccessDeniedException("No authenticated user");
  }
}
