import { useTranslation } from "react-i18next";

export function SubjectsPage() {
  const { t } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("subjects.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("subjects.description")}</p>
    </div>
  );
}
