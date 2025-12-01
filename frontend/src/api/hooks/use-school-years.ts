/**
 * React Query hooks for School Years
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

/** Fetch all school years for a school */
export function useSchoolYears(schoolId: string | undefined) {
  return useQuery<SchoolYearSummary[]>({
    queryKey: queryKeys.schoolYears.all(schoolId!),
    queryFn: () => schoolYearsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/** Fetch a single school year by ID */
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

/** Create a new school year */
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

/** Update an existing school year */
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

/** Delete a school year */
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
