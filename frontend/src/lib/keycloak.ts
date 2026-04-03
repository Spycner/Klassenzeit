import Keycloak from "keycloak-js";

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: string;
  schoolId: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  logout: () => void;
}

export function createKeycloak(): Keycloak {
  return new Keycloak({
    url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8080",
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "klassenzeit",
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "klassenzeit-dev",
  });
}

export function parseAuthUser(keycloak: Keycloak): AuthUser | null {
  const parsed = keycloak.tokenParsed;
  if (!parsed) return null;

  const realmRoles: string[] = parsed.realm_access?.roles ?? [];
  const role =
    realmRoles.find((r) => ["admin", "teacher", "viewer"].includes(r)) ??
    "viewer";

  return {
    sub: parsed.sub ?? "",
    email: parsed.email ?? "",
    name: parsed.preferred_username ?? parsed.email ?? "",
    role,
    schoolId: parsed.school_id ?? "",
  };
}
