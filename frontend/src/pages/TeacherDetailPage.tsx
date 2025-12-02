import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

export function TeacherDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold">
        {id ? t("teachers.editTitle") : t("teachers.newTitle")}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {id ? t("teachers.editingTeacher", { id }) : t("teachers.createNew")}
      </p>
    </div>
  );
}
