package com.klassenzeit.klassenzeit.user;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.klassenzeit.klassenzeit.accessrequest.AccessRequestService;
import com.klassenzeit.klassenzeit.membership.SchoolMembership;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipRepository;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.school.School;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import com.klassenzeit.klassenzeit.security.TestSecurityConfig;
import com.klassenzeit.klassenzeit.security.WithMockCurrentUser;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AppUserController.class)
@Import(TestSecurityConfig.class)
@ActiveProfiles("test")
class AppUserControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private SchoolMembershipRepository schoolMembershipRepository;

  @MockitoBean private AccessRequestService accessRequestService;

  @MockitoBean private AppUserRepository appUserRepository;

  @MockitoBean(name = "authz")
  private AuthorizationService authorizationService;

  private final UUID currentUserId = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    CurrentUser currentUser =
        new CurrentUser(
            currentUserId, "keycloak-id", "user@example.com", "Test User", false, Map.of());
    when(authorizationService.getCurrentUser()).thenReturn(currentUser);
    when(authorizationService.canSearchUsers()).thenReturn(true);
  }

  @Nested
  class GetCurrentUser {

    @Test
    @WithMockCurrentUser(email = "test@example.com", displayName = "Test User")
    void returnsCurrentUserProfile() throws Exception {
      CurrentUser testUser =
          new CurrentUser(
              currentUserId, "keycloak-id", "test@example.com", "Test User", false, Map.of());
      when(authorizationService.getCurrentUser()).thenReturn(testUser);
      when(schoolMembershipRepository.findByUserIdWithSchool(any(UUID.class)))
          .thenReturn(List.of());

      mockMvc
          .perform(get("/api/users/me"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.email").value("test@example.com"))
          .andExpect(jsonPath("$.displayName").value("Test User"))
          .andExpect(jsonPath("$.isPlatformAdmin").value(false))
          .andExpect(jsonPath("$.schools").isArray())
          .andExpect(jsonPath("$.schools").isEmpty());
    }

    @Test
    @WithMockCurrentUser(
        email = "admin@example.com",
        displayName = "Admin User",
        isPlatformAdmin = true)
    void returnsPlatformAdminStatus() throws Exception {
      CurrentUser adminUser =
          new CurrentUser(
              currentUserId, "keycloak-id", "admin@example.com", "Admin User", true, Map.of());
      when(authorizationService.getCurrentUser()).thenReturn(adminUser);
      when(schoolMembershipRepository.findByUserIdWithSchool(any(UUID.class)))
          .thenReturn(List.of());

      mockMvc
          .perform(get("/api/users/me"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.isPlatformAdmin").value(true));
    }

    @Test
    @WithMockCurrentUser(email = "member@example.com")
    void returnsSchoolMemberships() throws Exception {
      CurrentUser memberUser =
          new CurrentUser(
              currentUserId, "keycloak-id", "member@example.com", "Test User", false, Map.of());
      when(authorizationService.getCurrentUser()).thenReturn(memberUser);

      UUID schoolId = UUID.randomUUID();
      School school = createMockSchool(schoolId, "Test School");
      AppUser user = createMockUser();
      SchoolMembership membership = new SchoolMembership(user, school, SchoolRole.TEACHER, null);

      when(schoolMembershipRepository.findByUserIdWithSchool(any(UUID.class)))
          .thenReturn(List.of(membership));

      mockMvc
          .perform(get("/api/users/me"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.schools").isArray())
          .andExpect(jsonPath("$.schools[0].schoolId").value(schoolId.toString()))
          .andExpect(jsonPath("$.schools[0].schoolName").value("Test School"))
          .andExpect(jsonPath("$.schools[0].role").value("TEACHER"));
    }
  }

  @Nested
  class SearchUsers {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void returnsSearchResults() throws Exception {
      AppUser user1 = createMockUserWithDetails("user1@example.com", "User One");
      AppUser user2 = createMockUserWithDetails("user2@example.com", "User Two");

      when(appUserRepository.searchByEmailOrDisplayName(anyString(), any(PageRequest.class)))
          .thenReturn(List.of(user1, user2));

      mockMvc
          .perform(get("/api/users/search").param("query", "user"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$").isArray())
          .andExpect(jsonPath("$.length()").value(2))
          .andExpect(jsonPath("$[0].email").value("user1@example.com"))
          .andExpect(jsonPath("$[0].displayName").value("User One"))
          .andExpect(jsonPath("$[1].email").value("user2@example.com"));
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void returnsEmptyListForShortQuery() throws Exception {
      mockMvc
          .perform(get("/api/users/search").param("query", "a"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$").isArray())
          .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void returnsEmptyListForNullQuery() throws Exception {
      mockMvc
          .perform(get("/api/users/search"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$").isArray())
          .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void trimsQueryBeforeSearch() throws Exception {
      when(appUserRepository.searchByEmailOrDisplayName(anyString(), any(PageRequest.class)))
          .thenReturn(List.of());

      mockMvc
          .perform(get("/api/users/search").param("query", "  test  "))
          .andExpect(status().isOk());

      verify(appUserRepository)
          .searchByEmailOrDisplayName(
              org.mockito.ArgumentMatchers.eq("test"), any(PageRequest.class));
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = false)
    void requiresSearchPermission() throws Exception {
      when(authorizationService.canSearchUsers()).thenReturn(false);

      mockMvc
          .perform(get("/api/users/search").param("query", "test"))
          .andExpect(status().isForbidden());
    }
  }

  @Nested
  class CancelAccessRequest {

    @Test
    @WithMockCurrentUser
    void cancelsAccessRequest() throws Exception {
      UUID requestId = UUID.randomUUID();
      doNothing().when(accessRequestService).cancel(requestId);

      mockMvc
          .perform(delete("/api/users/me/access-requests/{id}", requestId))
          .andExpect(status().isNoContent());

      verify(accessRequestService).cancel(requestId);
    }
  }

  private School createMockSchool(UUID id, String name) {
    School school = new School();
    school.setId(id);
    school.setName(name);
    school.setSlug("test-school");
    school.setSchoolType("Grundschule");
    school.setMinGrade((short) 1);
    school.setMaxGrade((short) 4);
    school.setTimezone("Europe/Berlin");
    return school;
  }

  private AppUser createMockUser() {
    AppUser user = new AppUser("keycloak-id", "user@example.com", "Test User");
    user.setId(currentUserId);
    return user;
  }

  private AppUser createMockUserWithDetails(String email, String displayName) {
    AppUser user = new AppUser(UUID.randomUUID().toString(), email, displayName);
    user.setId(UUID.randomUUID());
    return user;
  }
}
