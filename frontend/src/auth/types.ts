/**
 * School role enum matching backend SchoolRole.java
 */
export type SchoolRole = "SCHOOL_ADMIN" | "PLANNER" | "TEACHER" | "VIEWER";

/**
 * School membership from UserProfileResponse.SchoolMembershipSummary
 */
export interface SchoolMembership {
  schoolId: string;
  schoolName: string;
  role: SchoolRole;
}

/**
 * User profile returned from /api/users/me
 * Matches backend UserProfileResponse.java
 */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  schools: SchoolMembership[];
}

/**
 * Auth context state exposed via useAuth hook
 */
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  error: Error | null;
}

/**
 * Auth actions exposed via useAuth hook
 */
export interface AuthActions {
  login: () => void;
  logout: () => void;
}

/**
 * Combined auth context value
 */
export type AuthContextValue = AuthState & AuthActions;
