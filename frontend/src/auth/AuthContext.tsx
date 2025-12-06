import { useAuth as useOidcAuth } from "react-oidc-context";

import type { AuthContextValue } from "./types";

/**
 * Custom auth hook that wraps react-oidc-context.
 * Provides a simplified API for components.
 */
export function useAuth(): AuthContextValue {
  const auth = useOidcAuth();

  return {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    accessToken: auth.user?.access_token ?? null,
    error: auth.error ?? null,
    login: () => auth.signinRedirect(),
    logout: () =>
      auth.signoutRedirect({
        post_logout_redirect_uri: window.location.origin,
      }),
  };
}
