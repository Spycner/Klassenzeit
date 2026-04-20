import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Teacher = components["schemas"]["TeacherListResponse"];
export type TeacherCreate = components["schemas"]["TeacherCreate"];
export type TeacherUpdate = components["schemas"]["TeacherUpdate"];

export const teachersQueryKey = ["teachers"] as const;

export function useTeachers() {
  return useQuery({
    queryKey: teachersQueryKey,
    queryFn: async (): Promise<Teacher[]> => {
      const { data } = await client.GET("/api/teachers");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /teachers");
      }
      return data;
    },
  });
}

export function useCreateTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: TeacherCreate): Promise<Teacher> => {
      const { data } = await client.POST("/api/teachers", { body });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /teachers");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teachersQueryKey }),
  });
}

export function useUpdateTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: TeacherUpdate }): Promise<Teacher> => {
      const { data } = await client.PATCH("/api/teachers/{teacher_id}", {
        params: { path: { teacher_id: id } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from PATCH /teachers/{id}");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teachersQueryKey }),
  });
}

export function useDeleteTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/teachers/{teacher_id}", {
        params: { path: { teacher_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teachersQueryKey }),
  });
}
