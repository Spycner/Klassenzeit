/**
 * React Query hooks for School Years
 *
 * Provides data fetching and mutation hooks for managing school years.
 * All hooks automatically handle caching, invalidation, and refetching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { schoolYearsApi } from "../services";
import type {
  CreateSchoolYearRequest,
  SchoolYearResponse,
  SchoolYearSummary,
  UpdateSchoolYearRequest,
} from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all school years for a specific school.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @returns Query result containing an array of school year summaries
 */
export function useSchoolYears(schoolId: string | undefined) {
  return useQuery<SchoolYearSummary[]>({
    queryKey: queryKeys.schoolYears.all(schoolId!),
    queryFn: () => schoolYearsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/**
 * Fetches a single school year by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param id - The unique identifier of the school year (query is disabled if undefined)
 * @returns Query result containing full school year details
 */
export function useSchoolYear(
  schoolId: string | undefined,
  id: string | undefined,
) {
  return useQuery<SchoolYearResponse>({
    queryKey: queryKeys.schoolYears.detail(schoolId!, id!),
    queryFn: () => schoolYearsApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/**
 * Creates a new school year within a school.
 * On success, automatically invalidates the school years list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useCreateSchoolYear(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSchoolYearRequest) =>
      schoolYearsApi.create(schoolId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.schoolYears.all(schoolId),
      });
    },
  });
}

/**
 * Updates an existing school year.
 * On success, automatically invalidates both the school years list and detail cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useUpdateSchoolYear(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSchoolYearRequest }) =>
      schoolYearsApi.update(schoolId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.schoolYears.all(schoolId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.schoolYears.detail(schoolId, id),
      });
    },
  });
}

/**
 * Deletes a school year and all its associated terms and lessons.
 * On success, automatically invalidates the school years list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useDeleteSchoolYear(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => schoolYearsApi.delete(schoolId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.schoolYears.all(schoolId),
      });
    },
  });
}
