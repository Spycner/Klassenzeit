import { createFileRoute } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authed/")({
  component: Dashboard,
});

function Dashboard() {
  const { t } = useTranslation();
  const me = useMe();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
      <p className="text-sm text-muted-foreground">
        {me.data ? (
          <Trans
            i18nKey="dashboard.welcomeEmail"
            values={{ email: me.data.email }}
            components={{ strong: <strong /> }}
          />
        ) : (
          t("dashboard.welcome")
        )}
      </p>
    </div>
  );
}
