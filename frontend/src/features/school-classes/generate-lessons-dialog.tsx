import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SchoolClass, useGenerateLessons } from "./hooks";

interface GenerateLessonsConfirmDialogProps {
  schoolClass: SchoolClass;
  onDone: (createdCount: number) => void;
}

export function GenerateLessonsConfirmDialog({
  schoolClass,
  onDone,
}: GenerateLessonsConfirmDialogProps) {
  const { t } = useTranslation();
  const mutation = useGenerateLessons();

  async function handleGenerateLessonsConfirm() {
    const created = await mutation.mutateAsync(schoolClass.id);
    onDone(created.length);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onDone(-1);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("schoolClasses.generateLessons.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("schoolClasses.generateLessons.confirmDescription", { name: schoolClass.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onDone(-1)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleGenerateLessonsConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? t("common.saving") : t("schoolClasses.generateLessons.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
