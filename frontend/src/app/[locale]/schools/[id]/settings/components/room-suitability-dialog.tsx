"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useApiClient } from "@/hooks/use-api-client";
import type {
  RoomResponse,
  RoomSuitabilityEntry,
  RoomSuitabilityPutBody,
  SubjectResponse,
} from "@/lib/types";

interface Props {
  room: RoomResponse | null;
  subjects: SubjectResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoomSuitabilityDialog({
  room,
  subjects,
  open,
  onOpenChange,
}: Props) {
  const params = useParams<{ id: string }>();
  const schoolId = params.id;
  const apiClient = useApiClient();
  const t = useTranslations("settings.rooms.suitability");

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!room || !open) return;
    setLoading(true);
    apiClient
      .get<RoomSuitabilityEntry[]>(
        `/api/schools/${schoolId}/rooms/${room.id}/suitabilities`,
      )
      .then((entries) => {
        setChecked(new Set(entries.map((e) => e.subject_id)));
      })
      .catch(() => toast.error(t("error_toast")))
      .finally(() => setLoading(false));
  }, [apiClient, schoolId, room, open, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setChecked(new Set());
    }
  }, [open]);

  const toggle = (subjectId: string) => {
    const next = new Set(checked);
    if (next.has(subjectId)) {
      next.delete(subjectId);
    } else {
      next.add(subjectId);
    }
    setChecked(next);
  };

  const handleSave = async () => {
    if (!room) return;
    setSaving(true);
    const body: RoomSuitabilityPutBody = {
      subject_ids: Array.from(checked),
    };
    try {
      await apiClient.put<void>(
        `/api/schools/${schoolId}/rooms/${room.id}/suitabilities`,
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

  if (!room) return null;

  const sorted = [...subjects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialog_title", { name: room.name })}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : sorted.length === 0 ? (
          <p className="text-muted-foreground">{t("empty_subjects_hint")}</p>
        ) : (
          <div
            className="max-h-80 overflow-y-auto flex flex-col gap-2"
            data-testid="room-suitability-list"
          >
            {sorted.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <Checkbox
                  id={`subj-${s.id}`}
                  data-testid={`subject-${s.id}`}
                  checked={checked.has(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                />
                <Label htmlFor={`subj-${s.id}`} className="cursor-pointer">
                  {s.name}
                </Label>
              </div>
            ))}
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
