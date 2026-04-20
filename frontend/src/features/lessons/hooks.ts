import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Lesson = components["schemas"]["LessonResponse"];
export type LessonCreate = components["schemas"]["LessonCreate"];
export type LessonUpdate = components["schemas"]["LessonUpdate"];

export const lessonsQueryKey = ["lessons"] as const;

export function useLessons() {
  return useQuery({
    queryKey: lessonsQueryKey,
    queryFn: async (): Promise<Lesson[]> => {
      const { data } = await client.GET("/api/lessons");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /lessons");
      }
      return data;
    },
  });
}

export function useCreateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: LessonCreate): Promise<Lesson> => {
      const { data } = await client.POST("/api/lessons", { body });
      if (!data) {
        throw new ApiError(500, null, "Empty response from POST /lessons");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lessonsQueryKey }),
  });
}

export function useUpdateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: LessonUpdate }): Promise<Lesson> => {
      const { data } = await client.PATCH("/api/lessons/{lesson_id}", {
        params: { path: { lesson_id: id } },
        body,
      });
      if (!data) {
        throw new ApiError(500, null, "Empty response from PATCH /lessons/{id}");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lessonsQueryKey }),
  });
}

export function useDeleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/api/lessons/{lesson_id}", {
        params: { path: { lesson_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lessonsQueryKey }),
  });
}
