import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

// Initialize i18n for tests
import i18n from "@/i18n";

import { server } from "./mocks/server";

// Set default language to German for tests
i18n.changeLanguage("de");

// Disable API client retries in tests for faster execution
declare global {
  interface Window {
    __DISABLE_API_RETRIES__?: boolean;
  }
}
window.__DISABLE_API_RETRIES__ = true;

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

// Reset handlers after each test (important for test isolation)
afterEach(() => {
  server.resetHandlers();
  cleanup();
});

// Clean up after all tests
afterAll(() => server.close());
