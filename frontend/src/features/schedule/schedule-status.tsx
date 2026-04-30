import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Lesson } from "@/features/lessons/hooks";
import { violationItemKey } from "@/i18n/violation-keys";
import type { Violation } from "./hooks";

interface ScheduleStatusProps {
  placementsCount: number;
  expectedHours: number;
  violations: Violation[] | undefined;
  lessonById: Map<string, Lesson>;
}

export function ScheduleStatus({
  placementsCount,
  expectedHours,
  violations,
  lessonById,
}: ScheduleStatusProps) {
  const { t } = useTranslation();
  const derivedUnplaced = Math.max(0, expectedHours - placementsCount);
  const hasTypedViolations = violations !== undefined && violations.length > 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span>{t("schedule.stats.placements", { count: placementsCount })}</span>
        {!hasTypedViolations && derivedUnplaced > 0 ? (
          <span className="text-amber-700 dark:text-amber-400">
            {t("schedule.stats.unplaced", { count: derivedUnplaced })}
          </span>
        ) : null}
      </div>
      {hasTypedViolations ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            {t("schedule.violations.title")}
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {violations?.map((v) => {
              const lesson = lessonById.get(v.lesson_id);
              const fallback = t("schedule.cellDeletedLesson");
              return (
                <li key={`${v.lesson_id}:${v.hour_index}:${v.kind}`}>
                  {t(violationItemKey(v.kind), {
                    subject: lesson?.subject.name ?? fallback,
                    hour: v.hour_index + 1,
                    teacher: lesson?.teacher?.last_name ?? fallback,
                    class: lesson ? lesson.school_classes.map((c) => c.name).join(", ") : fallback,
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
