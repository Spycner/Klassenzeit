import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SubjectMultiPicker } from "@/features/subjects/subject-multi-picker";
import { useSaveTeacherQualifications, useTeacherDetail } from "./hooks";

export function TeacherQualificationsEditor({ teacherId }: { teacherId: string }) {
  const { t } = useTranslation();
  const detail = useTeacherDetail(teacherId);
  const save = useSaveTeacherQualifications();
  const persisted = detail.data?.qualifications.map((q) => q.id) ?? [];
  const [draft, setDraft] = useState<string[]>(persisted);
  useEffect(() => {
    setDraft(detail.data?.qualifications.map((q) => q.id) ?? []);
  }, [detail.data]);

  async function handleTeacherQualificationsSave() {
    try {
      await save.mutateAsync({ id: teacherId, subjectIds: draft });
      toast.success(t("teachers.qualifications.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teachers.qualifications.saveError"));
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("teachers.qualifications.sectionTitle")}</h3>
      </div>
      <SubjectMultiPicker value={draft} onChange={setDraft} />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleTeacherQualificationsSave} disabled={save.isPending}>
          {save.isPending ? t("common.saving") : t("teachers.qualifications.save")}
        </Button>
      </div>
    </div>
  );
}
