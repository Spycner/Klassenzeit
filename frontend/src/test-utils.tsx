import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { AuthContextValue, AuthUser } from "@/lib/keycloak";
import { AuthContext } from "@/providers/keycloak-provider";

const defaultUser: AuthUser = {
  sub: "test-sub-id",
  email: "admin@test.com",
  name: "admin",
  role: "admin",
  schoolId: "00000000-0000-0000-0000-000000000001",
};

export function createMockAuthContext(
  overrides?: Partial<AuthContextValue>,
): AuthContextValue {
  return {
    user: defaultUser,
    token: "mock-jwt-token",
    isAuthenticated: true,
    logout: () => {},
    ...overrides,
  };
}

export function AuthTestWrapper({
  children,
  authContext,
}: {
  children: ReactNode;
  authContext?: Partial<AuthContextValue>;
}) {
  const value = createMockAuthContext(authContext);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function renderWithAuth(
  ui: ReactElement,
  authContext?: Partial<AuthContextValue>,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <AuthTestWrapper authContext={authContext}>{children}</AuthTestWrapper>
    ),
    ...options,
  });
}
