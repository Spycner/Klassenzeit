package com.klassenzeit.klassenzeit.common;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Test controller for GlobalExceptionHandler tests. */
@RestController
@RequestMapping("/test")
class GlobalExceptionHandlerTestController {

  @GetMapping("/entity-not-found")
  public void entityNotFound() {
    throw new EntityNotFoundException("TestEntity", UUID.randomUUID());
  }

  @GetMapping("/data-integrity")
  public void dataIntegrity() {
    throw new DataIntegrityViolationException(
        "could not execute statement; SQL [n/a]; constraint [uk_teacher_email]; "
            + "nested exception is org.hibernate.exception.ConstraintViolationException");
  }

  @GetMapping("/illegal-argument")
  public void illegalArgument() {
    throw new IllegalArgumentException("Invalid argument provided");
  }

  @PostMapping("/validation")
  public void validation(@Valid @RequestBody TestRequest request) {
    // Will throw MethodArgumentNotValidException if validation fails
  }

  @GetMapping("/unexpected")
  public void unexpected() {
    throw new UnexpectedTestException("Something went terribly wrong with internal details");
  }

  record TestRequest(@NotBlank String name) {}

  /** Custom exception for testing unexpected error handling. */
  static class UnexpectedTestException extends RuntimeException {
    UnexpectedTestException(String message) {
      super(message);
    }
  }
}
