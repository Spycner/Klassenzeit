package com.klassenzeit.klassenzeit.security;

import java.util.Collection;
import java.util.Collections;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

/**
 * Mock authentication token for tests that contains a CurrentUser without requiring a real JWT.
 *
 * <p>This is used by {@link WithMockCurrentUser} to set up the security context in tests.
 */
@SuppressWarnings({
  "PMD.NonSerializableClass", // Test class, serialization not needed
  "PMD.CallSuperInConstructor", // AbstractAuthenticationToken handles this
  "PMD.ConstructorCallsOverridableMethod" // Safe in test context, setAuthenticated is final
})
public class MockCurrentUserAuthentication extends AbstractAuthenticationToken {

  private final CurrentUser currentUser;

  public MockCurrentUserAuthentication(CurrentUser currentUser) {
    super(Collections.emptyList());
    this.currentUser = currentUser;
    setAuthenticated(true);
  }

  public MockCurrentUserAuthentication(
      CurrentUser currentUser, Collection<? extends GrantedAuthority> authorities) {
    super(authorities);
    this.currentUser = currentUser;
    setAuthenticated(true);
  }

  public CurrentUser getCurrentUser() {
    return currentUser;
  }

  @Override
  public Object getCredentials() {
    return null;
  }

  @Override
  public Object getPrincipal() {
    return currentUser;
  }
}
