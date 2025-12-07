package com.klassenzeit.klassenzeit.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

@ExtendWith(MockitoExtension.class)
class AppUserServiceUnitTest {

  @Mock private AppUserRepository appUserRepository;

  @Mock private SchoolMembershipRepository schoolMembershipRepository;

  private AppUserService appUserService;

  @BeforeEach
  void setUp() {
    appUserService = new AppUserService(appUserRepository, schoolMembershipRepository, List.of());
  }

  @Nested
  class ConcurrentUserCreation {

    @Test
    void handlesDataIntegrityViolationByFetchingExistingUser() {
      String keycloakId = "concurrent-keycloak-id";
      String email = "concurrent@example.com";
      String displayName = "Concurrent User";

      // First update returns 0 (user doesn't exist)
      when(appUserRepository.updateLoginInfo(anyString(), anyString(), anyBoolean(), any()))
          .thenReturn(0);

      // saveAndFlush throws DataIntegrityViolationException (concurrent create)
      when(appUserRepository.saveAndFlush(any(AppUser.class)))
          .thenThrow(new DataIntegrityViolationException("Duplicate key"));

      // After exception, find the existing user
      AppUser existingUser = new AppUser(keycloakId, email, "Original Name");
      existingUser.setId(UUID.randomUUID());
      when(appUserRepository.findByKeycloakId(keycloakId)).thenReturn(Optional.of(existingUser));

      // save returns the updated user
      when(appUserRepository.save(any(AppUser.class)))
          .thenAnswer(invocation -> invocation.getArgument(0));

      // schoolMembershipRepository returns empty list
      when(schoolMembershipRepository.findByUserIdWithSchool(any())).thenReturn(List.of());

      CurrentUser result = appUserService.resolveOrCreateUser(keycloakId, email, displayName);

      assertThat(result).isNotNull();
      assertThat(result.keycloakId()).isEqualTo(keycloakId);
      assertThat(result.email()).isEqualTo(email);
      // Display name should be updated to the new value
      assertThat(result.displayName()).isEqualTo(displayName);
    }

    @Test
    void throwsIllegalStateExceptionWhenUserNotFoundAfterDataIntegrityViolation() {
      String keycloakId = "missing-keycloak-id";

      // First update returns 0 (user doesn't exist)
      when(appUserRepository.updateLoginInfo(anyString(), anyString(), anyBoolean(), any()))
          .thenReturn(0);

      // saveAndFlush throws DataIntegrityViolationException (concurrent create)
      when(appUserRepository.saveAndFlush(any(AppUser.class)))
          .thenThrow(new DataIntegrityViolationException("Duplicate key"));

      // After exception, user is still not found (should not happen but handle it)
      when(appUserRepository.findByKeycloakId(keycloakId)).thenReturn(Optional.empty());

      assertThatThrownBy(
              () -> appUserService.resolveOrCreateUser(keycloakId, "email@test.com", "User"))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("User creation failed but user not found");
    }

    @Test
    void throwsIllegalStateExceptionWhenUserNotFoundAfterUpdate() {
      String keycloakId = "updated-but-missing";

      // updateLoginInfo returns 1 (user was updated)
      when(appUserRepository.updateLoginInfo(anyString(), anyString(), anyBoolean(), any()))
          .thenReturn(1);

      // But then findByKeycloakId returns empty (should not happen)
      when(appUserRepository.findByKeycloakId(keycloakId)).thenReturn(Optional.empty());

      assertThatThrownBy(
              () -> appUserService.resolveOrCreateUser(keycloakId, "email@test.com", "User"))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("User was updated but not found");
    }
  }
}
