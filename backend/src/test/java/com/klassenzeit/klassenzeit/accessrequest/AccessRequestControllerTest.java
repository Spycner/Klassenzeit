package com.klassenzeit.klassenzeit.accessrequest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.klassenzeit.klassenzeit.accessrequest.dto.AccessRequestResponse;
import com.klassenzeit.klassenzeit.accessrequest.dto.AccessRequestSummary;
import com.klassenzeit.klassenzeit.accessrequest.dto.CreateAccessRequestRequest;
import com.klassenzeit.klassenzeit.accessrequest.dto.ReviewAccessRequestRequest;
import com.klassenzeit.klassenzeit.accessrequest.dto.ReviewDecision;
import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.membership.ForbiddenOperationException;
import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.security.AuthorizationService;
import com.klassenzeit.klassenzeit.security.CurrentUser;
import com.klassenzeit.klassenzeit.security.TestSecurityConfig;
import com.klassenzeit.klassenzeit.security.WithMockCurrentUser;
import java.time.Instant;
import java.util.List;
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

@WebMvcTest(AccessRequestController.class)
@Import(TestSecurityConfig.class)
@ActiveProfiles("test")
class AccessRequestControllerTest {

  @Autowired private MockMvc mockMvc;

  @Autowired private ObjectMapper objectMapper;

  @MockitoBean private AccessRequestService accessRequestService;

  @MockitoBean(name = "authz")
  private AuthorizationService authorizationService;

  private final UUID schoolId = UUID.randomUUID();
  private final UUID requestId = UUID.randomUUID();
  private final UUID userId = UUID.randomUUID();
  private final UUID adminUserId = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    CurrentUser currentUser =
        new CurrentUser(
            userId,
            "keycloak-id",
            "user@example.com",
            "Test User",
            false,
            Map.of(schoolId, SchoolRole.SCHOOL_ADMIN));
    when(authorizationService.getCurrentUser()).thenReturn(currentUser);
  }

  private String baseUrl() {
    return "/api/schools/" + schoolId + "/access-requests";
  }

  private String requestUrl(UUID id) {
    return baseUrl() + "/" + id;
  }

  @Nested
  class Create {

    @Test
    @WithMockCurrentUser
    void authenticatedUserCanCreateRequest() throws Exception {
      AccessRequestResponse response = createResponse(AccessRequestStatus.PENDING);
      when(accessRequestService.create(eq(schoolId), any())).thenReturn(response);

      CreateAccessRequestRequest request =
          new CreateAccessRequestRequest(SchoolRole.PLANNER, "I want to help");

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.userId").value(userId.toString()))
          .andExpect(jsonPath("$.status").value("PENDING"))
          .andExpect(jsonPath("$.requestedRole").value("PLANNER"));
    }

    @Test
    void unauthenticatedUserCannotCreateRequest() throws Exception {
      CreateAccessRequestRequest request = new CreateAccessRequestRequest(null, null);

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isForbidden());
    }

    @Test
    @WithMockCurrentUser
    void createRequestToNonExistentSchoolReturns404() throws Exception {
      when(accessRequestService.create(eq(schoolId), any()))
          .thenThrow(new EntityNotFoundException("School", schoolId));

      CreateAccessRequestRequest request = new CreateAccessRequestRequest(null, null);

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isNotFound());
    }

    @Test
    @WithMockCurrentUser
    void createRequestWhenAlreadyMemberReturns403() throws Exception {
      when(accessRequestService.create(eq(schoolId), any()))
          .thenThrow(new ForbiddenOperationException("You already have access to this school"));

      CreateAccessRequestRequest request = new CreateAccessRequestRequest(null, null);

      mockMvc
          .perform(
              post(baseUrl())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isForbidden());
    }
  }

  @Nested
  class FindAll {

    @Test
    @WithMockCurrentUser(schoolRoles = {"00000000-0000-0000-0000-000000000000:SCHOOL_ADMIN"})
    void schoolAdminCanListRequests() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(true);

      List<AccessRequestSummary> summaries =
          List.of(
              new AccessRequestSummary(
                  requestId,
                  userId,
                  "Test User",
                  "user@example.com",
                  SchoolRole.PLANNER,
                  AccessRequestStatus.PENDING,
                  "My message",
                  Instant.now()));
      when(accessRequestService.findAllBySchool(eq(schoolId), any())).thenReturn(summaries);

      mockMvc
          .perform(get(baseUrl()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$").isArray())
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$[0].status").value("PENDING"));
    }

    @Test
    @WithMockCurrentUser
    void nonAdminCannotListRequests() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(false);

      mockMvc.perform(get(baseUrl())).andExpect(status().isForbidden());
    }

    @Test
    @WithMockCurrentUser(schoolRoles = {"00000000-0000-0000-0000-000000000000:SCHOOL_ADMIN"})
    void canFilterByStatus() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(true);
      when(accessRequestService.findAllBySchool(schoolId, AccessRequestStatus.REJECTED))
          .thenReturn(List.of());

      mockMvc
          .perform(get(baseUrl()).param("status", "REJECTED"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$").isArray())
          .andExpect(jsonPath("$.length()").value(0));
    }
  }

  @Nested
  class FindById {

    @Test
    @WithMockCurrentUser(schoolRoles = {"00000000-0000-0000-0000-000000000000:SCHOOL_ADMIN"})
    void schoolAdminCanGetRequestById() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(true);

      AccessRequestResponse response = createResponse(AccessRequestStatus.PENDING);
      when(accessRequestService.findById(schoolId, requestId)).thenReturn(response);

      mockMvc
          .perform(get(requestUrl(requestId)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.id").value(requestId.toString()));
    }

    @Test
    @WithMockCurrentUser
    void nonAdminCannotGetRequestById() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(false);

      mockMvc.perform(get(requestUrl(requestId))).andExpect(status().isForbidden());
    }

    @Test
    @WithMockCurrentUser(schoolRoles = {"00000000-0000-0000-0000-000000000000:SCHOOL_ADMIN"})
    void getNonExistentRequestReturns404() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(true);
      when(accessRequestService.findById(schoolId, requestId))
          .thenThrow(new EntityNotFoundException("AccessRequest", requestId));

      mockMvc.perform(get(requestUrl(requestId))).andExpect(status().isNotFound());
    }
  }

  @Nested
  class Review {

    @Test
    @WithMockCurrentUser(schoolRoles = {"00000000-0000-0000-0000-000000000000:SCHOOL_ADMIN"})
    void schoolAdminCanApproveRequest() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(true);

      AccessRequestResponse response = createResponse(AccessRequestStatus.APPROVED);
      when(accessRequestService.review(eq(schoolId), eq(requestId), any())).thenReturn(response);

      ReviewAccessRequestRequest request =
          new ReviewAccessRequestRequest(ReviewDecision.APPROVE, "Welcome!", null);

      mockMvc
          .perform(
              put(requestUrl(requestId))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    @WithMockCurrentUser(schoolRoles = {"00000000-0000-0000-0000-000000000000:SCHOOL_ADMIN"})
    void schoolAdminCanRejectRequest() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(true);

      AccessRequestResponse response = createResponse(AccessRequestStatus.REJECTED);
      when(accessRequestService.review(eq(schoolId), eq(requestId), any())).thenReturn(response);

      ReviewAccessRequestRequest request =
          new ReviewAccessRequestRequest(ReviewDecision.REJECT, "Not now", null);

      mockMvc
          .perform(
              put(requestUrl(requestId))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("REJECTED"));
    }

    @Test
    @WithMockCurrentUser
    void nonAdminCannotReviewRequest() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(false);

      ReviewAccessRequestRequest request =
          new ReviewAccessRequestRequest(ReviewDecision.APPROVE, null, null);

      mockMvc
          .perform(
              put(requestUrl(requestId))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isForbidden());
    }

    @Test
    @WithMockCurrentUser(schoolRoles = {"00000000-0000-0000-0000-000000000000:SCHOOL_ADMIN"})
    void reviewWithNullDecisionReturns400() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(true);

      String requestBody = "{\"responseMessage\": \"test\"}";

      mockMvc
          .perform(
              put(requestUrl(requestId))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(requestBody))
          .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockCurrentUser(schoolRoles = {"00000000-0000-0000-0000-000000000000:SCHOOL_ADMIN"})
    void reviewAlreadyReviewedRequestReturns403() throws Exception {
      when(authorizationService.isSchoolAdmin(schoolId)).thenReturn(true);
      when(accessRequestService.review(eq(schoolId), eq(requestId), any()))
          .thenThrow(new ForbiddenOperationException("This request has already been reviewed"));

      ReviewAccessRequestRequest request =
          new ReviewAccessRequestRequest(ReviewDecision.APPROVE, null, null);

      mockMvc
          .perform(
              put(requestUrl(requestId))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(objectMapper.writeValueAsString(request)))
          .andExpect(status().isForbidden());
    }
  }

  private AccessRequestResponse createResponse(AccessRequestStatus status) {
    Instant now = Instant.now();
    return new AccessRequestResponse(
        requestId,
        userId,
        "Test User",
        "user@example.com",
        schoolId,
        "Test School",
        SchoolRole.PLANNER,
        status,
        "My message",
        status == AccessRequestStatus.APPROVED ? "Welcome!" : null,
        status != AccessRequestStatus.PENDING ? adminUserId : null,
        status != AccessRequestStatus.PENDING ? "Admin User" : null,
        status != AccessRequestStatus.PENDING ? now : null,
        now,
        now);
  }
}
