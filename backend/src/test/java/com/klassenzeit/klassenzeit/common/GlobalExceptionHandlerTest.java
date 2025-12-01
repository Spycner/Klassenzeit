package com.klassenzeit.klassenzeit.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Tests for GlobalExceptionHandler to verify error responses don't leak sensitive information.
 *
 * <p>Uses a minimal test controller to trigger different exception types.
 */
@WebMvcTest(
    controllers = {GlobalExceptionHandlerTestController.class, GlobalExceptionHandler.class})
class GlobalExceptionHandlerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private com.klassenzeit.klassenzeit.school.SchoolService schoolService;

  @Test
  void entityNotFound_returns404WithEntityInfo() throws Exception {
    mockMvc
        .perform(get("/test/entity-not-found"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.status").value(404))
        .andExpect(jsonPath("$.error").value("Not Found"))
        .andExpect(jsonPath("$.entityType").value("TestEntity"))
        .andExpect(jsonPath("$.message").exists())
        .andExpect(jsonPath("$.timestamp").exists());
  }

  @Test
  void dataIntegrityViolation_returns409WithGenericMessage() throws Exception {
    mockMvc
        .perform(get("/test/data-integrity"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.status").value(409))
        .andExpect(jsonPath("$.error").value("Conflict"))
        .andExpect(
            jsonPath("$.message")
                .value("A data constraint was violated. The operation could not be completed."))
        // Verify no database schema details leak (SQL, specific constraint names, etc.)
        .andExpect(
            jsonPath("$.message")
                .value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("SQL"))))
        .andExpect(
            jsonPath("$.message")
                .value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("uk_"))))
        .andExpect(
            jsonPath("$.message")
                .value(
                    org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("hibernate"))));
  }

  @Test
  void illegalArgument_returns400() throws Exception {
    mockMvc
        .perform(get("/test/illegal-argument"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.status").value(400))
        .andExpect(jsonPath("$.error").value("Bad Request"))
        .andExpect(jsonPath("$.message").value("Invalid argument provided"));
  }

  @Test
  void validationError_returns400WithFieldErrors() throws Exception {
    mockMvc
        .perform(
            post("/test/validation")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\": \"\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.status").value(400))
        .andExpect(jsonPath("$.error").value("Validation Failed"))
        .andExpect(jsonPath("$.errors").exists())
        .andExpect(jsonPath("$.errors.name").exists());
  }

  @Test
  void unexpectedException_returns500WithGenericMessage() throws Exception {
    mockMvc
        .perform(get("/test/unexpected"))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.status").value(500))
        .andExpect(jsonPath("$.error").value("Internal Server Error"))
        .andExpect(
            jsonPath("$.message").value("An unexpected error occurred. Please try again later."))
        // Verify no stack trace or internal details leak
        .andExpect(
            jsonPath("$.message")
                .value(
                    org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Exception"))))
        .andExpect(
            jsonPath("$.message")
                .value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("at com."))));
  }
}
