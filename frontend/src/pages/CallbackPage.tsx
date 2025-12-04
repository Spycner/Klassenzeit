import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { useNavigate } from "react-router";

import { LoadingState } from "@/components/shared/LoadingState";

/**
 * OIDC callback page that handles the redirect after authentication.
 * Redirects to the stored return URL or dashboard on success.
 */
export function CallbackPage() {
  const auth = useOidcAuth();
  const navigate = useNavigate();
  const { i18n, t } = useTranslation("auth");

  useEffect(() => {
    if (!auth.isLoading) {
      if (auth.isAuthenticated) {
        // Get return URL from session storage or default to dashboard
        const returnTo =
          sessionStorage.getItem("returnTo") || `/${i18n.language}/dashboard`;
        sessionStorage.removeItem("returnTo");
        navigate(returnTo, { replace: true });
      } else if (auth.error) {
        console.error("Auth callback error:", auth.error);
        // Redirect to home on error
        navigate(`/${i18n.language}`, { replace: true });
      }
    }
  }, [
    auth.isLoading,
    auth.isAuthenticated,
    auth.error,
    navigate,
    i18n.language,
  ]);

  return <LoadingState message={t("signingIn", "Signing in...")} />;
}
