/**
 * React Query hooks for Terms
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

/** Fetch all terms for a school year */
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

/** Fetch a single term by ID */
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

/** Create a new term */
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

/** Update an existing term */
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

/** Delete a term */
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
