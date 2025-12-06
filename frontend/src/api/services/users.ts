import type { UserProfile } from "@/auth/types";

import { apiClient } from "../client";
import type { UserSearchResult } from "../types";

/**
 * Users API service for user-related endpoints.
 */
export const usersApi = {
  /**
   * Get current user's profile with school memberships.
   * Backend endpoint: GET /api/users/me
   */
  getCurrentUser(): Promise<UserProfile> {
    return apiClient.get<UserProfile>("/api/users/me");
  },

  /**
   * Search for a user by email.
   * Backend endpoint: GET /api/users/search?email={email}
   * Returns null if no user is found.
   */
  searchByEmail(email: string): Promise<UserSearchResult | null> {
    return apiClient.get<UserSearchResult | null>(
      `/api/users/search?email=${encodeURIComponent(email)}`,
    );
  },
};
