/**
 * Tests for CallbackPage component
 *
 * The CallbackPage handles OIDC callback after authentication.
 * It redirects to the stored returnTo URL or dashboard on success,
 * and redirects to home on error.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock react-oidc-context
const mockUseOidcAuth = vi.fn();
vi.mock("react-oidc-context", () => ({
  useAuth: () => mockUseOidcAuth(),
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string) => defaultValue,
    i18n: { language: "en" },
  }),
}));

import { CallbackPage } from "./CallbackPage";

describe("CallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("should show loading message while auth is loading", () => {
    mockUseOidcAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      error: null,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Signing in...")).toBeInTheDocument();
  });

  it("should redirect to stored returnTo URL on successful auth", async () => {
    sessionStorage.setItem("returnTo", "/en/teachers?page=2");

    mockUseOidcAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/en/teachers?page=2", {
        replace: true,
      });
    });
  });

  it("should redirect to dashboard when no returnTo stored", async () => {
    // No returnTo in sessionStorage

    mockUseOidcAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/en/dashboard", {
        replace: true,
      });
    });
  });

  it("should clear returnTo from sessionStorage after use", async () => {
    sessionStorage.setItem("returnTo", "/en/dashboard");

    mockUseOidcAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });

    expect(sessionStorage.getItem("returnTo")).toBeNull();
  });

  it("should redirect to home on auth error", async () => {
    const testError = new Error("Authentication failed");

    mockUseOidcAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: testError,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/en", { replace: true });
    });
  });

  it("should log error to console on auth error", async () => {
    const testError = new Error("Auth callback failed");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockUseOidcAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: testError,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Auth callback error:",
        testError,
      );
    });

    consoleSpy.mockRestore();
  });

  it("should not navigate while still loading", () => {
    mockUseOidcAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      error: null,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should not navigate when loading and authenticated", () => {
    // Edge case: loading flag still true even if authenticated
    mockUseOidcAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: true,
      error: null,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should use current language in dashboard redirect", async () => {
    // Mock returns 'en' for i18n.language
    mockUseOidcAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/en/dashboard", {
        replace: true,
      });
    });
  });

  it("should use current language in error redirect", async () => {
    mockUseOidcAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: new Error("Failed"),
    });

    render(
      <MemoryRouter>
        <CallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/en", { replace: true });
    });
  });
});
