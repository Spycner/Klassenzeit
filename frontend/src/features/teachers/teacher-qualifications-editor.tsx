import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SubjectMultiPicker } from "@/features/subjects/subject-multi-picker";
import { type TeacherDetail, useSaveTeacherQualifications, useTeacherDetail } from "./hooks";

export function TeacherQualificationsEditor({ teacherId }: { teacherId: string }) {
  const detail = useTeacherDetail(teacherId);
  if (!detail.isSuccess) return null;
  return <TeacherQualificationsEditorLoaded teacher={detail.data} />;
}

function TeacherQualificationsEditorLoaded({ teacher }: { teacher: TeacherDetail }) {
  const { t } = useTranslation();
  const save = useSaveTeacherQualifications();
  const [draft, setDraft] = useState<string[]>(() => teacher.qualifications.map((q) => q.id));

  async function handleTeacherQualificationsSave() {
    try {
      await save.mutateAsync({ id: teacher.id, subjectIds: draft });
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
