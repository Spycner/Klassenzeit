package com.klassenzeit.klassenzeit.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.TestDataBuilder;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.user.AppUser;
import jakarta.persistence.EntityManager;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class AuthorizationServiceTest extends AbstractIntegrationTest {

  @Autowired private AuthorizationService authorizationService;
  @Autowired private EntityManager entityManager;

  private TestDataBuilder testData;

  @BeforeEach
  void setUp() {
    testData = new TestDataBuilder(entityManager);
  }

  @Nested
  class CanAccessSchoolByIdentifier {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdminCanAccessSchoolByUuid() {
      School school = testData.school().withSlug("test-school").persist();
      entityManager.flush();
      entityManager.clear();

      boolean result = authorizationService.canAccessSchoolByIdentifier(school.getId().toString());

      assertThat(result).isTrue();
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdminCanAccessSchoolBySlug() {
      testData.school().withSlug("test-school").persist();
      entityManager.flush();
      entityManager.clear();

      boolean result = authorizationService.canAccessSchoolByIdentifier("test-school");

      assertThat(result).isTrue();
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdminCanAccessSchoolByOldSlug() {
      School school = testData.school().withSlug("current-slug").persist();
      testData.slugHistory(school).withSlug("old-slug").persist();
      entityManager.flush();
      entityManager.clear();

      // Old slug should still resolve to the school (redirect handled at service layer)
      boolean result = authorizationService.canAccessSchoolByIdentifier("old-slug");

      assertThat(result).isTrue();
    }

    @Test
    void memberCanAccessSchoolBySlug() {
      AppUser user = testData.appUser().withEmail("member@test.com").persist();
      School school = testData.school().withSlug("member-school").persist();
      testData.membership(school, user).withRole(SchoolRole.TEACHER).persist();
      entityManager.flush();
      entityManager.clear();

      // Set up the current user with the school membership
      setCurrentUser(user.getId(), Map.of(school.getId(), SchoolRole.TEACHER));

      boolean result = authorizationService.canAccessSchoolByIdentifier("member-school");

      assertThat(result).isTrue();
    }

    @Test
    void memberCanAccessSchoolByOldSlug() {
      AppUser user = testData.appUser().withEmail("member@test.com").persist();
      School school = testData.school().withSlug("current-slug").persist();
      testData.slugHistory(school).withSlug("old-slug").persist();
      testData.membership(school, user).withRole(SchoolRole.TEACHER).persist();
      entityManager.flush();
      entityManager.clear();

      setCurrentUser(user.getId(), Map.of(school.getId(), SchoolRole.TEACHER));

      boolean result = authorizationService.canAccessSchoolByIdentifier("old-slug");

      assertThat(result).isTrue();
    }

    @Test
    void nonMemberCannotAccessSchoolBySlug() {
      testData.school().withSlug("restricted-school").persist();
      entityManager.flush();
      entityManager.clear();

      // User with no memberships
      setCurrentUser(UUID.randomUUID(), Map.of());

      boolean result = authorizationService.canAccessSchoolByIdentifier("restricted-school");

      assertThat(result).isFalse();
    }

    @Test
    void returnsFalseForUnknownSlug() {
      setCurrentUser(UUID.randomUUID(), Map.of());

      boolean result = authorizationService.canAccessSchoolByIdentifier("unknown-slug");

      assertThat(result).isFalse();
    }

    @Test
    void returnsFalseForUnknownUuid() {
      setCurrentUser(UUID.randomUUID(), Map.of());

      boolean result =
          authorizationService.canAccessSchoolByIdentifier(UUID.randomUUID().toString());

      assertThat(result).isFalse();
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void handlesInvalidUuidAsSlug() {
      // A string that looks like a UUID but isn't valid should be treated as a slug
      testData.school().withSlug("not-a-uuid").persist();
      entityManager.flush();
      entityManager.clear();

      boolean result = authorizationService.canAccessSchoolByIdentifier("not-a-uuid");

      assertThat(result).isTrue();
    }
  }

  private void setCurrentUser(UUID userId, Map<UUID, SchoolRole> schoolRoles) {
    CurrentUser currentUser =
        new CurrentUser(userId, "keycloak-id", "test@test.com", "Test User", false, schoolRoles);
    SecurityContextHolder.getContext()
        .setAuthentication(new MockCurrentUserAuthentication(currentUser));
  }
}
