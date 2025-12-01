/**
 * React Query hooks for Rooms
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roomsApi } from "../services";
import type {
  CreateRoomRequest,
  RoomResponse,
  RoomSummary,
  UpdateRoomRequest,
} from "../types";
import { queryKeys } from "./query-client";

/** Fetch all rooms for a school */
export function useRooms(schoolId: string | undefined) {
  return useQuery<RoomSummary[]>({
    queryKey: queryKeys.rooms.all(schoolId!),
    queryFn: () => roomsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/** Fetch a single room by ID */
export function useRoom(schoolId: string | undefined, id: string | undefined) {
  return useQuery<RoomResponse>({
    queryKey: queryKeys.rooms.detail(schoolId!, id!),
    queryFn: () => roomsApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/** Create a new room */
export function useCreateRoom(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoomRequest) => roomsApi.create(schoolId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rooms.all(schoolId),
      });
    },
  });
}

/** Update an existing room */
export function useUpdateRoom(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoomRequest }) =>
      roomsApi.update(schoolId, id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rooms.all(schoolId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.rooms.detail(schoolId, id),
      });
    },
  });
}

/** Delete a room */
export function useDeleteRoom(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => roomsApi.delete(schoolId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rooms.all(schoolId),
      });
    },
  });
}
