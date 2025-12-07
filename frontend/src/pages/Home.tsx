import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";

import { useAuth } from "@/auth";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";

export function Home() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, isLoading, login } = useAuth();

  // Show loading while checking auth status
  if (isLoading) {
    return <LoadingState />;
  }

  // Redirect authenticated users to dashboard
  if (isAuthenticated) {
    return <Navigate to={`/${i18n.language}/dashboard`} replace />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">{t("appName")}</h1>
      <p className="text-muted-foreground">{t("pages:home.tagline")}</p>
      <Button onClick={login}>{t("auth:login", "Log in")}</Button>
    </main>
  );
}
