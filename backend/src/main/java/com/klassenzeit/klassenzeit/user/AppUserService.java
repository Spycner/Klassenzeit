package com.klassenzeit.klassenzeit.user;

import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service for managing application users.
 *
 * <p>Handles user resolution from Keycloak JWTs and building the CurrentUser context.
 */
@Service
public class AppUserService {

  private final AppUserRepository appUserRepository;
  private final SchoolMembershipRepository schoolMembershipRepository;
  private final List<String> platformAdminEmails;

  public AppUserService(
      AppUserRepository appUserRepository,
      SchoolMembershipRepository schoolMembershipRepository,
      @Value("${klassenzeit.security.platform-admin-emails:}") List<String> platformAdminEmails) {
    this.appUserRepository = appUserRepository;
    this.schoolMembershipRepository = schoolMembershipRepository;
    this.platformAdminEmails = platformAdminEmails;
  }

  /**
   * Resolve or create an application user from Keycloak JWT claims.
   *
   * <p>On first login, creates a new user record. On subsequent logins, updates the display name
   * and last login time.
   */
  @Transactional
  public CurrentUser resolveOrCreateUser(String keycloakId, String email, String displayName) {
    AppUser user =
        appUserRepository
            .findByKeycloakId(keycloakId)
            .map(
                existingUser -> {
                  // Update display name if changed
                  if (!existingUser.getDisplayName().equals(displayName)) {
                    existingUser.setDisplayName(displayName);
                  }
                  existingUser.setLastLoginAt(Instant.now());
                  return appUserRepository.save(existingUser);
                })
            .orElseGet(
                () -> {
                  // Create new user
                  AppUser newUser = new AppUser(keycloakId, email, displayName);
                  newUser.setLastLoginAt(Instant.now());

                  // Check if this email should be a platform admin
                  if (platformAdminEmails.contains(email)) {
                    newUser.setPlatformAdmin(true);
                  }

                  return appUserRepository.save(newUser);
                });

    return buildCurrentUser(user);
  }

  /** Build a CurrentUser from an AppUser entity by loading their school memberships. */
  public CurrentUser buildCurrentUser(AppUser user) {
    Map<UUID, SchoolRole> schoolRoles = new HashMap<>();

    List<SchoolMembership> memberships =
        schoolMembershipRepository.findByUserIdAndActiveTrue(user.getId());

    for (SchoolMembership membership : memberships) {
      schoolRoles.put(membership.getSchool().getId(), membership.getRole());
    }

    return new CurrentUser(
        user.getId(),
        user.getKeycloakId(),
        user.getEmail(),
        user.getDisplayName(),
        user.isPlatformAdmin(),
        schoolRoles);
  }

  /** Find a user by their ID. */
  @Transactional(readOnly = true)
  public AppUser findById(UUID id) {
    return appUserRepository
        .findById(id)
        .orElseThrow(() -> new IllegalArgumentException("User not found: " + id));
  }

  /** Find a user by their Keycloak ID. */
  @Transactional(readOnly = true)
  public AppUser findByKeycloakId(String keycloakId) {
    return appUserRepository
        .findByKeycloakId(keycloakId)
        .orElseThrow(() -> new IllegalArgumentException("User not found for Keycloak ID"));
  }
}
