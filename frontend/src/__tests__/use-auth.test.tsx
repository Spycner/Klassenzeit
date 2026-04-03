import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAuth } from "@/hooks/use-auth";
import { AuthTestWrapper } from "@/test-utils";

describe("useAuth", () => {
  it("returns auth context when inside provider", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthTestWrapper>{children}</AuthTestWrapper>,
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("admin@test.com");
    expect(result.current.user?.role).toBe("admin");
    expect(result.current.token).toBe("mock-jwt-token");
  });

  it("returns unauthenticated state when no provider wraps it", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });
});
