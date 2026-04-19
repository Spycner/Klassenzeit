import { useTranslation } from "react-i18next";
import { NextSteps } from "./next-steps";
import { QuickAdd } from "./quick-add";
import { ReadinessChecklist } from "./readiness-checklist";
import { RecentlyEdited } from "./recently-edited";
import { StatGrid } from "./stat-grid";

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.welcome")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
      </div>
      <StatGrid />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <ReadinessChecklist />
          <NextSteps />
        </div>
        <div className="space-y-4">
          <QuickAdd />
          <RecentlyEdited />
        </div>
      </div>
    </div>
  );
}
