import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("dashboard.welcome")}</p>
    </div>
  );
}
