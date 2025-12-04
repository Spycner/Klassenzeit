import type { UserProfile } from "@/auth/types";

import { apiClient } from "../client";

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
};
