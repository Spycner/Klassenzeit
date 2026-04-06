"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiClient } from "@/hooks/use-api-client";
import type {
  AvailabilityType,
  TeacherAvailabilityEntry,
  TeacherResponse,
  TimeSlotResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  teacher: TeacherResponse | null;
  timeslots: TimeSlotResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function cycle(state: AvailabilityType): AvailabilityType {
  if (state === "available") return "preferred";
  if (state === "preferred") return "blocked";
  return "available";
}

function cellClass(state: AvailabilityType): string {
  switch (state) {
    case "preferred":
      return "bg-green-100 hover:bg-green-200 text-green-900";
    case "blocked":
      return "bg-red-100 hover:bg-red-200 text-red-900";
    default:
      return "bg-muted hover:bg-muted/80 text-muted-foreground";
  }
}

export function TeacherAvailabilityDialog({
  teacher,
  timeslots,
  open,
  onOpenChange,
}: Props) {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.teachers.availability");
  // Day names live under settings.rooms.dayNames (same source as timeslot-capacity-grid).
  const tGrid = useTranslations("settings.rooms");

  const [cells, setCells] = useState<Map<string, AvailabilityType>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { days, periods } = useMemo(() => {
    const daySet = new Set<number>();
    const periodSet = new Set<number>();
    for (const ts of timeslots) {
      if (!ts.is_break) {
        daySet.add(ts.day_of_week);
        periodSet.add(ts.period);
      }
    }
    return {
      days: [...daySet].sort((a, b) => a - b),
      periods: [...periodSet].sort((a, b) => a - b),
    };
  }, [timeslots]);

  const dayNames: string[] = tGrid.raw("dayNames");

  const load = useCallback(() => {
    if (!teacher || !open) return;
    setLoading(true);
    apiClient
      .get<TeacherAvailabilityEntry[]>(
        `/api/schools/${schoolId}/teachers/${teacher.id}/availabilities`,
      )
      .then((entries) => {
        const next = new Map<string, AvailabilityType>();
        for (const e of entries) {
          next.set(`${e.day_of_week}-${e.period}`, e.availability_type);
        }
        setCells(next);
      })
      .catch(() => toast.error(t("error_toast")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, teacher, open, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setCells(new Map());
    }
  }, [open]);

  const getCell = (day: number, period: number): AvailabilityType =>
    cells.get(`${day}-${period}`) ?? "available";

  const handleCellClick = (day: number, period: number) => {
    const key = `${day}-${period}`;
    const current = cells.get(key) ?? "available";
    const next = cycle(current);
    const newCells = new Map(cells);
    if (next === "available") {
      newCells.delete(key);
    } else {
      newCells.set(key, next);
    }
    setCells(newCells);
  };

  const handleSave = async () => {
    if (!teacher) return;
    setSaving(true);
    const body: TeacherAvailabilityEntry[] = [];
    for (const [key, value] of cells.entries()) {
      const [day, period] = key.split("-").map(Number);
      body.push({
        day_of_week: day,
        period,
        availability_type: value,
      });
    }
    try {
      await apiClient.put<void>(
        `/api/schools/${schoolId}/teachers/${teacher.id}/availabilities`,
        body,
      );
      toast.success(t("saved_toast"));
      onOpenChange(false);
    } catch {
      toast.error(t("error_toast"));
    } finally {
      setSaving(false);
    }
  };

  if (!teacher) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("dialog_title", {
              name: `${teacher.first_name} ${teacher.last_name}`,
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 items-center text-xs">
          <div className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded bg-muted" />
            {t("legend.available")}
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded bg-green-100" />
            {t("legend.preferred")}
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded bg-red-100" />
            {t("legend.blocked")}
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : (
          <div
            className="overflow-x-auto"
            data-testid="teacher-availability-grid"
          >
            <table className="w-full border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-xs font-medium text-muted-foreground p-1">
                    #
                  </th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className="text-xs font-medium text-muted-foreground p-1"
                    >
                      {dayNames[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p}>
                    <td className="text-xs font-medium text-muted-foreground p-1 text-right">
                      {p}
                    </td>
                    {days.map((d) => {
                      const state = getCell(d, p);
                      return (
                        <td key={d} className="p-0">
                          <button
                            type="button"
                            data-testid={`cell-${d}-${p}`}
                            onClick={() => handleCellClick(d, p)}
                            className={cn(
                              "w-full h-10 rounded text-xs transition-colors",
                              cellClass(state),
                            )}
                          >
                            {state === "available"
                              ? ""
                              : state.charAt(0).toUpperCase()}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
