"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface Props {
  canUndo: boolean;
  onUndo: () => void;
}

export function UndoToolbar({ canUndo, onUndo }: Props) {
  const t = useTranslations("timetable.edit");
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!canUndo}
      onClick={onUndo}
      aria-label={t("undo")}
    >
      <Undo2 className="mr-1 h-4 w-4" />
      {t("undo")}
    </Button>
  );
}
