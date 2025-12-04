import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

import { Home } from "./Home";

// Override the global mock to show unauthenticated state for landing page tests
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn(),
    error: null,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("Home", () => {
  it("renders the main heading", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: /klassenzeit/i }),
    ).toBeInTheDocument();
  });

  it("renders the tagline", () => {
    render(<Home />);
    // German: "Stundenplaner für Schulen"
    expect(screen.getByText(/stundenplaner für schulen/i)).toBeInTheDocument();
  });

  it("renders the login button", () => {
    render(<Home />);
    // German: "Anmelden" (or English "Log in")
    expect(
      screen.getByRole("button", { name: /anmelden|log in/i }),
    ).toBeInTheDocument();
  });
});
