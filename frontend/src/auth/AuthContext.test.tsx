/**
 * Tests for useAuth hook
 *
 * The useAuth hook wraps react-oidc-context's useAuth hook and provides
 * a simplified API for components to access authentication state.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// We need to test the hook with different mock states, so we'll mock
// react-oidc-context directly in each test
const mockSigninRedirect = vi.fn();
const mockSignoutRedirect = vi.fn();

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache to allow fresh mocks
    vi.resetModules();
  });

  it("should return isAuthenticated: true when OIDC reports authenticated", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: { access_token: "test-token" },
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
  });

  it("should return isAuthenticated: false when not authenticated", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
  });

  it("should return isLoading: true during auth initialization", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: false,
        isLoading: true,
        user: null,
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(true);
  });

  it("should return accessToken from OIDC user object", async () => {
    const testToken = "test-access-token-123";
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: { access_token: testToken },
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.accessToken).toBe(testToken);
  });

  it("should return null for accessToken when no user", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.accessToken).toBeNull();
  });

  it("should return null for accessToken when user has no access_token", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: {}, // User exists but no access_token
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.accessToken).toBeNull();
  });

  it("should call signinRedirect when login() is called", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    result.current.login();

    expect(mockSigninRedirect).toHaveBeenCalledTimes(1);
  });

  it("should call signoutRedirect with correct URI when logout() is called", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: { access_token: "test-token" },
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    result.current.logout();

    expect(mockSignoutRedirect).toHaveBeenCalledTimes(1);
    expect(mockSignoutRedirect).toHaveBeenCalledWith({
      post_logout_redirect_uri: window.location.origin,
    });
  });

  it("should return error from OIDC context", async () => {
    const testError = new Error("Auth failed");
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: testError,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.error).toBe(testError);
  });

  it("should return null for error when no error exists", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: { access_token: "test-token" },
        error: null,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.error).toBeNull();
  });

  it("should return null for error when error is undefined", async () => {
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: { access_token: "test-token" },
        error: undefined,
        signinRedirect: mockSigninRedirect,
        signoutRedirect: mockSignoutRedirect,
      }),
    }));

    const { useAuth } = await import("./AuthContext");
    const { result } = renderHook(() => useAuth());

    expect(result.current.error).toBeNull();
  });
});
