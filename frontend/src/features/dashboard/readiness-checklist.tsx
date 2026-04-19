import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRooms } from "@/features/rooms/hooks";
import { useSubjects } from "@/features/subjects/hooks";
import { useTeachers } from "@/features/teachers/hooks";
import { useWeekSchemes } from "@/features/week-schemes/hooks";
import { cn } from "@/lib/utils";

export function ReadinessChecklist() {
  const { t } = useTranslation();
  const rooms = useRooms();
  const teachers = useTeachers();
  const subjects = useSubjects();
  const weekSchemes = useWeekSchemes();

  const items = [
    {
      key: "subjectsCatalogue" as const,
      label: t("dashboard.readinessItems.subjectsCatalogue"),
      ok: (subjects.data?.length ?? 0) > 0,
    },
    {
      key: "roomsDefined" as const,
      label: t("dashboard.readinessItems.roomsDefined"),
      ok: (rooms.data?.length ?? 0) > 0,
    },
    {
      key: "teachersDefined" as const,
      label: t("dashboard.readinessItems.teachersDefined"),
      ok: (teachers.data?.length ?? 0) > 0,
    },
    {
      key: "weekSchemeDefined" as const,
      label: t("dashboard.readinessItems.weekSchemeDefined"),
      ok: (weekSchemes.data?.length ?? 0) > 0,
    },
  ];

  const okCount = items.filter((item) => item.ok).length;
  const pct = Math.round((okCount / items.length) * 100);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("dashboard.readiness")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.readinessSub")}</p>
        </div>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-2.5 text-xs font-medium text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {pct}%
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-4 w-4 place-items-center rounded-[4px] border",
                item.ok
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-transparent",
              )}
            >
              {item.ok ? <Check className="h-3 w-3" /> : null}
            </span>
            <span className={cn(item.ok && "text-muted-foreground line-through")}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
