"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  RoomResponse,
  SchoolClassResponse,
  TeacherResponse,
  TimetableViewMode,
} from "@/lib/types";

interface ViewModeSelectorProps {
  schoolId: string;
  viewMode: TimetableViewMode;
  selectedEntityId: string | null;
  classes: SchoolClassResponse[];
  teachers: TeacherResponse[];
  rooms: RoomResponse[];
  onChange: (next: {
    viewMode: TimetableViewMode;
    selectedEntityId: string | null;
  }) => void;
}

interface PersistedView {
  viewMode: TimetableViewMode;
  selectedEntityId: string | null;
}

function storageKey(schoolId: string) {
  return `timetable:lastView:${schoolId}`;
}

export function loadPersistedView(schoolId: string): PersistedView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedView;
    if (
      parsed &&
      ["class", "teacher", "room"].includes(parsed.viewMode) &&
      (typeof parsed.selectedEntityId === "string" ||
        parsed.selectedEntityId === null)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function ViewModeSelector({
  schoolId,
  viewMode,
  selectedEntityId,
  classes,
  teachers,
  rooms,
  onChange,
}: ViewModeSelectorProps) {
  const t = useTranslations("timetable");

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      storageKey(schoolId),
      JSON.stringify({ viewMode, selectedEntityId }),
    );
  }, [schoolId, viewMode, selectedEntityId]);

  function firstEntityId(mode: TimetableViewMode): string | null {
    switch (mode) {
      case "class":
        return classes[0]?.id ?? null;
      case "teacher":
        return teachers[0]?.id ?? null;
      case "room":
        return rooms[0]?.id ?? null;
    }
  }

  function persist(next: PersistedView) {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey(schoolId), JSON.stringify(next));
  }

  function handleModeChange(mode: TimetableViewMode) {
    const next = { viewMode: mode, selectedEntityId: firstEntityId(mode) };
    persist(next);
    onChange(next);
  }

  function handleEntityChange(val: string) {
    const next = { viewMode, selectedEntityId: val };
    persist(next);
    onChange(next);
  }

  const entityOptions: { id: string; label: string }[] =
    viewMode === "class"
      ? classes.map((c) => ({ id: c.id, label: c.name }))
      : viewMode === "teacher"
        ? teachers.map((tc) => ({
            id: tc.id,
            label: `${tc.first_name} ${tc.last_name}`,
          }))
        : rooms.map((r) => ({ id: r.id, label: r.name }));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border p-0.5">
        {(["class", "teacher", "room"] as TimetableViewMode[]).map((mode) => (
          <Button
            key={mode}
            type="button"
            variant={viewMode === mode ? "default" : "ghost"}
            size="sm"
            onClick={() => handleModeChange(mode)}
          >
            {t(`viewMode.${mode}`)}
          </Button>
        ))}
      </div>

      {entityOptions.length > 0 && (
        <Select
          value={selectedEntityId ?? ""}
          onValueChange={handleEntityChange}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {entityOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
