package com.klassenzeit.klassenzeit.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import com.klassenzeit.klassenzeit.user.AppUserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

@ExtendWith(MockitoExtension.class)
class UserResolutionFilterTest {

  @Mock private AppUserService appUserService;
  @Mock private HttpServletRequest request;
  @Mock private HttpServletResponse response;
  @Mock private FilterChain filterChain;

  private UserResolutionFilter filter;

  @BeforeEach
  void setUp() {
    filter = new UserResolutionFilter(appUserService);
    SecurityContextHolder.clearContext();
  }

  @AfterEach
  void tearDown() {
    SecurityContextHolder.clearContext();
  }

  @Nested
  class DoFilterInternal {

    @Test
    void withJwtToken_resolvesUserAndSetsAuthentication() throws Exception {
      // Given
      Jwt jwt = createJwt("keycloak-123", "user@example.com", "preferred_username", "Test User");
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser expectedUser =
          new CurrentUser(
              UUID.randomUUID(), "keycloak-123", "user@example.com", "Test User", false, Map.of());
      when(appUserService.resolveOrCreateUser("keycloak-123", "user@example.com", "Test User"))
          .thenReturn(expectedUser);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/schools");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService).resolveOrCreateUser("keycloak-123", "user@example.com", "Test User");
      verify(filterChain).doFilter(request, response);

      Authentication auth = SecurityContextHolder.getContext().getAuthentication();
      assertThat(auth).isInstanceOf(CurrentUserAuthentication.class);
      CurrentUserAuthentication cua = (CurrentUserAuthentication) auth;
      assertThat(cua.getCurrentUser()).isSameAs(expectedUser);
    }

    @Test
    void withoutAuthentication_continuesFilterChainWithoutModification() throws Exception {
      // Given - no authentication set
      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/schools");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService, never()).resolveOrCreateUser(any(), any(), any());
      verify(filterChain).doFilter(request, response);
      assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void withNonJwtAuthentication_continuesFilterChainWithoutModification() throws Exception {
      // Given - different authentication type
      Authentication mockAuth = mock(Authentication.class);
      SecurityContextHolder.getContext().setAuthentication(mockAuth);
      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/schools");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService, never()).resolveOrCreateUser(any(), any(), any());
      verify(filterChain).doFilter(request, response);
    }

    @Test
    void withUserWithSchoolRoles_setsCorrectMemberships() throws Exception {
      // Given
      Jwt jwt = createJwt("keycloak-456", "admin@school.com", "preferred_username", "Admin User");
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      UUID schoolId = UUID.randomUUID();
      CurrentUser adminUser =
          new CurrentUser(
              UUID.randomUUID(),
              "keycloak-456",
              "admin@school.com",
              "Admin User",
              false,
              Map.of(schoolId, SchoolRole.SCHOOL_ADMIN));
      when(appUserService.resolveOrCreateUser("keycloak-456", "admin@school.com", "Admin User"))
          .thenReturn(adminUser);

      when(request.getMethod()).thenReturn("POST");
      when(request.getRequestURI()).thenReturn("/api/schools/" + schoolId + "/teachers");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      CurrentUserAuthentication auth =
          (CurrentUserAuthentication) SecurityContextHolder.getContext().getAuthentication();
      assertThat(auth.getCurrentUser().schoolRoles()).containsKey(schoolId);
      assertThat(auth.getCurrentUser().schoolRoles().get(schoolId))
          .isEqualTo(SchoolRole.SCHOOL_ADMIN);
    }
  }

  @Nested
  class ExtractDisplayName {

    @Test
    void withPreferredUsername_usesPreferredUsername() throws Exception {
      // Given
      Jwt jwt = createJwt("kc-id", "test@example.com", "preferred_username", "PreferredName");
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser user = createCurrentUser("PreferredName");
      when(appUserService.resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), any()))
          .thenReturn(user);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService)
          .resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), eq("PreferredName"));
    }

    @Test
    void withoutPreferredUsername_usesNameClaim() throws Exception {
      // Given
      Jwt jwt =
          Jwt.withTokenValue("token")
              .header("alg", "RS256")
              .subject("kc-id")
              .claim("email", "test@example.com")
              .claim("name", "Full Name")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser user = createCurrentUser("Full Name");
      when(appUserService.resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), any()))
          .thenReturn(user);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService)
          .resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), eq("Full Name"));
    }

    @Test
    void withGivenAndFamilyName_combinesThem() throws Exception {
      // Given
      Jwt jwt =
          Jwt.withTokenValue("token")
              .header("alg", "RS256")
              .subject("kc-id")
              .claim("email", "test@example.com")
              .claim("given_name", "John")
              .claim("family_name", "Doe")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser user = createCurrentUser("John Doe");
      when(appUserService.resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), any()))
          .thenReturn(user);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService)
          .resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), eq("John Doe"));
    }

    @Test
    void withOnlyGivenName_usesGivenName() throws Exception {
      // Given
      Jwt jwt =
          Jwt.withTokenValue("token")
              .header("alg", "RS256")
              .subject("kc-id")
              .claim("email", "test@example.com")
              .claim("given_name", "John")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser user = createCurrentUser("John");
      when(appUserService.resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), any()))
          .thenReturn(user);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService).resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), eq("John"));
    }

    @Test
    void withNoNameClaims_fallsBackToEmail() throws Exception {
      // Given
      Jwt jwt =
          Jwt.withTokenValue("token")
              .header("alg", "RS256")
              .subject("kc-id")
              .claim("email", "user@example.com")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser user = createCurrentUser("user@example.com");
      when(appUserService.resolveOrCreateUser(eq("kc-id"), eq("user@example.com"), any()))
          .thenReturn(user);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService)
          .resolveOrCreateUser(eq("kc-id"), eq("user@example.com"), eq("user@example.com"));
    }

    @Test
    void withNoClaims_usesUnknownUser() throws Exception {
      // Given
      Jwt jwt =
          Jwt.withTokenValue("token")
              .header("alg", "RS256")
              .subject("kc-id")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser user = createCurrentUser("Unknown User");
      when(appUserService.resolveOrCreateUser(eq("kc-id"), any(), any())).thenReturn(user);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService).resolveOrCreateUser(eq("kc-id"), eq(null), eq("Unknown User"));
    }

    @Test
    void withBlankPreferredUsername_fallsBackToNextOption() throws Exception {
      // Given
      Jwt jwt =
          Jwt.withTokenValue("token")
              .header("alg", "RS256")
              .subject("kc-id")
              .claim("email", "test@example.com")
              .claim("preferred_username", "   ") // blank
              .claim("name", "Real Name")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser user = createCurrentUser("Real Name");
      when(appUserService.resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), any()))
          .thenReturn(user);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(appUserService)
          .resolveOrCreateUser(eq("kc-id"), eq("test@example.com"), eq("Real Name"));
    }
  }

  @Nested
  class FilterChainContinues {

    @Test
    void alwaysContinuesFilterChain() throws Exception {
      // Given - JWT auth
      Jwt jwt = createJwt("kc-id", "test@example.com", "preferred_username", "Test");
      JwtAuthenticationToken jwtAuth = new JwtAuthenticationToken(jwt);
      SecurityContextHolder.getContext().setAuthentication(jwtAuth);

      CurrentUser user = createCurrentUser("Test");
      when(appUserService.resolveOrCreateUser(any(), any(), any())).thenReturn(user);

      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(filterChain).doFilter(request, response);
    }

    @Test
    void continuesEvenWithNoAuth() throws Exception {
      // Given - no auth
      when(request.getMethod()).thenReturn("GET");
      when(request.getRequestURI()).thenReturn("/api/test");

      // When
      filter.doFilterInternal(request, response, filterChain);

      // Then
      verify(filterChain).doFilter(request, response);
    }
  }

  private Jwt createJwt(String subject, String email, String displayNameClaim, String displayName) {
    return Jwt.withTokenValue("token")
        .header("alg", "RS256")
        .subject(subject)
        .claim("email", email)
        .claim(displayNameClaim, displayName)
        .issuedAt(Instant.now())
        .expiresAt(Instant.now().plusSeconds(3600))
        .build();
  }

  private CurrentUser createCurrentUser(String displayName) {
    return new CurrentUser(
        UUID.randomUUID(), "kc-id", "test@example.com", displayName, false, Map.of());
  }
}
