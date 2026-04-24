import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Placement = components["schemas"]["PlacementResponse"];
export type Violation = components["schemas"]["ViolationResponse"];
export type SchedulePostResponse = components["schemas"]["ScheduleResponse"];
export type ScheduleGetResponse = components["schemas"]["ScheduleReadResponse"];

export function scheduleQueryKey(classId: string) {
  return ["schedule", classId] as const;
}

export function useClassSchedule(classId: string | undefined) {
  return useQuery({
    enabled: Boolean(classId),
    queryKey: classId ? scheduleQueryKey(classId) : ["schedule", "disabled"],
    queryFn: async (): Promise<ScheduleGetResponse> => {
      if (!classId) {
        throw new ApiError(400, null, "useClassSchedule called without classId");
      }
      const { data } = await client.GET("/api/classes/{class_id}/schedule", {
        params: { path: { class_id: classId } },
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from GET /schedule");
      }
      return data;
    },
  });
}

export function useGenerateClassSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (classId: string): Promise<SchedulePostResponse> => {
      const { data } = await client.POST("/api/classes/{class_id}/schedule", {
        params: { path: { class_id: classId } },
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /schedule");
      }
      return data;
    },
    onSuccess: (result, classId) => {
      queryClient.setQueryData(scheduleQueryKey(classId), {
        placements: result.placements,
      } satisfies ScheduleGetResponse);
    },
  });
}
