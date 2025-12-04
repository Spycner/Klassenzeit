import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth";
import type { UserProfile } from "@/auth/types";

import { usersApi } from "../services/users";

/**
 * Hook to fetch current user profile.
 * Only enabled when user is authenticated.
 */
export function useCurrentUser() {
  const { isAuthenticated } = useAuth();

  return useQuery<UserProfile>({
    queryKey: ["users", "me"],
    queryFn: () => usersApi.getCurrentUser(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
