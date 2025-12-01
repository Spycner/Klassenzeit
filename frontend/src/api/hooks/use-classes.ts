/**
 * React Query hooks for School Classes
 *
 * Provides data fetching and mutation hooks for managing school classes.
 * All hooks automatically handle caching, invalidation, and refetching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { classesApi } from "../services";
import type {
  CreateSchoolClassRequest,
  SchoolClassResponse,
  SchoolClassSummary,
  UpdateSchoolClassRequest,
} from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all school classes for a specific school.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @returns Query result containing an array of class summaries
 * @example
 * ```tsx
 * function ClassList({ schoolId }: { schoolId: string }) {
 *   const { data: classes, isLoading } = useClasses(schoolId);
 *   return <ul>{classes?.map(c => <li key={c.id}>{c.name}</li>)}</ul>;
 * }
 * ```
 */
export function useClasses(schoolId: string | undefined) {
  return useQuery<SchoolClassSummary[]>({
    queryKey: queryKeys.classes.all(schoolId!),
    queryFn: () => classesApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/**
 * Fetches a single school class by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param id - The unique identifier of the class (query is disabled if undefined)
 * @returns Query result containing full class details
 * @example
 * ```tsx
 * function ClassDetail({ schoolId, classId }: Props) {
 *   const { data: schoolClass } = useClass(schoolId, classId);
 *   return <h1>{schoolClass?.name}</h1>;
 * }
 * ```
 */
export function useClass(schoolId: string | undefined, id: string | undefined) {
  return useQuery<SchoolClassResponse>({
    queryKey: queryKeys.classes.detail(schoolId!, id!),
    queryFn: () => classesApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/**
 * Creates a new school class within a school.
 *
 * On success, automatically invalidates the classes list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function CreateClassForm({ schoolId }: { schoolId: string }) {
 *   const createClass = useCreateClass(schoolId);
 *   const handleSubmit = (data: CreateSchoolClassRequest) => {
 *     createClass.mutate(data, { onSuccess: () => navigate("/classes") });
 *   };
 * }
 * ```
 */
export function useCreateClass(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSchoolClassRequest) =>
      classesApi.create(schoolId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.all(schoolId),
      });
    },
  });
}

/**
 * Updates an existing school class.
 *
 * On success, automatically invalidates both the classes list and the specific
 * class detail cache to ensure fresh data.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function EditClassForm({ schoolId, schoolClass }: Props) {
 *   const updateClass = useUpdateClass(schoolId);
 *   const handleSubmit = (data: UpdateSchoolClassRequest) => {
 *     updateClass.mutate({ id: schoolClass.id, data });
 *   };
 * }
 * ```
 */
export function useUpdateClass(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateSchoolClassRequest;
    }) => classesApi.update(schoolId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.all(schoolId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.detail(schoolId, id),
      });
    },
  });
}

/**
 * Deletes a school class.
 *
 * On success, automatically invalidates the classes list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function DeleteClassButton({ schoolId, classId }: Props) {
 *   const deleteClass = useDeleteClass(schoolId);
 *   return <button onClick={() => deleteClass.mutate(classId)}>Delete</button>;
 * }
 * ```
 */
export function useDeleteClass(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => classesApi.delete(schoolId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.classes.all(schoolId),
      });
    },
  });
}
