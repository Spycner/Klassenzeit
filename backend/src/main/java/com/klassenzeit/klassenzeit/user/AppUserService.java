package com.klassenzeit.klassenzeit.user;

import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

  private static final Logger LOGGER = LoggerFactory.getLogger(AppUserService.class);

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
    LOGGER.info("AppUserService initialized with platformAdminEmails: {}", platformAdminEmails);
  }

  /**
   * Resolve or create an application user from Keycloak JWT claims.
   *
   * <p>On first login, creates a new user record. On subsequent logins, updates the display name
   * and last login time.
   *
   * <p>This method is designed to handle concurrent requests safely by:
   *
   * <ul>
   *   <li>Using atomic updates for existing users to avoid optimistic locking conflicts
   *   <li>Using pessimistic locking when creating new users to prevent duplicate inserts
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
      // User doesn't exist, need to create with pessimistic lock to prevent duplicates
      user = createUserWithLock(keycloakId, email, displayName, shouldBePlatformAdmin, now);
    }

    return buildCurrentUser(user);
  }

  /**
   * Create a new user with pessimistic locking to prevent duplicate creation from concurrent
   * requests.
   */
  private AppUser createUserWithLock(
      String keycloakId,
      String email,
      String displayName,
      boolean shouldBePlatformAdmin,
      Instant now) {
    // Use pessimistic lock to check if another transaction created the user
    Optional<AppUser> existingUser = appUserRepository.findByKeycloakIdForUpdate(keycloakId);

    if (existingUser.isPresent()) {
      // Another transaction already created the user, update it
      AppUser user = existingUser.get();
      user.setDisplayName(displayName);
      user.setPlatformAdmin(shouldBePlatformAdmin);
      user.setLastLoginAt(now);
      return appUserRepository.save(user);
    }

    // Create new user
    AppUser newUser = new AppUser(keycloakId, email, displayName);
    newUser.setLastLoginAt(now);
    newUser.setPlatformAdmin(shouldBePlatformAdmin);
    return appUserRepository.save(newUser);
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
