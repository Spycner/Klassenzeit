package com.klassenzeit.klassenzeit.security;

import com.klassenzeit.klassenzeit.user.AppUserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Filter that resolves the Keycloak JWT to an application user.
 *
 * <p>This filter runs after JWT authentication and:
 *
 * <ol>
 *   <li>Extracts user info from the JWT
 *   <li>Finds or creates an AppUser record
 *   <li>Loads school memberships
 *   <li>Replaces the authentication with CurrentUserAuthentication
 * </ol>
 */
@Component
@Profile("!test")
public class UserResolutionFilter extends OncePerRequestFilter {

  private final AppUserService appUserService;

  public UserResolutionFilter(AppUserService appUserService) {
    this.appUserService = appUserService;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {

    Authentication auth = SecurityContextHolder.getContext().getAuthentication();

    if (auth instanceof JwtAuthenticationToken jwtAuth) {
      Jwt jwt = jwtAuth.getToken();

      String keycloakId = jwt.getSubject();
      String email = jwt.getClaimAsString("email");
      String displayName = extractDisplayName(jwt);

      CurrentUser currentUser = appUserService.resolveOrCreateUser(keycloakId, email, displayName);

      // Replace authentication with enriched version
      CurrentUserAuthentication enrichedAuth = new CurrentUserAuthentication(currentUser, jwtAuth);
      SecurityContextHolder.getContext().setAuthentication(enrichedAuth);
    }

    chain.doFilter(request, response);
  }

  /** Extract display name from JWT, falling back to email if not present. */
  private String extractDisplayName(Jwt jwt) {
    // Try preferred_username first (Keycloak default)
    String result = getClaimIfPresent(jwt, "preferred_username");
    if (result != null) {
      return result;
    }

    // Try name claim
    result = getClaimIfPresent(jwt, "name");
    if (result != null) {
      return result;
    }

    // Try combining given_name and family_name
    String givenName = jwt.getClaimAsString("given_name");
    String familyName = jwt.getClaimAsString("family_name");
    if (givenName != null || familyName != null) {
      String combined =
          String.join(" ", givenName != null ? givenName : "", familyName != null ? familyName : "")
              .trim();
      if (!combined.isEmpty()) {
        return combined;
      }
    }

    // Fall back to email
    result = getClaimIfPresent(jwt, "email");
    return result != null ? result : "Unknown User";
  }

  /** Get a claim value if present and not blank. */
  private String getClaimIfPresent(Jwt jwt, String claimName) {
    String value = jwt.getClaimAsString(claimName);
    return (value != null && !value.isBlank()) ? value : null;
  }
}
