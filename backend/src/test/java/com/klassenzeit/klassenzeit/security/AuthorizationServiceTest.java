package com.klassenzeit.klassenzeit.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import org.springframework.security.access.AccessDeniedException;
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

  @Nested
  class IsPlatformAdmin {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdmin_returnsTrue() {
      assertThat(authorizationService.isPlatformAdmin()).isTrue();
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = false)
    void nonAdmin_returnsFalse() {
      assertThat(authorizationService.isPlatformAdmin()).isFalse();
    }
  }

  @Nested
  class CanAccessSchool {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdmin_canAccessAnySchool() {
      School school = testData.school().withSlug("any-school").persist();
      entityManager.flush();

      assertThat(authorizationService.canAccessSchool(school.getId())).isTrue();
    }

    @Test
    void member_canAccessOwnSchool() {
      AppUser user = testData.appUser().withEmail("member@test.com").persist();
      School school = testData.school().withSlug("member-school").persist();
      testData.membership(school, user).withRole(SchoolRole.TEACHER).persist();
      entityManager.flush();

      setCurrentUser(user.getId(), Map.of(school.getId(), SchoolRole.TEACHER));

      assertThat(authorizationService.canAccessSchool(school.getId())).isTrue();
    }

    @Test
    void member_cannotAccessOtherSchool() {
      School school = testData.school().withSlug("other-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of());

      assertThat(authorizationService.canAccessSchool(school.getId())).isFalse();
    }
  }

  @Nested
  class CanManageSchool {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdmin_canManageAnySchool() {
      School school = testData.school().withSlug("any-school").persist();
      entityManager.flush();

      assertThat(authorizationService.canManageSchool(school.getId())).isTrue();
    }

    @Test
    void schoolAdmin_canManageSchool() {
      School school = testData.school().withSlug("managed-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.SCHOOL_ADMIN));

      assertThat(authorizationService.canManageSchool(school.getId())).isTrue();
    }

    @Test
    void planner_canManageSchool() {
      School school = testData.school().withSlug("planned-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.PLANNER));

      assertThat(authorizationService.canManageSchool(school.getId())).isTrue();
    }

    @Test
    void teacher_cannotManageSchool() {
      School school = testData.school().withSlug("teacher-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.TEACHER));

      assertThat(authorizationService.canManageSchool(school.getId())).isFalse();
    }

    @Test
    void viewer_cannotManageSchool() {
      School school = testData.school().withSlug("viewer-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.VIEWER));

      assertThat(authorizationService.canManageSchool(school.getId())).isFalse();
    }
  }

  @Nested
  class IsSchoolAdmin {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdmin_isTreatedAsSchoolAdmin() {
      School school = testData.school().withSlug("any-school").persist();
      entityManager.flush();

      assertThat(authorizationService.isSchoolAdmin(school.getId())).isTrue();
    }

    @Test
    void schoolAdmin_isSchoolAdmin() {
      School school = testData.school().withSlug("admin-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.SCHOOL_ADMIN));

      assertThat(authorizationService.isSchoolAdmin(school.getId())).isTrue();
    }

    @Test
    void planner_isNotSchoolAdmin() {
      School school = testData.school().withSlug("planner-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.PLANNER));

      assertThat(authorizationService.isSchoolAdmin(school.getId())).isFalse();
    }

    @Test
    void teacher_isNotSchoolAdmin() {
      School school = testData.school().withSlug("teacher-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.TEACHER));

      assertThat(authorizationService.isSchoolAdmin(school.getId())).isFalse();
    }
  }

  @Nested
  class HasRole {

    @Test
    void matchingRole_returnsTrue() {
      School school = testData.school().withSlug("role-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.TEACHER));

      assertThat(authorizationService.hasRole(school.getId(), SchoolRole.TEACHER)).isTrue();
    }

    @Test
    void nonMatchingRole_returnsFalse() {
      School school = testData.school().withSlug("role-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.TEACHER));

      assertThat(authorizationService.hasRole(school.getId(), SchoolRole.SCHOOL_ADMIN)).isFalse();
    }

    @Test
    void multipleRoles_matchesAny() {
      School school = testData.school().withSlug("multi-role-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.PLANNER));

      assertThat(
              authorizationService.hasRole(
                  school.getId(), SchoolRole.SCHOOL_ADMIN, SchoolRole.PLANNER))
          .isTrue();
    }

    @Test
    void noMembership_returnsFalse() {
      School school = testData.school().withSlug("no-member-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of());

      assertThat(authorizationService.hasRole(school.getId(), SchoolRole.TEACHER)).isFalse();
    }
  }

  @Nested
  class CanListSchools {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdmin_canList() {
      assertThat(authorizationService.canListSchools()).isTrue();
    }

    @Test
    void userWithMembership_canList() {
      School school = testData.school().withSlug("member-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.VIEWER));

      assertThat(authorizationService.canListSchools()).isTrue();
    }

    @Test
    void userWithNoMembership_cannotList() {
      setCurrentUser(UUID.randomUUID(), Map.of());

      assertThat(authorizationService.canListSchools()).isFalse();
    }
  }

  @Nested
  class CanSearchUsers {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdmin_canSearch() {
      assertThat(authorizationService.canSearchUsers()).isTrue();
    }

    @Test
    void userWithMembership_canSearch() {
      School school = testData.school().withSlug("search-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.VIEWER));

      assertThat(authorizationService.canSearchUsers()).isTrue();
    }

    @Test
    void userWithNoMembership_cannotSearch() {
      setCurrentUser(UUID.randomUUID(), Map.of());

      assertThat(authorizationService.canSearchUsers()).isFalse();
    }
  }

  @Nested
  class CanManageMembers {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdmin_canManageMembers() {
      School school = testData.school().withSlug("any-school").persist();
      entityManager.flush();

      assertThat(authorizationService.canManageMembers(school.getId())).isTrue();
    }

    @Test
    void schoolAdmin_canManageMembers() {
      School school = testData.school().withSlug("admin-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.SCHOOL_ADMIN));

      assertThat(authorizationService.canManageMembers(school.getId())).isTrue();
    }

    @Test
    void planner_cannotManageMembers() {
      School school = testData.school().withSlug("planner-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.PLANNER));

      assertThat(authorizationService.canManageMembers(school.getId())).isFalse();
    }

    @Test
    void teacher_cannotManageMembers() {
      School school = testData.school().withSlug("teacher-school").persist();
      entityManager.flush();

      setCurrentUser(UUID.randomUUID(), Map.of(school.getId(), SchoolRole.TEACHER));

      assertThat(authorizationService.canManageMembers(school.getId())).isFalse();
    }
  }

  @Nested
  class GetCurrentUser {

    @Test
    void noAuthentication_throwsAccessDenied() {
      SecurityContextHolder.clearContext();

      assertThatThrownBy(authorizationService::getCurrentUser)
          .isInstanceOf(AccessDeniedException.class)
          .hasMessage("No authenticated user");
    }

    @Test
    @WithMockCurrentUser(email = "test@example.com", displayName = "Test User")
    void validAuthentication_returnsCurrentUser() {
      CurrentUser user = authorizationService.getCurrentUser();

      assertThat(user.email()).isEqualTo("test@example.com");
      assertThat(user.displayName()).isEqualTo("Test User");
    }
  }

  private void setCurrentUser(UUID userId, Map<UUID, SchoolRole> schoolRoles) {
    CurrentUser currentUser =
        new CurrentUser(userId, "keycloak-id", "test@test.com", "Test User", false, schoolRoles);
    SecurityContextHolder.getContext()
        .setAuthentication(new MockCurrentUserAuthentication(currentUser));
  }
}
