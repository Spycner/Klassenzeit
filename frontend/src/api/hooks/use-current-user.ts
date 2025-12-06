import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth";
import type { UserProfile } from "@/auth/types";

import { usersApi } from "../services/users";

/**
 * Hook to fetch current user profile.
 * Only enabled when user is authenticated and access token is available.
 */
export function useCurrentUser() {
  const { isAuthenticated, accessToken } = useAuth();

  return useQuery<UserProfile>({
    queryKey: ["users", "me"],
    queryFn: () => usersApi.getCurrentUser(),
    // Wait for both authentication and token to be available
    // This prevents race conditions where the API call fires before
    // the TokenSync component has set the token getter
    enabled: isAuthenticated && !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
