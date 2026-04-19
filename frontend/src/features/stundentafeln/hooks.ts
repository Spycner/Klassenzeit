import { useQuery } from "@tanstack/react-query";
import { ApiError, client } from "@/lib/api-client";
import type { components } from "@/lib/api-types";

export type Stundentafel = components["schemas"]["StundentafelListResponse"];

export const stundentafelnQueryKey = ["stundentafeln"] as const;

export function useStundentafeln() {
  return useQuery({
    queryKey: stundentafelnQueryKey,
    queryFn: async (): Promise<Stundentafel[]> => {
      const { data } = await client.GET("/stundentafeln");
      if (!data) {
        throw new ApiError(500, null, "Empty response from /stundentafeln");
      }
      return data;
    },
  });
}
