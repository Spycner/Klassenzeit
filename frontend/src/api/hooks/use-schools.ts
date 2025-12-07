/**
 * React Query hooks for Schools
 *
 * Provides data fetching and mutation hooks for managing schools.
 * All hooks automatically handle caching, invalidation, and refetching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { isRetryableError, RedirectError } from "../errors";
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
 * Fetches a single school by identifier (UUID or slug).
 *
 * If the slug has changed (301 redirect), automatically navigates to the new URL.
 *
 * @param identifier - The unique identifier (UUID) or slug of the school (query is disabled if undefined)
 * @returns Query result containing full school details
 * @example
 * ```tsx
 * function SchoolDetail({ slug }: { slug: string }) {
 *   const { data: school, isLoading } = useSchool(slug);
 *   if (isLoading) return <Spinner />;
 *   return <h1>{school?.name}</h1>;
 * }
 * ```
 */
export function useSchool(identifier: string | undefined) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  return useQuery<SchoolResponse>({
    queryKey: queryKeys.schools.detail(identifier!),
    queryFn: async () => {
      try {
        return await schoolsApi.get(identifier!);
      } catch (error) {
        if (error instanceof RedirectError) {
          // Navigate to new slug, replacing history
          navigate(`/${i18n.language}/schools/${error.newSlug}`, {
            replace: true,
          });
          // Re-throw to prevent caching the redirect
          throw error;
        }
        throw error;
      }
    },
    enabled: !!identifier,
    retry: (failureCount, error) => {
      // Never retry redirect errors
      if (error instanceof RedirectError) return false;
      if (failureCount >= 3) return false;
      return isRetryableError(error);
    },
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
