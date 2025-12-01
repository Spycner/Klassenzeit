/**
 * React Query hooks for Lessons (Timetable entries)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lessonsApi } from "../services";
import type {
  CreateLessonRequest,
  LessonResponse,
  LessonSummary,
  UpdateLessonRequest,
} from "../types";
import { queryKeys } from "./query-client";

/** Fetch all lessons for a term */
export function useLessons(
  schoolId: string | undefined,
  termId: string | undefined,
) {
  return useQuery<LessonSummary[]>({
    queryKey: queryKeys.lessons.all(schoolId!, termId!),
    queryFn: () => lessonsApi.list(schoolId!, termId!),
    enabled: !!schoolId && !!termId,
  });
}

/** Fetch a single lesson by ID */
export function useLesson(
  schoolId: string | undefined,
  termId: string | undefined,
  id: string | undefined,
) {
  return useQuery<LessonResponse>({
    queryKey: queryKeys.lessons.detail(schoolId!, termId!, id!),
    queryFn: () => lessonsApi.get(schoolId!, termId!, id!),
    enabled: !!schoolId && !!termId && !!id,
  });
}

/** Create a new lesson */
export function useCreateLesson(schoolId: string, termId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLessonRequest) =>
      lessonsApi.create(schoolId, termId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessons.all(schoolId, termId),
      });
    },
  });
}

/** Update an existing lesson */
export function useUpdateLesson(schoolId: string, termId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLessonRequest }) =>
      lessonsApi.update(schoolId, termId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessons.all(schoolId, termId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessons.detail(schoolId, termId, id),
      });
    },
  });
}

/** Delete a lesson */
export function useDeleteLesson(schoolId: string, termId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => lessonsApi.delete(schoolId, termId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessons.all(schoolId, termId),
      });
    },
  });
}
