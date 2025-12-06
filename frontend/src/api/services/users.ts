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
   * Search for users by email or display name.
   * Backend endpoint: GET /api/users/search?query={query}
   * Returns a list of matching users (up to 10).
   */
  search(query: string): Promise<UserSearchResult[]> {
    return apiClient.get<UserSearchResult[]>(
      `/api/users/search?query=${encodeURIComponent(query)}`,
    );
  },
};
