import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router";

import { LoadingState } from "@/components/shared/LoadingState";

import { useAuth } from "./AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Route guard component that redirects unauthenticated users to the home page.
 * Shows a loading state while checking authentication status.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const { i18n, t } = useTranslation("auth");
  const location = useLocation();

  if (isLoading) {
    return (
      <LoadingState message={t("checkingAuth", "Checking authentication...")} />
    );
  }

  if (!isAuthenticated) {
    // Store return URL for post-login redirect
    sessionStorage.setItem("returnTo", location.pathname + location.search);
    // Redirect to home page
    return <Navigate to={`/${i18n.language}`} replace />;
  }

  return <>{children}</>;
}
