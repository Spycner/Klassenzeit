/**
 * React Query hooks for Teachers (including Qualifications and Availability)
 *
 * Provides data fetching and mutation hooks for managing teachers and their
 * related data. This module includes three sets of hooks:
 * - Teacher hooks: Core teacher CRUD operations
 * - Qualification hooks: Managing teacher subject qualifications
 * - Availability hooks: Managing teacher time slot availability
 *
 * All hooks automatically handle caching, invalidation, and refetching.
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
  SchoolClassSummary,
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

/**
 * Fetches all teachers for a specific school.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param options - Optional parameters for filtering
 * @param options.includeInactive - If true, includes deactivated teachers
 * @returns Query result containing an array of teacher summaries
 * @example
 * ```tsx
 * function TeacherList({ schoolId }: { schoolId: string }) {
 *   const { data: teachers, isLoading } = useTeachers(schoolId);
 *   return (
 *     <ul>
 *       {teachers?.map(t => (
 *         <li key={t.id}>{t.firstName} {t.lastName} ({t.abbreviation})</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useTeachers(
  schoolId: string | undefined,
  options?: { includeInactive?: boolean },
) {
  return useQuery<TeacherSummary[]>({
    queryKey: [
      ...queryKeys.teachers.all(schoolId!),
      { includeInactive: options?.includeInactive },
    ],
    queryFn: () => teachersApi.list(schoolId!, options),
    enabled: !!schoolId,
  });
}

/**
 * Fetches a single teacher by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param id - The unique identifier of the teacher (query is disabled if undefined)
 * @returns Query result containing full teacher details
 * @example
 * ```tsx
 * function TeacherDetail({ schoolId, teacherId }: Props) {
 *   const { data: teacher } = useTeacher(schoolId, teacherId);
 *   return (
 *     <div>
 *       <h1>{teacher?.firstName} {teacher?.lastName}</h1>
 *       <p>Email: {teacher?.email}</p>
 *     </div>
 *   );
 * }
 * ```
 */
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

/**
 * Creates a new teacher within a school.
 * On success, automatically invalidates the teachers list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function CreateTeacherForm({ schoolId }: { schoolId: string }) {
 *   const createTeacher = useCreateTeacher(schoolId);
 *
 *   const handleSubmit = (data: CreateTeacherRequest) => {
 *     createTeacher.mutate(data, {
 *       onSuccess: () => navigate("/teachers"),
 *     });
 *   };
 * }
 * ```
 */
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

/**
 * Updates an existing teacher.
 * On success, automatically invalidates both the teachers list and detail cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function EditTeacherForm({ schoolId, teacher }: Props) {
 *   const updateTeacher = useUpdateTeacher(schoolId);
 *
 *   const handleSubmit = (data: UpdateTeacherRequest) => {
 *     updateTeacher.mutate({ id: teacher.id, data });
 *   };
 * }
 * ```
 */
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

/**
 * Soft-deletes (deactivates) a teacher.
 * On success, automatically invalidates the teachers list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function DeactivateTeacherButton({ schoolId, teacherId }: Props) {
 *   const deleteTeacher = useDeleteTeacher(schoolId);
 *   return (
 *     <button onClick={() => deleteTeacher.mutate(teacherId)}>
 *       Deactivate Teacher
 *     </button>
 *   );
 * }
 * ```
 */
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

/**
 * Permanently deletes a teacher and all their associated data.
 * This action cannot be undone.
 * On success, automatically invalidates the teachers list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function PermanentDeleteButton({ schoolId, teacherId }: Props) {
 *   const permanentDelete = usePermanentDeleteTeacher(schoolId);
 *   return (
 *     <button onClick={() => permanentDelete.mutate(teacherId)}>
 *       Permanently Delete
 *     </button>
 *   );
 * }
 * ```
 */
export function usePermanentDeleteTeacher(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => teachersApi.deletePermanent(schoolId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.all(schoolId),
      });
    },
  });
}

/**
 * Fetches the classes where a teacher is assigned as class teacher.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param teacherId - The unique identifier of the teacher (query is disabled if undefined)
 * @returns Query result containing an array of class summaries
 * @example
 * ```tsx
 * function TeacherClassAssignments({ schoolId, teacherId }: Props) {
 *   const { data: classes } = useClassTeacherAssignments(schoolId, teacherId);
 *   return (
 *     <ul>
 *       {classes?.map(c => <li key={c.id}>{c.name}</li>)}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useClassTeacherAssignments(
  schoolId: string | undefined,
  teacherId: string | undefined,
) {
  return useQuery<SchoolClassSummary[]>({
    queryKey: queryKeys.teachers.classTeacherAssignments(schoolId!, teacherId!),
    queryFn: () =>
      teachersApi.getClassTeacherAssignments(schoolId!, teacherId!),
    enabled: !!schoolId && !!teacherId,
  });
}

// ============================================================================
// Qualification Hooks
// ============================================================================

/**
 * Fetches all qualifications for a specific teacher.
 * Qualifications define which subjects a teacher is certified to teach.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param teacherId - The unique identifier of the teacher (query is disabled if undefined)
 * @returns Query result containing an array of qualification summaries
 * @example
 * ```tsx
 * function TeacherQualifications({ schoolId, teacherId }: Props) {
 *   const { data: qualifications } = useQualifications(schoolId, teacherId);
 *   return (
 *     <ul>
 *       {qualifications?.map(q => (
 *         <li key={q.id}>{q.subject.name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
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

/**
 * Fetches a single qualification by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param teacherId - The unique identifier of the teacher (query is disabled if undefined)
 * @param id - The unique identifier of the qualification (query is disabled if undefined)
 * @returns Query result containing full qualification details
 */
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

/**
 * Creates a new qualification for a teacher.
 * On success, automatically invalidates the qualifications list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param teacherId - The unique identifier of the teacher
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function AddQualificationForm({ schoolId, teacherId }: Props) {
 *   const createQualification = useCreateQualification(schoolId, teacherId);
 *
 *   const handleSubmit = (subjectId: string) => {
 *     createQualification.mutate({ subjectId });
 *   };
 * }
 * ```
 */
export function useCreateQualification(schoolId: string, teacherId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateQualificationRequest) =>
      qualificationsApi.create(schoolId, teacherId, data),
    onSuccess: () => {
      // Invalidate qualifications list to refresh available subjects filter
      queryClient.invalidateQueries({
        queryKey: queryKeys.teachers.qualifications.all(schoolId, teacherId),
      });
      // Also invalidate subjects to ensure the list is fresh
      queryClient.invalidateQueries({
        queryKey: queryKeys.subjects.all(schoolId),
      });
    },
  });
}

/**
 * Updates an existing qualification.
 * On success, automatically invalidates both the qualifications list and detail cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param teacherId - The unique identifier of the teacher
 * @returns Mutation object with mutate/mutateAsync functions
 */
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

/**
 * Deletes a qualification from a teacher.
 * On success, automatically invalidates the qualifications list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param teacherId - The unique identifier of the teacher
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function RemoveQualificationButton({ schoolId, teacherId, qualificationId }: Props) {
 *   const deleteQualification = useDeleteQualification(schoolId, teacherId);
 *   return (
 *     <button onClick={() => deleteQualification.mutate(qualificationId)}>
 *       Remove Qualification
 *     </button>
 *   );
 * }
 * ```
 */
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

/**
 * Fetches all availability entries for a specific teacher.
 * Availability defines when a teacher is available to be scheduled for lessons.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param teacherId - The unique identifier of the teacher (query is disabled if undefined)
 * @returns Query result containing an array of availability summaries
 * @example
 * ```tsx
 * function TeacherSchedule({ schoolId, teacherId }: Props) {
 *   const { data: availability } = useAvailability(schoolId, teacherId);
 *   return (
 *     <div className="weekly-grid">
 *       {availability?.map(slot => (
 *         <AvailabilitySlot key={slot.id} slot={slot} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
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

/**
 * Fetches a single availability entry by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param teacherId - The unique identifier of the teacher (query is disabled if undefined)
 * @param id - The unique identifier of the availability entry (query is disabled if undefined)
 * @returns Query result containing full availability details
 */
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

/**
 * Creates a new availability entry for a teacher.
 * On success, automatically invalidates the availability list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param teacherId - The unique identifier of the teacher
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function AddAvailabilityForm({ schoolId, teacherId }: Props) {
 *   const createAvailability = useCreateAvailability(schoolId, teacherId);
 *
 *   const handleSubmit = (data: CreateAvailabilityRequest) => {
 *     createAvailability.mutate(data);
 *   };
 * }
 * ```
 */
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

/**
 * Updates an existing availability entry.
 * On success, automatically invalidates both the availability list and detail cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param teacherId - The unique identifier of the teacher
 * @returns Mutation object with mutate/mutateAsync functions
 */
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

/**
 * Deletes an availability entry from a teacher.
 * On success, automatically invalidates the availability list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @param teacherId - The unique identifier of the teacher
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function RemoveAvailabilityButton({ schoolId, teacherId, availabilityId }: Props) {
 *   const deleteAvailability = useDeleteAvailability(schoolId, teacherId);
 *   return (
 *     <button onClick={() => deleteAvailability.mutate(availabilityId)}>
 *       Remove Availability
 *     </button>
 *   );
 * }
 * ```
 */
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
