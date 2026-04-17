import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Subject = components["schemas"]["SubjectResponse"];
export type SubjectCreate = components["schemas"]["SubjectCreate"];
export type SubjectUpdate = components["schemas"]["SubjectUpdate"];

export const subjectsQueryKey = ["subjects"] as const;

export function useSubjects() {
  return useQuery({
    queryKey: subjectsQueryKey,
    queryFn: async (): Promise<Subject[]> => {
      const { data } = await client.GET("/subjects");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /subjects");
      }
      return data;
    },
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubjectCreate): Promise<Subject> => {
      const { data } = await client.POST("/subjects", { body });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /subjects");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectsQueryKey }),
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: SubjectUpdate }): Promise<Subject> => {
      const { data } = await client.PATCH("/subjects/{subject_id}", {
        params: { path: { subject_id: id } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from PATCH /subjects/{id}");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectsQueryKey }),
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/subjects/{subject_id}", {
        params: { path: { subject_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectsQueryKey }),
  });
}
