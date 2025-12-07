package com.klassenzeit.klassenzeit.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.klassenzeit.klassenzeit.AbstractIntegrationTest;
import com.klassenzeit.klassenzeit.security.WithMockCurrentUser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/** Integration tests for CORS configuration. */
@AutoConfigureMockMvc
class CorsIntegrationTest extends AbstractIntegrationTest {

  @Autowired private MockMvc mockMvc;

  private static final String ALLOWED_ORIGIN = "http://localhost:3000";
  private static final String DISALLOWED_ORIGIN = "http://malicious-site.com";

  @Test
  void preflightRequest_fromAllowedOrigin_returnsCorrectHeaders() throws Exception {
    mockMvc
        .perform(
            options("/api/schools")
                .header("Origin", ALLOWED_ORIGIN)
                .header("Access-Control-Request-Method", "GET"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN))
        .andExpect(header().exists("Access-Control-Allow-Methods"))
        .andExpect(header().exists("Access-Control-Max-Age"));
  }

  @Test
  void preflightRequest_withPostMethod_isAllowed() throws Exception {
    mockMvc
        .perform(
            options("/api/schools")
                .header("Origin", ALLOWED_ORIGIN)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "Content-Type"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN));
  }

  @Test
  @WithMockCurrentUser(isPlatformAdmin = true)
  void actualRequest_fromAllowedOrigin_includesCorsHeaders() throws Exception {
    mockMvc
        .perform(get("/api/schools").header("Origin", ALLOWED_ORIGIN))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN))
        .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
  }

  @Test
  @WithMockCurrentUser(isPlatformAdmin = true)
  void request_fromViteDevServer_isAllowed() throws Exception {
    String viteOrigin = "http://localhost:5173";
    mockMvc
        .perform(get("/api/schools").header("Origin", viteOrigin))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", viteOrigin));
  }

  @Test
  @WithMockCurrentUser(isPlatformAdmin = true)
  void request_fromDisallowedOrigin_isRejected() throws Exception {
    mockMvc
        .perform(get("/api/schools").header("Origin", DISALLOWED_ORIGIN))
        .andExpect(status().isForbidden())
        .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
  }
}
