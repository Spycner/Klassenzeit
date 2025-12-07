package com.klassenzeit.klassenzeit.user;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class AppUserTest {

  @Test
  void constructorSetsFields() {
    String keycloakId = "keycloak-123";
    String email = "test@example.com";
    String displayName = "Test User";

    AppUser user = new AppUser(keycloakId, email, displayName);

    assertThat(user.getKeycloakId()).isEqualTo(keycloakId);
    assertThat(user.getEmail()).isEqualTo(email);
    assertThat(user.getDisplayName()).isEqualTo(displayName);
    assertThat(user.isPlatformAdmin()).isFalse();
    assertThat(user.isActive()).isTrue();
    assertThat(user.getLastLoginAt()).isNull();
  }

  @Test
  void setEmailUpdatesEmail() {
    AppUser user = new AppUser("kc-id", "old@example.com", "User");

    user.setEmail("new@example.com");

    assertThat(user.getEmail()).isEqualTo("new@example.com");
  }

  @Test
  void setDisplayNameUpdatesDisplayName() {
    AppUser user = new AppUser("kc-id", "user@example.com", "Old Name");

    user.setDisplayName("New Name");

    assertThat(user.getDisplayName()).isEqualTo("New Name");
  }

  @Test
  void setPlatformAdminUpdatesPlatformAdmin() {
    AppUser user = new AppUser("kc-id", "user@example.com", "User");
    assertThat(user.isPlatformAdmin()).isFalse();

    user.setPlatformAdmin(true);

    assertThat(user.isPlatformAdmin()).isTrue();
  }

  @Test
  void setActiveUpdatesActive() {
    AppUser user = new AppUser("kc-id", "user@example.com", "User");
    assertThat(user.isActive()).isTrue();

    user.setActive(false);

    assertThat(user.isActive()).isFalse();
  }

  @Test
  void setLastLoginAtUpdatesLastLoginAt() {
    AppUser user = new AppUser("kc-id", "user@example.com", "User");
    Instant loginTime = Instant.now();

    user.setLastLoginAt(loginTime);

    assertThat(user.getLastLoginAt()).isEqualTo(loginTime);
  }

  @Test
  void getMembershipsReturnsEmptyListByDefault() {
    AppUser user = new AppUser("kc-id", "user@example.com", "User");

    assertThat(user.getMemberships()).isEmpty();
  }
}
