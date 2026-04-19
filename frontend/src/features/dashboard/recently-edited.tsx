import { useTranslation } from "react-i18next";

export function RecentlyEdited() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{t("dashboard.recent")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.recentPlaceholder")}</p>
    </div>
  );
}
