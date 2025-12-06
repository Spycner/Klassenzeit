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
  search: (query: string) => ["users", "search", query] as const,
};

/**
 * Searches for users by email or display name.
 *
 * @param query - The search query (email or name)
 * @param options - Query options
 * @param options.enabled - Whether the query should run (defaults to true if query has 2+ chars)
 * @returns Query result containing matching users
 */
export function useUserSearch(query: string, options?: { enabled?: boolean }) {
  const hasMinLength = query.trim().length >= 2;

  return useQuery<UserSearchResult[]>({
    queryKey: userQueryKeys.search(query.trim()),
    queryFn: () => usersApi.search(query.trim()),
    enabled: options?.enabled ?? hasMinLength,
    // User search results should stay fresh
    staleTime: 30 * 1000, // 30 seconds
  });
}
