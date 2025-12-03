package com.klassenzeit.klassenzeit.security;

import java.util.Collection;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Authentication token that wraps the original JWT authentication and adds the CurrentUser.
 *
 * <p>This allows accessing the enriched user information throughout the application while
 * maintaining compatibility with Spring Security.
 */
public class CurrentUserAuthentication extends JwtAuthenticationToken {

  private final CurrentUser currentUser;

  public CurrentUserAuthentication(CurrentUser currentUser, JwtAuthenticationToken originalAuth) {
    super(originalAuth.getToken(), originalAuth.getAuthorities());
    this.currentUser = currentUser;
  }

  public CurrentUser getCurrentUser() {
    return currentUser;
  }

  @Override
  public Object getPrincipal() {
    return currentUser;
  }

  @Override
  public Collection<GrantedAuthority> getAuthorities() {
    return super.getAuthorities();
  }
}
