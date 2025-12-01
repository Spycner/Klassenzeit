/**
 * React Query hooks for Lessons (Timetable entries)
 *
 * Provides data fetching and mutation hooks for managing lessons within terms.
 * Lessons represent scheduled teaching sessions in the timetable.
 * All hooks automatically handle caching, invalidation, and refetching.
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

/**
 * Fetches all lessons for a specific term.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param termId - The unique identifier of the parent term (query is disabled if undefined)
 * @returns Query result containing an array of lesson summaries
 * @example
 * ```tsx
 * function TimetableView({ schoolId, termId }: Props) {
 *   const { data: lessons, isLoading } = useLessons(schoolId, termId);
 *   return (
 *     <div className="timetable">
 *       {lessons?.map(lesson => (
 *         <LessonCell key={lesson.id} lesson={lesson} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
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

/**
 * Fetches a single lesson by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param termId - The unique identifier of the parent term (query is disabled if undefined)
 * @param id - The unique identifier of the lesson (query is disabled if undefined)
 * @returns Query result containing full lesson details
 * @example
 * ```tsx
 * function LessonDetail({ schoolId, termId, lessonId }: Props) {
 *   const { data: lesson } = useLesson(schoolId, termId, lessonId);
 *   return (
 *     <div>
 *       <h1>{lesson?.subject.name}</h1>
 *       <p>Teacher: {lesson?.teacher.name}</p>
 *       <p>Room: {lesson?.room.name}</p>
 *     </div>
 *   );
 * }
 * ```
 */
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

/**
 * Creates a new lesson within a term.
 * On success, automatically invalidates the lessons list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param termId - The unique identifier of the parent term
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function AddLessonForm({ schoolId, termId }: Props) {
 *   const createLesson = useCreateLesson(schoolId, termId);
 *
 *   const handleSubmit = (data: CreateLessonRequest) => {
 *     createLesson.mutate(data, {
 *       onSuccess: () => toast.success("Lesson added to timetable"),
 *     });
 *   };
 * }
 * ```
 */
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

/**
 * Updates an existing lesson.
 * On success, automatically invalidates both the lessons list and detail cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param termId - The unique identifier of the parent term
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function EditLessonForm({ schoolId, termId, lesson }: Props) {
 *   const updateLesson = useUpdateLesson(schoolId, termId);
 *
 *   const handleSubmit = (data: UpdateLessonRequest) => {
 *     updateLesson.mutate({ id: lesson.id, data });
 *   };
 * }
 * ```
 */
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

/**
 * Deletes a lesson from the timetable.
 * On success, automatically invalidates the lessons list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param termId - The unique identifier of the parent term
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function DeleteLessonButton({ schoolId, termId, lessonId }: Props) {
 *   const deleteLesson = useDeleteLesson(schoolId, termId);
 *   return (
 *     <button onClick={() => deleteLesson.mutate(lessonId)}>
 *       Remove from timetable
 *     </button>
 *   );
 * }
 * ```
 */
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
