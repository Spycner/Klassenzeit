import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type SchoolClass = components["schemas"]["SchoolClassResponse"];
export type SchoolClassCreate = components["schemas"]["SchoolClassCreate"];
export type SchoolClassUpdate = components["schemas"]["SchoolClassUpdate"];

export const schoolClassesQueryKey = ["school-classes"] as const;

export function useSchoolClasses() {
  return useQuery({
    queryKey: schoolClassesQueryKey,
    queryFn: async (): Promise<SchoolClass[]> => {
      const { data } = await client.GET("/classes");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /classes");
      }
      return data;
    },
  });
}

export function useCreateSchoolClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SchoolClassCreate): Promise<SchoolClass> => {
      const { data } = await client.POST("/classes", { body });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /classes");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolClassesQueryKey }),
  });
}

export function useUpdateSchoolClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: SchoolClassUpdate;
    }): Promise<SchoolClass> => {
      const { data } = await client.PATCH("/classes/{class_id}", {
        params: { path: { class_id: id } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from PATCH /classes/{id}");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolClassesQueryKey }),
  });
}

export function useDeleteSchoolClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/classes/{class_id}", {
        params: { path: { class_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolClassesQueryKey }),
  });
}
