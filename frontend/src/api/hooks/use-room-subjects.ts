/**
 * React Query hooks for Room Subject Suitabilities
 *
 * Provides data fetching and mutation hooks for managing which subjects
 * can be taught in which rooms.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roomSubjectsApi } from "../services/room-subjects";
import type {
  CreateRoomSubjectSuitabilityRequest,
  RoomSubjectSuitabilitySummary,
} from "../types";
import { queryKeys } from "./query-client";

/**
 * Fetches all subject suitabilities for a room.
 *
 * @param schoolId - The unique identifier of the school
 * @param roomId - The unique identifier of the room
 * @returns Query result containing an array of subject suitabilities
 */
export function useRoomSubjects(
  schoolId: string | undefined,
  roomId: string | undefined,
) {
  return useQuery<RoomSubjectSuitabilitySummary[]>({
    queryKey: queryKeys.rooms.subjects.all(schoolId!, roomId!),
    queryFn: () => roomSubjectsApi.list(schoolId!, roomId!),
    enabled: !!schoolId && !!roomId,
  });
}

/**
 * Creates a new subject suitability for a room.
 * On success, automatically invalidates the room subjects list cache.
 *
 * @param schoolId - The unique identifier of the school
 * @param roomId - The unique identifier of the room
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useCreateRoomSubject(schoolId: string, roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoomSubjectSuitabilityRequest) =>
      roomSubjectsApi.create(schoolId, roomId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rooms.subjects.all(schoolId, roomId),
      });
    },
  });
}

/**
 * Deletes a subject suitability from a room.
 * On success, automatically invalidates the room subjects list cache.
 *
 * @param schoolId - The unique identifier of the school
 * @param roomId - The unique identifier of the room
 * @returns Mutation object with mutate/mutateAsync functions
 */
export function useDeleteRoomSubject(schoolId: string, roomId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => roomSubjectsApi.delete(schoolId, roomId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rooms.subjects.all(schoolId, roomId),
      });
    },
  });
}
