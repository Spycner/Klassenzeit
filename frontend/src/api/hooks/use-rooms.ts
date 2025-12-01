/**
 * React Query hooks for Rooms
 *
 * Provides data fetching and mutation hooks for managing rooms.
 * All hooks automatically handle caching, invalidation, and refetching.
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

/**
 * Fetches all rooms for a specific school.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @returns Query result containing an array of room summaries
 * @example
 * ```tsx
 * function RoomList({ schoolId }: { schoolId: string }) {
 *   const { data: rooms, isLoading } = useRooms(schoolId);
 *   return <ul>{rooms?.map(r => <li key={r.id}>{r.name}</li>)}</ul>;
 * }
 * ```
 */
export function useRooms(schoolId: string | undefined) {
  return useQuery<RoomSummary[]>({
    queryKey: queryKeys.rooms.all(schoolId!),
    queryFn: () => roomsApi.list(schoolId!),
    enabled: !!schoolId,
  });
}

/**
 * Fetches a single room by ID.
 *
 * @param schoolId - The unique identifier of the parent school (query is disabled if undefined)
 * @param id - The unique identifier of the room (query is disabled if undefined)
 * @returns Query result containing full room details
 * @example
 * ```tsx
 * function RoomDetail({ schoolId, roomId }: Props) {
 *   const { data: room } = useRoom(schoolId, roomId);
 *   return <h1>{room?.name} (Capacity: {room?.capacity})</h1>;
 * }
 * ```
 */
export function useRoom(schoolId: string | undefined, id: string | undefined) {
  return useQuery<RoomResponse>({
    queryKey: queryKeys.rooms.detail(schoolId!, id!),
    queryFn: () => roomsApi.get(schoolId!, id!),
    enabled: !!schoolId && !!id,
  });
}

/**
 * Creates a new room within a school.
 *
 * On success, automatically invalidates the rooms list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function CreateRoomForm({ schoolId }: { schoolId: string }) {
 *   const createRoom = useCreateRoom(schoolId);
 *   const handleSubmit = (data: CreateRoomRequest) => {
 *     createRoom.mutate(data, { onSuccess: () => navigate("/rooms") });
 *   };
 * }
 * ```
 */
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

/**
 * Updates an existing room.
 *
 * On success, automatically invalidates both the rooms list and the specific
 * room detail cache to ensure fresh data.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function EditRoomForm({ schoolId, room }: Props) {
 *   const updateRoom = useUpdateRoom(schoolId);
 *   const handleSubmit = (data: UpdateRoomRequest) => {
 *     updateRoom.mutate({ id: room.id, data });
 *   };
 * }
 * ```
 */
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

/**
 * Deletes a room.
 *
 * On success, automatically invalidates the rooms list cache.
 *
 * @param schoolId - The unique identifier of the parent school
 * @returns Mutation object with mutate/mutateAsync functions
 * @example
 * ```tsx
 * function DeleteRoomButton({ schoolId, roomId }: Props) {
 *   const deleteRoom = useDeleteRoom(schoolId);
 *   return <button onClick={() => deleteRoom.mutate(roomId)}>Delete</button>;
 * }
 * ```
 */
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
