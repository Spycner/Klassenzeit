/**
 * React Query hooks for Subject Rooms
 *
 * Provides data fetching and mutation hooks for managing which rooms
 * can host lessons for a subject (the reverse direction of room-subjects).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subjectRoomsApi } from "../services/subject-rooms";
import type { AddRoomToSubjectRequest, SubjectRoomSummary } from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all rooms that can host a subject.
 *
 * @param schoolId - The unique identifier of the school
 * @param subjectId - The unique identifier of the subject
 * @returns Query result containing an array of room summaries
 */
export function useSubjectRooms(
  schoolId: string | undefined,
  subjectId: string | undefined,
) {
  return useQuery<SubjectRoomSummary[]>({
    queryKey: queryKeys.subjects.rooms.all(schoolId!, subjectId!),
    queryFn: () => subjectRoomsApi.list(schoolId!, subjectId!),
    enabled: !!schoolId && !!subjectId,
  });
}

/**
 * Adds a room to a subject.
 * On success, automatically invalidates the subject rooms list cache.
 *
 * @param schoolId - The unique identifier of the school
 * @param subjectId - The unique identifier of the subject
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useAddRoomToSubject(schoolId: string, subjectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddRoomToSubjectRequest) =>
      subjectRoomsApi.add(schoolId, subjectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.subjects.rooms.all(schoolId, subjectId),
      });
    },
  });
}

/**
 * Removes a room from a subject.
 * On success, automatically invalidates the subject rooms list cache.
 *
 * @param schoolId - The unique identifier of the school
 * @param subjectId - The unique identifier of the subject
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useRemoveRoomFromSubject(schoolId: string, subjectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) =>
      subjectRoomsApi.remove(schoolId, subjectId, roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.subjects.rooms.all(schoolId, subjectId),
      });
    },
  });
}
