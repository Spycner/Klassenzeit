import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Room = components["schemas"]["RoomListResponse"];
export type RoomCreate = components["schemas"]["RoomCreate"];
export type RoomUpdate = components["schemas"]["RoomUpdate"];

export const roomsQueryKey = ["rooms"] as const;

export function useRooms() {
  return useQuery({
    queryKey: roomsQueryKey,
    queryFn: async (): Promise<Room[]> => {
      const { data } = await client.GET("/rooms");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /rooms");
      }
      return data;
    },
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoomCreate): Promise<Room> => {
      const { data } = await client.POST("/rooms", { body });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /rooms");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: RoomUpdate }): Promise<Room> => {
      const { data } = await client.PATCH("/rooms/{room_id}", {
        params: { path: { room_id: id } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from PATCH /rooms/{id}");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/rooms/{room_id}", {
        params: { path: { room_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}
