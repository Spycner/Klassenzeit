/**
 * React Query hooks for Subjects
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

/** Fetch all subjects for a school */
export function useSubjects(schoolId: string | undefined) {
  return useQuery<SubjectSummary[]>({
    queryKey: queryKeys.subjects.all(schoolId!),
    queryFn: () => subjectsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/** Fetch a single subject by ID */
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

/** Create a new subject */
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

/** Update an existing subject */
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

/** Delete a subject */
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
