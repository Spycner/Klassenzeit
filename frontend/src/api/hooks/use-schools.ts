/**
 * React Query hooks for Schools
 *
 * Provides data fetching and mutation hooks for managing schools.
 * All hooks automatically handle caching, invalidation, and refetching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { schoolsApi } from "../services";
import type {
  CreateSchoolRequest,
  SchoolResponse,
  SchoolSummary,
  UpdateSchoolRequest,
} from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all schools.
 *
 * @returns Query result containing an array of school summaries
 * @example
 * ```tsx
 * function SchoolList() {
 *   const { data: schools, isLoading, error } = useSchools();
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   return <ul>{schools?.map(s => <li key={s.id}>{s.name}</li>)}</ul>;
 * }
 * ```
 */
export function useSchools() {
  return useQuery<SchoolSummary[]>({
    queryKey: queryKeys.schools.all,
    queryFn: () => schoolsApi.list(),
  });
}

/**
 * Fetches a single school by ID.
 *
 * @param id - The unique identifier of the school (query is disabled if undefined)
 * @returns Query result containing full school details
 * @example
 * ```tsx
 * function SchoolDetail({ schoolId }: { schoolId: string }) {
 *   const { data: school, isLoading } = useSchool(schoolId);
 *   if (isLoading) return <Spinner />;
 *   return <h1>{school?.name}</h1>;
 * }
 * ```
 */
export function useSchool(id: string | undefined) {
  return useQuery<SchoolResponse>({
    queryKey: queryKeys.schools.detail(id!),
    queryFn: () => schoolsApi.get(id!),
    enabled: !!id,
  });
}

/**
 * Creates a new school.
 *
 * On success, automatically invalidates the schools list cache to trigger a refetch.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function CreateSchoolForm() {
 *   const createSchool = useCreateSchool();
 *   const handleSubmit = (data: CreateSchoolRequest) => {
 *     createSchool.mutate(data, {
 *       onSuccess: (school) => navigate(`/schools/${school.id}`),
 *       onError: (error) => showErrorToast(error)
 *     });
 *   };
 * }
 * ```
 */
export function useCreateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSchoolRequest) => schoolsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.all });
    },
  });
}

/**
 * Updates an existing school.
 *
 * On success, automatically invalidates both the schools list and the specific
 * school detail cache to ensure fresh data.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function EditSchoolForm({ school }: { school: SchoolResponse }) {
 *   const updateSchool = useUpdateSchool();
 *   const handleSubmit = (data: UpdateSchoolRequest) => {
 *     updateSchool.mutate(
 *       { id: school.id, data: { ...data, version: school.version } },
 *       { onSuccess: () => showSuccessToast("School updated") }
 *     );
 *   };
 * }
 * ```
 */
export function useUpdateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSchoolRequest }) =>
      schoolsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.detail(id) });
    },
  });
}

/**
 * Deletes a school.
 *
 * On success, automatically invalidates the schools list cache.
 * Warning: This is a cascading delete that removes all associated data.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function DeleteSchoolButton({ schoolId }: { schoolId: string }) {
 *   const deleteSchool = useDeleteSchool();
 *   const handleDelete = () => {
 *     if (confirm("Are you sure? This will delete all school data.")) {
 *       deleteSchool.mutate(schoolId, {
 *         onSuccess: () => navigate("/schools")
 *       });
 *     }
 *   };
 * }
 * ```
 */
export function useDeleteSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => schoolsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.all });
    },
  });
}
