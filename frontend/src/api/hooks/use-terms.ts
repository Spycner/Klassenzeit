/**
 * React Query hooks for Terms
 *
 * Provides data fetching and mutation hooks for managing terms within school years.
 * Terms divide the school year into distinct periods (e.g., semesters, quarters).
 * All hooks automatically handle caching, invalidation, and refetching.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { termsApi } from "../services";
import type {
  CreateTermRequest,
  TermResponse,
  TermSummary,
  UpdateTermRequest,
} from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all terms for a specific school year.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param schoolYearId - The unique identifier of the parent school year (query is disabled if undefined)
 * @returns Query result containing an array of term summaries
 * @example
 * ```tsx
 * function TermList({ schoolId, schoolYearId }: Props) {
 *   const { data: terms, isLoading } = useTerms(schoolId, schoolYearId);
 *   return (
 *     <ul>
 *       {terms?.map(term => (
 *         <li key={term.id}>{term.name}: {term.startDate} - {term.endDate}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useTerms(
  schoolId: string | undefined,
  schoolYearId: string | undefined,
) {
  return useQuery<TermSummary[]>({
    queryKey: queryKeys.terms.all(schoolId!, schoolYearId!),
    queryFn: () => termsApi.list(schoolId!, schoolYearId!),
    enabled: !!schoolId && !!schoolYearId,
  });
}

/**
 * Fetches a single term by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param schoolYearId - The unique identifier of the parent school year (query is disabled if undefined)
 * @param id - The unique identifier of the term (query is disabled if undefined)
 * @returns Query result containing full term details
 * @example
 * ```tsx
 * function TermDetail({ schoolId, schoolYearId, termId }: Props) {
 *   const { data: term } = useTerm(schoolId, schoolYearId, termId);
 *   return (
 *     <div>
 *       <h1>{term?.name}</h1>
 *       <p>Period: {term?.startDate} to {term?.endDate}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTerm(
  schoolId: string | undefined,
  schoolYearId: string | undefined,
  id: string | undefined,
) {
  return useQuery<TermResponse>({
    queryKey: queryKeys.terms.detail(schoolId!, schoolYearId!, id!),
    queryFn: () => termsApi.get(schoolId!, schoolYearId!, id!),
    enabled: !!schoolId && !!schoolYearId && !!id,
  });
}

/**
 * Creates a new term within a school year.
 * On success, automatically invalidates the terms list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param schoolYearId - The unique identifier of the parent school year
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function CreateTermForm({ schoolId, schoolYearId }: Props) {
 *   const createTerm = useCreateTerm(schoolId, schoolYearId);
 *
 *   const handleSubmit = (data: CreateTermRequest) => {
 *     createTerm.mutate(data, {
 *       onSuccess: () => navigate(`/years/${schoolYearId}/terms`),
 *     });
 *   };
 * }
 * ```
 */
export function useCreateTerm(schoolId: string, schoolYearId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTermRequest) =>
      termsApi.create(schoolId, schoolYearId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.terms.all(schoolId, schoolYearId),
      });
    },
  });
}

/**
 * Updates an existing term.
 * On success, automatically invalidates both the terms list and detail cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param schoolYearId - The unique identifier of the parent school year
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function EditTermForm({ schoolId, schoolYearId, term }: Props) {
 *   const updateTerm = useUpdateTerm(schoolId, schoolYearId);
 *
 *   const handleSubmit = (data: UpdateTermRequest) => {
 *     updateTerm.mutate({ id: term.id, data });
 *   };
 * }
 * ```
 */
export function useUpdateTerm(schoolId: string, schoolYearId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTermRequest }) =>
      termsApi.update(schoolId, schoolYearId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.terms.all(schoolId, schoolYearId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.terms.detail(schoolId, schoolYearId, id),
      });
    },
  });
}

/**
 * Deletes a term and all its associated lessons.
 * On success, automatically invalidates the terms list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param schoolYearId - The unique identifier of the parent school year
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function DeleteTermButton({ schoolId, schoolYearId, termId }: Props) {
 *   const deleteTerm = useDeleteTerm(schoolId, schoolYearId);
 *   return (
 *     <button onClick={() => deleteTerm.mutate(termId)}>
 *       Delete Term
 *     </button>
 *   );
 * }
 * ```
 */
export function useDeleteTerm(schoolId: string, schoolYearId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => termsApi.delete(schoolId, schoolYearId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.terms.all(schoolId, schoolYearId),
      });
    },
  });
}
