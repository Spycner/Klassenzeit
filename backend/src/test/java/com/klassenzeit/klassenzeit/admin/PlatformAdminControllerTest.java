package com.klassenzeit.klassenzeit.admin;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.klassenzeit.klassenzeit.admin.dto.AssignAdminRequest;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.membership.ForbiddenOperationException;
import com.klassenzeit.klassenzeit.membership.SchoolMembershipService;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.membership.dto.MembershipResponse;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import com.klassenzeit.klassenzeit.security.TestSecurityConfig;
import com.klassenzeit.klassenzeit.security.WithMockCurrentUser;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PlatformAdminController.class)
@Import(TestSecurityConfig.class)
@ActiveProfiles("test")
class PlatformAdminControllerTest {

  @Autowired private MockMvc mockMvc;

  @Autowired private ObjectMapper objectMapper;

  @MockitoBean private SchoolMembershipService membershipService;

  @MockitoBean(name = "authz")
  private AuthorizationService authorizationService;

  private final UUID schoolId = UUID.randomUUID();
  private final UUID userId = UUID.randomUUID();
  private final UUID currentUserId = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    // Set up the current user for authorization service
    CurrentUser currentUser =
        new CurrentUser(
            currentUserId, "keycloak-id", "admin@example.com", "Platform Admin", true, Map.of());
    when(authorizationService.getCurrentUser()).thenReturn(currentUser);
  }

  private String baseUrl() {
    return "/api/admin/schools/" + schoolId + "/admins";
  }

  @Nested
  class AssignAdmin {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void platformAdminCanAssignAdmin() throws Exception {
      when(authorizationService.isPlatformAdmin()).thenReturn(true);

      MembershipResponse response = createMembershipResponse();
      when(membershipService.assignSchoolAdmin(any(), any(), any())).thenReturn(response);

      AssignAdminRequest request = new AssignAdminRequest(userId);

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.userId").value(userId.toString()))
          .andExpect(jsonPath("$.role").value("SCHOOL_ADMIN"))
          .andExpect(jsonPath("$.schoolId").value(schoolId.toString()));
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = false)
    void nonPlatformAdminCannotAssignAdmin() throws Exception {
      when(authorizationService.isPlatformAdmin()).thenReturn(false);

      AssignAdminRequest request = new AssignAdminRequest(userId);

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isForbidden());
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void assignAdminWithNullUserIdReturns400() throws Exception {
      when(authorizationService.isPlatformAdmin()).thenReturn(true);

      String requestBody = "{}";

      mockMvc
          .perform(post(baseUrl()).contentType(MediaType.APPLICATION_JSON).content(requestBody))
          .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void assignAdminToNonExistentSchoolReturns404() throws Exception {
      when(authorizationService.isPlatformAdmin()).thenReturn(true);
      when(membershipService.assignSchoolAdmin(any(), any(), any()))
          .thenThrow(new EntityNotFoundException("School", schoolId));

      AssignAdminRequest request = new AssignAdminRequest(userId);

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isNotFound());
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void assignAdminWithNonExistentUserReturns404() throws Exception {
      when(authorizationService.isPlatformAdmin()).thenReturn(true);
      when(membershipService.assignSchoolAdmin(any(), any(), any()))
          .thenThrow(new EntityNotFoundException("User", userId));

      AssignAdminRequest request = new AssignAdminRequest(userId);

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isNotFound());
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void assignAdminWhenUserAlreadyMemberReturns403() throws Exception {
      when(authorizationService.isPlatformAdmin()).thenReturn(true);
      when(membershipService.assignSchoolAdmin(any(), any(), any()))
          .thenThrow(new ForbiddenOperationException("User already has an active membership"));

      AssignAdminRequest request = new AssignAdminRequest(userId);

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isForbidden());
    }

    private MembershipResponse createMembershipResponse() {
      UUID membershipId = UUID.randomUUID();
      Instant now = Instant.now();
      return new MembershipResponse(
          membershipId,
          userId,
          "New Admin",
          "newadmin@example.com",
          schoolId,
          SchoolRole.SCHOOL_ADMIN,
          null,
          null,
          true,
          currentUserId,
          "Platform Admin",
          now,
          now,
          now);
    }
  }
}
