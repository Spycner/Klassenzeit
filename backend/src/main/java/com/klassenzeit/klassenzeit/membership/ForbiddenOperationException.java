package com.klassenzeit.klassenzeit.membership;

/**
 * Exception thrown when a business rule prevents an operation.
 *
 * <p>Examples:
 *
 * <ul>
 *   <li>Cannot remove last school admin
 *   <li>User already has membership in school
 * </ul>
 */
public class ForbiddenOperationException extends RuntimeException {

  public ForbiddenOperationException(String message) {
    super(message);
  }
}
