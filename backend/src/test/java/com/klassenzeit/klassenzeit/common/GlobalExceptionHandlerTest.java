package com.klassenzeit.klassenzeit.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.klassenzeit.klassenzeit.security.TestSecurityConfig;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Tests for GlobalExceptionHandler to verify error responses don't leak sensitive information and
 * are properly localized.
 *
 * <p>Uses a minimal test controller to trigger different exception types.
 */
@WebMvcTest(
    controllers = {GlobalExceptionHandlerTestController.class, GlobalExceptionHandler.class})
@Import({I18nConfig.class, TestSecurityConfig.class})
@ActiveProfiles("test")
class GlobalExceptionHandlerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private com.klassenzeit.klassenzeit.school.SchoolService schoolService;

  @Nested
  class WithDefaultLocale {

    @Test
    void entityNotFound_returns404WithGermanMessage() throws Exception {
      mockMvc
          .perform(get("/test/entity-not-found"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.status").value(404))
          .andExpect(jsonPath("$.error").value("Not Found"))
          .andExpect(jsonPath("$.entityType").value("TestEntity"))
          .andExpect(jsonPath("$.message").value(Matchers.containsString("nicht gefunden")))
          .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void dataIntegrityViolation_returns409WithGermanMessage() throws Exception {
      mockMvc
          .perform(get("/test/data-integrity"))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.status").value(409))
          .andExpect(jsonPath("$.error").value("Konflikt"))
          .andExpect(
              jsonPath("$.message")
                  .value(Matchers.containsString("Datenbeschränkung wurde verletzt")))
          // Verify no database schema details leak
          .andExpect(jsonPath("$.message").value(Matchers.not(Matchers.containsString("SQL"))))
          .andExpect(jsonPath("$.message").value(Matchers.not(Matchers.containsString("uk_"))))
          .andExpect(
              jsonPath("$.message").value(Matchers.not(Matchers.containsString("hibernate"))));
    }

    @Test
    void illegalArgument_returns400WithGermanError() throws Exception {
      mockMvc
          .perform(get("/test/illegal-argument"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.status").value(400))
          .andExpect(jsonPath("$.error").value("Ungültige Anfrage"))
          .andExpect(jsonPath("$.message").value("Invalid argument provided"));
    }

    @Test
    void validationError_returns400WithGermanError() throws Exception {
      mockMvc
          .perform(
              post("/test/validation")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"name\": \"\"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.status").value(400))
          .andExpect(jsonPath("$.error").value("Validierung fehlgeschlagen"))
          .andExpect(jsonPath("$.errors").exists())
          .andExpect(jsonPath("$.errors.name").exists());
    }

    @Test
    void unexpectedException_returns500WithGermanMessage() throws Exception {
      mockMvc
          .perform(get("/test/unexpected"))
          .andExpect(status().isInternalServerError())
          .andExpect(jsonPath("$.status").value(500))
          .andExpect(jsonPath("$.error").value("Interner Serverfehler"))
          .andExpect(jsonPath("$.message").value(Matchers.containsString("unerwarteter Fehler")))
          // Verify no stack trace or internal details leak
          .andExpect(
              jsonPath("$.message").value(Matchers.not(Matchers.containsString("Exception"))))
          .andExpect(jsonPath("$.message").value(Matchers.not(Matchers.containsString("at com."))));
    }
  }

  @Nested
  class WithEnglishLocale {

    @Test
    void entityNotFound_returns404WithEnglishMessage() throws Exception {
      mockMvc
          .perform(get("/test/entity-not-found").header("Accept-Language", "en"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.status").value(404))
          .andExpect(jsonPath("$.error").value("Not Found"))
          .andExpect(jsonPath("$.entityType").value("TestEntity"))
          .andExpect(jsonPath("$.message").value(Matchers.containsString("not found with id")))
          .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void dataIntegrityViolation_returns409WithEnglishMessage() throws Exception {
      mockMvc
          .perform(get("/test/data-integrity").header("Accept-Language", "en"))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.status").value(409))
          .andExpect(jsonPath("$.error").value("Conflict"))
          .andExpect(
              jsonPath("$.message")
                  .value("A data constraint was violated. The operation could not be completed."))
          // Verify no database schema details leak
          .andExpect(jsonPath("$.message").value(Matchers.not(Matchers.containsString("SQL"))))
          .andExpect(jsonPath("$.message").value(Matchers.not(Matchers.containsString("uk_"))))
          .andExpect(
              jsonPath("$.message").value(Matchers.not(Matchers.containsString("hibernate"))));
    }

    @Test
    void illegalArgument_returns400WithEnglishError() throws Exception {
      mockMvc
          .perform(get("/test/illegal-argument").header("Accept-Language", "en"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.status").value(400))
          .andExpect(jsonPath("$.error").value("Bad Request"))
          .andExpect(jsonPath("$.message").value("Invalid argument provided"));
    }

    @Test
    void validationError_returns400WithEnglishError() throws Exception {
      mockMvc
          .perform(
              post("/test/validation")
                  .header("Accept-Language", "en")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"name\": \"\"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.status").value(400))
          .andExpect(jsonPath("$.error").value("Validation Failed"))
          .andExpect(jsonPath("$.errors").exists())
          .andExpect(jsonPath("$.errors.name").exists());
    }

    @Test
    void unexpectedException_returns500WithEnglishMessage() throws Exception {
      mockMvc
          .perform(get("/test/unexpected").header("Accept-Language", "en"))
          .andExpect(status().isInternalServerError())
          .andExpect(jsonPath("$.status").value(500))
          .andExpect(jsonPath("$.error").value("Internal Server Error"))
          .andExpect(
              jsonPath("$.message").value("An unexpected error occurred. Please try again later."))
          // Verify no stack trace or internal details leak
          .andExpect(
              jsonPath("$.message").value(Matchers.not(Matchers.containsString("Exception"))))
          .andExpect(jsonPath("$.message").value(Matchers.not(Matchers.containsString("at com."))));
    }
  }
}
