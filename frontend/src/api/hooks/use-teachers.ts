/**
 * React Query hooks for Teachers (including Qualifications and Availability)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { availabilityApi, qualificationsApi, teachersApi } from "../services";
import type {
  AvailabilityResponse,
  AvailabilitySummary,
  CreateAvailabilityRequest,
  CreateQualificationRequest,
  CreateTeacherRequest,
  QualificationResponse,
  QualificationSummary,
  TeacherResponse,
  TeacherSummary,
  UpdateAvailabilityRequest,
  UpdateQualificationRequest,
  UpdateTeacherRequest,
} from "../types";
import { queryKeys } from "./query-client";

// ============================================================================
// Teacher Hooks
// ============================================================================

/** Fetch all teachers for a school */
export function useTeachers(schoolId: string | undefined) {
  return useQuery<TeacherSummary[]>({
    queryKey: queryKeys.teachers.all(schoolId!),
    queryFn: () => teachersApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/** Fetch a single teacher by ID */
export function useTeacher(
  schoolId: string | undefined,
  id: string | undefined,
) {
  return useQuery<TeacherResponse>({
    queryKey: queryKeys.teachers.detail(schoolId!, id!),
    queryFn: () => teachersApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/** Create a new teacher */
export function useCreateTeacher(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTeacherRequest) =>
      teachersApi.create(schoolId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.all(schoolId),
      });
    },
  });
}

/** Update an existing teacher */
export function useUpdateTeacher(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTeacherRequest }) =>
      teachersApi.update(schoolId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.all(schoolId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.detail(schoolId, id),
      });
    },
  });
}

/** Delete a teacher */
export function useDeleteTeacher(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => teachersApi.delete(schoolId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.all(schoolId),
      });
    },
  });
}

// ============================================================================
// Qualification Hooks
// ============================================================================

/** Fetch all qualifications for a teacher */
export function useQualifications(
  schoolId: string | undefined,
  teacherId: string | undefined,
) {
  return useQuery<QualificationSummary[]>({
    queryKey: queryKeys.teachers.qualifications.all(schoolId!, teacherId!),
    queryFn: () => qualificationsApi.list(schoolId!, teacherId!),
    enabled: !!schoolId && !!teacherId,
  });
}

/** Fetch a single qualification by ID */
export function useQualification(
  schoolId: string | undefined,
  teacherId: string | undefined,
  id: string | undefined,
) {
  return useQuery<QualificationResponse>({
    queryKey: queryKeys.teachers.qualifications.detail(
      schoolId!,
      teacherId!,
      id!,
    ),
    queryFn: () => qualificationsApi.get(schoolId!, teacherId!, id!),
    enabled: !!schoolId && !!teacherId && !!id,
  });
}

/** Create a new qualification */
export function useCreateQualification(schoolId: string, teacherId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQualificationRequest) =>
      qualificationsApi.create(schoolId, teacherId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.qualifications.all(schoolId, teacherId),
      });
    },
  });
}

/** Update an existing qualification */
export function useUpdateQualification(schoolId: string, teacherId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateQualificationRequest;
    }) => qualificationsApi.update(schoolId, teacherId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.qualifications.all(schoolId, teacherId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.qualifications.detail(
          schoolId,
          teacherId,
          id,
        ),
      });
    },
  });
}

/** Delete a qualification */
export function useDeleteQualification(schoolId: string, teacherId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      qualificationsApi.delete(schoolId, teacherId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.qualifications.all(schoolId, teacherId),
      });
    },
  });
}

// ============================================================================
// Availability Hooks
// ============================================================================

/** Fetch all availability entries for a teacher */
export function useAvailability(
  schoolId: string | undefined,
  teacherId: string | undefined,
) {
  return useQuery<AvailabilitySummary[]>({
    queryKey: queryKeys.teachers.availability.all(schoolId!, teacherId!),
    queryFn: () => availabilityApi.list(schoolId!, teacherId!),
    enabled: !!schoolId && !!teacherId,
  });
}

/** Fetch a single availability entry by ID */
export function useAvailabilityEntry(
  schoolId: string | undefined,
  teacherId: string | undefined,
  id: string | undefined,
) {
  return useQuery<AvailabilityResponse>({
    queryKey: queryKeys.teachers.availability.detail(
      schoolId!,
      teacherId!,
      id!,
    ),
    queryFn: () => availabilityApi.get(schoolId!, teacherId!, id!),
    enabled: !!schoolId && !!teacherId && !!id,
  });
}

/** Create a new availability entry */
export function useCreateAvailability(schoolId: string, teacherId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAvailabilityRequest) =>
      availabilityApi.create(schoolId, teacherId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.availability.all(schoolId, teacherId),
      });
    },
  });
}

/** Update an existing availability entry */
export function useUpdateAvailability(schoolId: string, teacherId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateAvailabilityRequest;
    }) => availabilityApi.update(schoolId, teacherId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.availability.all(schoolId, teacherId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.availability.detail(
          schoolId,
          teacherId,
          id,
        ),
      });
    },
  });
}

/** Delete an availability entry */
export function useDeleteAvailability(schoolId: string, teacherId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => availabilityApi.delete(schoolId, teacherId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.availability.all(schoolId, teacherId),
      });
    },
  });
}
