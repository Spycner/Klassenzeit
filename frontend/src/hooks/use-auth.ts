import { use } from "react";
import type { AuthContextValue } from "@/lib/keycloak";
import { AuthContext } from "@/providers/keycloak-provider";

export function useAuth(): AuthContextValue {
  return use(AuthContext);
}
