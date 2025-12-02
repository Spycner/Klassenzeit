import { Check, RotateCcw, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAvailability,
  useCreateAvailability,
  useDeleteAvailability,
  type AvailabilitySummary,
  type AvailabilityType,
  type DayOfWeek,
  type Period,
} from "@/api";
import { LoadingState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AvailabilitySectionProps {
  schoolId: string;
  teacherId: string;
}

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4];
const PERIODS: Period[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const AVAILABILITY_CYCLE: AvailabilityType[] = [
  "AVAILABLE",
  "PREFERRED",
  "BLOCKED",
];

function getNextAvailability(current: AvailabilityType): AvailabilityType {
  const index = AVAILABILITY_CYCLE.indexOf(current);
  return AVAILABILITY_CYCLE[(index + 1) % AVAILABILITY_CYCLE.length];
}

function getCellStyles(type: AvailabilityType): string {
  switch (type) {
    case "PREFERRED":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "BLOCKED":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    default:
      return "bg-background hover:bg-muted/50";
  }
}

function getCellIcon(type: AvailabilityType) {
  switch (type) {
    case "PREFERRED":
      return <Check className="h-4 w-4" />;
    case "BLOCKED":
      return <X className="h-4 w-4" />;
    default:
      return null;
  }
}

export function AvailabilitySection({
  schoolId,
  teacherId,
}: AvailabilitySectionProps) {
  const { t } = useTranslation("pages");

  const { data: availability, isLoading } = useAvailability(schoolId, teacherId);
  const createMutation = useCreateAvailability(schoolId, teacherId);
  const deleteMutation = useDeleteAvailability(schoolId, teacherId);

  const [pendingChanges, setPendingChanges] = useState<Map<string, AvailabilityType>>(
    new Map(),
  );

  // Build a map of day-period to availability for quick lookup
  const availabilityMap = useMemo(() => {
    const map = new Map<string, AvailabilitySummary>();
    availability?.forEach((a) => {
      map.set(`${a.dayOfWeek}-${a.period}`, a);
    });
    return map;
  }, [availability]);

  const getKey = (day: DayOfWeek, period: Period) => `${day}-${period}`;

  const getCurrentType = (day: DayOfWeek, period: Period): AvailabilityType => {
    const key = getKey(day, period);
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key)!;
    }
    const existing = availabilityMap.get(key);
    return existing?.availabilityType ?? "AVAILABLE";
  };

  const handleCellClick = useCallback(
    (day: DayOfWeek, period: Period) => {
      const key = `${day}-${period}`;

      setPendingChanges((prev) => {
        // Get current type from pending changes or availability map
        const pendingType = prev.get(key);
        const existing = availabilityMap.get(key);
        const current = pendingType ?? existing?.availabilityType ?? "AVAILABLE";
        const next = getNextAvailability(current);

        const newMap = new Map(prev);
        // If next state matches original state, remove from pending
        if (existing?.availabilityType === next || (!existing && next === "AVAILABLE")) {
          newMap.delete(key);
        } else {
          newMap.set(key, next);
        }
        return newMap;
      });
    },
    [availabilityMap],
  );

  const handleSave = async () => {
    const promises: Promise<void>[] = [];

    for (const [key, newType] of pendingChanges) {
      const [dayStr, periodStr] = key.split("-");
      const day = Number(dayStr) as DayOfWeek;
      const period = Number(periodStr) as Period;
      const existing = availabilityMap.get(key);

      if (existing) {
        // Delete existing entry
        promises.push(deleteMutation.mutateAsync(existing.id));
      }

      if (newType !== "AVAILABLE") {
        // Create new entry (AVAILABLE is the default, so no need to create)
        promises.push(
          createMutation.mutateAsync({
            dayOfWeek: day,
            period: period,
            availabilityType: newType,
          }).then(() => {}),
        );
      }
    }

    await Promise.all(promises);
    setPendingChanges(new Map());
  };

  const handleReset = () => {
    setPendingChanges(new Map());
  };

  const handleSetAll = (type: AvailabilityType) => {
    const newChanges = new Map<string, AvailabilityType>();
    for (const day of DAYS) {
      for (const period of PERIODS) {
        const key = getKey(day, period);
        const existing = availabilityMap.get(key);
        // Only add to pending if different from current state
        if (existing?.availabilityType !== type && !(type === "AVAILABLE" && !existing)) {
          newChanges.set(key, type);
        }
      }
    }
    setPendingChanges(newChanges);
  };

  const hasChanges = pendingChanges.size > 0;
  const isSaving = createMutation.isPending || deleteMutation.isPending;

  const dayNames = [
    t("teachers.availability.days.monday"),
    t("teachers.availability.days.tuesday"),
    t("teachers.availability.days.wednesday"),
    t("teachers.availability.days.thursday"),
    t("teachers.availability.days.friday"),
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">
            {t("teachers.availability.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("teachers.availability.description")}
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t("teachers.availability.reset")}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? t("common:saving") : t("common:save")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="space-y-4">
            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded border" />
                <span>{t("teachers.availability.types.AVAILABLE")}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <span>{t("teachers.availability.types.PREFERRED")}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </div>
                <span>{t("teachers.availability.types.BLOCKED")}</span>
              </div>
            </div>

            {/* Bulk actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSetAll("AVAILABLE")}
              >
                {t("teachers.availability.setAllAvailable")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSetAll("BLOCKED")}
              >
                {t("teachers.availability.setAllBlocked")}
              </Button>
            </div>

            {/* Grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[500px]">
                {/* Header row with day names */}
                <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1">
                  <div className="w-12" /> {/* Empty corner cell */}
                  {DAYS.map((day) => (
                    <div
                      key={day}
                      className="py-2 text-center text-sm font-medium"
                    >
                      {dayNames[day]}
                    </div>
                  ))}
                </div>

                {/* Period rows */}
                {PERIODS.map((period) => (
                  <div
                    key={period}
                    className="grid grid-cols-[auto_repeat(5,1fr)] gap-1"
                  >
                    {/* Period label */}
                    <div className="flex w-12 items-center justify-center text-sm text-muted-foreground">
                      {period}
                    </div>

                    {/* Day cells */}
                    {DAYS.map((day) => {
                      const type = getCurrentType(day, period);
                      const key = getKey(day, period);
                      const hasPendingChange = pendingChanges.has(key);

                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => handleCellClick(day, period)}
                          disabled={isSaving}
                          className={cn(
                            "flex h-10 items-center justify-center rounded border transition-all",
                            getCellStyles(type),
                            hasPendingChange && "ring-2 ring-primary ring-offset-1",
                            "hover:scale-[1.02] active:scale-[0.98]",
                            "focus:outline-none focus:ring-2 focus:ring-primary",
                          )}
                          aria-label={`${dayNames[day]} ${t("teachers.availability.period")} ${period}: ${t(`teachers.availability.types.${type}`)}`}
                        >
                          {getCellIcon(type)}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {hasChanges && (
              <p className="text-sm text-muted-foreground">
                {t("teachers.availability.unsavedChanges", {
                  count: pendingChanges.size,
                })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
