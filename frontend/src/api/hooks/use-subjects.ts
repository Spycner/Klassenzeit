/**
 * React Query hooks for Subjects
 *
 * Provides data fetching and mutation hooks for managing subjects.
 * All hooks automatically handle caching, invalidation, and refetching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subjectsApi } from "../services";
import type {
  CreateSubjectRequest,
  SubjectResponse,
  SubjectSummary,
  UpdateSubjectRequest,
} from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all subjects for a specific school.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @returns Query result containing an array of subject summaries
 */
export function useSubjects(schoolId: string | undefined) {
  return useQuery<SubjectSummary[]>({
    queryKey: queryKeys.subjects.all(schoolId!),
    queryFn: () => subjectsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/**
 * Fetches a single subject by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param id - The unique identifier of the subject (query is disabled if undefined)
 * @returns Query result containing full subject details
 */
export function useSubject(
  schoolId: string | undefined,
  id: string | undefined,
) {
  return useQuery<SubjectResponse>({
    queryKey: queryKeys.subjects.detail(schoolId!, id!),
    queryFn: () => subjectsApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/**
 * Creates a new subject within a school.
 * On success, automatically invalidates the subjects list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useCreateSubject(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSubjectRequest) =>
      subjectsApi.create(schoolId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.subjects.all(schoolId),
      });
    },
  });
}

/**
 * Updates an existing subject.
 * On success, automatically invalidates both the subjects list and detail cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useUpdateSubject(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSubjectRequest }) =>
      subjectsApi.update(schoolId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.subjects.all(schoolId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.subjects.detail(schoolId, id),
      });
    },
  });
}

/**
 * Deletes a subject.
 * On success, automatically invalidates the subjects list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useDeleteSubject(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => subjectsApi.delete(schoolId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.subjects.all(schoolId),
      });
    },
  });
}
