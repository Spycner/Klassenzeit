package com.klassenzeit.klassenzeit.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

class CurrentUserAuthenticationTest {

  private CurrentUser currentUser;
  private Jwt jwt;
  private CurrentUserAuthentication authentication;

  @BeforeEach
  void setUp() {
    currentUser =
        new CurrentUser(
            UUID.randomUUID(),
            "keycloak-123",
            "test@example.com",
            "Test User",
            false,
            Map.of(UUID.randomUUID(), SchoolRole.TEACHER));

    jwt =
        Jwt.withTokenValue("token")
            .header("alg", "RS256")
            .subject("keycloak-123")
            .claim("email", "test@example.com")
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(3600))
            .build();

    Collection<GrantedAuthority> authorities = List.of(new SimpleGrantedAuthority("ROLE_USER"));
    JwtAuthenticationToken originalAuth = mock(JwtAuthenticationToken.class);
    when(originalAuth.getToken()).thenReturn(jwt);
    when(originalAuth.getAuthorities()).thenReturn(authorities);

    authentication = new CurrentUserAuthentication(currentUser, originalAuth);
  }

  @Nested
  class GetCurrentUser {

    @Test
    void returnsTheWrappedCurrentUser() {
      assertThat(authentication.getCurrentUser()).isSameAs(currentUser);
    }
  }

  @Nested
  class GetPrincipal {

    @Test
    void returnsCurrentUser() {
      assertThat(authentication.getPrincipal()).isSameAs(currentUser);
    }

    @Test
    void overridesParentBehavior() {
      // The parent JwtAuthenticationToken normally returns the JWT subject as principal
      // Our implementation overrides to return CurrentUser
      Object principal = authentication.getPrincipal();
      assertThat(principal).isInstanceOf(CurrentUser.class);
    }
  }

  @Nested
  class GetToken {

    @Test
    void returnsTheOriginalJwt() {
      assertThat(authentication.getToken()).isSameAs(jwt);
    }
  }

  @Nested
  class GetAuthorities {

    @Test
    void returnsAuthoritiesFromOriginalAuth() {
      assertThat(authentication.getAuthorities()).hasSize(1);
      assertThat(authentication.getAuthorities())
          .extracting(GrantedAuthority::getAuthority)
          .containsExactly("ROLE_USER");
    }
  }

  @Nested
  class IsAuthenticated {

    @Test
    void returnsTrue() {
      // JwtAuthenticationToken sets authenticated=true when created with authorities
      assertThat(authentication.isAuthenticated()).isTrue();
    }
  }

  @Nested
  class GetName {

    @Test
    void returnsJwtSubject() {
      // getName() comes from JwtAuthenticationToken which returns the JWT subject
      assertThat(authentication.getName()).isEqualTo("keycloak-123");
    }
  }
}
