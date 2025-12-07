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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service for managing application users.
 *
 * <p>Handles user resolution from Keycloak JWTs and building the CurrentUser context.
 */
@Service
public class AppUserService {

  private static final Logger LOGGER = LoggerFactory.getLogger(AppUserService.class);

  private final AppUserRepository appUserRepository;
  private final SchoolMembershipRepository schoolMembershipRepository;
  private final List<String> platformAdminEmails;

  public AppUserService(
      AppUserRepository appUserRepository,
      SchoolMembershipRepository schoolMembershipRepository,
      @Value("#{'${klassenzeit.security.platform-admin-emails:}'.split(',')}")
          List<String> platformAdminEmails) {
    this.appUserRepository = appUserRepository;
    this.schoolMembershipRepository = schoolMembershipRepository;
    this.platformAdminEmails = platformAdminEmails;
    LOGGER.info("AppUserService initialized with platformAdminEmails: {}", platformAdminEmails);
  }

  /**
   * Resolve or create an application user from Keycloak JWT claims.
   *
   * <p>On first login, creates a new user record. On subsequent logins, updates the display name
   * and last login time.
   *
   * <p>This method handles concurrent requests safely by:
   *
   * <ul>
   *   <li>Using atomic updates for existing users to avoid optimistic locking conflicts
   *   <li>Catching duplicate key violations on first login and retrying with fetch
   * </ul>
   */
  @Transactional
  public CurrentUser resolveOrCreateUser(String keycloakId, String email, String displayName) {
    boolean shouldBePlatformAdmin = platformAdminEmails.contains(email);
    Instant now = Instant.now();

    // Try atomic update first (handles most cases without locking)
    int updated =
        appUserRepository.updateLoginInfo(keycloakId, displayName, shouldBePlatformAdmin, now);

    AppUser user;
    if (updated > 0) {
      // User exists and was updated atomically, now fetch it for building CurrentUser
      user =
          appUserRepository
              .findByKeycloakId(keycloakId)
              .orElseThrow(() -> new IllegalStateException("User was updated but not found"));
    } else {
      // User doesn't exist, create with retry logic to handle concurrent requests
      user = createUserWithRetry(keycloakId, email, displayName, shouldBePlatformAdmin, now);
    }

    return buildCurrentUser(user);
  }

  /**
   * Create a new user, handling the race condition where concurrent requests may try to create the
   * same user simultaneously.
   *
   * <p>If a duplicate key violation occurs (another request created the user first), we catch the
   * exception and fetch the existing user instead.
   */
  private AppUser createUserWithRetry(
      String keycloakId,
      String email,
      String displayName,
      boolean shouldBePlatformAdmin,
      Instant now) {
    try {
      // Try to create new user
      AppUser newUser = new AppUser(keycloakId, email, displayName);
      newUser.setLastLoginAt(now);
      newUser.setPlatformAdmin(shouldBePlatformAdmin);
      AppUser savedUser = appUserRepository.saveAndFlush(newUser);
      LOGGER.debug("Created new user for keycloakId: {}", keycloakId);
      return savedUser;
    } catch (DataIntegrityViolationException e) {
      // Another request created the user first - fetch and update it
      LOGGER.debug(
          "Concurrent user creation detected for keycloakId: {}, fetching existing user",
          keycloakId);
      AppUser existingUser =
          appUserRepository
              .findByKeycloakId(keycloakId)
              .orElseThrow(
                  () ->
                      new IllegalStateException(
                          "User creation failed but user not found: " + keycloakId, e));
      existingUser.setDisplayName(displayName);
      existingUser.setPlatformAdmin(shouldBePlatformAdmin);
      existingUser.setLastLoginAt(now);
      return appUserRepository.save(existingUser);
    }
  }

  /** Build a CurrentUser from an AppUser entity by loading their school memberships. */
  public CurrentUser buildCurrentUser(AppUser user) {
    Map<UUID, SchoolRole> schoolRoles = new HashMap<>();

    List<SchoolMembership> memberships =
        schoolMembershipRepository.findByUserIdWithSchool(user.getId());

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
