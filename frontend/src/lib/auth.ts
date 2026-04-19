import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client } from "./api-client";
import type { components } from "./api-types";

export type Me = components["schemas"]["MeResponse"];

export const meQueryKey = ["auth", "me"] as const;

async function fetchMe(): Promise<Me> {
  const { data } = await client.GET("/api/auth/me");
  if (!data) {
    throw new ApiError(500, null, "Empty response from /auth/me");
  }
  return data;
}

export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await client.POST("/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export { fetchMe };
