import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type WeekScheme = components["schemas"]["WeekSchemeListResponse"];
export type WeekSchemeCreate = components["schemas"]["WeekSchemeCreate"];
export type WeekSchemeUpdate = components["schemas"]["WeekSchemeUpdate"];

export const weekSchemesQueryKey = ["week-schemes"] as const;

export function useWeekSchemes() {
  return useQuery({
    queryKey: weekSchemesQueryKey,
    queryFn: async (): Promise<WeekScheme[]> => {
      const { data } = await client.GET("/api/week-schemes");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /week-schemes");
      }
      return data;
    },
  });
}

export function useCreateWeekScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: WeekSchemeCreate): Promise<WeekScheme> => {
      const { data } = await client.POST("/api/week-schemes", { body });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /week-schemes");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: weekSchemesQueryKey }),
  });
}

export function useUpdateWeekScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: WeekSchemeUpdate;
    }): Promise<WeekScheme> => {
      const { data } = await client.PATCH("/api/week-schemes/{scheme_id}", {
        params: { path: { scheme_id: id } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from PATCH /week-schemes/{id}");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: weekSchemesQueryKey }),
  });
}

export function useDeleteWeekScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/week-schemes/{scheme_id}", {
        params: { path: { scheme_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: weekSchemesQueryKey }),
  });
}
