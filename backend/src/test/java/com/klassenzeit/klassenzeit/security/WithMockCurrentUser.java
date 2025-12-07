package com.klassenzeit.klassenzeit.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.test.context.support.WithSecurityContext;

/**
 * Annotation for tests to set up a mock CurrentUser in the security context.
 *
 * <p>Usage:
 *
 * <pre>{@code
 * @Test
 * @WithMockCurrentUser(email = "admin@school.com", schoolRoles = {"550e8400-e29b-41d4-a716-446655440000:SCHOOL_ADMIN"})
 * void adminCanCreateTeacher() { ... }
 * }</pre>
 *
 * <p>The schoolRoles format is "schoolId:ROLE" where ROLE is one of SCHOOL_ADMIN, PLANNER, TEACHER,
 * VIEWER.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@WithSecurityContext(factory = WithMockCurrentUserSecurityContextFactory.class)
public @interface WithMockCurrentUser {

  /** The user's email address. */
  String email() default "test@example.com";

  /** The user's display name. */
  String displayName() default "Test User";

  /** Whether the user is a platform admin. */
  boolean isPlatformAdmin() default false;

  /**
   * School roles in format "schoolId:ROLE".
   *
   * <p>Example: {"550e8400-e29b-41d4-a716-446655440000:SCHOOL_ADMIN",
   * "660e8400-e29b-41d4-a716-446655440001:PLANNER"}
   */
  String[] schoolRoles() default {};
}
