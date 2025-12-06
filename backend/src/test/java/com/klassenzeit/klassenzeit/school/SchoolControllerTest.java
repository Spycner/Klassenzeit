package com.klassenzeit.klassenzeit.school;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.klassenzeit.klassenzeit.common.EntityNotFoundException;
import com.klassenzeit.klassenzeit.school.dto.SchoolResponse;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(SchoolController.class)
@Import(TestSecurityConfig.class)
@ActiveProfiles("test")
class SchoolControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private SchoolService schoolService;

  @MockitoBean(name = "authz")
  private AuthorizationService authorizationService;

  private final UUID currentUserId = UUID.randomUUID();

  @BeforeEach
  void setUp() {
    CurrentUser currentUser =
        new CurrentUser(
            currentUserId, "keycloak-id", "user@example.com", "Test User", true, Map.of());
    when(authorizationService.getCurrentUser()).thenReturn(currentUser);
  }

  @Nested
  class FindByIdentifier {

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void returnsSchoolWhenFoundByUuid() throws Exception {
      UUID schoolId = UUID.randomUUID();
      SchoolResponse response = createSchoolResponse(schoolId, "Test School", "test-school");

      when(authorizationService.canAccessSchoolByIdentifier(schoolId.toString())).thenReturn(true);
      when(schoolService.findByIdentifier(schoolId.toString())).thenReturn(response);

      mockMvc
          .perform(get("/api/schools/{identifier}", schoolId))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.id").value(schoolId.toString()))
          .andExpect(jsonPath("$.name").value("Test School"))
          .andExpect(jsonPath("$.slug").value("test-school"));
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void returnsSchoolWhenFoundBySlug() throws Exception {
      UUID schoolId = UUID.randomUUID();
      String slug = "springfield-high";
      SchoolResponse response = createSchoolResponse(schoolId, "Springfield High", slug);

      when(authorizationService.canAccessSchoolByIdentifier(slug)).thenReturn(true);
      when(schoolService.findByIdentifier(slug)).thenReturn(response);

      mockMvc
          .perform(get("/api/schools/{identifier}", slug))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.id").value(schoolId.toString()))
          .andExpect(jsonPath("$.name").value("Springfield High"))
          .andExpect(jsonPath("$.slug").value(slug));
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void returns301WhenSlugHasChanged() throws Exception {
      UUID schoolId = UUID.randomUUID();
      String oldSlug = "old-slug";
      String newSlug = "new-slug";

      when(authorizationService.canAccessSchoolByIdentifier(oldSlug)).thenReturn(true);
      when(schoolService.findByIdentifier(oldSlug))
          .thenThrow(new SlugRedirectException(newSlug, schoolId));

      mockMvc
          .perform(get("/api/schools/{identifier}", oldSlug))
          .andExpect(status().isMovedPermanently())
          .andExpect(header().string("Location", "/api/schools/" + newSlug))
          .andExpect(header().string("X-Redirect-Slug", newSlug))
          .andExpect(jsonPath("$.status").value(301))
          .andExpect(jsonPath("$.newSlug").value(newSlug))
          .andExpect(jsonPath("$.redirectUrl").value("/api/schools/" + newSlug));
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = true)
    void returns404WhenSchoolNotFound() throws Exception {
      String unknownIdentifier = "unknown-school";

      when(authorizationService.canAccessSchoolByIdentifier(unknownIdentifier)).thenReturn(true);
      when(schoolService.findByIdentifier(unknownIdentifier))
          .thenThrow(new EntityNotFoundException("School", unknownIdentifier));

      mockMvc
          .perform(get("/api/schools/{identifier}", unknownIdentifier))
          .andExpect(status().isNotFound());
    }

    @Test
    @WithMockCurrentUser(isPlatformAdmin = false)
    void returns403WhenUserCannotAccessSchool() throws Exception {
      String slug = "restricted-school";

      when(authorizationService.canAccessSchoolByIdentifier(anyString())).thenReturn(false);

      mockMvc.perform(get("/api/schools/{identifier}", slug)).andExpect(status().isForbidden());
    }
  }

  private SchoolResponse createSchoolResponse(UUID id, String name, String slug) {
    return new SchoolResponse(
        id,
        name,
        slug,
        "Grundschule",
        (short) 1,
        (short) 4,
        "Europe/Berlin",
        null,
        Instant.now(),
        Instant.now());
  }
}
