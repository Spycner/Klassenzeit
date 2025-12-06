/**
 * React Query hooks for School Memberships
 *
 * Provides data fetching and mutation hooks for managing school memberships.
 * Only school admins can manage memberships for their school.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { membershipsApi } from "../services";
import type {
  CreateMembershipRequest,
  MembershipResponse,
  MembershipSummary,
  UpdateMembershipRequest,
} from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all members of a school.
 *
 * @param schoolId - The school's unique identifier (query is disabled if undefined)
 * @returns Query result containing an array of membership summaries
 */
export function useMemberships(schoolId: string | undefined) {
  return useQuery<MembershipSummary[]>({
    queryKey: queryKeys.memberships.all(schoolId!),
    queryFn: () => membershipsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/**
 * Fetches a single membership by ID.
 *
 * @param schoolId - The school's unique identifier
 * @param id - The membership's unique identifier (query is disabled if undefined)
 * @returns Query result containing full membership details
 */
export function useMembership(
  schoolId: string | undefined,
  id: string | undefined,
) {
  return useQuery<MembershipResponse>({
    queryKey: queryKeys.memberships.detail(schoolId!, id!),
    queryFn: () => membershipsApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/**
 * Adds a user to a school with a specific role.
 *
 * On success, automatically invalidates the memberships list cache.
 *
 * @param schoolId - The school's unique identifier
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useCreateMembership(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMembershipRequest) =>
      membershipsApi.create(schoolId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.memberships.all(schoolId),
      });
    },
  });
}

/**
 * Updates a membership's role or linked teacher.
 *
 * On success, automatically invalidates both the list and detail caches.
 *
 * @param schoolId - The school's unique identifier
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useUpdateMembership(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMembershipRequest }) =>
      membershipsApi.update(schoolId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.memberships.all(schoolId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.memberships.detail(schoolId, id),
      });
    },
  });
}

/**
 * Removes a user from a school.
 *
 * On success, automatically invalidates the memberships list cache.
 *
 * @param schoolId - The school's unique identifier
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useDeleteMembership(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => membershipsApi.delete(schoolId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.memberships.all(schoolId),
      });
    },
  });
}
