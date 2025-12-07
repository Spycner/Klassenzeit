import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

// Initialize i18n for tests
import i18n from "@/i18n";

import { server } from "./mocks/server";

// Mock react-oidc-context for tests
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: {
      access_token: "mock-access-token",
    },
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn(),
    error: null,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock school context for tests
vi.mock("@/contexts/SchoolContext", () => ({
  useSchoolContext: () => ({
    currentSchool: {
      schoolId: "test-school-id",
      schoolName: "Test School",
      role: "TEACHER",
    },
    setCurrentSchool: vi.fn(),
    userSchools: [
      {
        schoolId: "test-school-id",
        schoolName: "Test School",
        role: "TEACHER",
      },
    ],
    isLoading: false,
  }),
  SchoolProvider: ({ children }: { children: React.ReactNode }) => children,
}));

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
