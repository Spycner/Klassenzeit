/**
 * Query Client Configuration
 *
 * Configures React Query with:
 * - Global error handling for mutations (shows toast notifications)
 * - Smart retry logic that only retries on retryable errors
 * - Reasonable cache and stale times
 */

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { showErrorToast } from "../error-handler";
import { ClientError, isRetryableError } from "../errors";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // Log query errors for debugging but don't show toast
      // (queries will show loading/error states in UI)
      console.error("Query error:", error);

      // Handle 401 - clear all queries to trigger re-fetch after re-auth
      // The auth provider will handle the redirect to login
      if (error instanceof ClientError && error.isUnauthorized) {
        console.warn("Unauthorized - clearing query cache");
        // Use setTimeout to avoid clearing during render
        setTimeout(() => {
          queryClient.clear();
        }, 0);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      // Show toast notification for mutation errors
      showErrorToast(error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        // Only retry up to 3 times and only for retryable errors
        if (failureCount >= 3) return false;
        return isRetryableError(error);
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        // Only retry once for mutations and only for retryable errors
        if (failureCount >= 1) return false;
        return isRetryableError(error);
      },
    },
  },
});

/** Query key factory for consistent key generation */
export const queryKeys = {
  // Schools
  schools: {
    all: ["schools"] as const,
    detail: (id: string) => ["schools", id] as const,
  },

  // School Years
  schoolYears: {
    all: (schoolId: string) => ["schools", schoolId, "school-years"] as const,
    detail: (schoolId: string, id: string) =>
      ["schools", schoolId, "school-years", id] as const,
  },

  // Terms
  terms: {
    all: (schoolId: string, schoolYearId: string) =>
      ["schools", schoolId, "school-years", schoolYearId, "terms"] as const,
    detail: (schoolId: string, schoolYearId: string, id: string) =>
      ["schools", schoolId, "school-years", schoolYearId, "terms", id] as const,
  },

  // Teachers
  teachers: {
    all: (schoolId: string) => ["schools", schoolId, "teachers"] as const,
    detail: (schoolId: string, id: string) =>
      ["schools", schoolId, "teachers", id] as const,
    classTeacherAssignments: (schoolId: string, teacherId: string) =>
      [
        "schools",
        schoolId,
        "teachers",
        teacherId,
        "class-teacher-assignments",
      ] as const,
    qualifications: {
      all: (schoolId: string, teacherId: string) =>
        ["schools", schoolId, "teachers", teacherId, "qualifications"] as const,
      detail: (schoolId: string, teacherId: string, id: string) =>
        [
          "schools",
          schoolId,
          "teachers",
          teacherId,
          "qualifications",
          id,
        ] as const,
    },
    availability: {
      all: (schoolId: string, teacherId: string) =>
        ["schools", schoolId, "teachers", teacherId, "availability"] as const,
      detail: (schoolId: string, teacherId: string, id: string) =>
        [
          "schools",
          schoolId,
          "teachers",
          teacherId,
          "availability",
          id,
        ] as const,
    },
  },

  // Subjects
  subjects: {
    all: (schoolId: string) => ["schools", schoolId, "subjects"] as const,
    detail: (schoolId: string, id: string) =>
      ["schools", schoolId, "subjects", id] as const,
    rooms: {
      all: (schoolId: string, subjectId: string) =>
        ["schools", schoolId, "subjects", subjectId, "rooms"] as const,
    },
  },

  // Rooms
  rooms: {
    all: (schoolId: string) => ["schools", schoolId, "rooms"] as const,
    detail: (schoolId: string, id: string) =>
      ["schools", schoolId, "rooms", id] as const,
    subjects: {
      all: (schoolId: string, roomId: string) =>
        ["schools", schoolId, "rooms", roomId, "subjects"] as const,
    },
  },

  // Classes
  classes: {
    all: (schoolId: string) => ["schools", schoolId, "classes"] as const,
    detail: (schoolId: string, id: string) =>
      ["schools", schoolId, "classes", id] as const,
  },

  // Time Slots
  timeSlots: {
    all: (schoolId: string) => ["schools", schoolId, "time-slots"] as const,
    detail: (schoolId: string, id: string) =>
      ["schools", schoolId, "time-slots", id] as const,
  },

  // Lessons
  lessons: {
    all: (schoolId: string, termId: string) =>
      ["schools", schoolId, "terms", termId, "lessons"] as const,
    detail: (schoolId: string, termId: string, id: string) =>
      ["schools", schoolId, "terms", termId, "lessons", id] as const,
  },

  // Solver
  solver: {
    status: (schoolId: string, termId: string) =>
      ["schools", schoolId, "terms", termId, "solver", "status"] as const,
    solution: (schoolId: string, termId: string) =>
      ["schools", schoolId, "terms", termId, "solver", "solution"] as const,
  },

  // Memberships
  memberships: {
    all: (schoolId: string) => ["schools", schoolId, "members"] as const,
    detail: (schoolId: string, id: string) =>
      ["schools", schoolId, "members", id] as const,
  },
};
