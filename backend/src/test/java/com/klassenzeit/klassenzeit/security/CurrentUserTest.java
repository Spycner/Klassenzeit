package com.klassenzeit.klassenzeit.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class CurrentUserTest {

  private static final UUID USER_ID = UUID.randomUUID();
  private static final String KEYCLOAK_ID = "keycloak-123";
  private static final String EMAIL = "test@example.com";
  private static final String DISPLAY_NAME = "Test User";
  private static final UUID SCHOOL_ID = UUID.randomUUID();
  private static final UUID OTHER_SCHOOL_ID = UUID.randomUUID();

  @Nested
  class HasSchoolAccess {

    @Test
    void member_hasAccess() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.TEACHER));

      assertThat(user.hasSchoolAccess(SCHOOL_ID)).isTrue();
    }

    @Test
    void nonMember_noAccess() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.TEACHER));

      assertThat(user.hasSchoolAccess(OTHER_SCHOOL_ID)).isFalse();
    }

    @Test
    void emptyRoles_noAccess() {
      CurrentUser user =
          new CurrentUser(USER_ID, KEYCLOAK_ID, EMAIL, DISPLAY_NAME, false, Map.of());

      assertThat(user.hasSchoolAccess(SCHOOL_ID)).isFalse();
    }
  }

  @Nested
  class HasRole {

    @Test
    void matchingRole_returnsTrue() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.TEACHER));

      assertThat(user.hasRole(SCHOOL_ID, SchoolRole.TEACHER)).isTrue();
    }

    @Test
    void differentRole_returnsFalse() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.TEACHER));

      assertThat(user.hasRole(SCHOOL_ID, SchoolRole.SCHOOL_ADMIN)).isFalse();
    }

    @Test
    void anyOfMultipleRoles_returnsTrue() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.PLANNER));

      assertThat(user.hasRole(SCHOOL_ID, SchoolRole.SCHOOL_ADMIN, SchoolRole.PLANNER)).isTrue();
    }

    @Test
    void noMembership_returnsFalse() {
      CurrentUser user =
          new CurrentUser(USER_ID, KEYCLOAK_ID, EMAIL, DISPLAY_NAME, false, Map.of());

      assertThat(user.hasRole(SCHOOL_ID, SchoolRole.TEACHER)).isFalse();
    }

    @Test
    void wrongSchool_returnsFalse() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.SCHOOL_ADMIN));

      assertThat(user.hasRole(OTHER_SCHOOL_ID, SchoolRole.SCHOOL_ADMIN)).isFalse();
    }
  }

  @Nested
  class IsSchoolAdmin {

    @Test
    void adminRole_returnsTrue() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.SCHOOL_ADMIN));

      assertThat(user.isSchoolAdmin(SCHOOL_ID)).isTrue();
    }

    @Test
    void plannerRole_returnsFalse() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.PLANNER));

      assertThat(user.isSchoolAdmin(SCHOOL_ID)).isFalse();
    }

    @Test
    void teacherRole_returnsFalse() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.TEACHER));

      assertThat(user.isSchoolAdmin(SCHOOL_ID)).isFalse();
    }

    @Test
    void viewerRole_returnsFalse() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.VIEWER));

      assertThat(user.isSchoolAdmin(SCHOOL_ID)).isFalse();
    }
  }

  @Nested
  class CanManageSchool {

    @Test
    void adminRole_returnsTrue() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.SCHOOL_ADMIN));

      assertThat(user.canManageSchool(SCHOOL_ID)).isTrue();
    }

    @Test
    void plannerRole_returnsTrue() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.PLANNER));

      assertThat(user.canManageSchool(SCHOOL_ID)).isTrue();
    }

    @Test
    void teacherRole_returnsFalse() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.TEACHER));

      assertThat(user.canManageSchool(SCHOOL_ID)).isFalse();
    }

    @Test
    void viewerRole_returnsFalse() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.VIEWER));

      assertThat(user.canManageSchool(SCHOOL_ID)).isFalse();
    }

    @Test
    void noMembership_returnsFalse() {
      CurrentUser user =
          new CurrentUser(USER_ID, KEYCLOAK_ID, EMAIL, DISPLAY_NAME, false, Map.of());

      assertThat(user.canManageSchool(SCHOOL_ID)).isFalse();
    }
  }

  @Nested
  class GetRoleInSchool {

    @Test
    void member_returnsRole() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.TEACHER));

      assertThat(user.getRoleInSchool(SCHOOL_ID)).isEqualTo(SchoolRole.TEACHER);
    }

    @Test
    void nonMember_returnsNull() {
      CurrentUser user =
          new CurrentUser(
              USER_ID,
              KEYCLOAK_ID,
              EMAIL,
              DISPLAY_NAME,
              false,
              Map.of(SCHOOL_ID, SchoolRole.TEACHER));

      assertThat(user.getRoleInSchool(OTHER_SCHOOL_ID)).isNull();
    }

    @Test
    void emptyRoles_returnsNull() {
      CurrentUser user =
          new CurrentUser(USER_ID, KEYCLOAK_ID, EMAIL, DISPLAY_NAME, false, Map.of());

      assertThat(user.getRoleInSchool(SCHOOL_ID)).isNull();
    }
  }

  @Nested
  class RecordFields {

    @Test
    void fieldsAreAccessible() {
      Map<UUID, SchoolRole> schoolRoles = Map.of(SCHOOL_ID, SchoolRole.TEACHER);
      CurrentUser user =
          new CurrentUser(USER_ID, KEYCLOAK_ID, EMAIL, DISPLAY_NAME, true, schoolRoles);

      assertThat(user.id()).isEqualTo(USER_ID);
      assertThat(user.keycloakId()).isEqualTo(KEYCLOAK_ID);
      assertThat(user.email()).isEqualTo(EMAIL);
      assertThat(user.displayName()).isEqualTo(DISPLAY_NAME);
      assertThat(user.isPlatformAdmin()).isTrue();
      assertThat(user.schoolRoles()).isEqualTo(schoolRoles);
    }
  }
}
