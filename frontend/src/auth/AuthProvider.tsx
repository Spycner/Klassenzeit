import { type ReactNode, useEffect } from "react";
import {
  AuthProvider as OidcAuthProvider,
  useAuth as useOidcAuth,
} from "react-oidc-context";

import { setTokenGetter } from "@/api/client";

const oidcConfig = {
  authority: `${import.meta.env.VITE_KEYCLOAK_URL}/realms/${import.meta.env.VITE_KEYCLOAK_REALM}`,
  client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: window.location.origin,
  scope: "openid profile email",
  automaticSilentRenew: true,
  onSigninCallback: () => {
    // Remove OIDC query params from URL after successful login
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Internal component that syncs the access token with the API client.
 * Must be rendered inside the OIDC provider.
 */
function TokenSync() {
  const auth = useOidcAuth();

  useEffect(() => {
    setTokenGetter(() => auth.user?.access_token ?? null);
  }, [auth.user?.access_token]);

  return null;
}

/**
 * Authentication provider that wraps the application.
 * Handles OIDC authentication with Keycloak and syncs tokens to the API client.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <OidcAuthProvider {...oidcConfig}>
      <TokenSync />
      {children}
    </OidcAuthProvider>
  );
}
