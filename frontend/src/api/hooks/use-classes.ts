/**
 * React Query hooks for School Classes
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

/** Fetch all school classes for a school */
export function useClasses(schoolId: string | undefined) {
  return useQuery<SchoolClassSummary[]>({
    queryKey: queryKeys.classes.all(schoolId!),
    queryFn: () => classesApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/** Fetch a single school class by ID */
export function useClass(schoolId: string | undefined, id: string | undefined) {
  return useQuery<SchoolClassResponse>({
    queryKey: queryKeys.classes.detail(schoolId!, id!),
    queryFn: () => classesApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/** Create a new school class */
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

/** Update an existing school class */
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

/** Delete a school class */
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
