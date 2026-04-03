import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSchool } from "@/hooks/use-school";
import { type ApiClient, createApiClient } from "@/lib/api-client";

export function useApiClient(): ApiClient {
  const { token } = useAuth();
  const { selectedSchoolId } = useSchool();

  return useMemo(
    () =>
      createApiClient(
        () => token,
        () => selectedSchoolId,
      ),
    [token, selectedSchoolId],
  );
}
