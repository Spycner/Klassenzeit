package com.klassenzeit.klassenzeit.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;

class SecurityConfigTest {

  private SecurityConfig securityConfig;

  @BeforeEach
  void setUp() {
    UserResolutionFilter mockFilter = mock(UserResolutionFilter.class);
    securityConfig = new SecurityConfig(mockFilter);
  }

  @Nested
  class JwtAuthenticationConverterBean {

    @Test
    void createsJwtAuthenticationConverter() {
      JwtAuthenticationConverter converter = securityConfig.jwtAuthenticationConverter();

      assertThat(converter).isNotNull();
    }

    @Test
    void converterUsesSubjectAsName() {
      JwtAuthenticationConverter converter = securityConfig.jwtAuthenticationConverter();

      Jwt jwt =
          Jwt.withTokenValue("token")
              .header("alg", "RS256")
              .subject("user-123")
              .claim("email", "user@example.com")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();

      Authentication auth = converter.convert(jwt);

      assertThat(auth).isNotNull();
      assertThat(auth.getName()).isEqualTo("user-123");
    }

    @Test
    void converterHandlesJwtWithVariousClaims() {
      JwtAuthenticationConverter converter = securityConfig.jwtAuthenticationConverter();

      Jwt jwt =
          Jwt.withTokenValue("token-with-many-claims")
              .header("alg", "RS256")
              .subject("keycloak-subject-id")
              .claim("email", "test@example.com")
              .claim("preferred_username", "testuser")
              .claim("name", "Test User")
              .claim("given_name", "Test")
              .claim("family_name", "User")
              .issuedAt(Instant.now())
              .expiresAt(Instant.now().plusSeconds(3600))
              .build();

      Authentication auth = converter.convert(jwt);

      assertThat(auth).isNotNull();
      // The principal claim is "sub", so it should be the keycloak subject
      assertThat(auth.getName()).isEqualTo("keycloak-subject-id");
    }
  }

  @Nested
  class ConfigurationConstruction {

    @Test
    void acceptsUserResolutionFilter() {
      UserResolutionFilter filter = mock(UserResolutionFilter.class);

      SecurityConfig config = new SecurityConfig(filter);

      assertThat(config).isNotNull();
    }
  }
}
