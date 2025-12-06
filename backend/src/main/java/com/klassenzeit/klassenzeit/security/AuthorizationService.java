package com.klassenzeit.klassenzeit.security;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.school.SchoolRepository;
import com.klassenzeit.klassenzeit.school.SchoolSlugHistoryRepository;
import java.util.Optional;
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
 * &#64;PreAuthorize("@authz.canAccessSchool(#schoolId)")
 * public List<TeacherSummary> findAll(@PathVariable UUID schoolId) { ... }
 * }</pre>
 */
@Service("authz")
public class AuthorizationService {

  private final SchoolRepository schoolRepository;
  private final SchoolSlugHistoryRepository slugHistoryRepository;

  public AuthorizationService(
      SchoolRepository schoolRepository, SchoolSlugHistoryRepository slugHistoryRepository) {
    this.schoolRepository = schoolRepository;
    this.slugHistoryRepository = slugHistoryRepository;
  }

  /** Check if the current user is a platform admin. */
  public boolean isPlatformAdmin() {
    return getCurrentUser().isPlatformAdmin();
  }

  /**
   * Check if the current user can access the given school.
   *
   * <p>Platform admins can access all schools. Other users require explicit membership.
   */
  public boolean canAccessSchool(UUID schoolId) {
    CurrentUser user = getCurrentUser();
    return user.isPlatformAdmin() || user.hasSchoolAccess(schoolId);
  }

  /**
   * Check if the current user can access a school by identifier (UUID or slug).
   *
   * <p>Resolves the identifier to a school ID and checks access. Returns true for old slugs (the
   * redirect will be handled by the service layer).
   */
  public boolean canAccessSchoolByIdentifier(String identifier) {
    Optional<UUID> schoolId = resolveSchoolIdentifier(identifier);
    return schoolId.map(this::canAccessSchool).orElse(false);
  }

  /**
   * Resolve an identifier (UUID or slug) to a school ID.
   *
   * @return the school ID if found, empty if not found
   */
  private Optional<UUID> resolveSchoolIdentifier(String identifier) {
    // Try parsing as UUID first
    UUID id = parseUuid(identifier);
    if (id != null) {
      if (schoolRepository.existsById(id)) {
        return Optional.of(id);
      }
      return Optional.empty();
    }

    // Check current slug
    return schoolRepository
        .findBySlug(identifier)
        .map(School::getId)
        .or(
            () ->
                // Check historical slug
                slugHistoryRepository.findBySlug(identifier).map(h -> h.getSchool().getId()));
  }

  /** Safely parse a string as UUID, returns null if not valid. */
  private static UUID parseUuid(String str) {
    try {
      return UUID.fromString(str);
    } catch (IllegalArgumentException e) {
      return null;
    }
  }

  /**
   * Check if the current user can manage the school (admin or planner).
   *
   * <p>Platform admins can manage all schools. Other users require SCHOOL_ADMIN or PLANNER role.
   */
  public boolean canManageSchool(UUID schoolId) {
    CurrentUser user = getCurrentUser();
    return user.isPlatformAdmin() || user.canManageSchool(schoolId);
  }

  /**
   * Check if the current user is a school admin for the given school.
   *
   * <p>Platform admins are treated as school admins for all schools.
   */
  public boolean isSchoolAdmin(UUID schoolId) {
    CurrentUser user = getCurrentUser();
    return user.isPlatformAdmin() || user.isSchoolAdmin(schoolId);
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

  /**
   * Check if the current user can search for users.
   *
   * <p>Platform admins and users with at least one school membership can search for users.
   */
  public boolean canSearchUsers() {
    CurrentUser user = getCurrentUser();
    return user.isPlatformAdmin() || !user.schoolRoles().isEmpty();
  }

  /**
   * Check if the current user can manage members for the given school.
   *
   * <p>Platform admins can manage members for all schools. School admins can manage their own.
   */
  public boolean canManageMembers(UUID schoolId) {
    return isSchoolAdmin(schoolId);
  }

  /**
   * Get the current authenticated user from the security context.
   *
   * <p>This method supports both production authentication (CurrentUserAuthentication) and test
   * authentication (where the principal is a CurrentUser).
   */
  public CurrentUser getCurrentUser() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth instanceof CurrentUserAuthentication cua) {
      return cua.getCurrentUser();
    }
    // Support test authentication where principal is CurrentUser
    if (auth != null && auth.getPrincipal() instanceof CurrentUser currentUser) {
      return currentUser;
    }
    throw new AccessDeniedException("No authenticated user");
  }
}
