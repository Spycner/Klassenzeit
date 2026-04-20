import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Teacher = components["schemas"]["TeacherListResponse"];
export type TeacherDetail = components["schemas"]["TeacherDetailResponse"];
export type TeacherCreate = components["schemas"]["TeacherCreate"];
export type TeacherUpdate = components["schemas"]["TeacherUpdate"];

export const teachersQueryKey = ["teachers"] as const;
export const teacherDetailQueryKey = (id: string) => ["teachers", id] as const;

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

export function useTeacherDetail(id: string | null) {
  return useQuery({
    queryKey: id ? teacherDetailQueryKey(id) : ["teachers", "none"],
    enabled: id !== null,
    queryFn: async (): Promise<TeacherDetail> => {
      const { data } = await client.GET("/api/teachers/{teacher_id}", {
        params: { path: { teacher_id: id as string } },
      });
      if (!data) throw new ApiError(500, null, "Empty response from GET /teachers/{id}");
      return data;
    },
  });
}

export type TeacherAvailabilityEntry = {
  time_block_id: string;
  status: "available" | "preferred" | "unavailable";
};

export function useSaveTeacherAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      entries,
    }: {
      id: string;
      entries: TeacherAvailabilityEntry[];
    }): Promise<TeacherDetail> => {
      const { data } = await client.PUT("/api/teachers/{teacher_id}/availability", {
        params: { path: { teacher_id: id } },
        body: { entries },
      });
      if (!data) throw new ApiError(500, null, "Empty response from PUT availability");
      return data;
    },
    onSuccess: (_, vars) =>
      queryClient.invalidateQueries({ queryKey: teacherDetailQueryKey(vars.id) }),
  });
}

export function useSaveTeacherQualifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      subjectIds,
    }: {
      id: string;
      subjectIds: string[];
    }): Promise<TeacherDetail> => {
      const { data } = await client.PUT("/api/teachers/{teacher_id}/qualifications", {
        params: { path: { teacher_id: id } },
        body: { subject_ids: subjectIds },
      });
      if (!data) throw new ApiError(500, null, "Empty response from PUT qualifications");
      return data;
    },
    onSuccess: (_, vars) =>
      queryClient.invalidateQueries({ queryKey: teacherDetailQueryKey(vars.id) }),
  });
}
