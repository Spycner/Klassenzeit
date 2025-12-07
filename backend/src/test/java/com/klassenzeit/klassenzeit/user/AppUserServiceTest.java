package com.klassenzeit.klassenzeit.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

@Transactional
@TestPropertySource(
    properties = {"klassenzeit.security.platform-admin-emails=admin@example.com,super@example.com"})
class AppUserServiceTest extends AbstractIntegrationTest {

  @Autowired private AppUserService appUserService;
  @Autowired private AppUserRepository appUserRepository;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
  }

  @Nested
  class ResolveOrCreateUser {

    @Test
    void createsNewUserWhenNotExists() {
      String keycloakId = UUID.randomUUID().toString();
      String email = "newuser@example.com";
      String displayName = "New User";

      CurrentUser result = appUserService.resolveOrCreateUser(keycloakId, email, displayName);

      assertThat(result).isNotNull();
      assertThat(result.keycloakId()).isEqualTo(keycloakId);
      assertThat(result.email()).isEqualTo(email);
      assertThat(result.displayName()).isEqualTo(displayName);
      assertThat(result.isPlatformAdmin()).isFalse();
      assertThat(result.schoolRoles()).isEmpty();

      // Verify persisted
      AppUser persistedUser = appUserRepository.findByKeycloakId(keycloakId).orElseThrow();
      assertThat(persistedUser.getEmail()).isEqualTo(email);
      assertThat(persistedUser.getLastLoginAt()).isNotNull();
    }

    @Test
    void updatesExistingUserOnSubsequentLogin() {
      testData
          .appUser()
          .withKeycloakId("existing-keycloak-id")
          .withEmail("existing@example.com")
          .withDisplayName("Old Name")
          .persist();
      entityManager.flush();
      entityManager.clear();

      Instant beforeLogin = Instant.now();
      CurrentUser result =
          appUserService.resolveOrCreateUser(
              "existing-keycloak-id", "existing@example.com", "Updated Name");

      assertThat(result.displayName()).isEqualTo("Updated Name");

      entityManager.flush();
      entityManager.clear();

      AppUser updatedUser =
          appUserRepository.findByKeycloakId("existing-keycloak-id").orElseThrow();
      assertThat(updatedUser.getDisplayName()).isEqualTo("Updated Name");
      assertThat(updatedUser.getLastLoginAt()).isAfterOrEqualTo(beforeLogin);
    }

    @Test
    void setsPlatformAdminForConfiguredEmails() {
      String keycloakId = UUID.randomUUID().toString();

      CurrentUser result =
          appUserService.resolveOrCreateUser(keycloakId, "admin@example.com", "Admin User");

      assertThat(result.isPlatformAdmin()).isTrue();

      AppUser persistedUser = appUserRepository.findByKeycloakId(keycloakId).orElseThrow();
      assertThat(persistedUser.isPlatformAdmin()).isTrue();
    }

    @Test
    void doesNotSetPlatformAdminForNonConfiguredEmails() {
      String keycloakId = UUID.randomUUID().toString();

      CurrentUser result =
          appUserService.resolveOrCreateUser(keycloakId, "regular@example.com", "Regular User");

      assertThat(result.isPlatformAdmin()).isFalse();
    }

    @Test
    void updatesPlatformAdminStatusOnLogin() {
      // Create user as non-admin
      testData
          .appUser()
          .withKeycloakId("admin-keycloak-id")
          .withEmail("admin@example.com")
          .isPlatformAdmin(false)
          .persist();
      entityManager.flush();
      entityManager.clear();

      // Login should upgrade to admin based on configured email
      CurrentUser result =
          appUserService.resolveOrCreateUser(
              "admin-keycloak-id", "admin@example.com", "Admin User");

      assertThat(result.isPlatformAdmin()).isTrue();
    }
  }

  @Nested
  class BuildCurrentUser {

    @Test
    void buildsCurrentUserWithSchoolRoles() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      School school1 = testData.school().withSlug("school-1").persist();
      School school2 = testData.school().withSlug("school-2").persist();
      testData.membership(school1, user).withRole(SchoolRole.SCHOOL_ADMIN).persist();
      testData.membership(school2, user).withRole(SchoolRole.TEACHER).persist();
      entityManager.flush();
      entityManager.clear();

      user = appUserRepository.findById(user.getId()).orElseThrow();
      CurrentUser result = appUserService.buildCurrentUser(user);

      assertThat(result.schoolRoles()).hasSize(2);
      assertThat(result.schoolRoles().get(school1.getId())).isEqualTo(SchoolRole.SCHOOL_ADMIN);
      assertThat(result.schoolRoles().get(school2.getId())).isEqualTo(SchoolRole.TEACHER);
    }

    @Test
    void buildsCurrentUserWithNoMemberships() {
      AppUser user = testData.appUser().withEmail("lonely@example.com").persist();
      entityManager.flush();
      entityManager.clear();

      user = appUserRepository.findById(user.getId()).orElseThrow();
      CurrentUser result = appUserService.buildCurrentUser(user);

      assertThat(result.id()).isEqualTo(user.getId());
      assertThat(result.schoolRoles()).isEmpty();
    }

    @Test
    void excludesInactiveMemberships() {
      AppUser user = testData.appUser().withEmail("user@example.com").persist();
      School activeSchool = testData.school().withSlug("active-school").persist();
      School inactiveSchool = testData.school().withSlug("inactive-school").persist();
      testData.membership(activeSchool, user).withRole(SchoolRole.VIEWER).isActive(true).persist();
      testData
          .membership(inactiveSchool, user)
          .withRole(SchoolRole.VIEWER)
          .isActive(false)
          .persist();
      entityManager.flush();
      entityManager.clear();

      user = appUserRepository.findById(user.getId()).orElseThrow();
      CurrentUser result = appUserService.buildCurrentUser(user);

      assertThat(result.schoolRoles()).hasSize(1);
      assertThat(result.schoolRoles()).containsKey(activeSchool.getId());
      assertThat(result.schoolRoles()).doesNotContainKey(inactiveSchool.getId());
    }
  }

  @Nested
  class FindById {

    @Test
    void returnsUserWhenFound() {
      AppUser user =
          testData.appUser().withEmail("findme@example.com").withDisplayName("Find Me").persist();
      entityManager.flush();
      entityManager.clear();

      AppUser result = appUserService.findById(user.getId());

      assertThat(result).isNotNull();
      assertThat(result.getEmail()).isEqualTo("findme@example.com");
      assertThat(result.getDisplayName()).isEqualTo("Find Me");
    }

    @Test
    void throwsWhenUserNotFound() {
      UUID nonExistentId = UUID.randomUUID();

      assertThatThrownBy(() -> appUserService.findById(nonExistentId))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("User not found");
    }
  }

  @Nested
  class FindByKeycloakId {

    @Test
    void returnsUserWhenFound() {
      String keycloakId = UUID.randomUUID().toString();
      testData.appUser().withKeycloakId(keycloakId).withEmail("keycloak@example.com").persist();
      entityManager.flush();
      entityManager.clear();

      AppUser result = appUserService.findByKeycloakId(keycloakId);

      assertThat(result).isNotNull();
      assertThat(result.getEmail()).isEqualTo("keycloak@example.com");
    }

    @Test
    void throwsWhenUserNotFound() {
      assertThatThrownBy(() -> appUserService.findByKeycloakId("non-existent-keycloak-id"))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("User not found");
    }
  }
}
