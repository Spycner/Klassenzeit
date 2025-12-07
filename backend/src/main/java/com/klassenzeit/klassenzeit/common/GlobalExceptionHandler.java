package com.klassenzeit.klassenzeit.common;

import com.klassenzeit.klassenzeit.membership.ForbiddenOperationException;
import com.klassenzeit.klassenzeit.school.SlugRedirectException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Global exception handler for REST controllers. */
@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger LOG = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  private final MessageSource messageSource;

  public GlobalExceptionHandler(MessageSource messageSource) {
    this.messageSource = messageSource;
  }

  @ExceptionHandler(EntityNotFoundException.class)
  public ResponseEntity<Map<String, Object>> handleEntityNotFound(
      EntityNotFoundException ex, Locale locale) {
    Object identifier = ex.getEntityId() != null ? ex.getEntityId() : ex.getIdentifier();
    String message =
        messageSource.getMessage(
            "error.notFound", new Object[] {ex.getEntityType(), identifier}, locale);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.NOT_FOUND.value());
    body.put("error", "Not Found");
    body.put("message", message);
    body.put("entityType", ex.getEntityType());
    if (ex.getEntityId() != null) {
      body.put("entityId", ex.getEntityId());
    }
    if (ex.getIdentifier() != null) {
      body.put("identifier", ex.getIdentifier());
    }
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
  }

  @ExceptionHandler(SlugRedirectException.class)
  public ResponseEntity<Map<String, Object>> handleSlugRedirect(SlugRedirectException ex) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.MOVED_PERMANENTLY.value());
    body.put("newSlug", ex.getNewSlug());
    body.put("redirectUrl", "/api/schools/" + ex.getNewSlug());

    return ResponseEntity.status(HttpStatus.MOVED_PERMANENTLY)
        .header("Location", "/api/schools/" + ex.getNewSlug())
        .header("X-Redirect-Slug", ex.getNewSlug())
        .body(body);
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<Map<String, Object>> handleDataIntegrityViolation(
      DataIntegrityViolationException ex, Locale locale) {
    // Log the full error for debugging, but don't expose to client
    LOG.error("Data integrity violation", ex);

    String message = messageSource.getMessage("error.dataIntegrity", null, locale);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.CONFLICT.value());
    body.put("error", messageSource.getMessage("error.conflict", null, locale));
    body.put("message", message);
    return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
  }

  @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
  public ResponseEntity<Map<String, Object>> handleOptimisticLockingFailure(
      ObjectOptimisticLockingFailureException ex, Locale locale) {
    LOG.warn("Optimistic locking failure: {}", ex.getMessage());

    String message = messageSource.getMessage("error.optimisticLocking", null, locale);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.CONFLICT.value());
    body.put("error", messageSource.getMessage("error.conflict", null, locale));
    body.put("message", message);
    return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Map<String, Object>> handleIllegalArgument(
      IllegalArgumentException ex, Locale locale) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.BAD_REQUEST.value());
    body.put("error", messageSource.getMessage("error.badRequest", null, locale));
    body.put("message", ex.getMessage());
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
  }

  @ExceptionHandler(IllegalStateException.class)
  public ResponseEntity<Map<String, Object>> handleIllegalState(
      IllegalStateException ex, Locale locale) {
    // Distinguish between conflict (already running) and bad request (no solution)
    String message = ex.getMessage();
    boolean isConflict =
        message != null
            && (message.contains("already running") || message.contains("still running"));

    HttpStatus status = isConflict ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
    String errorKey = isConflict ? "error.conflict" : "error.badRequest";

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", status.value());
    body.put("error", messageSource.getMessage(errorKey, null, locale));
    body.put("message", message);
    return ResponseEntity.status(status).body(body);
  }

  @ExceptionHandler(ForbiddenOperationException.class)
  public ResponseEntity<Map<String, Object>> handleForbiddenOperation(
      ForbiddenOperationException ex, Locale locale) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.FORBIDDEN.value());
    body.put("error", messageSource.getMessage("error.forbidden", null, locale));
    body.put("message", ex.getMessage());
    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
  }

  @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class})
  public ResponseEntity<Map<String, Object>> handleAccessDenied(Exception ex, Locale locale) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.FORBIDDEN.value());
    body.put("error", messageSource.getMessage("error.forbidden", null, locale));
    body.put("message", messageSource.getMessage("error.accessDenied", null, locale));
    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Map<String, Object>> handleValidationErrors(
      MethodArgumentNotValidException ex, Locale locale) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.BAD_REQUEST.value());
    body.put("error", messageSource.getMessage("error.validationFailed", null, locale));

    Map<String, String> fieldErrors = new LinkedHashMap<>();
    ex.getBindingResult()
        .getFieldErrors()
        .forEach(error -> fieldErrors.put(error.getField(), error.getDefaultMessage()));
    body.put("errors", fieldErrors);

    return ResponseEntity.badRequest().body(body);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleUnexpectedException(
      Exception ex, Locale locale) {
    // Log the full error for debugging, but don't expose details to client
    LOG.error(
        "Unexpected error occurred: type={}, message={}",
        ex.getClass().getName(),
        ex.getMessage(),
        ex);

    String message = messageSource.getMessage("error.unexpected", null, locale);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("timestamp", Instant.now());
    body.put("status", HttpStatus.INTERNAL_SERVER_ERROR.value());
    body.put("error", messageSource.getMessage("error.internalServer", null, locale));
    body.put("message", message);
    // Include exception type for debugging in non-production environments
    body.put("exceptionType", ex.getClass().getSimpleName());
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
  }
}
