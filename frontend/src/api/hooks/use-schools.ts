/**
 * React Query hooks for Schools
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

/** Fetch all schools */
export function useSchools() {
  return useQuery<SchoolSummary[]>({
    queryKey: queryKeys.schools.all,
    queryFn: () => schoolsApi.list(),
  });
}

/** Fetch a single school by ID */
export function useSchool(id: string | undefined) {
  return useQuery<SchoolResponse>({
    queryKey: queryKeys.schools.detail(id!),
    queryFn: () => schoolsApi.get(id!),
    enabled: !!id,
  });
}

/** Create a new school */
export function useCreateSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSchoolRequest) => schoolsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.all });
    },
  });
}

/** Update an existing school */
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

/** Delete a school */
export function useDeleteSchool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => schoolsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schools.all });
    },
  });
}
