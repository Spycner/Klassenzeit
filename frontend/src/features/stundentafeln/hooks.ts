import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Stundentafel = components["schemas"]["StundentafelListResponse"];
export type StundentafelDetail = components["schemas"]["StundentafelDetailResponse"];
export type StundentafelEntry = components["schemas"]["StundentafelEntryResponse"];
export type StundentafelCreate = components["schemas"]["StundentafelCreate"];
export type StundentafelUpdate = components["schemas"]["StundentafelUpdate"];
export type EntryCreate = components["schemas"]["EntryCreate"];
export type EntryUpdate = components["schemas"]["EntryUpdate"];

export const stundentafelnQueryKey = ["stundentafeln"] as const;
export const stundentafelDetailQueryKey = (id: string) => ["stundentafeln", id] as const;

export function useStundentafeln() {
  return useQuery({
    queryKey: stundentafelnQueryKey,
    queryFn: async (): Promise<Stundentafel[]> => {
      const { data } = await client.GET("/api/stundentafeln");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /stundentafeln");
      }
      return data;
    },
  });
}

export function useStundentafel(id: string | null) {
  return useQuery({
    queryKey: id ? stundentafelDetailQueryKey(id) : ["stundentafeln", "null"],
    enabled: id !== null,
    queryFn: async (): Promise<StundentafelDetail> => {
      if (!id) {
        throw new ApiError(500, null, "useStundentafel called with null id");
      }
      const { data } = await client.GET("/api/stundentafeln/{tafel_id}", {
        params: { path: { tafel_id: id } },
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from /stundentafeln/{id}");
      }
      return data;
    },
  });
}

export function useCreateStundentafel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: StundentafelCreate): Promise<Stundentafel> => {
      const { data } = await client.POST("/api/stundentafeln", { body });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /stundentafeln");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stundentafelnQueryKey }),
  });
}

export function useUpdateStundentafel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: StundentafelUpdate;
    }): Promise<Stundentafel> => {
      const { data } = await client.PATCH("/api/stundentafeln/{tafel_id}", {
        params: { path: { tafel_id: id } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from PATCH /stundentafeln/{id}");
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: stundentafelnQueryKey });
      queryClient.invalidateQueries({
        queryKey: stundentafelDetailQueryKey(variables.id),
      });
    },
  });
}

export function useDeleteStundentafel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/stundentafeln/{tafel_id}", {
        params: { path: { tafel_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stundentafelnQueryKey }),
  });
}

export function useCreateStundentafelEntry(tafelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: EntryCreate): Promise<StundentafelEntry> => {
      const { data } = await client.POST("/api/stundentafeln/{tafel_id}/entries", {
        params: { path: { tafel_id: tafelId } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /stundentafeln/{id}/entries");
      }
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: stundentafelDetailQueryKey(tafelId),
      }),
  });
}

export function useUpdateStundentafelEntry(tafelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entryId,
      body,
    }: {
      entryId: string;
      body: EntryUpdate;
    }): Promise<StundentafelEntry> => {
      const { data } = await client.PATCH("/api/stundentafeln/{tafel_id}/entries/{entry_id}", {
        params: { path: { tafel_id: tafelId, entry_id: entryId } },
        body,
      });
      if (!data) {
        throw new ApiError(
          500,
          null,
          "Empty response from PATCH /stundentafeln/{id}/entries/{entryId}",
        );
      }
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: stundentafelDetailQueryKey(tafelId),
      }),
  });
}

export function useDeleteStundentafelEntry(tafelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      await client.DELETE("/api/stundentafeln/{tafel_id}/entries/{entry_id}", {
        params: { path: { tafel_id: tafelId, entry_id: entryId } },
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: stundentafelDetailQueryKey(tafelId),
      }),
  });
}
