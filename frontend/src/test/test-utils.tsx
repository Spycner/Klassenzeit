/**
 * Test utilities for rendering components with providers
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { MemoryRouter } from "react-router";

import type {
  AuthContextValue,
  SchoolMembership,
  UserProfile,
} from "@/auth/types";
import type { SchoolContextValue } from "@/contexts/SchoolContext";

/**
 * Creates a new QueryClient configured for testing
 * - Disabled retries for faster tests
 * - Disabled gc to prevent memory issues during tests
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

/**
 * Mock auth options for testing
 */
export interface MockAuthOptions {
  /** Whether the user is authenticated (default: true) */
  isAuthenticated?: boolean;
  /** Whether auth is loading (default: false) */
  isLoading?: boolean;
  /** Mock user profile data */
  user?: Partial<UserProfile>;
}

/** Default mock user for testing - exported for use in tests */
export const mockUser: UserProfile = {
  id: "test-user-id",
  email: "test@example.com",
  displayName: "Test User",
  isPlatformAdmin: false,
  schools: [
    {
      schoolId: "test-school-id",
      schoolName: "Test School",
      role: "TEACHER",
    },
  ],
};

/**
 * Mock auth context for testing
 */
const MockAuthContext = createContext<AuthContextValue | null>(null);

/**
 * Mock auth provider for tests
 */
function MockAuthProvider({
  children,
  options = {},
}: {
  children: ReactNode;
  options?: MockAuthOptions;
}) {
  const {
    isAuthenticated = true,
    isLoading = false,
    // user is available for future use when we need to mock useCurrentUser
    // user = defaultMockUser,
  } = options;

  const value: AuthContextValue = {
    isAuthenticated,
    isLoading,
    accessToken: isAuthenticated ? "mock-access-token" : null,
    error: null,
    login: () => {},
    logout: () => {},
  };

  return (
    <MockAuthContext.Provider value={value}>
      {children}
    </MockAuthContext.Provider>
  );
}

/**
 * Hook to use mock auth in tests
 * Note: In real app, components use useAuth from @/auth which uses react-oidc-context
 * This mock is for test utilities only
 */
export function useMockAuth(): AuthContextValue {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error("useMockAuth must be used within MockAuthProvider");
  }
  return context;
}

/**
 * Mock school options for testing
 */
export interface MockSchoolOptions {
  /** Current school (default: test school) */
  currentSchool?: SchoolMembership | null;
  /** All user schools (default: single test school) */
  userSchools?: SchoolMembership[];
  /** Whether loading (default: false) */
  isLoading?: boolean;
}

/** Default mock school for testing */
export const mockSchool: SchoolMembership = {
  schoolId: "test-school-id",
  schoolName: "Test School",
  role: "TEACHER",
};

/**
 * Mock school context for testing
 */
const MockSchoolContext = createContext<SchoolContextValue | null>(null);

/**
 * Mock school provider for tests
 */
function MockSchoolProvider({
  children,
  options = {},
}: {
  children: ReactNode;
  options?: MockSchoolOptions;
}) {
  const {
    currentSchool = mockSchool,
    userSchools = [mockSchool],
    isLoading = false,
  } = options;

  const value: SchoolContextValue = {
    currentSchool,
    setCurrentSchool: () => {},
    userSchools,
    isLoading,
  };

  return (
    <MockSchoolContext.Provider value={value}>
      {children}
    </MockSchoolContext.Provider>
  );
}

/**
 * Hook to use mock school context in tests
 */
export function useMockSchoolContext(): SchoolContextValue {
  const context = useContext(MockSchoolContext);
  if (!context) {
    throw new Error(
      "useMockSchoolContext must be used within MockSchoolProvider",
    );
  }
  return context;
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
  initialEntries?: string[];
  /** Auth options for mocking authentication state */
  auth?: MockAuthOptions;
  /** School options for mocking school context */
  school?: MockSchoolOptions;
}

/**
 * Creates a wrapper component with all necessary providers
 */
export function createWrapper(
  queryClient?: QueryClient,
  initialEntries?: string[],
  authOptions?: MockAuthOptions,
  schoolOptions?: MockSchoolOptions,
) {
  const client = queryClient ?? createTestQueryClient();

  return function Wrapper({ children }: WrapperProps) {
    return (
      <MockAuthProvider options={authOptions}>
        <MockSchoolProvider options={schoolOptions}>
          <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={initialEntries ?? ["/"]}>
              {children}
            </MemoryRouter>
          </QueryClientProvider>
        </MockSchoolProvider>
      </MockAuthProvider>
    );
  };
}

/**
 * Custom render function that wraps components with providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderWithProvidersOptions,
) {
  const { queryClient, initialEntries, auth, school, ...renderOptions } =
    options ?? {};

  return render(ui, {
    wrapper: createWrapper(queryClient, initialEntries, auth, school),
    ...renderOptions,
  });
}

// Re-export everything from testing-library
export * from "@testing-library/react";
export { renderWithProviders as render };
