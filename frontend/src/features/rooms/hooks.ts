import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Room = components["schemas"]["RoomListResponse"];
export type RoomDetail = components["schemas"]["RoomDetailResponse"];
export type RoomCreate = components["schemas"]["RoomCreate"];
export type RoomUpdate = components["schemas"]["RoomUpdate"];

export const roomsQueryKey = ["rooms"] as const;
export const roomDetailQueryKey = (id: string) => ["rooms", id] as const;

export function useRooms() {
  return useQuery({
    queryKey: roomsQueryKey,
    queryFn: async (): Promise<Room[]> => {
      const { data } = await client.GET("/api/rooms");
      if (!data) throw new ApiError(500, null, "Empty response from /rooms");
      return data;
    },
  });
}

export function useRoomDetail(id: string | null) {
  return useQuery({
    queryKey: id ? roomDetailQueryKey(id) : ["rooms", "none"],
    enabled: id !== null,
    queryFn: async (): Promise<RoomDetail> => {
      const { data } = await client.GET("/api/rooms/{room_id}", {
        params: { path: { room_id: id as string } },
      });
      if (!data) throw new ApiError(500, null, "Empty response from GET /rooms/{id}");
      return data;
    },
  });
}

async function putSuitability(roomId: string, subjectIds: string[]): Promise<void> {
  await client.PUT("/api/rooms/{room_id}/suitability", {
    params: { path: { room_id: roomId } },
    body: { subject_ids: subjectIds },
  });
}

export function useCreateRoomWithSuitability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      base: RoomCreate;
      suitable_subject_ids: string[];
    }): Promise<Room> => {
      const { data } = await client.POST("/api/rooms", { body: args.base });
      if (!data) throw new ApiError(500, null, "Empty response from POST /rooms");
      if (args.suitable_subject_ids.length > 0) {
        await putSuitability(data.id, args.suitable_subject_ids);
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}

export function useUpdateRoomWithSuitability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      base: RoomUpdate;
      suitable_subject_ids: string[];
      original_suitable_subject_ids: string[];
    }): Promise<Room> => {
      const { data } = await client.PATCH("/api/rooms/{room_id}", {
        params: { path: { room_id: args.id } },
        body: args.base,
      });
      if (!data) throw new ApiError(500, null, "Empty response from PATCH /rooms/{id}");
      const changed =
        args.suitable_subject_ids.length !== args.original_suitable_subject_ids.length ||
        args.suitable_subject_ids.some((id, i) => id !== args.original_suitable_subject_ids[i]);
      if (changed) {
        await putSuitability(args.id, args.suitable_subject_ids);
      }
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: roomsQueryKey });
      queryClient.invalidateQueries({ queryKey: roomDetailQueryKey(vars.id) });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/rooms/{room_id}", {
        params: { path: { room_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roomsQueryKey }),
  });
}

export function useSaveRoomAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      timeBlockIds,
    }: {
      id: string;
      timeBlockIds: string[];
    }): Promise<RoomDetail> => {
      const { data } = await client.PUT("/api/rooms/{room_id}/availability", {
        params: { path: { room_id: id } },
        body: { time_block_ids: timeBlockIds },
      });
      if (!data) throw new ApiError(500, null, "Empty response from PUT availability");
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: roomDetailQueryKey(vars.id) });
    },
  });
}
