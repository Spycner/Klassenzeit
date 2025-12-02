import { useTranslation } from "react-i18next";

export function TeachersListPage() {
  const { t } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("teachers.title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("teachers.description")}</p>
    </div>
  );
}
