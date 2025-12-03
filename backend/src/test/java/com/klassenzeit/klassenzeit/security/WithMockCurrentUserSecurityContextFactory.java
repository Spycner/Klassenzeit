package com.klassenzeit.klassenzeit.security;

import com.klassenzeit.klassenzeit.membership.SchoolRole;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.test.context.support.WithSecurityContextFactory;

/**
 * Factory that creates a SecurityContext from a {@link WithMockCurrentUser} annotation.
 *
 * <p>Parses the annotation values and creates a {@link CurrentUser} record with the specified
 * properties, then wraps it in a {@link MockCurrentUserAuthentication} and sets it in the security
 * context.
 */
public class WithMockCurrentUserSecurityContextFactory
    implements WithSecurityContextFactory<WithMockCurrentUser> {

  @Override
  public SecurityContext createSecurityContext(WithMockCurrentUser annotation) {
    SecurityContext context = SecurityContextHolder.createEmptyContext();

    Map<UUID, SchoolRole> schoolRoles = parseSchoolRoles(annotation.schoolRoles());

    CurrentUser currentUser =
        new CurrentUser(
            UUID.randomUUID(), // Generate a random user ID for tests
            "keycloak-" + UUID.randomUUID(), // Generate a random keycloak ID
            annotation.email(),
            annotation.displayName(),
            annotation.isPlatformAdmin(),
            schoolRoles);

    MockCurrentUserAuthentication authentication = new MockCurrentUserAuthentication(currentUser);
    context.setAuthentication(authentication);

    return context;
  }

  private Map<UUID, SchoolRole> parseSchoolRoles(String[] schoolRoles) {
    Map<UUID, SchoolRole> roles = new HashMap<>();
    for (String roleSpec : schoolRoles) {
      String[] parts = roleSpec.split(":");
      if (parts.length != 2) {
        throw new IllegalArgumentException(
            "Invalid school role format. Expected 'schoolId:ROLE', got: " + roleSpec);
      }
      UUID schoolId = UUID.fromString(parts[0]);
      SchoolRole role = SchoolRole.valueOf(parts[1]);
      roles.put(schoolId, role);
    }
    return roles;
  }
}
