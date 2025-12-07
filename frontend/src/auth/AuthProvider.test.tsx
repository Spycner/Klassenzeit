/**
 * Tests for AuthProvider component
 *
 * The AuthProvider wraps the app with OIDC authentication and syncs
 * the access token to the API client via setTokenGetter.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock setTokenGetter from API client
const mockSetTokenGetter = vi.fn();
vi.mock("@/api/client", () => ({
  setTokenGetter: (getter: () => string | null) => mockSetTokenGetter(getter),
}));

// Mock react-oidc-context
const mockUseOidcAuth = vi.fn();
vi.mock("react-oidc-context", () => ({
  useAuth: () => mockUseOidcAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="oidc-provider">{children}</div>
  ),
}));

import { AuthProvider } from "./AuthProvider";

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOidcAuth.mockReturnValue({
      user: { access_token: "test-token" },
    });
  });

  it("should render children correctly", () => {
    render(
      <AuthProvider>
        <div data-testid="child-content">Child Content</div>
      </AuthProvider>,
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Child Content")).toBeInTheDocument();
  });

  it("should wrap children with OIDC provider", () => {
    render(
      <AuthProvider>
        <div>Child Content</div>
      </AuthProvider>,
    );

    expect(screen.getByTestId("oidc-provider")).toBeInTheDocument();
  });

  it("should call setTokenGetter during render", () => {
    render(
      <AuthProvider>
        <div>Child Content</div>
      </AuthProvider>,
    );

    expect(mockSetTokenGetter).toHaveBeenCalled();
  });

  it("should pass a getter function that returns the access token", () => {
    mockUseOidcAuth.mockReturnValue({
      user: { access_token: "my-access-token" },
    });

    render(
      <AuthProvider>
        <div>Child Content</div>
      </AuthProvider>,
    );

    // Get the getter function that was passed to setTokenGetter
    const tokenGetter = mockSetTokenGetter.mock.calls[0][0];

    // Call the getter and verify it returns the token
    expect(tokenGetter()).toBe("my-access-token");
  });

  it("should return null from getter when no user", () => {
    mockUseOidcAuth.mockReturnValue({
      user: null,
    });

    render(
      <AuthProvider>
        <div>Child Content</div>
      </AuthProvider>,
    );

    const tokenGetter = mockSetTokenGetter.mock.calls[0][0];
    expect(tokenGetter()).toBeNull();
  });

  it("should return null from getter when user has no access_token", () => {
    mockUseOidcAuth.mockReturnValue({
      user: {}, // User exists but no access_token
    });

    render(
      <AuthProvider>
        <div>Child Content</div>
      </AuthProvider>,
    );

    const tokenGetter = mockSetTokenGetter.mock.calls[0][0];
    expect(tokenGetter()).toBeNull();
  });

  it("should render multiple children", () => {
    render(
      <AuthProvider>
        <div data-testid="child-1">First Child</div>
        <div data-testid="child-2">Second Child</div>
      </AuthProvider>,
    );

    expect(screen.getByTestId("child-1")).toBeInTheDocument();
    expect(screen.getByTestId("child-2")).toBeInTheDocument();
  });

  it("should update token getter on each render", () => {
    const { rerender } = render(
      <AuthProvider>
        <div>Child Content</div>
      </AuthProvider>,
    );

    // First render
    expect(mockSetTokenGetter).toHaveBeenCalledTimes(1);

    // Update user to trigger re-render
    mockUseOidcAuth.mockReturnValue({
      user: { access_token: "new-token" },
    });

    rerender(
      <AuthProvider>
        <div>Child Content</div>
      </AuthProvider>,
    );

    // TokenSync should be called again on re-render
    expect(mockSetTokenGetter).toHaveBeenCalledTimes(2);

    // Latest getter should return new token
    const latestTokenGetter = mockSetTokenGetter.mock.calls[1][0];
    expect(latestTokenGetter()).toBe("new-token");
  });
});
