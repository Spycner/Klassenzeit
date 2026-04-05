"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { TimeSlotResponse, TimeslotCapacityOverride } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  timeslots: TimeSlotResponse[];
  maxConcurrent: number;
  overrides: TimeslotCapacityOverride[];
  onChange: (overrides: TimeslotCapacityOverride[]) => void;
  disabled?: boolean;
}

export function TimeslotCapacityGrid({
  timeslots,
  maxConcurrent,
  overrides,
  onChange,
  disabled,
}: Props) {
  const t = useTranslations("settings.rooms");
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const { days, periods } = useMemo(() => {
    const daySet = new Set<number>();
    const periodSet = new Set<number>();
    for (const ts of timeslots) {
      daySet.add(ts.day_of_week);
      periodSet.add(ts.period);
    }
    return {
      days: [...daySet].sort((a, b) => a - b),
      periods: [...periodSet].sort((a, b) => a - b),
    };
  }, [timeslots]);

  const dayNames: string[] = t.raw("dayNames");

  const slotLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of timeslots) {
      map.set(`${ts.day_of_week}-${ts.period}`, ts.id);
    }
    return map;
  }, [timeslots]);

  const overrideLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of overrides) {
      map.set(o.timeslot_id, o.capacity);
    }
    return map;
  }, [overrides]);

  const getEffectiveCapacity = useCallback(
    (timeslotId: string) => overrideLookup.get(timeslotId) ?? maxConcurrent,
    [overrideLookup, maxConcurrent],
  );

  const handleCellChange = useCallback(
    (timeslotId: string, value: number) => {
      if (value === maxConcurrent) {
        onChange(overrides.filter((o) => o.timeslot_id !== timeslotId));
      } else {
        const existing = overrides.filter((o) => o.timeslot_id !== timeslotId);
        onChange([...existing, { timeslot_id: timeslotId, capacity: value }]);
      }
      setEditingCell(null);
    },
    [maxConcurrent, overrides, onChange],
  );

  if (timeslots.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("capacityGrid")}</p>
      <p className="text-xs text-muted-foreground">{t("capacityGridHint")}</p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-muted-foreground">{t("period")}</th>
              {days.map((day) => (
                <th key={day} className="p-2 text-center font-medium">
                  {dayNames[day] ?? `Day ${day}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period}>
                <td className="p-2 text-muted-foreground">{period + 1}</td>
                {days.map((day) => {
                  const key = `${day}-${period}`;
                  const timeslotId = slotLookup.get(key);
                  if (!timeslotId) return <td key={key} className="p-2" />;

                  const cap = getEffectiveCapacity(timeslotId);
                  const isOverride = overrideLookup.has(timeslotId);
                  const isEditing = editingCell === timeslotId;

                  return (
                    <td key={key} className="p-1">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-14 text-center"
                          defaultValue={cap}
                          autoFocus
                          disabled={disabled}
                          onBlur={(e) =>
                            handleCellChange(
                              timeslotId,
                              Number(e.target.value) || 0,
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleCellChange(
                                timeslotId,
                                Number((e.target as HTMLInputElement).value) ||
                                  0,
                              );
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            "flex h-8 w-14 items-center justify-center rounded border text-sm",
                            cap === 0
                              ? "border-destructive/30 bg-destructive/10 text-destructive line-through"
                              : isOverride
                                ? "border-primary/30 bg-primary/10 font-medium text-primary"
                                : "border-muted bg-muted/50 text-muted-foreground",
                          )}
                          onClick={() =>
                            !disabled && setEditingCell(timeslotId)
                          }
                          disabled={disabled}
                        >
                          {cap}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
