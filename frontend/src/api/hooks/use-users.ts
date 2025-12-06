/**
 * React Query hooks for User operations
 *
 * Provides data fetching hooks for user-related operations.
 */

import { useQuery } from "@tanstack/react-query";
import { usersApi } from "../services";
import type { UserSearchResult } from "../types";

/** Query keys for user-related queries */
export const userQueryKeys = {
  search: (email: string) => ["users", "search", email] as const,
};

/**
 * Searches for a user by email address.
 *
 * @param email - The email address to search for
 * @param options - Query options
 * @param options.enabled - Whether the query should run (defaults to true if email has 3+ chars)
 * @returns Query result containing the user if found, or null
 */
export function useUserSearch(email: string, options?: { enabled?: boolean }) {
  const hasMinLength = email.trim().length >= 3;

  return useQuery<UserSearchResult | null>({
    queryKey: userQueryKeys.search(email.trim()),
    queryFn: () => usersApi.searchByEmail(email.trim()),
    enabled: options?.enabled ?? hasMinLength,
    // User search results should stay fresh
    staleTime: 30 * 1000, // 30 seconds
  });
}
